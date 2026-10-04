# FactorAI

A wizarding-school 3D visualizer for a coding AI swarm, in the browser.

One **floor per repository**. One **wizard per coding agent**, running a real
Claude Code or Kilo process. **Issues** are potion orders on a kanban board,
**pull requests** are bottled potions on a shelf, and **CI failures** bubble in
the central cauldron. You walk around the castle in first person and read the
state of your swarm by looking at it.

<p align="center">
  <em>React + Three.js (cel-shaded) · Node/Express orchestrator · WebSocket live state</em>
</p>

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. The Vite dev server proxies `/api` and `/ws`
to the orchestrator on port 8787.

The orchestrator seeds a demo floor on first boot (a local sandbox repo with two
wizards, three orders and two bottled PRs) so the castle is not empty. Set
`FACTORAI_SEED=0` to skip it.

Production:

```bash
npm run build
npm start          # serves dist/ and the API from one process on :8787
```

## Controls

| Input | Action |
| --- | --- |
| Click | take control of the castle (pointer lock) |
| `W A S D` | walk · `Shift` to stride |
| Mouse | look |
| `E` | read a board, open a desk, step on a warp dais |
| `Esc` | release the mouse, close panels |
| `1`–`9` | jump to a floor |
| `F` | open the Head Mistress' office |

## What is in the castle

- **Great Hall** (ground floor) — the master kanban board listing every order in
  the castle, and a warp dais for each repository floor.
- **Repo floors** — one per connected repo, themed from a ten-way palette. Each
  has its own kanban board, test cauldron, potion shelf, and one desk per agent
  with a live spell book showing that agent's output.
- **Head Mistress' office** (east of the Great Hall) — add repositories, file
  potion orders, summon / restart / dismiss wizards. The wall mirror plots every
  repository as a constellation, glowing for each floor with agents at work.
- **Stairwells** — a spiral tower in each room with a warp dais up and a
  downward passage.

## Connecting a repository

Two modes, both from the Head Mistress' office:

1. **Provider slug** — e.g. `owner/name` with `github` or `gitlab`. Needs the
   `gh` / `glab` CLI installed and authenticated on the host. The orchestrator
   polls for issues, pull requests and check state.
2. **Local checkout** — give an absolute path. Needs no CLI at all, and agents
   run directly in that directory. This is the mode to use when you have neither
   `gh` nor `glab` (as on this machine, out of the box).

The HUD shows a dot per CLI (`claude`, `kilo`, `gh`, `glab`) so you can see at a
glance what this host can actually drive. Missing tooling is never fatal: an
unusable floor is labelled `unlinked` and says why on its plaque.

## Running an agent

1. File a **potion order** (issue) on a floor.
2. In the kanban panel, assign it to a wizard — or summon one from the office.
3. The orchestrator resolves the workspace and spawns a real process.
4. Its stdout streams into that wizard's **spell book** in 3D.
5. When it exits, bottle a **potion** (pull request) from the issue panel. If the
   floor is linked to a provider CLI it is opened for real; otherwise it is
   recorded locally and the UI says so.

Workers run one process each, capped by `FACTORAI_MAX_AGENTS` (default 4). A
crashed agent goes to `error` with the reason on its desk, and can be restarted
or dismissed from the office — there is no silent retry loop.

## Project layout

```
server/                     the orchestrator (Node + Express + ws)
  index.ts                  HTTP, WebSocket, pollers, message router, static dist
  agents/manager.ts         process lifecycle: spawn, stream, kill, restart
  agents/claude.ts          Claude Code argv + stream-json interpreter
  agents/kilo.ts            Kilo argv + output interpreter
  git/github.ts             gh wrapper
  git/gitlab.ts             glab wrapper
  git/parsers.ts            pure, defensive CLI-output parsers (unit tested)
  state/store.ts            in-memory swarm state
  state/events.ts           WebSocket hub
src/
  core/                     shared types + wire protocol (used by both sides)
  three/                    the castle: shaders, materials, props, characters
  three/environment/        Great Hall, repo floors, office, stairwell, room shell
  hooks/                    useWebSocket, useFirstPerson
  ui/                       2D overlay panels
docs/
  THEME.md                  art direction and the cel-shading pipeline
  AGENT-ORCHESTRATION.md    how an order becomes a process; failure modes
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | orchestrator + Vite dev server together |
| `npm run build` | production client bundle into `dist/` |
| `npm start` | serve `dist/` and the API from one process |
| `npm run typecheck` | `tsc --noEmit` over client and server |
| `npm run lint` | ESLint, flat config |
| `npm test` | unit tests for the CLI parsers, stream interpreter and store |
| `npm run check` | typecheck + lint + test + build |

## Documentation

- [docs/THEME.md](docs/THEME.md) — the art direction, the cel-shading pipeline,
  and why outlines are an inverted hull rather than a post-processing pass.
- [docs/AGENT-ORCHESTRATION.md](docs/AGENT-ORCHESTRATION.md) — process lifecycle,
  workspaces, streaming, failure handling, git polling, the protocol, and every
  environment variable.

## Known limits

- **No persistence.** State is in-memory; restarting the orchestrator resets the
  castle. Deliberate for v1.
- **No sandboxing.** The orchestrator runs agents with the full privileges of the
  user that started it. It binds to `127.0.0.1` by default — do not expose it.
- **No swarm scheduling.** One agent per issue, manual assignment. Dependency
  graphs and parallel fan-out are out of scope.
- **`kilo` argv is a best guess.** The Kilo CLI is not a dependency of this
  project, so `kilo run "<prompt>"` is assumed and overridable via
  `FACTORAI_KILO_BIN` / `FACTORAI_KILO_ARGS`.