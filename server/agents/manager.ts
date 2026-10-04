/**
 * Agent process manager.
 *
 * Every wizard in the castle is backed by one real OS process running the
 * Claude Code or Kilo CLI. This module owns that lifecycle:
 *
 *   create issue -> assign to agent -> resolve workspace -> spawn
 *   -> stream stdout into the store (which fans out over WebSocket)
 *   -> on exit mark idle or errored
 *
 * Design rules:
 *  - never throw out of a public method; failures become agent status + a log
 *    line the wizard's spell book can display;
 *  - never leave an orphaned child behind (stopAll on shutdown, kill on
 *    reassignment, spawn error handled);
 *  - a missing CLI is a normal, expected state, not a crash.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import type { Agent, Issue, Repo } from '../../src/core/types';
import { providerFor } from '../git';
import { hasCli, LineSplitter, ensureDir, expandPath, dirExists, run } from '../util/cli';
import type { EventBus } from '../state/events';
import { store, type Store } from '../state/store';
import { claudeRunner, type AgentRunner } from './claude';
import { kiloRunner } from './kilo';

const WORKSPACES = join(process.cwd(), 'server', '.workspaces');
const MAX_CONCURRENT = Number(process.env.FACTORAI_MAX_AGENTS ?? 4);
const FLUSH_MS = 120;

const runners: Record<Agent['type'], AgentRunner> = {
  claude: claudeRunner,
  kilo: kiloRunner,
};

export class AgentManager {
  private children = new Map<string, ChildProcess>();
  private splitters = new Map<string, LineSplitter>();
  private flushTimers = new Map<string, NodeJS.Timeout>();
  private pending = new Map<string, string[]>();

  constructor(
    private readonly state: Store = store,
    private readonly bus: EventBus,
  ) {}

  get runningCount(): number {
    return this.children.size;
  }

  /* ------------------------- workspace ------------------------- */

  /**
   * Where an agent's process should run. Prefers a local checkout, otherwise
   * clones the repo once into `server/.workspaces/repos/<id>`.
   */
  async resolveWorkspace(repo: Repo): Promise<{ path: string } | { error: string }> {
    if (repo.localPath) {
      const path = expandPath(repo.localPath);
      if (await dirExists(path)) return { path };
      return { error: `localPath does not exist: ${path}` };
    }
    const destination = join(WORKSPACES, 'repos', repo.id);
    if (await dirExists(destination)) return { path: destination };
    await ensureDir(join(WORKSPACES, 'repos'));
    const cloned = await providerFor(repo).clone(repo.slug, destination);
    if (!cloned.ok) return { error: cloned.message };
    return { path: destination };
  }

  /* --------------------------- lifecycle --------------------------- */

  async assign(agentId: string, issueId: string): Promise<void> {
    const agent = this.state.getAgent(agentId);
    const issue = this.state.getIssue(issueId);
    if (!agent || !issue) throw new Error('unknown agent or issue');
    if (issue.repoId !== agent.repoId) throw new Error('agent and issue are on different floors');
    if (agent.status === 'working') throw new Error(`${agent.name} is already working`);

    this.state.updateIssue(issue.id, { status: 'in-progress', assigneeId: agent.id });
    this.state.updateAgent(agent.id, {
      currentTaskId: issue.id,
      status: 'idle',
      lastError: null,
    });
    this.log(agent.id, [`⚡ ${agent.name} accepts "${issue.title}"`]);
    await this.start(agent.id);
  }

  /** Spawn (or re-spawn) the process for an agent's current task. */
  async start(agentId: string): Promise<void> {
    const agent = this.state.getAgent(agentId);
    if (!agent) throw new Error('unknown agent');
    if (this.children.has(agentId)) return;
    if (this.children.size >= MAX_CONCURRENT) {
      this.fail(agent, `swarm is full (${MAX_CONCURRENT} concurrent agents)`);
      return;
    }

    const issue = agent.currentTaskId ? this.state.getIssue(agent.currentTaskId) : undefined;
    if (!issue) {
      this.state.updateAgent(agentId, { status: 'idle', processId: null, startedAt: null });
      this.log(agentId, ['… waiting for a task']);
      return;
    }
    const repo = this.state.getRepo(agent.repoId);
    if (!repo) {
      this.fail(agent, 'its floor no longer exists');
      return;
    }

    const runner = runners[agent.type];
    const workspace = await this.resolveWorkspace(repo);
    if ('error' in workspace) {
      this.fail(agent, workspace.error);
      return;
    }

    const prompt = buildPrompt(agent, issue, repo, workspace.path);
    this.state.clearLogs(agentId);
    this.log(agentId, [`$ ${runner.bin} ${summariseArgv(runner.args(prompt, {}))}`]);
    this.log(agentId, [`⌂ ${workspace.path}`]);

    let child: ChildProcess;
    try {
      child = spawn(runner.bin, runner.args(prompt, {}), {
        cwd: workspace.path,
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.fail(agent, `could not launch ${runner.bin}: ${errorText(err)}`);
      return;
    }

    this.children.set(agentId, child);
    this.splitters.set(agentId, new LineSplitter());
    this.state.updateAgent(agentId, {
      status: 'working',
      processId: child.pid ?? null,
      startedAt: Date.now(),
      lastError: null,
    });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.ingest(agentId, chunk, runner));

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (line.trim()) this.queue(agentId, [`! ${line.trim()}`]);
      }
    });

    child.on('error', (err) => {
      this.children.delete(agentId);
      const hint =
        (err as NodeJS.ErrnoException).code === 'ENOENT'
          ? `${runner.bin} is not installed or not on PATH`
          : errorText(err);
      this.fail(agent, hint);
    });

    child.on('close', (code, signal) => {
      this.flush(agentId);
      this.children.delete(agentId);
      this.splitters.delete(agentId);
      const current = this.state.getAgent(agentId);
      if (!current) return;
      if (current.processId !== child.pid && current.processId !== null) return;

      if (signal === 'SIGTERM' || signal === 'SIGKILL') {
        this.state.updateAgent(agentId, { status: 'idle', processId: null, startedAt: null });
        this.log(agentId, ['■ process stopped']);
        return;
      }
      if (code === 0) {
        this.state.updateAgent(agentId, { status: 'idle', processId: null, startedAt: null });
        this.log(agentId, ['✓ task finished - awaiting review']);
      } else {
        this.fail(current, `${runner.bin} exited with code ${code ?? 'null'}`);
      }
    });
  }

  kill(agentId: string, reason = 'stopped by the headmistress'): void {
    const child = this.children.get(agentId);
    this.log(agentId, [`⨯ ${reason}`]);
    if (!child) {
      const agent = this.state.getAgent(agentId);
      if (agent) this.state.updateAgent(agentId, { status: 'idle', processId: null, startedAt: null });
      return;
    }
    child.kill('SIGTERM');
    // Escalate if the child ignores SIGTERM.
    setTimeout(() => {
      if (this.children.has(agentId)) child.kill('SIGKILL');
    }, 3_000).unref();
  }

  async restart(agentId: string): Promise<void> {
    this.kill(agentId, 'restarting');
    await new Promise((r) => setTimeout(r, 250));
    this.state.updateAgent(agentId, { status: 'idle', lastError: null });
    await this.start(agentId);
  }

  stopAll(): void {
    for (const child of this.children.values()) child.kill('SIGTERM');
    for (const timer of this.flushTimers.values()) clearTimeout(timer);
    this.flushTimers.clear();
    this.children.clear();
    this.splitters.clear();
    this.pending.clear();
  }

  /* --------------------------- internals --------------------------- */

  private ingest(agentId: string, chunk: string, runner: AgentRunner): void {
    const splitter = this.splitters.get(agentId);
    if (!splitter) return;
    for (const raw of splitter.push(chunk)) {
      for (const line of runner.interpret(raw)) this.queue(agentId, [line]);
    }
  }

  private queue(agentId: string, lines: string[]): void {
    const clean = lines.map((l) => l.replace(/\s+$/, '')).filter((l) => l.length > 0);
    if (clean.length === 0) return;
    const buffer = this.pending.get(agentId) ?? [];
    buffer.push(...clean);
    this.pending.set(agentId, buffer);
    this.scheduleFlush(agentId);
  }

  private scheduleFlush(agentId: string): void {
    if (this.flushTimers.has(agentId)) return;
    const timer = setTimeout(() => {
      this.flushTimers.delete(agentId);
      this.flush(agentId);
    }, FLUSH_MS);
    timer.unref?.();
    this.flushTimers.set(agentId, timer);
  }

  private flush(agentId: string): void {
    const lines = this.pending.get(agentId);
    if (!lines || lines.length === 0) return;
    this.pending.set(agentId, []);
    this.state.appendLog(agentId, lines);
    this.bus.send({ t: 'agentLog', payload: { agentId, lines } });
  }

  private log(agentId: string, lines: string[]): void {
    this.state.appendLog(agentId, lines);
    this.bus.send({ t: 'agentLog', payload: { agentId, lines } });
  }

  private fail(agent: Agent, reason: string): void {
    this.state.updateAgent(agent.id, {
      status: 'error',
      processId: null,
      startedAt: null,
      lastError: reason,
    });
    this.log(agent.id, [`✗ ${reason}`]);
  }
}

