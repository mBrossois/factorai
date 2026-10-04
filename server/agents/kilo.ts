/**
 * Kilo runner.
 *
 * The Kilo CLI is not bundled with this project, so the argv is intentionally
 * conservative and fully overridable:
 *
 *   FACTORAI_KILO_BIN=path/to/kilo           # custom binary
 *   FACTORAI_KILO_ARGS='["run","%PROMPT%"]'  # custom argv, %PROMPT% substituted
 *
 * When neither is set the runner assumes `kilo run "<prompt>"` and writes plain
 * text lines to the spell book. A wrong guess surfaces as a readable error on
 * the desk rather than a crash.
 */

import type { AgentRunner } from './claude';

function kiloBin(): string {
  return process.env.FACTORAI_KILO_BIN || 'kilo';
}

function kiloArgTemplate(prompt: string): string[] {
  const raw = process.env.FACTORAI_KILO_ARGS;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every((a) => typeof a === 'string')) {
        return (parsed as string[]).map((a) => a.replaceAll('%PROMPT%', prompt));
      }
    } catch {
      // fall through to the default template
    }
  }
  return ['run', prompt];
}

export const kiloRunner: AgentRunner = {
  type: 'kilo',
  bin: kiloBin(),
  streamFormat: 'text',
  label: 'Kilo',

  args(prompt) {
    return kiloArgTemplate(prompt);
  },

  interpret(line) {
    const trimmed = line.trim();
    if (!trimmed) return [];
    // Kilo's own JSON stream mode: pull out the text payloads.
    if (trimmed.startsWith('{')) {
      try {
        const event = JSON.parse(trimmed) as Record<string, unknown>;
        const text = event.text ?? event.content ?? event.message;
        if (typeof text === 'string' && text.trim()) return [text.trim()];
        return [];
      } catch {
        return [trimmed];
      }
    }
    return [trimmed];
  },
};
