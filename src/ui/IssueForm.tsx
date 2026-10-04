/**
 * File a new potion order (issue).
 *
 * When the floor is linked to a provider CLI the order is also created
 * upstream, and the resulting number and URL are folded back into the record.
 * `pushRemote: false` keeps it local-only, which is what you want on a local
 * checkout floor.
 */

import { useMemo, useState } from 'react';

import { PRIORITIES, type Priority } from '../core/types';
import type { PanelProps } from './KanbanOverlay';

export function IssueForm({ state, send, onClose, panel }: PanelProps) {
  const presetRepoId = panel.kind === 'issue-form' ? panel.repoId : undefined;
  const [repoId, setRepoId] = useState(presetRepoId ?? state.repos[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [assigneeId, setAssigneeId] = useState('');
  const [pushRemote, setPushRemote] = useState(false);

  const repo = state.repos.find((r) => r.id === repoId);
  const agents = useMemo(
    () => (repoId ? state.agents.filter((a) => a.repoId === repoId) : []),
    [state.agents, repoId],
  );

  // A floor backed by a provider CLI should file upstream by default; a local
  // checkout cannot, so it defaults to local-only.
  const upstreamAvailable = Boolean(repo?.connected && !repo?.localPath);
  const effectivePush = upstreamAvailable && pushRemote;

  const canSubmit = title.trim().length > 0 && repoId.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    send({
      t: 'createIssue',
      payload: {
        repoId,
        title: title.trim(),
        body: body.trim(),
        priority,
        assigneeId: assigneeId || null,
        pushRemote: effectivePush,
      },
    });
    onClose();
  };

  return (
    <aside className="panel" role="dialog" aria-label="New potion order">
      <header className="panel__head">
        <h2 className="panel__title">Write a potion order</h2>
        <button type="button" className="panel__close" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </header>

      <div className="panel__body">
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {state.repos.length === 0 ? (
            <p className="warn small">Bind a repository first - every potion order belongs to a floor.</p>
          ) : (
            <label className="field">
              <span className="field__label">Floor</span>
              <select className="input" value={repoId} onChange={(event) => setRepoId(event.target.value)}>
                {state.repos.map((option) => (
                  <option key={option.id} value={option.id}>
                    floor {option.floorNumber} · {option.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span className="field__label">Title</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What must be built?"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span className="field__label">Description</span>
            <textarea
              className="input input--area"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={6}
              placeholder="What does done look like? Which cases must pass?"
            />
          </label>

          <label className="field">
            <span className="field__label">Priority</span>
            <div className="chiprow">
              {PRIORITIES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip tag--${option} ${priority === option ? 'chip--active' : ''}`}
                  onClick={() => setPriority(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </label>

          {agents.length > 0 && (
            <label className="field">
              <span className="field__label">Assign now (optional)</span>
              <select className="input" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
                <option value="">leave it on the board</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} · {agent.type} · {agent.status}
                  </option>
                ))}
              </select>
            </label>
          )}

          {upstreamAvailable && (
            <label className="field field--inline">
              <input type="checkbox" checked={pushRemote} onChange={(event) => setPushRemote(event.target.checked)} />
              <span className="field__label">also file it on {repo?.provider}</span>
            </label>
          )}

          <div className="chiprow">
            <button type="submit" className="button button--primary" disabled={!canSubmit}>
              post the order
            </button>
            <button type="button" className="button" onClick={onClose}>
              cancel
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
}