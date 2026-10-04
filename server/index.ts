/**
 * FactorAI orchestrator.
 *
 * One process hosts three things:
 *   1. the REST + WebSocket API the browser talks to,
 *   2. the agent process manager that spawns Claude Code / Kilo,
 *   3. the pollers that keep repo/issue/PR state fresh via `gh` / `glab`.
 *
 * Nothing here requires `gh`, `glab`, `claude` or `kilo` to be installed: each
 * is probed at boot and its absence is reported through `state.capabilities`
 * and per-repo `connected`/`statusReason` fields instead of crashing.
 */

import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import cors from 'cors';
import express from 'express';

import { AgentManager, probeAgentClis, runnerVersion } from './agents/manager';
import { providerFor } from './git';
import { CLIENT_MESSAGE_TYPES, type ClientMessage } from '../src/core/protocol';
import type { Issue, Repo, Theme } from '../src/core/types';
import { THEMES } from '../src/core/types';
import { hub, errorMessage } from './state/events';
import { store } from './state/store';
import { dirExists, ensureDir, expandPath, hasCli } from './util/cli';

const PORT = Number(process.env.FACTORAI_PORT ?? 8787);
const HOST = process.env.FACTORAI_HOST ?? '127.0.0.1';
const PRODUCTION = process.env.NODE_ENV === 'production';
const DEMO_SANDBOX = join(process.cwd(), 'server', '.workspaces', 'demo');

let pollSeconds = clampSeconds(process.env.FACTORAI_POLL_SECONDS ?? 45);
const agents = new AgentManager(store, hub);

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

await ensureDir(DEMO_SANDBOX);
store.capabilities = {
  ...(await probeAgentClis()),
  ghCli: await hasCli('gh'),
  glabCli: await hasCli('glab'),
  version: '0.1.0',
};
log('capabilities', JSON.stringify(store.capabilities));

if (process.env.FACTORAI_SEED !== '0' && store.listRepos().length === 0) {
  seedDemoCastle();
}

/* ------------------------------------------------------------------ *
 * HTTP + WebSocket
 * ------------------------------------------------------------------ */

const app = express();
app.use(cors({ origin: PRODUCTION ? false : true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    clients: hub.clientCount,
    agents: agents.runningCount,
    pollSeconds,
    capabilities: store.capabilities,
  });
});

app.get('/api/state', (_req, res) => {
  res.json(store.snapshot());
});

app.get('/api/version/:type', async (req, res) => {
  const type = req.params.type;
  if (type !== 'claude' && type !== 'kilo') {
    res.status(400).json({ error: 'type must be claude or kilo' });
    return;
  }
  res.json({ type, version: await runnerVersion(type) });
});

app.post('/api/repos', (req, res) => {
  void dispatch({ t: 'createRepo', payload: req.body }, hub, res);
});
app.post('/api/issues', (req, res) => {
  void dispatch({ t: 'createIssue', payload: req.body }, hub, res);
});
app.post('/api/agents', (req, res) => {
  void dispatch({ t: 'createAgent', payload: req.body }, hub, res);
});
app.post('/api/agents/:agentId/assign', (req, res) => {
  void dispatch(
    { t: 'assignAgent', payload: { agentId: req.params.agentId, issueId: String(req.body?.issueId ?? '') } },
    hub,
    res,
  );
});
app.delete('/api/agents/:agentId', (req, res) => {
  void dispatch({ t: 'killAgent', payload: { agentId: req.params.agentId } }, hub, res);
});
app.post('/api/repos/:repoId/sync', (req, res) => {
  void dispatch({ t: 'refreshRepo', payload: { repoId: req.params.repoId } }, hub, res);
});

const distDir = join(process.cwd(), 'dist');
if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) return next();
    res.sendFile(join(distDir, 'index.html'));
  });
} else {
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res
      .status(200)
      .type('text/plain')
      .send('FactorAI API is up. Run `npm run dev:client` for the Vite dev server, or `npm run build` for a static bundle.');
  });
}

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

