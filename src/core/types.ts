/**
 * Shared domain types for FactorAI.
 *
 * These are imported by BOTH the Node orchestrator (`server/`) and the React
 * client (`src/`), because the WebSocket protocol in `protocol.ts` carries them
 * verbatim. Keep this file free of runtime dependencies on either side.
 *
 * Deviation from the original plan (documented in docs/AGENT-ORCHESTRATION.md):
 * the plan sketched `Issue.assignee: Agent | null` and `PullRequest.author: Agent`,
 * which is a cycle (Agent.currentTask -> Issue -> Agent) and cannot survive JSON
 * serialisation. Both are modelled as `*Id` references here instead.
 */

export type Provider = 'github' | 'gitlab';
export type IssueStatus = 'todo' | 'in-progress' | 'done';
export type Priority = 'low' | 'medium' | 'high';
export type AgentType = 'claude' | 'kilo';
export type AgentStatus = 'idle' | 'working' | 'error';
export type PrStatus = 'open' | 'merged' | 'closed';

export const ISSUE_STATUSES: readonly IssueStatus[] = ['todo', 'in-progress', 'done'];
export const PRIORITIES: readonly Priority[] = ['low', 'medium', 'high'];
export const AGENT_TYPES: readonly AgentType[] = ['claude', 'kilo'];
export const PROVIDERS: readonly Provider[] = ['github', 'gitlab'];

/** Floor themes. Each repo floor is dressed according to its theme string. */
export const THEMES = [
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
] as const;
export type Theme = (typeof THEMES)[number];

/** CI check rollup for a pull/merge request. */
export interface CheckState {
  total: number;
  passing: number;
  failing: number;
  pending: number;
}

export const EMPTY_CHECKS: CheckState = { total: 0, passing: 0, failing: 0, pending: 0 };

/** One connected GitHub/GitLab repository == one floor of the castle. */
export interface Repo {
  id: string;
  name: string;
  /** `owner/name` for GitHub, `group/project` for GitLab. */
  slug: string;
  provider: Provider;
  url: string;
  /**
   * Optional path to a local checkout. When set the orchestrator never shells
   * out to `gh`/`glab` clone and instead runs agents directly in this folder.
   */
  localPath: string | null;
  floorNumber: number;
  theme: Theme;
  connected: boolean;
  /** Human readable reason shown on the floor hologram when `connected` is false. */
  statusReason: string | null;
  createdAt: number;
}

export interface Issue {
  id: string;
  repoId: string;
  /** Provider-side issue number, when the issue exists on the remote. */
  number: number | null;
  title: string;
  body: string;
  status: IssueStatus;
  priority: Priority;
  /** See file header: this is an id, not a nested Agent, to avoid a cycle. */
  assigneeId: string | null;
  url: string | null;
  createdAt: number;
}

export interface Agent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  currentTaskId: string | null;
  repoId: string;
  processId: number | null;
  /** Index of the desk slot this wizard occupies on its floor. */
  desk: number;
  lastError: string | null;
  startedAt: number | null;
  createdAt: number;
}

export interface PullRequest {
  id: string;
  repoId: string;
  issueId: string | null;
  number: number | null;
  title: string;
  authorId: string | null;
  status: PrStatus;
  url: string;
  checks: CheckState;
  createdAt: number;
}

/** Full client-visible snapshot. The server owns it; clients only mirror it. */
export interface AppState {
  repos: Repo[];
  issues: Issue[];
  agents: Agent[];
  prs: PullRequest[];
  /** Rolling tail of agent stdout, newest last, capped per agent. */
  logs: Record<string, string[]>;
  /** Server capability probe: which CLIs the orchestrator can actually drive. */
  capabilities: Capabilities;
}

export interface Capabilities {
  claudeCli: boolean;
  kiloCli: boolean;
  ghCli: boolean;
  glabCli: boolean;
  version: string;
}

export const EMPTY_STATE: AppState = {
  repos: [],
  issues: [],
  agents: [],
  prs: [],
  logs: {},
  capabilities: {
    claudeCli: false,
    kiloCli: false,
    ghCli: false,
    glabCli: false,
    version: '0.1.0',
  },
};

export const MAX_LOG_LINES_PER_AGENT = 200;

/* ------------------------------------------------------------------ *
 * Input payloads (client -> server)
 * ------------------------------------------------------------------ */

export interface CreateRepoPayload {
  name?: string;
  slug: string;
  provider: Provider;
  url?: string;
  localPath?: string | null;
  theme?: Theme;
}

export interface CreateIssuePayload {
  repoId: string;
  title: string;
  body?: string;
  priority?: Priority;
  assigneeId?: string | null;
  /** When false the issue is only recorded locally (no `gh issue create`). */
  pushRemote?: boolean;
}

export interface CreateAgentPayload {
  repoId: string;
  name?: string;
  type: AgentType;
}

export interface CreatePrPayload {
  issueId: string;
  title?: string;
  body?: string;
}

/* ------------------------------------------------------------------ *
 * Derived selectors (pure, used by both sides)
 * ------------------------------------------------------------------ */

export function issuesForRepo(state: AppState, repoId: string): Issue[] {
  return state.issues.filter((i) => i.repoId === repoId);
}

export function agentsForRepo(state: AppState, repoId: string): Agent[] {
  return state.agents.filter((a) => a.repoId === repoId);
}

export function prsForRepo(state: AppState, repoId: string): PullRequest[] {
  return state.prs.filter((p) => p.repoId === repoId);
}

export function agentById(state: AppState, id: string | null): Agent | undefined {
  if (!id) return undefined;
  return state.agents.find((a) => a.id === id);
}

export function issueById(state: AppState, id: string | null): Issue | undefined {
  if (!id) return undefined;
  return state.issues.find((i) => i.id === id);
}

export function repoById(state: AppState, id: string | null): Repo | undefined {
  if (!id) return undefined;
  return state.repos.find((r) => r.id === id);
}

/** Repos ordered bottom-up: the ground floor is Main Hall, then repo floors. */
export function orderedFloors(state: AppState): Repo[] {
  return [...state.repos].sort((a, b) => a.floorNumber - b.floorNumber);
}
