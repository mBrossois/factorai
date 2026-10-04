/**
 * The castle's memory: one kanban board file per floor.
 *
 * `<project>/kanbanboard/<owner>__<repo>.json` holds everything needed to
 * re-raise a floor after a restart - the repository it was bound to, and every
 * potion order on its board with the column, priority and wizard it had. Adding
 * a repository writes its board; every later change rewrites it; the next start
 * reads them all back.
 *
 * The design follows the same rules as the CLI parsers:
 *
 *   - **Plain JSON, one file per floor**, so a board can be read, diffed,
 *     hand-edited or committed like any other file in the repository.
 *   - **Atomic writes** (temp file + rename), debounced per floor, so a burst of
 *     kanban moves costs one write and a crash mid-write cannot truncate a board.
 *   - **Defensive reads**: an unreadable, foreign or half-written file is
 *     skipped with a log line, never a crash.
 *
 * `FACTORAI_KANBAN_DIR` moves the folder; `FACTORAI_KANBAN=0` turns persistence
 * off entirely, which restores the old reset-on-restart behaviour.
 */

import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AGENT_TYPES,
  ISSUE_STATUSES,
  PRIORITIES,
  PROVIDERS,
  THEMES,
  type AgentType,
  type IssueStatus,
  type Priority,
  type Provider,
  type Repo,
  type Theme,
} from '../../src/core/types';

/** Bumped when the on-disk shape changes; older files are still read. */
export const BOARD_VERSION = 1;

/** How long the writer waits for a floor to go quiet before saving it. */
const DEFAULT_DEBOUNCE_MS = 250;

export interface BoardTask {
  title: string;
  body: string;
  status: IssueStatus;
  priority: Priority;
  /** Provider issue number, when the order also exists on the remote. */
  number: number | null;
  url: string | null;
  /** The wizard holding the order, by name and type. */
  agent: string | null;
  agentType: AgentType | null;
  createdAt: number;
}

/** A wizard on the floor. Restored idle: the desk is remembered, the process is not. */
export interface BoardWizard {
  name: string;
  type: AgentType;
}

export interface BoardRepo {
  slug: string;
  name: string;
  provider: Provider;
  url: string;
  localPath: string | null;
  theme: Theme;
}

export interface BoardFile {
  version: number;
  repo: BoardRepo;
  wizards: BoardWizard[];
  tasks: BoardTask[];
  savedAt: number;
}

/* ------------------------------------------------------------------ *
 * Paths
 * ------------------------------------------------------------------ */

export function boardsEnabled(): boolean {
  return process.env.FACTORAI_KANBAN !== '0';
}

/** The folder the boards live in, one JSON file per floor. */
export function boardDir(): string {
  const configured = process.env.FACTORAI_KANBAN_DIR?.trim();
  return configured || join(process.cwd(), 'kanbanboard');
}

/**
 * File name for a slug: `owner/name` becomes `owner__name.json`, with anything
 * filesystem-hostile folded into `_` so a slug can never escape the folder.
 */
export function boardFileName(slug: string): string {
  const safe = slug
    .trim()
    .split('/')
    .map((part) => part.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._-]+/, ''))
    .filter(Boolean)
    .join('__');
  return `${safe || 'floor'}.json`;
}

/* ------------------------------------------------------------------ *
 * Pure parsing - the unit-tested surface
 * ------------------------------------------------------------------ */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function int(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function nullable<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(value as T) ? (value as T) : null;
}

/**
 * Read one board file. Unknown fields are ignored, a missing field falls back to
 * a sane default, and a file that is not a board at all returns null so the
 * caller can skip it instead of restoring nonsense into the castle.
 */
export function parseBoard(raw: string): BoardFile | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const root = asRecord(parsed);
  const repo = asRecord(root?.repo);
  const slug = str(repo?.slug).trim();
  if (!root || !repo || !slug) return null;

  const wizards: BoardWizard[] = [];
  for (const entry of asArray(root.wizards)) {
    const wizard = asRecord(entry);
    const name = str(wizard?.name).trim();
    const type = nullable(wizard?.type, AGENT_TYPES);
    if (name && type) wizards.push({ name, type });
  }

  const tasks: BoardTask[] = [];
  for (const entry of asArray(root.tasks)) {
    const task = asRecord(entry);
    const title = str(task?.title).trim();
    if (!task || !title) continue;
    tasks.push({
      title,
      body: str(task.body),
      status: oneOf(task.status, ISSUE_STATUSES, 'todo'),
      priority: oneOf(task.priority, PRIORITIES, 'medium'),
      number: int(task.number),
      url: typeof task.url === 'string' ? task.url : null,
      agent: typeof task.agent === 'string' && task.agent.trim() ? task.agent.trim() : null,
      agentType: nullable(task.agentType, AGENT_TYPES),
      createdAt: int(task.createdAt) ?? 0,
    });
  }

  return {
    version: typeof root.version === 'number' ? root.version : BOARD_VERSION,
    repo: {
      slug,
      name: str(repo.name) || slug.split('/').pop() || slug,
      provider: oneOf(repo.provider, PROVIDERS, 'github'),
      url: str(repo.url),
      localPath: typeof repo.localPath === 'string' ? repo.localPath : null,
      theme: oneOf(repo.theme, THEMES, 'library'),
    },
    wizards,
    tasks,
    savedAt: int(root.savedAt) ?? 0,
  };
}

