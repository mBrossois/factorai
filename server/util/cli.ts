import { spawn } from 'node:child_process';
import { access, constants, mkdir } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  /** True when the binary could not be launched at all (ENOENT, EACCES, ...). */
  spawnError: string | null;
  timedOut: boolean;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  input?: string;
  onLine?: (line: string) => void;
  /** Receives raw stdout chunks as they arrive (for streaming agent output). */
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * Run a CLI, capture stdout/stderr, never throw.
 *
 * Every git/agent integration goes through here so that a missing or
 * unauthenticated CLI degrades into a `spawnError` string the UI can render,
 * instead of crashing the orchestrator.
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  return new Promise<RunResult>((resolvePromise) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: { ...process.env, ...options.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolvePromise({
        code: null,
        signal: null,
        stdout: '',
        stderr: '',
        spawnError: describeSpawnError(err),
        timedOut: false,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let spawnError: string | null = null;
    let timedOut = false;
    let settled = false;

    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      resolvePromise({ code, signal, stdout, stderr, spawnError, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const onAbort = () => {
      child.kill('SIGTERM');
    };
    options.signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      options.onStdout?.(chunk);
    });

    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      options.onStderr?.(chunk);
    });

    child.on('error', (err) => {
      spawnError = describeSpawnError(err);
      finish(null, null);
    });

    child.on('close', (code, signal) => finish(code, signal));

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    } else {
      child.stdin?.end();
    }

    if (options.onLine) {
      let buffer = '';
      child.stdout?.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? '';
        for (const line of lines) if (line.trim()) options.onLine?.(line);
      });
    }
  });
}

function describeSpawnError(err: unknown): string {
  const e = err as NodeJS.ErrnoException;
  if (e?.code === 'ENOENT') return 'command not found';
  if (e?.code === 'EACCES') return 'permission denied';
  return e?.message ?? String(err);
}

/** Probe whether a CLI is on PATH and responds to `--version`. */
export async function hasCli(command: string): Promise<boolean> {
  const result = await run(command, ['--version'], { timeoutMs: 8_000 });
  return result.spawnError === null && result.code === 0;
}

export async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

/** Expand a leading `~` and resolve to an absolute path. */
export function expandPath(path: string): string {
  if (path === '~') return process.env.HOME ?? path;
  if (path.startsWith('~/')) return join(process.env.HOME ?? '~', path.slice(2));
  return isAbsolute(path) ? path : resolve(path);
}

/** Split a stream of text into complete lines, returning any trailing partial. */
export class LineSplitter {
  private buffer = '';

  push(chunk: string): string[] {
    this.buffer += chunk;
    const parts = this.buffer.split(/\r?\n/);
    this.buffer = parts.pop() ?? '';
    return parts;
  }

  flush(): string[] {
    if (!this.buffer) return [];
    const rest = this.buffer;
    this.buffer = '';
    return [rest];
  }
}
