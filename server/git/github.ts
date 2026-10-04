/**
 * GitHub provider: a thin, typed wrapper over the `gh` CLI.
 *
 * Nothing here assumes `gh` exists. Every call goes through `runCli`, which
 * converts a missing binary or a non-zero exit into a readable message that the
 * UI renders on the floor hologram.
 */

import { run, type RunResult } from '../util/cli';
import { parseGhChecks, parseGhIssues, parseGhPrs, parseNumberFromUrl } from './parsers';
import type {
  GitProvider,
  NewRemoteIssue,
  NewRemotePr,
  RemoteIssue,
  RemotePr,
  VerifyResult,
} from './types';

const TIMEOUT = 30_000;

function failureMessage(result: RunResult): string {
  if (result.spawnError) return `gh ${result.spawnError} - install GitHub CLI`;
  if (result.timedOut) return 'gh timed out';
  const detail = (result.stderr || result.stdout).trim().split('\n').slice(0, 3).join(' ').trim();
  return detail ? `gh: ${detail}` : `gh exited with code ${result.code}`;
}

async function runCli(args: string[], repoPath?: string) {
  const result = await run('gh', args, { cwd: repoPath, timeoutMs: TIMEOUT });
  if (result.spawnError || result.code !== 0) {
    return { ok: false as const, message: failureMessage(result) };
  }
  return { ok: true as const, stdout: result.stdout };
}

export const githubProvider: GitProvider = {
  cli: 'gh',

  run: (args, repoPath) => runCli(args, repoPath),

  async verify(slug: string): Promise<VerifyResult> {
    const result = await runCli(['repo', 'view', slug, '--json', 'nameWithOwner']);
    return result.ok
      ? { ok: true, reason: null }
      : { ok: false, reason: result.message };
  },

  async listIssues(slug: string): Promise<RemoteIssue[]> {
    const result = await runCli([
      'issue',
      'list',
      '--repo',
      slug,
      '--state',
      'all',
      '--limit',
      '100',
      '--json',
      'number,title,body,state,url',
    ]);
    return result.ok ? parseGhIssues(result.stdout) : [];
  },

  async createIssue(slug: string, input: NewRemoteIssue): Promise<RemoteIssue> {
    const result = await runCli([
      'issue',
      'create',
      '--repo',
      slug,
      '--title',
      input.title,
      '--body',
      input.body || 'Filed from FactorAI.',
    ]);
    if (!result.ok) throw new Error(result.message);
    const url = result.stdout.trim().split('\n').pop()?.trim() ?? '';
    const number = parseNumberFromUrl(url) ?? Date.now();
    return { number, title: input.title, body: input.body, status: 'todo', url };
  },

  async listPrs(slug: string): Promise<RemotePr[]> {
    const result = await runCli([
      'pr',
      'list',
      '--repo',
      slug,
      '--state',
      'all',
      '--limit',
      '100',
      '--json',
      'number,title,url,state,isDraft,author',
    ]);
    return result.ok ? parseGhPrs(result.stdout) : [];
  },

  async createPr(slug: string, input: NewRemotePr): Promise<RemotePr> {
    const result = await runCli([
      'pr',
      'create',
      '--repo',
      slug,
      '--title',
      input.title,
      '--body',
      input.body || 'Opened from FactorAI.',
    ]);
    if (!result.ok) throw new Error(result.message);
    const url = result.stdout.trim().split('\n').pop()?.trim() ?? '';
    const number = parseNumberFromUrl(url) ?? Date.now();
    return { number, title: input.title, url, status: 'open', author: 'agent', draft: false };
  },

  async checks(slug: string, pr: RemotePr) {
    const result = await runCli([
      'pr',
      'checks',
      String(pr.number),
      '--repo',
      slug,
      '--json',
      'name,state,bucket',
    ]);
    if (!result.ok) return null;
    return parseGhChecks(result.stdout);
  },

  async clone(slug: string, destination: string) {
    const result = await run('gh', ['repo', 'clone', slug, destination], { timeoutMs: 300_000 });
    if (result.spawnError || result.code !== 0) {
      return { ok: false, message: failureMessage(result) };
    }
    return { ok: true, message: `cloned ${slug}` };
  },
};