const server = createServer(app);
hub.attach(server, '/ws');
hub.setRouter((message, reply) => dispatch(message, reply));

store.subscribe((state) => hub.broadcastState(state));

server.listen(PORT, HOST, () => {
  log('listening', `http://${HOST}:${PORT}  (ws: /ws, poll: ${pollSeconds}s)`);
});

/* ------------------------------------------------------------------ *
 * Polling
 * ------------------------------------------------------------------ */

const syncing = new Set<string>();
let pollTimer: NodeJS.Timeout | null = null;

function schedulePolling(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => void syncAll(), pollSeconds * 1000);
  pollTimer.unref?.();
}
schedulePolling();

async function syncAll(): Promise<void> {
  for (const repo of store.listRepos()) await syncRepo(repo.id);
}

async function syncRepo(repoId: string): Promise<void> {
  if (syncing.has(repoId)) return;
  syncing.add(repoId);
  try {
    const repo = store.getRepo(repoId);
    if (repo) await syncOne(repo);
  } catch (err) {
    log('poll failed', `${repoId}: ${errorMessage(err)}`);
  } finally {
    syncing.delete(repoId);
  }
}

async function syncOne(repo: Repo): Promise<void> {
  if (repo.localPath) {
    const path = expandPath(repo.localPath);
    const ok = await dirExists(path);
    store.setRepoConnection(repo.id, ok, ok ? null : `localPath is missing: ${path}`);
    return;
  }

  const provider = providerFor(repo);
  const verify = await provider.verify(repo.slug);
  if (!verify.ok) {
    store.setRepoConnection(repo.id, false, verify.reason);
    return;
  }
  store.setRepoConnection(repo.id, true, null);

  for (const remote of await provider.listIssues(repo.slug)) {
    const existing = store.issuesForRepo(repo.id).find((i) => i.number === remote.number);
    if (existing) {
      store.updateIssue(existing.id, {
        title: remote.title,
        body: remote.body,
        url: remote.url,
        // Never stomp on local work in flight.
        status: existing.assigneeId ? existing.status : remote.status,
      });
    } else {
      const created = store.addIssue({
        repoId: repo.id,
        title: remote.title,
        body: remote.body,
        number: remote.number,
        url: remote.url,
      });
      store.setIssueStatus(created.id, remote.status);
    }
  }

  const known = store.prsForRepo(repo.id);
  for (const remote of await provider.listPrs(repo.slug)) {
    const existing = known.find((p) => p.number === remote.number);
    if (existing) {
      store.updatePr(existing.id, { status: remote.status, title: remote.title, url: remote.url });
      const checks = await provider.checks(repo.slug, remote);
      if (checks) store.updatePr(existing.id, { checks });
      continue;
    }
    const checks = (await provider.checks(repo.slug, remote)) ?? undefined;
    const pr = store.addPr({
      repoId: repo.id,
      title: remote.title,
      url: remote.url,
      number: remote.number,
      status: remote.status,
      checks,
    });
    hub.send({ t: 'prCreated', payload: pr });
  }
}

/* ------------------------------------------------------------------ *
 * Message router
 * ------------------------------------------------------------------ */

type Reply = { send: (message: { t: 'error'; payload: string } | { t: 'notice'; payload: string }) => void };

async function dispatch(message: ClientMessage, reply: Reply, res?: express.Response): Promise<void> {
  try {
    if (!CLIENT_MESSAGE_TYPES.has(message.t)) {
      throw new Error(`unknown message type "${(message as { t: string }).t}"`);
    }
    const detail = await handle(message, reply);
    if (res) res.json({ ok: true, ...(detail ?? {}) });
  } catch (err) {
    const text = errorMessage(err);
    reply.send({ t: 'error', payload: text });
    if (res) res.status(400).json({ ok: false, error: text });
    else log('error', text);
  }
}

