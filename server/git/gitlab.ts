/**
 * GitLab provider: a typed wrapper over the `glab` CLI.
 *
 * `glab` output shapes vary more than `gh`'s across versions, so every list call
 * tries JSON first and falls back to the plain-text table.
 */

import { run, type RunResult } from '../util/cli';
import {
  parseGlabIssues,
  parseGlabPipeline,
  parseGlabPrs,
  parseIssueText,
  parseNumberFromUrl,
  parsePrText,
} from './parsers';
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
  if (result.spawnError) return `glab ${result.spawnError} - install GitLab CLI`;
  if (result.timedOut) return 'glab timed out';
  const detail = (result.stderr || result.stdout).trim().split('\n').slice(0, 3).join(' ').trim();
  return detail ? `glab: ${detail}` : `glab exited with code ${result.code}`;
}

async function runCli(args: string[], repoPath?: string) {
  const result = await run('glab', args, { cwd: repoPath, timeoutMs: TIMEOUT });
  if (result.spawnError || result.code !== 0) {
    return { ok: false as const, message: failureMessage(result) };
  }
  return { ok: true as const, stdout: result.stdout };
}

export const gitlabProvider: GitProvider = {
  cli: 'glab',

  run: (args, repoPath) => runCli(args, repoPath),

  async verify(slug: string): Promise<VerifyResult> {
    const auth = await runCli(['auth', 'status']);
    if (!auth.ok) return { ok: false, reason: auth.message };
    const repo = await runCli(['repo', 'view', slug]);
    return repo.ok ? { ok: true, reason: null } : { ok: false, reason: repo.message };
  },

  async listIssues(slug: string): Promise<RemoteIssue[]> {
    const result = await runCli([
      'issue',
      'list',
      '--repo',
      slug,
      '--all',
      '--per-page',
      '100',
      '--output',
      'json',
    ]);
    if (!result.ok) return [];
    const parsed = parseGlabIssues(result.stdout);
    return parsed.length > 0 ? parsed : parseIssueText(result.stdout);
  },

  async createIssue(slug: string, input: NewRemoteIssue): Promise<RemoteIssue> {
    const result = await runCli([
      'issue',
      'create',
      '--repo',
      slug,
      '--title',
      input.title,
      '--description',
      input.body || 'Filed from FactorAI.',
      '--yes',
    ]);
    if (!result.ok) throw new Error(result.message);
    const url = result.stdout.trim().split('\n').pop()?.trim() ?? '';
    const number = parseNumberFromUrl(url) ?? Date.now();
    return { number, title: input.title, body: input.body, status: 'todo', url };
  },

  async listPrs(slug: string): Promise<RemotePr[]> {
    const result = await runCli([
      'mr',
      'list',
      '--repo',
      slug,
      '--all',
      '--per-page',
      '100',
      '--output',
      'json',
    ]);
    if (!result.ok) return [];
    const parsed = parseGlabPrs(result.stdout);
    return parsed.length > 0 ? parsed : parsePrText(result.stdout);
  },

  async createPr(slug: string, input: NewRemotePr): Promise<RemotePr> {
    const result = await runCli([
      'mr',
      'create',
      '--repo',
      slug,
      '--title',
      input.title,
      '--description',
      input.body || 'Opened from FactorAI.',
      '--yes',
    ]);
    if (!result.ok) throw new Error(result.message);
    const url = result.stdout.trim().split('\n').pop()?.trim() ?? '';
    const number = parseNumberFromUrl(url) ?? Date.now();
    return { number, title: input.title, url, status: 'open', author: 'agent', draft: false };
  },

  async checks(slug: string, pr: RemotePr) {
    const result = await runCli([
      'mr',
      'view',
      String(pr.number),
      '--repo',
      slug,
      '--output',
      'json',
    ]);
    if (!result.ok) return null;
    return parseGlabPipeline(result.stdout);
  },

  async clone(slug: string, destination: string) {
    const result = await run('glab', ['repo', 'clone', slug, destination], { timeoutMs: 300_000 });
    if (result.spawnError || result.code !== 0) {
      return { ok: false, message: failureMessage(result) };
    }
    return { ok: true, message: `cloned ${slug}` };
  },
};