export function serializeBoard(board: BoardFile): string {
  return `${JSON.stringify({ ...board, version: BOARD_VERSION }, null, 2)}\n`;
}

/** The board file for a floor, built from what the store knows. */
export function boardFrom(repo: Repo, wizards: BoardWizard[], tasks: BoardTask[]): BoardFile {
  return {
    version: BOARD_VERSION,
    repo: {
      slug: repo.slug,
      name: repo.name,
      provider: repo.provider,
      url: repo.url,
      localPath: repo.localPath,
    theme: repo.theme,
    },
    wizards,
    tasks,
    savedAt: Date.now(),
  };
}

/* ------------------------------------------------------------------ *
 * Disk
 * ------------------------------------------------------------------ */

export interface LoadedBoard {
  board: BoardFile;
  file: string;
}

/**
 * Every board in the folder, newest first. A file that cannot be read or parsed
 * is reported and skipped: one bad file must not cost you the whole castle.
 */
export async function loadBoards(dir: string = boardDir()): Promise<LoadedBoard[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const loaded: LoadedBoard[] = [];
  for (const entry of entries.filter((name) => name.endsWith('.json')).sort()) {
    const file = join(dir, entry);
    let raw: string;
    try {
      raw = await readFile(file, 'utf8');
    } catch (err) {
      log('board unreadable', `${entry}: ${describe(err)}`);
      continue;
    }
    const board = parseBoard(raw);
    if (!board) {
      log('board ignored', `${entry}: not a FactorAI board`);
      continue;
    }
    loaded.push({ board, file });
  }
  return loaded;
}

async function writeBoardFile(board: BoardFile, dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  const file = join(dir, boardFileName(board.repo.slug));
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, serializeBoard(board), 'utf8');
  await rename(temp, file);
}

/**
 * Debounced board writer.
 *
 * A kanban drag fires one store mutation per frame of the drag; each mutation
 * notifies subscribers. Saving on every notification would hammer the disk, so
 * writes are coalesced per floor and flushed on shutdown.
 */
export class BoardStore {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly pending = new Map<string, BoardFile>();
  private readonly fingerprints = new Map<string, string>();

  constructor(readonly dir: string = boardDir()) {}

  async load(): Promise<LoadedBoard[]> {
    return loadBoards(this.dir);
  }

  /** Queue a floor for saving; the last write in a burst wins. */
  schedule(board: BoardFile, debounceMs = DEFAULT_DEBOUNCE_MS): void {
    const key = board.repo.slug;
    // A poll that changes nothing must not rewrite the file every 45s.
    const fingerprint = `${JSON.stringify(board.repo)}|${JSON.stringify(board.tasks)}`;
    if (this.fingerprints.get(key) === fingerprint) return;
    this.fingerprints.set(key, fingerprint);
    this.pending.set(key, board);
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.flush(key);
    }, debounceMs);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  /** Save one queued floor now. */
  async flush(slug?: string): Promise<void> {
    const keys = slug ? [slug] : [...this.pending.keys()];
    for (const key of keys) {
      const board = this.pending.get(key);
      this.pending.delete(key);
      const timer = this.timers.get(key);
      if (timer) clearTimeout(timer);
      this.timers.delete(key);
      if (!board) continue;
      try {
        await writeBoardFile(board, this.dir);
      } catch (err) {
        log('board write failed', `${key}: ${describe(err)}`);
      }
    }
  }

  /** Forget a floor: its board file goes, exactly as the floor does. */
  async forget(slug: string): Promise<void> {
    this.timers.delete(slug);
    this.pending.delete(slug);
    this.fingerprints.delete(slug);
    try {
      await rm(join(this.dir, boardFileName(slug)));
    } catch {
      // Already gone, or the folder never existed. Either way the floor is gone.
    }
  }
}

/** A scratch directory under the OS temp dir, for tests and experiments. */
export async function tempBoardDir(prefix = 'factorai-boards-'): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function log(scope: string, message: string): void {
  console.log(`[factorai:${scope}] ${message}`);
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
