import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  BOARD_VERSION,
  BoardStore,
  boardDir,
  boardFileName,
  boardFrom,
  loadBoards,
  parseBoard,
  serializeBoard,
  type BoardFile,
  type BoardTask,
} from './boards';

const TASK: BoardTask = {
  title: 'Remember the added repositories',
  body: 'persist the castle',
  status: 'in-progress',
  priority: 'high',
  number: 1,
  url: 'https://github.com/mBrossois/factorai/issues/1',
  agent: 'Huffle',
  agentType: 'kilo',
  createdAt: 1_700_000_000_000,
};

const BOARD: BoardFile = {
  version: BOARD_VERSION,
  repo: {
    slug: 'mBrossois/factorai',
    name: 'factorai',
    provider: 'github',
    url: 'https://github.com/mBrossois/factorai',
    localPath: null,
    theme: 'library',
  },
  wizards: [
    { name: 'Huffle', type: 'kilo' },
    { name: 'Merlin', type: 'claude' },
  ],
  tasks: [TASK],
  savedAt: 1_700_000_000_500,
};

async function scratch(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'factorai-boards-test-'));
}

test('a slug becomes a safe file name inside the board folder', () => {
  assert.equal(boardFileName('mBrossois/factorai'), 'mBrossois__factorai.json');
  assert.equal(boardFileName('group/project'), 'group__project.json');
  assert.equal(boardFileName('local/some folder'), 'local__some_folder.json');
  assert.equal(boardFileName('../escape'), 'escape.json', 'a slug can never escape the folder');
  assert.equal(boardFileName(''), 'floor.json');
});

test('the board folder is configurable and defaults to the project', () => {
  assert.equal(boardDir(), join(process.cwd(), 'kanbanboard'));
  const previous = process.env.FACTORAI_KANBAN_DIR;
  process.env.FACTORAI_KANBAN_DIR = '/tmp/elsewhere';
  assert.equal(boardDir(), '/tmp/elsewhere');
  if (previous === undefined) delete process.env.FACTORAI_KANBAN_DIR;
  else process.env.FACTORAI_KANBAN_DIR = previous;
});

test('a board round trips through serialize and parse', () => {
  const parsed = parseBoard(serializeBoard(BOARD));
  assert.deepEqual(parsed, BOARD);
  assert.ok(serializeBoard(BOARD).endsWith('}\n'), 'files end with a newline');
});

test('parseBoard fills in what is missing and skips what makes no sense', () => {
  const partial = parseBoard(
    JSON.stringify({
      repo: { slug: 'acme/wand-core' },
      tasks: [
        { title: 'no fields at all' },
        { title: 'odd values', status: 'shipped', priority: 'urgent', agentType: 'merlin', agent: '  ' },
        { body: 'no title' },
      ],
    }),
  );
  assert.ok(partial);
  assert.equal(partial.version, BOARD_VERSION);
  assert.equal(partial.repo.provider, 'github', 'an unknown provider falls back to github');
  assert.equal(partial.repo.theme, 'library');
  assert.equal(partial.repo.name, 'wand-core');
  assert.deepEqual(partial.wizards, [], 'a board written before desks existed has none');
  assert.equal(partial.tasks.length, 2, 'a task without a title is not a task');

  const odd = partial.tasks[1]!;
  assert.equal(odd.status, 'todo', 'an unknown column falls back to todo');
  assert.equal(odd.priority, 'medium', 'an unknown priority falls back to medium');
  assert.equal(odd.agent, null);
  assert.equal(odd.agentType, null);
});

test('parseBoard keeps every desk it finds and drops nonsense ones', () => {
  const board = parseBoard(
    JSON.stringify({
      repo: { slug: 'acme/wand-core' },
      wizards: [
        { name: 'Huffle', type: 'kilo' },
        { name: 'Merlin', type: 'merlin' },
        { type: 'claude' },
        'not a wizard',
      ],
    }),
  );
  assert.ok(board);
  assert.deepEqual(board.wizards, [{ name: 'Huffle', type: 'kilo' }]);
});

