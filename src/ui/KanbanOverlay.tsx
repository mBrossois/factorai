/**
 * 2D overlay panels.
 *
 * The 3D world is the read surface (who is working, what is bottled, what is
 * failing); these panels are the write surface. Everything the Head Mistress'
 * office can do is here: assign work, move orders, open pull requests, manage
 * repos and agents, and read an agent's live log.
 */

import { useEffect, useMemo, useState } from 'react';

import type { ClientMessage } from '../core/protocol';
import type { Agent, AppState, CheckState, Issue, IssueStatus, Repo } from '../core/types';
import { EMPTY_CHECKS, agentsForRepo, issuesForRepo, orderedFloors, prsForRepo } from '../core/types';
import type { Panel } from '../three/Scene';
import { IssueForm } from './IssueForm';
import { RepoForm } from './RepoForm';

export interface PanelProps {
  panel: Panel;
  state: AppState;
  send: (message: ClientMessage) => boolean;
  onOpen: (panel: Panel) => void;
  onClose: () => void;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  todo: 'To brew',
  'in-progress': 'At the cauldron',
  done: 'Bottled',
};

export function KanbanOverlay(props: PanelProps) {
  const { panel, onClose } = props;
  if (panel.kind === 'none') return null;

  if (panel.kind === 'repo-form') return <RepoForm {...props} />;
  if (panel.kind === 'issue-form') return <IssueForm {...props} />;

  const titles: Partial<Record<Panel['kind'], string>> = {
    board: 'The Grand Board',
    shelf: 'Potion shelf',
    cauldron: 'Test cauldron',
    agent: 'Wizard',
    office: "Head Mistress' office",
    help: 'House rules',
  };
  const title = titles[panel.kind] ?? 'FactorAI';

  return (
    <aside className="panel" role="dialog" aria-label={title}>
      <header className="panel__head">
        <h2 className="panel__title">{title}</h2>
        <button type="button" className="panel__close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </header>
      <div className="panel__body">
        {panel.kind === 'board' && <BoardPanel {...props} repoId={panel.repoId} />}
        {panel.kind === 'shelf' && <ShelfPanel {...props} repoId={panel.repoId} />}
        {panel.kind === 'cauldron' && <CauldronPanel state={props.state} repoId={panel.repoId} />}
        {panel.kind === 'agent' && <AgentPanel {...props} agentId={panel.agentId} />}
        {panel.kind === 'office' && <OfficePanel {...props} />}
        {panel.kind === 'help' && <HelpPanel />}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * Board
 * ------------------------------------------------------------------ */

function BoardPanel({ state, send, repoId, onOpen, onSelectAgent, selectedAgentId }: PanelProps & { repoId: string | null }) {
  const issues = useMemo(() => {
    const scoped = repoId ? issuesForRepo(state, repoId) : state.issues;
    return [...scoped].sort((a, b) => b.createdAt - a.createdAt);
  }, [state, repoId]);

  const [openIssueId, setOpenIssueId] = useState<string | null>(null);
  const repo = state.repos.find((r) => r.id === repoId);

  return (
    <div className="stack">
      <div className="chiprow">
        <button type="button" className="chip chip--active">
          {repo ? repo.name : 'Every floor'} · {issues.length} orders
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => onOpen({ kind: 'issue-form', repoId: repoId ?? undefined })}
          disabled={state.repos.length === 0}
        >
          + potion order
        </button>
      </div>

      {issues.length === 0 && <p className="muted">No potion orders have been filed yet.</p>}

      {(['todo', 'in-progress', 'done'] as IssueStatus[]).map((status) => {
        const column = issues.filter((i) => i.status === status);
        return (
          <section key={status} className="column">
            <h3 className="column__title">
              {STATUS_LABEL[status]} <span className="column__count">{column.length}</span>
            </h3>
            {column.length === 0 && <p className="muted column__empty">Nothing here.</p>}
            {column.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                repo={state.repos.find((r) => r.id === issue.repoId)}
                agents={agentsForRepo(state, issue.repoId)}
                selectedAgentId={selectedAgentId}
                expanded={openIssueId === issue.id}
                onToggle={() => setOpenIssueId(openIssueId === issue.id ? null : issue.id)}
                send={send}
                onSelectAgent={onSelectAgent}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function IssueCard({
  issue,
  repo,
  agents,
  expanded,
  onToggle,
  send,
  selectedAgentId,
  onSelectAgent,
}: {
  issue: Issue;
  repo: Repo | undefined;
  agents: Agent[];
  expanded: boolean;
  onToggle: () => void;
  send: (message: ClientMessage) => boolean;
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
}) {
  const assignee = agents.find((a) => a.id === issue.assigneeId);
  return (
    <article className={`card card--${issue.priority}`}>
      <button type="button" className="card__head" onClick={onToggle} aria-expanded={expanded}>
        <span className="card__title">
          {issue.number !== null && <span className="card__number">#{issue.number}</span>}
          {issue.title}
        </span>
        <span className="card__meta">
          <span className={`tag tag--${issue.priority}`}>{issue.priority}</span>
          {assignee ? (
            <span className={`tag tag--agent tag--${assignee.status}`}>{assignee.name}</span>
          ) : (
            <span className="tag tag--idle">unassigned</span>
          )}
        </span>
      </button>

      {expanded && (
        <div className="card__body">
          {repo && <p className="muted small">{repo.name} · {repo.slug}</p>}
          <p className="card__body-text">{issue.body || 'No description written yet.'}</p>
          {issue.url && (
            <a className="link" href={issue.url} target="_blank" rel="noreferrer noopener">
              open upstream
            </a>
          )}

          <div className="field">
            <span className="field__label">Assign a wizard</span>
            <div className="chiprow">
              {agents.length === 0 && <span className="muted small">No wizards on this floor yet.</span>}
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  className={`chip chip--${agent.status} ${selectedAgentId === agent.id ? 'chip--active' : ''}`}
                  onClick={() => {
                    onSelectAgent(selectedAgentId === agent.id ? null : agent.id);
                    if (!issue.assigneeId) {
                      send({ t: 'assignAgent', payload: { agentId: agent.id, issueId: issue.id } });
                    }
                  }}
                >
                  {agent.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">Move this order</span>
            <div className="chiprow">
              {(['todo', 'in-progress', 'done'] as IssueStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`chip ${issue.status === status ? 'chip--active' : ''}`}
                  onClick={() => send({ t: 'setIssueStatus', payload: { issueId: issue.id, status } })}
                >
                  {STATUS_LABEL[status]}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field__label">Bottle a potion</span>
            <div className="chiprow">
              <button type="button" className="chip" onClick={() => send({ t: 'createPr', payload: { issueId: issue.id } })}>
                open a pull request
              </button>
              {assignee && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    send({ t: 'unassignAgent', payload: { agentId: assignee.id } });
                    onSelectAgent(null);
                  }}
                >
                  release {assignee.name}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

/* ------------------------------------------------------------------ *
 * Shelf
 * ------------------------------------------------------------------ */

function ShelfPanel({ state, repoId, onOpen }: PanelProps & { repoId: string | null }) {
  const prs = useMemo(() => {
    const scoped = repoId ? prsForRepo(state, repoId) : state.prs;
    return [...scoped].sort((a, b) => b.createdAt - a.createdAt);
  }, [state, repoId]);

  return (
    <div className="stack">
      <div className="chiprow">
        {prs.filter((p) => p.status === 'open').length} open · {prs.filter((p) => p.status === 'merged').length} merged ·{' '}
        {prs.filter((p) => p.status === 'closed').length} closed
      </div>
      {prs.length === 0 && <p className="muted">Nothing has been bottled yet.</p>}
      {prs.map((pr) => (
        <article key={pr.id} className={`card card--pr card--${pr.status}`}>
          <div className="card__head card__head--static">
            <span className="card__title">
              {pr.number !== null && <span className="card__number">#{pr.number}</span>}
              {pr.title}
            </span>
            <span className={`tag tag--pr-${pr.status}`}>{pr.status}</span>
          </div>
          <div className="card__body">
            <Checks checks={pr.checks} />
            <p className="muted small">
              {state.repos.find((r) => r.id === pr.repoId)?.name ?? 'unknown floor'}
              {pr.authorId ? ` · raised by ${state.agents.find((a) => a.id === pr.authorId)?.name ?? 'a wizard'}` : ''}
            </p>
            {pr.url.startsWith('http') ? (
              <a className="link" href={pr.url} target="_blank" rel="noreferrer noopener">
                open on {state.repos.find((r) => r.id === pr.repoId)?.provider ?? 'the provider'}
              </a>
            ) : (
              <span className="muted small">{pr.url} (botted locally)</span>
            )}
            {pr.issueId && (
              <button type="button" className="chip" onClick={() => onOpen({ kind: 'board', repoId: pr.repoId })}>
                see the potion order
              </button>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function Checks({ checks }: { checks: CheckState }) {
  if (checks.total === 0) return <p className="muted small">No checks reported.</p>;
  const ratio = checks.passing / checks.total;
  const tone = checks.failing > 0 ? 'bad' : ratio === 1 ? 'good' : 'warn';
  return (
    <div className="checks">
      <div className="checks__bar">
        <span className={`checks__fill checks__fill--${tone}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
      <span className="checks__label">
        {checks.passing}/{checks.total} passing
        {checks.failing > 0 && ` · ${checks.failing} failing`}
        {checks.pending > 0 && ` · ${checks.pending} pending`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cauldron
 * ------------------------------------------------------------------ */

function CauldronPanel({ state, repoId }: { state: AppState; repoId: string }) {
  const repo = state.repos.find((r) => r.id === repoId);
  const prs = prsForRepo(state, repoId);

  const totals = prs
    .filter((p) => p.status === 'open')
    .reduce<CheckState>(
      (acc, pr) => ({
        total: acc.total + pr.checks.total,
        passing: acc.passing + pr.checks.passing,
        failing: acc.failing + pr.checks.failing,
        pending: acc.pending + pr.checks.pending,
      }),
      { ...EMPTY_CHECKS },
    );

  return (
    <div className="stack">
      <section className="statgrid">
        <Stat label="passing" value={totals.passing} tone="good" />
        <Stat label="failing" value={totals.failing} tone={totals.failing > 0 ? 'bad' : 'flat'} />
        <Stat label="pending" value={totals.pending} tone="warn" />
        <Stat label="open PRs" value={prs.filter((p) => p.status === 'open').length} tone="flat" />
      </section>
      <Checks checks={totals} />
      <p className="muted small">
        The cauldron boils harder while checks are running. {repo?.connected ? `Polling ${repo.provider} for ${repo.slug}.` : (repo?.statusReason ?? 'Not connected.')}
      </p>
      {prs.length === 0 && <p className="muted">No pull requests to test yet.</p>}
      {prs.map((pr) => (
        <div key={pr.id} className="rowline">
          <span className="rowline__label">
            {pr.number !== null ? `#${pr.number} ` : ''}
            {pr.title}
          </span>
          <Checks checks={pr.checks} />
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: 'good' | 'bad' | 'warn' | 'flat' }) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Wizard
 * ------------------------------------------------------------------ */

function AgentPanel({ state, agentId, send, onClose, onOpen }: PanelProps & { agentId: string }) {
  const agent = state.agents.find((a) => a.id === agentId);
  const logs = state.logs[agentId] ?? [];
  const task = state.issues.find((i) => i.id === agent?.currentTaskId);

  if (!agent) {
    return <p className="muted">This wizard has been dismissed.</p>;
  }

  const repo = state.repos.find((r) => r.id === agent.repoId);

  return (
    <div className="stack">
      <section className="statgrid">
        <Stat label="status" value={STATUS_TEXT[agent.status]} tone={agent.status === 'error' ? 'bad' : agent.status === 'working' ? 'warn' : 'flat'} />
        <Stat label="type" value={agent.type} tone="flat" />
        <Stat label="pid" value={agent.processId ?? '—'} tone="flat" />
        <Stat label="desk" value={agent.desk + 1} tone="flat" />
      </section>

      <p className="muted small">
        {repo ? `${repo.name} · ${repo.slug}` : 'no floor'}
        {agent.lastError && <span className="error"> · {agent.lastError}</span>}
      </p>

      {task && (
        <section className="card">
          <div className="card__head card__head--static">
            <span className="card__title">{task.title}</span>
            <span className={`tag tag--${task.priority}`}>{task.priority}</span>
          </div>
          <div className="card__body">
            <p className="card__body-text">{task.body || 'No description written yet.'}</p>
          </div>
        </section>
      )}

      <div className="chiprow">
        {agent.status === 'working' ? (
          <button type="button" className="chip chip--danger" onClick={() => send({ t: 'killAgent', payload: { agentId } })}>
            stop the process
          </button>
        ) : (
          <button type="button" className="chip" onClick={() => send({ t: 'restartAgent', payload: { agentId } })}>
            {agent.currentTaskId ? 'resume the task' : 'wake this wizard'}
          </button>
        )}
        <button type="button" className="chip" onClick={() => onOpen({ kind: 'board', repoId: agent.repoId })}>
          floor kanban
        </button>
        <button type="button" className="chip" onClick={() => send({ t: 'createPr', payload: { issueId: task?.id ?? '' } })} disabled={!task}>
          bottle a potion
        </button>
        <button type="button" className="chip chip--danger" onClick={() => { send({ t: 'removeAgent', payload: { agentId } }); onClose(); }}>
          dismiss
        </button>
      </div>

      <section className="log">
        <h3 className="column__title">Spell book</h3>
        {logs.length === 0 ? (
          <p className="muted">Nothing has been said yet.</p>
        ) : (
          <pre className="log__body">{logs.slice(-80).join('\n')}</pre>
        )}
      </section>
    </div>
  );
}

const STATUS_TEXT: Record<Agent['status'], string> = {
  idle: 'idle',
  working: 'working',
  error: 'error',
};

/* ------------------------------------------------------------------ *
 * Office: repos + roster
 * ------------------------------------------------------------------ */

function OfficePanel({ state, send, onOpen, onClose }: PanelProps) {
  const [tab, setTab] = useState<'repos' | 'roster'>('repos');
  const floors = orderedFloors(state);
  const agents = state.agents;

  return (
    <div className="stack">
      <div className="chiprow">
        <button type="button" className={`chip ${tab === 'repos' ? 'chip--active' : ''}`} onClick={() => setTab('repos')}>
          repositories
        </button>
        <button type="button" className={`chip ${tab === 'roster' ? 'chip--active' : ''}`} onClick={() => setTab('roster')}>
          wizards ({agents.length})
        </button>
        <button type="button" className="chip" onClick={() => onOpen({ kind: 'repo-form' })}>
          + add repository
        </button>
      </div>

      {tab === 'repos' && (
        <div className="stack">
          {floors.length === 0 && <p className="muted">No repositories are bound to this castle yet.</p>}
          {floors.map((repo) => (
            <article key={repo.id} className="card">
              <div className="card__head card__head--static">
                <span className="card__title">
                  floor {repo.floorNumber} · {repo.name}
                </span>
                <span className={`tag tag--${repo.connected ? 'working' : 'error'}`}>{repo.connected ? 'linked' : 'unlinked'}</span>
              </div>
              <div className="card__body">
                <p className="muted small">
                  {repo.provider} · {repo.slug} · theme {repo.theme}
                </p>
                {repo.statusReason && <p className="error small">{repo.statusReason}</p>}
                {repo.localPath && <p className="muted small">local checkout: {repo.localPath}</p>}
                <p className="muted small">
                  {agentsForRepo(state, repo.id).length} wizards · {issuesForRepo(state, repo.id).length} orders ·{' '}
                  {prsForRepo(state, repo.id).length} potions
                </p>
                <div className="chiprow">
                  <button type="button" className="chip" onClick={() => send({ t: 'refreshRepo', payload: { repoId: repo.id } })}>
                    poll now
                  </button>
                  <button type="button" className="chip" onClick={() => onOpen({ kind: 'board', repoId: repo.id })}>
                    kanban
                  </button>
                  <button type="button" className="chip" onClick={() => onOpen({ kind: 'issue-form', repoId: repo.id })}>
                    new order
                  </button>
                  <button
                    type="button"
                    className="chip chip--danger"
                    onClick={() => {
                      if (confirm(`Unbind ${repo.name}? Its floor and wizards leave the castle.`)) {
                        send({ t: 'removeRepo', payload: { repoId: repo.id } });
                        onClose();
                      }
                    }}
                  >
                    unbind
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === 'roster' && (
        <div className="stack">
          <div className="chiprow">
            {floors.map((repo) => (
              <span key={repo.id} className="chiprow__group">
                <span className="muted small">{repo.name}</span>
                {(['claude', 'kilo'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={`chip chip--${type}`}
                    onClick={() => send({ t: 'createAgent', payload: { repoId: repo.id, type } })}
                  >
                    + {type}
                  </button>
                ))}
              </span>
            ))}
          </div>

          {agents.length === 0 && <p className="muted">No wizards have been summoned yet.</p>}
          {agents.map((agent) => (
            <article key={agent.id} className="card">
              <div className="card__head card__head--static">
                <span className="card__title">
                  {agent.name} <span className="muted small">({agent.type})</span>
                </span>
                <span className={`tag tag--${agent.status}`}>{agent.status}</span>
              </div>
              <div className="card__body">
                <p className="muted small">
                  {state.repos.find((r) => r.id === agent.repoId)?.name ?? 'no floor'} · desk {agent.desk + 1}
                  {agent.lastError && <span className="error"> · {agent.lastError}</span>}
                </p>
                <p className="card__body-text">
                  {state.issues.find((i) => i.id === agent.currentTaskId)?.title ?? 'awaiting a potion order'}
                </p>
                <div className="chiprow">
                  <button type="button" className="chip" onClick={() => onOpen({ kind: 'agent', agentId: agent.id })}>
                    spell book
                  </button>
                  <button type="button" className="chip" onClick={() => send({ t: 'killAgent', payload: { agentId: agent.id } })}>
                    stop
                  </button>
                  <button type="button" className="chip" onClick={() => send({ t: 'restartAgent', payload: { agentId: agent.id } })}>
                    restart
                  </button>
                  <button
                    type="button"
                    className="chip chip--danger"
                    onClick={() => send({ t: 'removeAgent', payload: { agentId: agent.id } })}
                  >
                    dismiss
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Help
 * ------------------------------------------------------------------ */

function HelpPanel() {
  return (
    <div className="stack">
      <table className="keys">
        <tbody>
          <KeyRow keys="click" action="take control of the castle (pointer lock)" />
          <KeyRow keys="W A S D" action="walk" />
          <KeyRow keys="shift" action="stride faster" />
          <KeyRow keys="E" action="read a board, open a desk, step on a stairwell" />
          <KeyRow keys="Esc" action="release the mouse and open menus" />
          <KeyRow keys="1 – 9" action="jump to a floor from the HUD" />
          <KeyRow keys="F" action="toggle this panel" />
        </tbody>
      </table>
      <p className="muted small">
        Every floor of the castle is one repository. Every wizard at a desk is one coding agent running a real
        Claude Code or Kilo process. Issues are potion orders on the kanban; pull requests are bottled potions on the
        shelf; browser-test failures bubble in the cauldron.
      </p>
    </div>
  );
}

function KeyRow({ keys, action }: { keys: string; action: string }) {
  return (
    <tr>
      <td>
        <kbd>{keys}</kbd>
      </td>
      <td>{action}</td>
    </tr>
  );
}

/** Release pointer lock whenever a panel opens so the mouse works again. */
export function useExitPointerLock(open: boolean): void {
  useEffect(() => {
    if (open && document.pointerLockElement) document.exitPointerLock();
  }, [open]);
}
