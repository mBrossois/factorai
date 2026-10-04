import { randomUUID } from 'node:crypto';

import {
  EMPTY_CHECKS,
  MAX_LOG_LINES_PER_AGENT,
  type Agent,
  type AppState,
  type Capabilities,
  type CheckState,
  type Issue,
  type IssueStatus,
  type Priority,
  type Provider,
  type PullRequest,
  type PrStatus,
  type Repo,
  type Theme,
} from '../../src/core/types';

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

type Listener = (state: AppState) => void;

/**
 * In-memory swarm state. Deliberately has no persistence (out of scope for v1):
 * restarting the orchestrator resets the castle.
 *
 * Every mutation notifies listeners; the WebSocket hub turns that into a
 * broadcast `state` frame, so the 3D world and the 2D overlay never diverge.
 */
export class Store {
  private repos: Repo[] = [];
  private issues: Issue[] = [];
  private agents: Agent[] = [];
  private prs: PullRequest[] = [];
  private logs = new Map<string, string[]>();
  private listeners = new Set<Listener>();
  capabilities: Capabilities = {
    claudeCli: false,
    kiloCli: false,
    ghCli: false,
    glabCli: false,
    version: '0.1.0',
  };

  /* ----------------------------- reads ----------------------------- */

  snapshot(): AppState {
    return {
      repos: this.repos.map((r) => ({ ...r })),
      issues: this.issues.map((i) => ({ ...i })),
      agents: this.agents.map((a) => ({ ...a })),
      prs: this.prs.map((p) => ({ ...p, checks: { ...p.checks } })),
      logs: Object.fromEntries([...this.logs].map(([k, v]) => [k, [...v]])),
      capabilities: { ...this.capabilities },
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  listRepos(): Repo[] {
    return this.repos.map((r) => ({ ...r }));
  }

  getRepo(id: string): Repo | undefined {
    const found = this.repos.find((r) => r.id === id);
    return found ? { ...found } : undefined;
  }

  getIssue(id: string): Issue | undefined {
    const found = this.issues.find((i) => i.id === id);
    return found ? { ...found } : undefined;
  }

  getAgent(id: string): Agent | undefined {
    const found = this.agents.find((a) => a.id === id);
    return found ? { ...found } : undefined;
  }

  getPr(id: string): PullRequest | undefined {
    const found = this.prs.find((p) => p.id === id);
    return found ? { ...found, checks: { ...found.checks } } : undefined;
  }

  issuesForRepo(repoId: string): Issue[] {
    return this.issues.filter((i) => i.repoId === repoId).map((i) => ({ ...i }));
  }

  agentsForRepo(repoId: string): Agent[] {
    return this.agents.filter((a) => a.repoId === repoId).map((a) => ({ ...a }));
  }

  prsForRepo(repoId: string): PullRequest[] {
    return this.prs.filter((p) => p.repoId === repoId).map((p) => ({ ...p }));
  }

  logsFor(agentId: string): string[] {
    return [...(this.logs.get(agentId) ?? [])];
  }

  /* ----------------------------- writes ---------------------------- */

  addRepo(input: {
    slug: string;
    provider: Provider;
    name?: string;
    url?: string;
    localPath?: string | null;
    theme?: Theme;
  }): Repo {
    const repo: Repo = {
      id: newId('repo'),
      name: input.name?.trim() || input.slug.split(/[/#]/).filter(Boolean).pop() || input.slug,
      slug: input.slug.trim(),
      provider: input.provider,
      url: input.url?.trim() || defaultRepoUrl(input.provider, input.slug),
      localPath: input.localPath?.trim() || null,
      floorNumber: this.nextFloorNumber(),
      theme: input.theme ?? this.nextTheme(),
      connected: false,
      statusReason: 'not yet probed',
      createdAt: Date.now(),
    };
    this.repos.push(repo);
    this.emit();
    return repo;
  }

  removeRepo(id: string): void {
    const agentIds = this.agents.filter((a) => a.repoId === id).map((a) => a.id);
    for (const agentId of agentIds) this.removeAgent(agentId);
    this.issues = this.issues.filter((i) => i.repoId !== id);
    this.prs = this.prs.filter((p) => p.repoId !== id);
    this.repos = this.repos.filter((r) => r.id !== id);
    this.compactFloors();
    this.emit();
  }

  updateRepo(id: string, patch: Partial<Omit<Repo, 'id' | 'createdAt'>>): Repo | undefined {
    const repo = this.repos.find((r) => r.id === id);
    if (!repo) return undefined;
    Object.assign(repo, patch);
    this.emit();
    return { ...repo };
  }

  setRepoConnection(id: string, connected: boolean, reason: string | null): void {
    const repo = this.repos.find((r) => r.id === id);
    if (!repo) return;
    if (repo.connected === connected && repo.statusReason === reason) return;
    repo.connected = connected;
    repo.statusReason = connected ? null : reason;
    this.emit();
  }

  addIssue(input: {
    repoId: string;
    title: string;
    body?: string;
    priority?: Priority;
    assigneeId?: string | null;
    number?: number | null;
    url?: string | null;
  }): Issue {
    const issue: Issue = {
      id: newId('iss'),
      repoId: input.repoId,
      number: input.number ?? null,
      title: input.title.trim(),
      body: input.body?.trim() ?? '',
      status: 'todo',
      priority: input.priority ?? 'medium',
      assigneeId: input.assigneeId ?? null,
      url: input.url ?? null,
      createdAt: Date.now(),
    };
    this.issues.push(issue);
    if (issue.assigneeId) this.updateAgent(issue.assigneeId, { currentTaskId: issue.id });
    this.emit();
    return issue;
  }

  updateIssue(id: string, patch: Partial<Omit<Issue, 'id' | 'createdAt'>>): Issue | undefined {
    const issue = this.issues.find((i) => i.id === id);
    if (!issue) return undefined;
    const previousAssignee = issue.assigneeId;
    Object.assign(issue, patch);
    if (patch.assigneeId !== undefined && patch.assigneeId !== previousAssignee) {
      if (previousAssignee) this.updateAgent(previousAssignee, { currentTaskId: null });
      if (patch.assigneeId) this.updateAgent(patch.assigneeId, { currentTaskId: issue.id });
    }
    this.emit();
    return { ...issue };
  }

  setIssueStatus(id: string, status: IssueStatus): Issue | undefined {
    return this.updateIssue(id, { status });
  }

  removeIssue(id: string): void {
    const issue = this.issues.find((i) => i.id === id);
    if (issue?.assigneeId) this.updateAgent(issue.assigneeId, { currentTaskId: null });
    this.issues = this.issues.filter((i) => i.id !== id);
    this.prs = this.prs.map((p) => (p.issueId === id ? { ...p, issueId: null } : p));
    this.emit();
  }

  addAgent(input: { repoId: string; type: Agent['type']; name?: string }): Agent {
    const existing = this.agentsForRepo(input.repoId);
    const desk = nextFreeDesk(existing);
    const agent: Agent = {
      id: newId('agt'),
      name: input.name?.trim() || wizardName(input.type, existing.length),
      type: input.type,
      status: 'idle',
      currentTaskId: null,
      repoId: input.repoId,
      processId: null,
      desk,
      lastError: null,
      startedAt: null,
      createdAt: Date.now(),
    };
    this.agents.push(agent);
    this.logs.set(agent.id, [`${agent.name} (${agent.type}) awaits a task…`]);
    this.emit();
    return agent;
  }

  updateAgent(id: string, patch: Partial<Omit<Agent, 'id' | 'createdAt'>>): Agent | undefined {
    const agent = this.agents.find((a) => a.id === id);
    if (!agent) return undefined;
    Object.assign(agent, patch);
    this.emit();
    return { ...agent };
  }

  removeAgent(id: string): void {
    this.agents = this.agents.filter((a) => a.id !== id);
    this.issues = this.issues.map((i) => (i.assigneeId === id ? { ...i, assigneeId: null } : i));
    this.prs = this.prs.map((p) => (p.authorId === id ? { ...p, authorId: null } : p));
    this.logs.delete(id);
    this.emit();
  }

  addPr(input: {
    repoId: string;
    title: string;
    issueId?: string | null;
    authorId?: string | null;
    url?: string;
    number?: number | null;
    status?: PrStatus;
    checks?: Partial<CheckState>;
  }): PullRequest {
    const pr: PullRequest = {
      id: newId('pr'),
      repoId: input.repoId,
      issueId: input.issueId ?? null,
      number: input.number ?? null,
      title: input.title.trim(),
      authorId: input.authorId ?? null,
      status: input.status ?? 'open',
      url: input.url ?? '#',
      checks: { ...EMPTY_CHECKS, ...input.checks },
      createdAt: Date.now(),
    };
    this.prs.push(pr);
    this.emit();
    return pr;
  }

  updatePr(id: string, patch: Partial<Omit<PullRequest, 'id' | 'createdAt'>>): PullRequest | undefined {
    const pr = this.prs.find((p) => p.id === id);
    if (!pr) return undefined;
    Object.assign(pr, patch);
    this.emit();
    return { ...pr, checks: { ...pr.checks } };
  }

  appendLog(agentId: string, lines: string[]): string[] {
    const current = this.logs.get(agentId) ?? [];
    const merged = [...current, ...lines];
    const trimmed =
      merged.length > MAX_LOG_LINES_PER_AGENT ? merged.slice(-MAX_LOG_LINES_PER_AGENT) : merged;
    this.logs.set(agentId, trimmed);
    return lines;
  }

  clearLogs(agentId: string): void {
    this.logs.set(agentId, []);
  }

  /* --------------------------- internals --------------------------- */

  private nextFloorNumber(): number {
    if (this.repos.length === 0) return 1;
    return Math.max(...this.repos.map((r) => r.floorNumber)) + 1;
  }

  private nextTheme(): Theme {
    const themes: Theme[] = [
      'library',
      'alchemy-lab',
      'observatory',
      'greenhouse',
      'crystal-halls',
      'dragon-roosts',
      'herbarium',
      'music-room',
      'dungeons',
      'clockwork',
    ];
    return themes[this.repos.length % themes.length] ?? 'library';
  }

  /** Keep floor numbers contiguous from 1 so no castle level is skipped. */
  private compactFloors(): void {
    const sorted = [...this.repos].sort((a, b) => a.floorNumber - b.floorNumber);
    sorted.forEach((repo, index) => {
      repo.floorNumber = index + 1;
    });
    this.repos = sorted;
  }
}

const WIZARD_NAMES: Record<Agent['type'], string[]> = {
  claude: ['Merlin', 'Dumbledore', 'McGonagall', 'Flitwick', 'Sprout', 'Sirius', 'Hagrid', 'Trelawney'],
  kilo: ['Huffle', 'Ravenclaw', 'Helga', 'Padma', 'Percy', 'Pomfrey', 'Ollivander', 'Slughorn'],
};

function wizardName(type: Agent['type'], index: number): string {
  const pool = WIZARD_NAMES[type];
  return pool[index % pool.length] ?? 'Wanderer';
}

function nextFreeDesk(agents: Agent[]): number {
  const taken = new Set(agents.map((a) => a.desk));
  let slot = 0;
  while (taken.has(slot)) slot += 1;
  return slot;
}

function defaultRepoUrl(provider: Provider, slug: string): string {
  return provider === 'github' ? `https://github.com/${slug}` : `https://gitlab.com/${slug}`;
}

export const store = new Store();
