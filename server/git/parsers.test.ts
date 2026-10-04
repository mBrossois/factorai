import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  mapIssueState,
  mapPrState,
  parseGhChecks,
  parseGhIssues,
  parseGhPrs,
  parseGlabIssues,
  parseGlabPipeline,
  parseGlabPrs,
  parseIssueText,
  parseNumberFromUrl,
  parsePrText,
} from './parsers';

test('parseNumberFromUrl handles github and gitlab shapes', () => {
  assert.equal(parseNumberFromUrl('https://github.com/a/b/issues/42'), 42);
  assert.equal(parseNumberFromUrl('https://gitlab.com/g/p/-/merge_requests/7'), 7);
  assert.equal(parseNumberFromUrl('https://github.com/a/b/pull/103/files'), 103);
  assert.equal(parseNumberFromUrl('https://example.com/nothing'), null);
});

test('state mapping collapses remote states onto the three kanban columns', () => {
  assert.equal(mapIssueState('OPEN'), 'todo');
  assert.equal(mapIssueState('closed'), 'done');
  assert.equal(mapIssueState('in-progress'), 'in-progress');
  assert.equal(mapPrState('MERGED'), 'merged');
  assert.equal(mapPrState('CLOSED'), 'closed');
  assert.equal(mapPrState('open'), 'open');
  assert.equal(mapPrState('nonsense'), 'open');
});

test('parseGhIssues reads the documented gh JSON array', () => {
  const issues = parseGhIssues(
    JSON.stringify([
      { number: 12, title: 'Cauldron leaks', body: 'Bubbles escape', state: 'OPEN', url: 'https://github.com/o/r/issues/12' },
      { number: 3, title: 'Fix stair runes', body: '', state: 'CLOSED', url: 'https://github.com/o/r/issues/3' },
    ]),
  );
  assert.equal(issues.length, 2);
  assert.equal(issues[0]?.number, 12);
  assert.equal(issues[0]?.status, 'todo');
  assert.equal(issues[1]?.status, 'done');
});

test('parseGhIssues tolerates an object-wrapped state and gh log noise', () => {
  const issues = parseGhIssues(
    `loading...\n${JSON.stringify([{ number: 9, title: 'Warp scroll', state: { state: 'OPEN' } }])}`,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.status, 'todo');
  assert.equal(issues[0]?.title, 'Warp scroll');
});

test('parseGhIssues returns empty for garbage instead of throwing', () => {
  assert.deepEqual(parseGhIssues(''), []);
  assert.deepEqual(parseGhIssues('gh: not logged in'), []);
  assert.deepEqual(parseGhIssues('[{"title":"no number"}]'), []);
});

test('parseGhPrs maps state and author login', () => {
  const prs = parseGhPrs(
    JSON.stringify([
      { number: 5, title: 'Spell: levitate', url: 'https://github.com/o/r/pull/5', state: 'MERGED', isDraft: false, author: { login: 'merlin' } },
      { number: 6, title: 'WIP', url: 'https://github.com/o/r/pull/6', state: 'OPEN', isDraft: true, author: { login: 'hagrid' } },
    ]),
  );
  assert.equal(prs[0]?.status, 'merged');
  assert.equal(prs[0]?.author, 'merlin');
  assert.equal(prs[1]?.draft, true);
});

test('parseGhChecks buckets every conclusion', () => {
  const checks = parseGhChecks(
    JSON.stringify([
      { name: 'build', bucket: 'pass' },
      { name: 'e2e', bucket: 'fail' },
      { name: 'lint', bucket: 'pending' },
      { name: 'docs', bucket: 'skipping' },
    ]),
  );
  assert.deepEqual(checks, { total: 4, passing: 1, failing: 1, pending: 1 });
});

test('parseGhChecks reports zero checks when gh returns none', () => {
  assert.deepEqual(parseGhChecks('[]'), { total: 0, passing: 0, failing: 0, pending: 0 });
});

test('parseGlabIssues prefers iid/description/web_url', () => {
  const issues = parseGlabIssues(
    JSON.stringify([
      { iid: 8, title: 'Greenhouse runes', description: 'Leaking mana', state: 'opened', web_url: 'https://gitlab.com/g/p/-/issues/8' },
      { iid: 2, title: 'Old bug', description: '', state: 'closed', web_url: 'https://gitlab.com/g/p/-/issues/2' },
    ]),
  );
  assert.equal(issues[0]?.number, 8);
  assert.equal(issues[0]?.body, 'Leaking mana');
  assert.equal(issues[0]?.status, 'todo');
  assert.equal(issues[1]?.status, 'done');
});

test('parseGlabPrs understands iid and draft/work_in_progress', () => {
  const prs = parseGlabPrs(
    JSON.stringify([
      { iid: 11, title: 'Refactor owlery', web_url: 'https://gitlab.com/g/p/-/merge_requests/11', state: 'merged', author: { username: 'mcgonagall' } },
      { iid: 12, title: 'Draft: broom flight', web_url: 'https://gitlab.com/g/p/-/merge_requests/12', state: 'opened', work_in_progress: true },
    ]),
  );
  assert.equal(prs[0]?.number, 11);
  assert.equal(prs[0]?.status, 'merged');
  assert.equal(prs[0]?.author, 'mcgonagall');
  assert.equal(prs[1]?.draft, true);
});

test('parseGlabPipeline maps pipeline status to a check rollup', () => {
  assert.deepEqual(parseGlabPipeline('{"head_pipeline":{"status":"success"}}'), {
    total: 1,
    passing: 1,
    failing: 0,
    pending: 0,
  });
  assert.deepEqual(parseGlabPipeline('{"head_pipeline":{"status":"failed"}}'), {
    total: 1,
    passing: 0,
    failing: 1,
    pending: 0,
  });
  assert.deepEqual(parseGlabPipeline('{"head_pipeline":{"status":"running"}}'), {
    total: 1,
    passing: 0,
    failing: 0,
    pending: 1,
  });
  assert.deepEqual(parseGlabPipeline('{"head_pipeline":null}'), {
    total: 0,
    passing: 0,
    failing: 0,
    pending: 0,
  });
  assert.deepEqual(parseGlabPipeline('not json'), { total: 0, passing: 0, failing: 0, pending: 0 });
});

test('text fallbacks pick up both # and ! markers', () => {
  const prs = parsePrText('#101  Add owl post\n!202  Fix cauldron\nrandom noise');
  assert.equal(prs.length, 2);
  assert.equal(prs[0]?.number, 101);
  assert.equal(prs[1]?.number, 202);

  const issues = parseIssueText('#4  Broken quill\n12 Another');
  assert.equal(issues.length, 2);
  assert.equal(issues[0]?.number, 4);
  assert.equal(issues[1]?.number, 12);
});