async function handle(
  message: ClientMessage,
  reply: Reply,
): Promise<Record<string, unknown> | undefined> {
  switch (message.t) {
    case 'subscribe':
    case 'ping':
      return undefined;

    case 'createRepo': {
      const slug = String(message.payload?.slug ?? '').trim();
      if (!slug) throw new Error('a repository slug like "owner/name" is required');
      const provider = message.payload.provider === 'gitlab' ? 'gitlab' : 'github';
      const theme: Theme = THEMES.includes(message.payload.theme as Theme)
        ? (message.payload.theme as Theme)
        : (undefined as unknown as Theme);
      const repo = store.addRepo({
        slug,
        provider,
        name: message.payload.name,
        url: message.payload.url,
        localPath: message.payload.localPath,
        theme,
      });
      void syncRepo(repo.id);
      return { repoId: repo.id };
    }

    case 'removeRepo': {
      for (const agent of store.agentsForRepo(message.payload.repoId)) agents.kill(agent.id, 'floor removed');
      store.removeRepo(message.payload.repoId);
      return undefined;
    }

    case 'refreshRepo': {
      void syncRepo(message.payload.repoId);
      reply.send({ t: 'notice', payload: 'polling the provider…' });
      return undefined;
    }

    case 'createIssue': {
      const repo = store.getRepo(message.payload.repoId);
      if (!repo) throw new Error('unknown floor');
      const title = String(message.payload.title ?? '').trim();
      if (!title) throw new Error('a potion order needs a title');
      const issue = store.addIssue({
        repoId: repo.id,
        title,
        body: message.payload.body,
        priority: message.payload.priority,
        assigneeId: message.payload.assigneeId,
      });
      hub.send({ t: 'issueUpdated', payload: issue });

      if (message.payload.pushRemote !== false && repo.connected && !repo.localPath) {
        void pushIssue(repo, issue.id);
      }
      return { issueId: issue.id };
    }

    case 'setIssueStatus': {
      const issue = store.setIssueStatus(message.payload.issueId, message.payload.status);
      if (!issue) throw new Error('unknown potion order');
      hub.send({ t: 'issueUpdated', payload: issue });
      return undefined;
    }

    case 'createAgent': {
      const repo = store.getRepo(message.payload.repoId);
      if (!repo) throw new Error('unknown floor');
      const type = message.payload.type === 'kilo' ? 'kilo' : 'claude';
      const agent = store.addAgent({ repoId: repo.id, type, name: message.payload.name });
      return { agentId: agent.id };
    }

    case 'removeAgent': {
      agents.kill(message.payload.agentId, 'dismissed');
      store.removeAgent(message.payload.agentId);
      return undefined;
    }

    case 'assignAgent': {
      await agents.assign(message.payload.agentId, message.payload.issueId);
      return undefined;
    }

    case 'unassignAgent': {
      const agent = store.getAgent(message.payload.agentId);
      if (agent) store.updateAgent(agent.id, { currentTaskId: null });
      return undefined;
    }

    case 'killAgent': {
      agents.kill(message.payload.agentId);
      return undefined;
    }

    case 'restartAgent': {
      await agents.restart(message.payload.agentId);
      return undefined;
    }

    case 'createPr': {
      const issue = store.getIssue(message.payload.issueId);
      if (!issue) throw new Error('unknown potion order');
      const repo = store.getRepo(issue.repoId);
      if (!repo) throw new Error('unknown floor');
      const title = message.payload.title?.trim() || `${issue.title}`;
      const body = [issue.body, '', `Closes #${issue.number ?? issue.id}`].filter(Boolean).join('\n');
      const author = issue.assigneeId;

      if (repo.connected && !repo.localPath) {
        const remote = await providerFor(repo).createPr(repo.slug, { title, body });
        const pr = store.addPr({
          repoId: repo.id,
          issueId: issue.id,
          authorId: author,
          title: remote.title,
          number: remote.number,
          url: remote.url || repo.url,
        });
        hub.send({ t: 'prCreated', payload: pr });
        return { prId: pr.id };
      }

      const pr = store.addPr({
        repoId: repo.id,
        issueId: issue.id,
        authorId: author,
        title,
        url: repo.localPath ? 'local (not pushed)' : repo.url,
      });
      hub.send({ t: 'prCreated', payload: pr });
      reply.send({
        t: 'notice',
        payload: repo.localPath
          ? 'potion bottled locally - this floor is a local checkout, nothing was pushed'
          : 'potion bottled locally - connect a provider CLI to push it',
      });
      return { prId: pr.id };
    }

    case 'setPollInterval': {
      pollSeconds = clampSeconds(message.payload.seconds);
      schedulePolling();
      reply.send({ t: 'notice', payload: `polling every ${pollSeconds}s` });
      return { pollSeconds };
    }

    default: {
      const exhaustive: never = message;
      throw new Error(`unsupported message: ${JSON.stringify(exhaustive)}`);
    }
  }
}