test('parseBoard refuses anything that is not a board', () => {
  assert.equal(parseBoard(''), null);
  assert.equal(parseBoard('{ not json'), null);
  assert.equal(parseBoard('[]'), null);
  assert.equal(parseBoard('{"version":1}'), null);
  assert.equal(parseBoard('{"repo":{"name":"no slug"}}'), null);
});

test('boardFrom copies the floor and its orders into a board file', () => {
  const repo = {
    id: 'repo_1',
    slug: 'acme/wand-core',
    name: 'Wand core',
    provider: 'github' as const,
    url: 'https://github.com/acme/wand-core',
    localPath: null,
    floorNumber: 1,
    theme: 'alchemy-lab' as const,
    connected: false,
    statusReason: null,
    createdAt: 1,
  };
  const board = boardFrom(repo, [{ name: 'Huffle', type: 'kilo' }], [TASK]);
  assert.equal(board.repo.slug, 'acme/wand-core');
  assert.equal(board.repo.theme, 'alchemy-lab');
  assert.deepEqual(board.wizards, [{ name: 'Huffle', type: 'kilo' }]);
  assert.equal(board.tasks.length, 1);
  assert.ok(board.savedAt > 0);
});

test('a board survives a real write and read', async () => {
  const dir = await scratch();
  const store = new BoardStore(dir);

  store.schedule(BOARD, 0);
  await store.flush();

  const files = await readdir(dir);
  assert.deepEqual(files, ['mBrossois__factorai.json']);
  assert.deepEqual((await store.load()).map((entry) => entry.board), [BOARD]);
});

test('writing a floor is debounced and the last board wins', async () => {
  const dir = await scratch();
  const store = new BoardStore(dir);

  store.schedule(BOARD, 5);
  store.schedule({ ...BOARD, savedAt: 2, tasks: [] }, 5);
  store.schedule({ ...BOARD, savedAt: 3, tasks: [TASK, TASK] }, 5);
  await store.flush();

  const loaded = await loadBoards(dir);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0]?.board.tasks.length, 2, 'the newest board is the one on disk');
  assert.equal(loaded[0]?.board.savedAt, 3);
});

test('an unchanged board is not rewritten', async () => {
  const dir = await scratch();
  const store = new BoardStore(dir);
  const file = join(dir, boardFileName(BOARD.repo.slug));

  store.schedule({ ...BOARD, savedAt: 1 }, 0);
  await store.flush();
  const first = await readFile(file, 'utf8');

  store.schedule({ ...BOARD, savedAt: 999 }, 0);
  await store.flush();
  assert.equal(await readFile(file, 'utf8'), first, 'a poll that changes nothing writes nothing');

  store.schedule({ ...BOARD, savedAt: 2, tasks: [TASK, TASK] }, 0);
  await store.flush();
  assert.notEqual(await readFile(file, 'utf8'), first, 'a real change is written');
});

test('forgetting a floor removes its board, and only its board', async () => {
  const dir = await scratch();
  const store = new BoardStore(dir);
  const other: BoardFile = { ...BOARD, repo: { ...BOARD.repo, slug: 'acme/wand-core' } };

  store.schedule(BOARD, 0);
  store.schedule(other, 0);
  await store.flush();

  await store.forget('mBrossois/factorai');
  const left = await loadBoards(dir);
  assert.deepEqual(
    left.map((entry) => entry.board.repo.slug),
    ['acme/wand-core'],
  );

  await store.forget('never/existed'); // must not throw
});

test('one bad file costs you that floor, not the castle', async () => {
  const dir = await scratch();
  await writeFile(join(dir, 'broken.json'), '{ "repo": { "slug"');
  await writeFile(join(dir, 'notaboard.json'), '{"hello":"world"}');
  await writeFile(join(dir, 'notes.txt'), 'ignored, not a board');
  const store = new BoardStore(dir);
  store.schedule(BOARD, 0);
  await store.flush();

  const loaded = await store.load();
  assert.deepEqual(
    loaded.map((entry) => entry.board.repo.slug),
    ['mBrossois/factorai'],
  );
});

test('a missing board folder is an empty castle, not an error', async () => {
  const dir = join(await scratch(), 'does', 'not', 'exist');
  assert.deepEqual(await loadBoards(dir), []);
  assert.deepEqual(await new BoardStore(dir).load(), []);
});
