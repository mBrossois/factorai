# Agent Orchestration

How a potion order becomes a running Claude Code / Kilo process, and what
happens when the outside world (a missing CLI, a crashed agent, an unauthenticated
`gh`) does not cooperate.

## The shape of it

```
  create issue ──▶ assign to agent ──▶ resolve workspace ──▶ spawn process
        │                                                          │
        │                              stdout ──▶ store ──▶ WebSocket
        │                                                          │
        └────────────────────────── on exit ◀───────────────────────┘
                                 (idle | error)
```

The browser never touches a process. It sends `assignAgent` over the WebSocket;
`server/agents/manager.ts` does the rest. The agent's output is written into the
in-memory store, and because the store notifies its subscribers on every change,
that same output reaches every connected browser.

## One process per wizard

Each agent is a **separate OS process**, launched by the orchestrator:

| Agent type | Binary | Default argv |
| --- | --- | --- |
| `claude` | `claude` | `--print --output-format stream-json --verbose --permission-mode acceptEdits <prompt>` |
| `kilo` | `kilo` | `run <prompt>` |

Both are overridable, because the host's CLIs are not under this project's
control:

```bash
FACTORAI_CLAUDE_BIN=/opt/homebrew/bin/claude   # custom claude install
FACTORAI_KILO_BIN=~/bin/kilo                   # custom kilo install
FACTORAI_KILO_ARGS='["run","--yolo","%PROMPT%"]'   # custom argv; %PROMPT% is substituted
```

`--permission-mode acceptEdits` is what stops a Claude Code session from hanging
on a permission prompt in a non-interactive print run. If a future version
rejects the flag, the process exits immediately and the reason is written to the
wizard's spell book rather than silently stalling.

`FACTORAI_MAX_AGENTS` (default 4) caps concurrent processes. Exceeding it marks
the agent `error` with a readable reason instead of forking unbounded.

## Workspaces

`AgentManager.resolveWorkspace(repo)` picks, in order:

1. **`repo.localPath`** — used directly if the directory exists. This is the path
   that makes FactorAI usable on a machine with no `gh` and no `glab`: agents run
   in your checkout, and nothing is cloned or pushed.
2. **`server/.workspaces/repos/<repoId>`** — cloned once via
   `gh repo clone` / `glab repo clone` and reused for every agent on that floor.
3. Neither works → the agent is marked `error` with the clone failure message.

`server/.workspaces/` is git-ignored and is also where the demo floor's sandbox
lives.

## The prompt

`buildPrompt()` assembles the agent's brief from the issue and repo: who the
agent is, which repo and working directory it has, the issue title, priority and
body, and a short list of house rules (work only in the working directory,
implement end to end, run the checks, summarise at the end).

## Streaming output

Claude Code's `stream-json` output is a stream of JSON lines; the wizard's spell
book wants short readable runes. `parseClaudeStreamLine`
(`server/agents/claude.ts`) maps each event:

| Event | Rendered as |
| --- | --- |
| `system` / `init` | `⚡ session started` |
| `assistant` text block | the text, verbatim |
| `assistant` tool_use | `✦ Edit` |
| `user` tool_result | `↩ tool result` |
| `result` | the final summary, or `✗ …` when `is_error` |
| everything else | dropped |

Lines are re-assembled from arbitrary chunk boundaries (`LineSplitter`), then
batched at 120 ms before being pushed to the store. A chatty agent therefore
cannot flood the WebSocket, and a slow one still updates promptly.

Both functions are pure and unit-tested against fixture output — they are the
only part of the agent layer that can be verified without spawning anything.

## Failure handling

The orchestrator assumes the outside world will fail. No public method throws;
every failure becomes agent status plus a line in the spell book.

| Failure | Result |
| --- | --- |
| CLI not installed | `error`, message names the binary and says it is not on PATH |
| Binary exits non-zero | `error`, message includes the exit code |
| Clone fails | `error`, message includes the provider CLI failure |
| Workdir missing | `error`, message includes the resolved path |
| Process killed by the user | `idle`, not `error` — a deliberate stop is not a failure |
| Server shutdown | `SIGTERM` to every child, then exit |

Crashed agents are marked `error` and left for the player to `restart` or
`dismiss` from the wizard panel. There is no silent auto-restart loop: a wizard
that crashes on a given issue would crash forever, and an invisible retry is
worse to debug than a red desk.

A process guard prevents double-spawning: a second `assign` for an agent already
working is refused with `agent is already working`.

## Git integration

`server/git/github.ts` and `server/git/gitlab.ts` implement one interface over
`gh` and `glab` respectively.

