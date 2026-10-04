/**
 * Pure parsers for `gh` / `glab` output.
 *
 * Both CLIs are external, versioned programs whose JSON field names drift
 * between releases, so every parser here is defensive: it accepts several field
 * spellings, tolerates missing keys, and returns an empty result rather than
 * throwing. That is why these functions live outside `github.ts`/`gitlab.ts` --
 * they are the only part of the git layer we can actually unit test without the
 * binaries installed.
 */

import type { CheckState, IssueStatus, PrStatus } from '../../src/core/types';
import type { RemoteIssue, RemotePr } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

function safeJson(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const start = trimmed.startsWith('[') || trimmed.startsWith('{') ? 0 : trimmed.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(trimmed.slice(start));
  } catch {
    return null;
  }
}

export function parseNumberFromUrl(url: string): number | null {
  const match = url.match(/(\d+)(?:[/?#]|$)/);
  return match?.[1] ? Number.parseInt(match[1], 10) : null;
}

/* ------------------------------------------------------------------ *
 * State mapping
 * ------------------------------------------------------------------ */

/** Remote issue states only distinguish open/closed; mid-flight is local. */
export function mapIssueState(state: string): IssueStatus {
  const s = state.trim().toLowerCase();
  if (s === 'closed' || s === 'merged' || s === 'done') return 'done';
  if (s === 'in-progress' || s === 'in progress' || s === 'started') return 'in-progress';
  return 'todo';
}

export function mapPrState(state: string): PrStatus {
  const s = state.trim().toLowerCase();
  if (s === 'merged') return 'merged';
  if (s === 'closed') return 'closed';
  return 'open';
}

/* ------------------------------------------------------------------ *
 * GitHub (`gh`)
 * ------------------------------------------------------------------ */

/**
 * `gh issue list --json number,title,body,state,url`
 * Tolerates `state` being the state name or an object such as
 * `{ state: "OPEN" }` depending on gh version.
 */
export function parseGhIssues(raw: string): RemoteIssue[] {
  const data = safeJson(raw);
  const rows = asArray(asRecord(data)?.issues ?? data);
  return rows
    .map((row): RemoteIssue | null => {
      const r = asRecord(row);
      if (!r) return null;
      const number = num(r.number ?? r.id);
      if (number === null) return null;
      const stateRaw = r.state;
      const stateText = typeof stateRaw === 'string' ? stateRaw : str(asRecord(stateRaw)?.state, 'OPEN');
      return {
        number,
        title: str(r.title, `Issue #${number}`),
        body: str(r.body),
        status: mapIssueState(stateText),
        url: str(r.url, `https://github.com/`),
      };
    })
    .filter((v): v is RemoteIssue => v !== null);
}

/** `gh pr list --json number,title,url,state,isDraft,author` */
export function parseGhPrs(raw: string): RemotePr[] {
  const data = safeJson(raw);
  const rows = asArray(asRecord(data)?.prs ?? data);
  return rows
    .map((row): RemotePr | null => {
      const r = asRecord(row);
      if (!r) return null;
      const number = num(r.number ?? r.id);
      if (number === null) return null;
      const stateText = str(r.state, 'OPEN');
      const author = asRecord(r.author);
      return {
        number,
        title: str(r.title, `Pull request #${number}`),
        url: str(r.url, `https://github.com/`),
        status: bool(r.isDraft) && mapPrState(stateText) === 'open' ? 'open' : mapPrState(stateText),
        author: str(author?.login, 'unknown'),
        draft: bool(r.isDraft),
      };
    })
    .filter((v): v is RemotePr => v !== null);
}

/** `gh pr checks <n> --json name,state,bucket` */
export function parseGhChecks(raw: string): CheckState {
  const data = safeJson(raw);
  const rows = asArray(data);
  const checks: CheckState = { total: 0, passing: 0, failing: 0, pending: 0 };
  for (const row of rows) {
    const r = asRecord(row);
    if (!r) continue;
    const bucket = str(r.bucket ?? r.state ?? r.conclusion).toLowerCase();
    checks.total += 1;
    if (bucket === 'pass' || bucket === 'success' || bucket === 'neutral' || bucket === 'skipping') {
      if (bucket !== 'skipping') checks.passing += 1;
    } else if (bucket === 'fail' || bucket === 'failure' || bucket === 'error' || bucket === 'cancelled' || bucket === 'timed_out') {
      checks.failing += 1;
    } else {
      checks.pending += 1;
    }
  }
  return checks;
}

/* ------------------------------------------------------------------ *
 * GitLab (`glab`)
 * ------------------------------------------------------------------ */

/**
 * `glab issue list --output json`
 * glab uses `iid` / `description` / `web_url`; some versions expose
 * `id`/`body`/`url` instead, so both are accepted.
 */
export function parseGlabIssues(raw: string): RemoteIssue[] {
  const data = safeJson(raw);
  const rows = asArray(asRecord(data)?.issues ?? data);
  return rows
    .map((row): RemoteIssue | null => {
      const r = asRecord(row);
      if (!r) return null;
      const number = num(r.iid ?? r.number ?? r.id);
      if (number === null) return null;
      return {
        number,
        title: str(r.title, `Issue #${number}`),
        body: str(r.description ?? r.body),
        status: mapIssueState(str(r.state, 'opened')),
        url: str(r.web_url ?? r.url, 'https://gitlab.com/'),
      };
    })
    .filter((v): v is RemoteIssue => v !== null);
}

/** `glab mr list --output json` */
export function parseGlabPrs(raw: string): RemotePr[] {
  const data = safeJson(raw);
  const rows = asArray(asRecord(data)?.merge_requests ?? data);
  return rows
    .map((row): RemotePr | null => {
      const r = asRecord(row);
      if (!r) return null;
      const number = num(r.iid ?? r.number ?? r.id);
      if (number === null) return null;
      const author = asRecord(r.author);
      return {
        number,
        title: str(r.title, `Merge request !${number}`),
        url: str(r.web_url ?? r.url, 'https://gitlab.com/'),
        status: mapPrState(str(r.state, 'opened')),
        author: str(author?.username ?? author?.name, 'unknown'),
        draft: bool(r.draft ?? r.work_in_progress),
      };
    })
    .filter((v): v is RemotePr => v !== null);
}

/**
 * `glab mr view <iid> --output json` -> `head_pipeline.status` /
 * `pipeline.status`. Returns a single-check rollup.
 */
export function parseGlabPipeline(raw: string): CheckState {
  const data = safeJson(raw);
  const r = asRecord(data);
  if (!r) return { total: 0, passing: 0, failing: 0, pending: 0 };
  const pipeline = asRecord(r.head_pipeline) ?? asRecord(r.pipeline);
  const status = str(pipeline?.status ?? r.status).toLowerCase();
  if (!status) return { total: 0, passing: 0, failing: 0, pending: 0 };
  if (status === 'success') return { total: 1, passing: 1, failing: 0, pending: 0 };
  if (status === 'failed' || status === 'canceled' || status === 'cancelled') {
    return { total: 1, passing: 0, failing: 1, pending: 0 };
  }
  return { total: 1, passing: 0, failing: 0, pending: 1 };
}

/* ------------------------------------------------------------------ *
 * Text fallbacks (used when --output json is unsupported)
 * ------------------------------------------------------------------ */

/**
 * `gh pr list` / `glab mr list` plain output looks like:
 *   #123  Some title
 *   !456  Another title
 * Lines that do not start with a marker are ignored.
 */
export function parsePrText(raw: string): RemotePr[] {
  const out: RemotePr[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*[#!]?(\d+)\s+(.*\S)\s*$/);
    if (!match?.[1] || !match[2]) continue;
    out.push({
      number: Number.parseInt(match[1], 10),
      title: match[2],
      url: '',
      status: 'open',
      author: 'unknown',
      draft: false,
    });
  }
  return out;
}

export function parseIssueText(raw: string): RemoteIssue[] {
  const out: RemoteIssue[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*#?(\d+)\s+(.*\S)\s*$/);
    if (!match?.[1] || !match[2]) continue;
    out.push({
      number: Number.parseInt(match[1], 10),
      title: match[2],
      body: '',
      status: 'todo',
      url: '',
    });
  }
  return out;
}