export function buildPrompt(agent: Agent, issue: Issue, repo: Repo, workdir: string): string {
  const reference = issue.number ? `issue #${issue.number}` : `local issue "${issue.id}"`;
  return [
    `You are ${agent.name}, a coding wizard in the castle of FactorAI.`,
    '',
    `Repository : ${repo.name} (${repo.slug}) on ${repo.provider}`,
    `Working dir: ${workdir}`,
    `Potion order: ${reference} - ${issue.title}`,
    `Priority   : ${issue.priority}`,
    '',
    issue.body.trim() || '(no further description was given)',
    '',
    'House rules:',
    '- Work only inside the working directory.',
    '- Implement the change end to end and run the project checks you can.',
    '- When you are done, summarise what changed and list any follow-up work.',
  ].join('\n');
}

function summariseArgv(args: string[]): string {
  const promptIndex = args.findIndex((a) => a.includes('\n'));
  if (promptIndex < 0) return args.join(' ');
  return `${args.slice(0, promptIndex).join(' ')} "<potion order>"`;
}

function errorText(err: unknown): string {
  const e = err as NodeJS.ErrnoException;
  if (e?.code === 'ENOENT') return 'command not found';
  return e?.message ?? String(err);
}

/** Probe the CLIs once at boot so the UI can grey out what is unavailable. */
export async function probeAgentClis(): Promise<{ claudeCli: boolean; kiloCli: boolean }> {
  const [claudeCli, kiloCli] = await Promise.all([
    hasCli(claudeRunner.bin),
    hasCli(kiloRunner.bin),
  ]);
  return { claudeCli, kiloCli };
}

/** Used by the "test the plumbing" endpoint: does the binary exist at all? */
export async function runnerVersion(type: Agent['type']): Promise<string> {
  const runner = runners[type];
  const result = await run(runner.bin, ['--version'], { timeoutMs: 8_000 });
  if (result.spawnError) return `unavailable (${result.spawnError})`;
  return result.stdout.trim().split('\n')[0] || 'unknown';
}

export { runners };
