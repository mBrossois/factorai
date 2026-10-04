/**
 * Claude Code runner.
 *
 * The backend drives the real `claude` CLI in non-interactive print mode and
 * streams its output to the wizard's spell book. Only the argv builder and the
 * output interpreter live here -- spawning is the manager's job.
 */

import type { AgentType } from '../../src/core/types';

export interface AgentRunner {
  type: AgentType;
  /** Binary name, overridable so the orchestrator can target a custom install. */
  bin: string;
  /** How to interpret a line of stdout. */
  streamFormat: 'json' | 'text';
  label: string;
  args(prompt: string, options: { model?: string | null }): string[];
  interpret(line: string): string[];
}

/** `FACTORAI_CLAUDE_BIN` lets you point at a specific install. */
function claudeBin(): string {
  return process.env.FACTORAI_CLAUDE_BIN || 'claude';
}

interface ClaudeContentBlock {
  type?: string;
  text?: string;
  name?: string;
}

interface ClaudeEvent {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  message?: { content?: unknown };
  delta?: { text?: string };
}

/**
 * Turn one line of `claude --output-format stream-json` into display lines.
 * Returns `[]` for events with nothing worth showing (tool bookkeeping).
 */
export function parseClaudeStreamLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('{')) return [trimmed];

  let event: ClaudeEvent;
  try {
    event = JSON.parse(trimmed) as ClaudeEvent;
  } catch {
    return [trimmed];
  }

  switch (event.type) {
    case 'assistant': {
      const content = event.message?.content;
      if (!Array.isArray(content)) return [];
      const out: string[] = [];
      for (const raw of content) {
        const block = raw as ClaudeContentBlock;
        if (block.type === 'text' && block.text?.trim()) out.push(block.text.trim());
        else if (block.type === 'tool_use' && block.name) out.push(`✦ ${block.name}`);
      }
      return out;
    }
    case 'user': {
      const content = event.message?.content;
      if (!Array.isArray(content)) return [];
      const out: string[] = [];
      for (const raw of content) {
        const block = raw as ClaudeContentBlock;
        if (block.type === 'tool_result') out.push('↩ tool result');
      }
      return out;
    }
    case 'stream_event': {
      const text = event.delta?.text?.trim();
      return text ? [text] : [];
    }
    case 'result': {
      const result = event.result?.trim();
      if (result) return [event.is_error ? `✗ ${result}` : result];
      return [];
    }
    case 'system': {
      if (event.subtype === 'init') return ['⚡ session started'];
      return event.subtype ? [`⚙ ${event.subtype}`] : [];
    }
    default:
      return [];
  }
}

export const claudeRunner: AgentRunner = {
  type: 'claude',
  bin: claudeBin(),
  streamFormat: 'json',
  label: 'Claude Code',

  args(prompt, options) {
    const args = [
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
    ];
    if (options.model) args.push('--model', options.model);
    args.push(prompt);
    return args;
  },

  interpret: parseClaudeStreamLine,
};