| Operation | GitHub | GitLab |
| --- | --- | --- |
| verify | `gh repo view <slug> --json nameWithOwner` | `glab auth status` + `glab repo view` |
| list issues | `gh issue list --state all --json …` | `glab issue list --all --output json` |
| create issue | `gh issue create` | `glab issue create --yes` |
| list PRs | `gh pr list --state all --json …` | `glab mr list --all --output json` |
| create PR | `gh pr create` | `glab mr create --yes` |
| checks | `gh pr checks --json name,state,bucket` | `glab mr view --output json` → `head_pipeline.status` |

**CLI output is treated as untrusted.** Field names drift between versions and
a failed command prints to stderr, so every parser in `server/git/parsers.ts`:

- accepts several field spellings (`iid`/`number`/`id`, `description`/`body`,
  `web_url`/`url`);
- tolerates a wrapper object or a bare array;
- returns an empty list instead of throwing;
- falls back to plain-text parsing when `--output json` is unsupported.

These parsers are the project's main unit-tested surface (12 tests).

### Polling

`syncRepo()` reconciles one repo on an interval (default 45 s,
`FACTORAI_POLL_SECONDS`, adjustable at runtime with `setPollInterval`):

- Verify the provider; on failure set `connected: false` and a readable
  `statusReason` — the floor hologram shows it, and the provider availability
  dot goes amber in the HUD.
- Upsert issues by **number**. Remote state only wins for issues with no local
  assignee: a poll will never stomp on work in flight.
- Upsert PRs by number, and fire `prCreated` for genuinely new ones so a potion
  materialises on the shelf.
- Fetch check state per open PR; that is what drives the cauldron's colour and
  boil rate.

Concurrent syncs of the same repo are suppressed. Removing a repo kills its
agents first, then compacts the remaining floor numbers so the castle never has a
gap.

## Local-only floors

A repo bound to a `localPath` has no provider CLI involved at all:

- `connected` is decided by whether the directory exists;
- issues and PRs are recorded locally;
- `createPr` bottles the potion and says plainly that nothing was pushed.

This is the mode to use when you want to drive your own checkout without giving
the orchestrator any remote credentials.

## State model

In-memory only; restarting the orchestrator resets the castle. This is an
explicit v1 boundary, not an oversight.

One deviation from the plan's sketch: it drew `Issue.assignee: Agent | null` and
`PullRequest.author: Agent`. That is a cycle (`Agent.currentTask → Issue →
Agent`) which cannot survive JSON serialisation, so both are `*Id` references
(`assigneeId`, `authorId`) and the store maintains both sides of the link. The
store's unit tests pin that invariant, including on agent and repo removal.

## The protocol

Frames are `{ t, payload? }` — see `src/core/protocol.ts`.

**Client → server**

| Message | Effect |
| --- | --- |
| `subscribe` | request a fresh state snapshot |
| `createRepo` / `removeRepo` / `refreshRepo` | bind, unbind, or re-poll a repo |
| `createIssue` / `setIssueStatus` | file or move a potion order |
| `createAgent` / `removeAgent` | summon or dismiss a wizard |
| `assignAgent` / `unassignAgent` | give or take back work |
| `killAgent` / `restartAgent` | stop or resume a process |
| `createPr` | bottle a potion |
| `setPollInterval` | change the polling cadence |

**Server → client**

| Message | Effect |
| --- | --- |
| `state` | full snapshot; sent on connect and on every mutation |
| `agentLog` | new log lines for one agent, appended to its spell book |
| `issueUpdated` / `prCreated` | targeted updates for instant feedback |
| `error` / `notice` | user-facing text, shown as a toast |
| `pong` | liveness reply to `ping` |

The server validates `t` against `CLIENT_MESSAGE_TYPES` before routing, so an
unknown frame is rejected rather than reaching the handler.

The same actions are exposed over REST (`POST /api/repos`, `/api/issues`,
`/api/agents/:id/assign`, …) for scripting; both paths funnel through the same
`dispatch`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `FACTORAI_PORT` | `8787` | HTTP + WebSocket port |
| `FACTORAI_HOST` | `127.0.0.1` | bind address |
| `FACTORAI_POLL_SECONDS` | `45` | provider polling interval (clamped 5–600) |
| `FACTORAI_MAX_AGENTS` | `4` | concurrent agent process cap |
| `FACTORAI_SEED` | on | set to `0` to skip the demo castle |
| `FACTORAI_CLAUDE_BIN` | `claude` | Claude Code binary |
| `FACTORAI_KILO_BIN` | `kilo` | Kilo binary |
| `FACTORAI_KILO_ARGS` | `["run","%PROMPT%"]` | Kilo argv template |

## Security

Out of scope for v1, and worth stating plainly: **the orchestrator runs agent
processes with the full privileges of the user that started it.** Anyone who can
reach the WebSocket can assign work that executes `claude`/`kilo` with tool
access. The server binds to `127.0.0.1` by default and CORS is enabled only
outside production, so it is not exposed by default — but do not bind it to a
public interface. Agent-level sandboxing (containers, restricted tool allowlists)
is the natural next step.