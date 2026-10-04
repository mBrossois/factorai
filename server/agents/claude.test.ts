import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseClaudeStreamLine } from './claude';
import { LineSplitter } from '../util/cli';

test('claude stream: assistant text is surfaced', () => {
  const line = JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: '  Summoning the fix…  ' }] },
  });
  assert.deepEqual(parseClaudeStreamLine(line), ['Summoning the fix…']);
});

test('claude stream: tool use shows a rune, tool results are summarised', () => {
  assert.deepEqual(
    parseClaudeStreamLine(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit' }] } })),
    ['✦ Edit'],
  );
  assert.deepEqual(
    parseClaudeStreamLine(JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result' }] } })),
    ['↩ tool result'],
  );
});

test('claude stream: result carries the final summary and error flag', () => {
  assert.deepEqual(
    parseClaudeStreamLine(JSON.stringify({ type: 'result', subtype: 'success', result: 'done', is_error: false })),
    ['done'],
  );
  assert.deepEqual(
    parseClaudeStreamLine(JSON.stringify({ type: 'result', subtype: 'error_during_execution', result: 'boom', is_error: true })),
    ['✗ boom'],
  );
});

test('claude stream: bookkeeping events are dropped, init is announced', () => {
  assert.deepEqual(parseClaudeStreamLine(JSON.stringify({ type: 'system', subtype: 'init' })), ['⚡ session started']);
  assert.deepEqual(parseClaudeStreamLine(JSON.stringify({ type: 'some_other_event' })), []);
  assert.deepEqual(parseClaudeStreamLine('   '), []);
});

test('claude stream: non-JSON output (plain print mode) passes through', () => {
  assert.deepEqual(parseClaudeStreamLine('plain text answer'), ['plain text answer']);
  assert.deepEqual(parseClaudeStreamLine('{broken json'), ['{broken json']);
});

test('LineSplitter re-assembles chunks split mid-line', () => {
  const splitter = new LineSplitter();
  assert.deepEqual(splitter.push('hello '), []);
  assert.deepEqual(splitter.push('world\nsecond'), ['hello world']);
  assert.deepEqual(splitter.push(' line\n'), ['second line']);
  assert.deepEqual(splitter.flush(), []);
});