async function pushIssue(repo: Repo, issueId: string): Promise<void> {
  const issue = store.getIssue(issueId);
  if (!issue) return;
  try {
    const remote = await providerFor(repo).createIssue(repo.slug, {
      title: issue.title,
      body: issue.body,
    });
    store.updateIssue(issue.id, { number: remote.number, url: remote.url });
    hub.send({ t: 'notice', payload: `potion order filed upstream: ${remote.url || remote.number}` });
  } catch (err) {
    hub.send({ t: 'error', payload: `could not file upstream: ${errorMessage(err)}` });
  }
}

/* ------------------------------------------------------------------ *
 * Seed + shutdown
 * ------------------------------------------------------------------ */

function seedDemoCastle(): void {
  const repo = store.addRepo({
    slug: 'demo/factorai-chamber',
    provider: 'github',
    name: 'Chamber Demo',
    localPath: DEMO_SANDBOX,
    theme: 'alchemy-lab',
  });
  store.setRepoConnection(repo.id, true, null);

  const orders: Array<[string, string, Issue['priority']]> = [
    ['Brew the onboarding floormap', 'Render a rune legend above the main hall stairs.', 'high'],
    ['Bottle the CI telemetry', 'Summarise check results as potion labels on the shelf.', 'medium'],
    ['Teach the corridor stairs to whisper', 'Play a soft chime when a wizard changes floor.', 'low'],
  ];
  const issues = orders.map(([title, body, priority]) =>
    store.addIssue({ repoId: repo.id, title, body, priority }),
  );
  store.setIssueStatus(issues[1]!.id, 'in-progress');

  const agentsList = [
    store.addAgent({ repoId: repo.id, type: 'claude' }),
    store.addAgent({ repoId: repo.id, type: 'kilo' }),
  ];
  store.updateIssue(issues[0]!.id, { assigneeId: agentsList[0]!.id });
  store.updateIssue(issues[1]!.id, { assigneeId: agentsList[1]!.id });

  store.addPr({
    repoId: repo.id,
    issueId: issues[2]!.id,
    title: 'Chatter: corridor chime',
    authorId: agentsList[0]!.id,
    number: 1,
    status: 'merged',
    checks: { total: 3, passing: 3, failing: 0, pending: 0 },
  });
  store.addPr({
    repoId: repo.id,
    title: 'Draft: rune legend',
    authorId: agentsList[1]!.id,
    number: 2,
    status: 'open',
    checks: { total: 2, passing: 1, failing: 0, pending: 1 },
  });

  log('seed', `demo floor "${repo.name}" ready at ${DEMO_SANDBOX} (FACTORAI_SEED=0 to disable)`);
}

function clampSeconds(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 45;
  return Math.min(600, Math.max(5, Math.round(n)));
}

function log(scope: string, message: string): void {
  console.log(`[factorai:${scope}] ${message}`);
}

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log('shutdown', `received ${signal}, releasing every agent…`);
    agents.stopAll();
    if (pollTimer) clearInterval(pollTimer);
    void hub.close().finally(() => server.close(() => process.exit(0)));
    setTimeout(() => process.exit(0), 2_000).unref();
  });
}
