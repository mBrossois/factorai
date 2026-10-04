/**
 * WebSocket wire protocol.
 *
 * One shape for every frame: a `t` discriminator plus an optional `payload`.
 * Keep this file dependency-free (types only) so the server can import it.
 */

import type {
  AppState,
  CreateAgentPayload,
  CreateIssuePayload,
  CreatePrPayload,
  CreateRepoPayload,
  Issue,
  IssueStatus,
  PullRequest,
} from './types';

export type ClientMessage =
  | { t: 'subscribe' }
  | { t: 'ping' }
  | { t: 'createRepo'; payload: CreateRepoPayload }
  | { t: 'removeRepo'; payload: { repoId: string } }
  | { t: 'refreshRepo'; payload: { repoId: string } }
  | { t: 'createIssue'; payload: CreateIssuePayload }
  | { t: 'setIssueStatus'; payload: { issueId: string; status: IssueStatus } }
  | { t: 'createAgent'; payload: CreateAgentPayload }
  | { t: 'removeAgent'; payload: { agentId: string } }
  | { t: 'assignAgent'; payload: { agentId: string; issueId: string } }
  | { t: 'unassignAgent'; payload: { agentId: string } }
  | { t: 'killAgent'; payload: { agentId: string } }
  | { t: 'restartAgent'; payload: { agentId: string } }
  | { t: 'createPr'; payload: CreatePrPayload }
  | { t: 'setPollInterval'; payload: { seconds: number } };

export type ServerMessage =
  | { t: 'state'; payload: AppState }
  | { t: 'agentLog'; payload: { agentId: string; lines: string[] } }
  | { t: 'prCreated'; payload: PullRequest }
  | { t: 'issueUpdated'; payload: Issue }
  | { t: 'error'; payload: string }
  | { t: 'pong' }
  | { t: 'notice'; payload: string };

export function encode(message: ServerMessage): string {
  return JSON.stringify(message);
}

export function decodeClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const t = (parsed as { t?: unknown }).t;
    if (typeof t !== 'string') return null;
    return parsed as ClientMessage;
  } catch {
    return null;
  }
}

export const CLIENT_MESSAGE_TYPES: ReadonlySet<string> = new Set<ClientMessage['t']>([
  'subscribe',
  'ping',
  'createRepo',
  'removeRepo',
  'refreshRepo',
  'createIssue',
  'setIssueStatus',
  'createAgent',
  'removeAgent',
  'assignAgent',
  'unassignAgent',
  'killAgent',
  'restartAgent',
  'createPr',
  'setPollInterval',
]);
