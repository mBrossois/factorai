/**
 * Cross-provider shapes. The two git providers (`github.ts`, `gitlab.ts`)
 * implement the same interface, so `index.ts` can treat them interchangeably.
 */

import type { CheckState, IssueStatus, PrStatus } from '../../src/core/types';

export interface RemoteIssue {
  number: number;
  title: string;
  body: string;
  status: IssueStatus;
  url: string;
}

export interface RemotePr {
  number: number;
  title: string;
  url: string;
  status: PrStatus;
  author: string;
  draft: boolean;
}

export interface NewRemoteIssue {
  title: string;
  body: string;
}

export interface NewRemotePr {
  title: string;
  body: string;
}

export interface VerifyResult {
  ok: boolean;
  reason: string | null;
}

export interface GitProvider {
  readonly cli: string;
  /** Raw exit summary of a CLI invocation, used to build readable failures. */
  run(
    args: string[],
    repoPath?: string,
  ): Promise<{ ok: true; stdout: string } | { ok: false; message: string }>;
  verify(slug: string): Promise<VerifyResult>;
  listIssues(slug: string): Promise<RemoteIssue[]>;
  createIssue(slug: string, input: NewRemoteIssue): Promise<RemoteIssue>;
  listPrs(slug: string): Promise<RemotePr[]>;
  createPr(slug: string, input: NewRemotePr): Promise<RemotePr>;
  checks(slug: string, pr: RemotePr): Promise<CheckState | null>;
  clone(slug: string, destination: string): Promise<{ ok: boolean; message: string }>;
}
