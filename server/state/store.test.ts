import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Store } from './store';

function makeStore(): Store {
  const store = new Store();
  store.addRepo({ slug: 'acme/wand-core', provider: 'github' });
  return store;
}

test('repos are numbered from the ground floor upwards', () => {
  const store = new Store();
  const a = store.addRepo({ slug: 'acme/one', provider: 'github' });
  const b = store.addRepo({ slug: 'acme/two', provider: 'gitlab' });
  assert.equal(a.floorNumber, 1);
  assert.equal(b.floorNumber, 2);
});

test('removing a repo compacts floors and drops its issues and agents', () => {
  const store = makeStore();
  const second = store.addRepo({ slug: 'acme/two', provider: 'github' });
  const issue = store.addIssue({ repoId: second.id, title: 'Broken quill' });
  const agent = store.addAgent({ repoId: second.id, type: 'claude' });
  store.updateIssue(issue.id, { assigneeId: agent.id });

  store.removeRepo(second.id);

  assert.equal(store.snapshot().repos.length, 1);
  assert.equal(store.snapshot().issues.length, 0);
  assert.equal(store.snapshot().agents.length, 0);

  const third = store.addRepo({ slug: 'acme/three', provider: 'github' });
  assert.equal(third.floorNumber, 2, 'floors must stay contiguous after a removal');
});

test('assigning an issue links both sides without duplicating the task', () => {
  const store = makeStore();
  const repo = store.getRepo(store.snapshot().repos[0]!.id)!;
  const agent = store.addAgent({ repoId: repo.id, type: 'claude' });
  const issue = store.addIssue({ repoId: repo.id, title: 'Cauldron leaks' });

  store.updateIssue(issue.id, { assigneeId: agent.id });
  assert.equal(store.getAgent(agent.id)?.currentTaskId, issue.id);

  const other = store.addAgent({ repoId: repo.id, type: 'kilo' });
  store.updateIssue(issue.id, { assigneeId: other.id });
  assert.equal(store.getAgent(agent.id)?.currentTaskId, null, 'previous assignee is released');
  assert.equal(store.getAgent(other.id)?.currentTaskId, issue.id);
});

test('agent desk slots are handed out without collisions', () => {
  const store = makeStore();
  const repoId = store.snapshot().repos[0]!.id;
  const a = store.addAgent({ repoId, type: 'claude' });
  const b = store.addAgent({ repoId, type: 'kilo' });
  const c = store.addAgent({ repoId, type: 'kilo' });
  assert.deepEqual([a.desk, b.desk, c.desk], [0, 1, 2]);

  store.removeAgent(b.id);
  const d = store.addAgent({ repoId, type: 'claude' });
  assert.equal(d.desk, 1, 'the freed slot is reused');
});

test('logs are capped and keep the newest lines', () => {
  const store = makeStore();
  const repoId = store.snapshot().repos[0]!.id;
  const agent = store.addAgent({ repoId, type: 'claude' });
  for (let i = 0; i < 260; i += 1) store.appendLog(agent.id, [`line ${i}`]);
  const logs = store.logsFor(agent.id);
  assert.equal(logs.length, 200);
  assert.equal(logs.at(-1), 'line 259');
});

test('removing an agent clears references from issues and PRs', () => {
  const store = makeStore();
  const repoId = store.snapshot().repos[0]!.id;
  const agent = store.addAgent({ repoId, type: 'kilo' });
  const issue = store.addIssue({ repoId, title: 'Task' });
  const pr = store.addPr({ repoId, title: 'PR', issueId: issue.id, authorId: agent.id });
  store.updateIssue(issue.id, { assigneeId: agent.id });

  store.removeAgent(agent.id);

  const snap = store.snapshot();
  assert.equal(snap.issues[0]?.assigneeId, null);
  assert.equal(snap.prs[0]?.authorId, null);
  assert.equal(store.getPr(pr.id)?.issueId, issue.id, 'the issue link survives the agent');
});

test('repo connection status only emits when it actually changes', () => {
  const store = makeStore();
  const repoId = store.snapshot().repos[0]!.id;
  let emissions = 0;
  store.subscribe(() => {
    emissions += 1;
  });
  store.setRepoConnection(repoId, false, 'gh command not found');
  store.setRepoConnection(repoId, false, 'gh command not found');
  assert.equal(emissions, 1);
  store.setRepoConnection(repoId, true, null);
  assert.equal(store.getRepo(repoId)?.connected, true);
  assert.equal(store.getRepo(repoId)?.statusReason, null);
});

test('snapshot returns copies so callers cannot mutate server state', () => {
  const store = makeStore();
  const repoId = store.snapshot().repos[0]!.id;
  const snap = store.snapshot();
  snap.repos[0]!.name = 'hacked';
  assert.notEqual(store.getRepo(repoId)?.name, 'hacked');
});
