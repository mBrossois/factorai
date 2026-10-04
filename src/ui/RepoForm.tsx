/**
 * Add / bind a repository.
 *
 * Two ways to connect a floor: a provider slug driven through `gh`/`glab`, or a
 * path to a local checkout, which needs no CLI at all and is what makes the
 * castle usable on a machine with neither tool installed.
 */

import { useMemo, useState } from 'react';

import { PROVIDERS, THEMES, type Provider, type Theme } from '../core/types';
import type { PanelProps } from './KanbanOverlay';

export function RepoForm({ state, send, onClose }: PanelProps) {
  const [slug, setSlug] = useState('');
  const [provider, setProvider] = useState<Provider>('github');
  const [localPath, setLocalPath] = useState('');
  const [theme, setTheme] = useState<Theme>('library');

  const capabilities = state.capabilities;
  const cliAvailable = provider === 'github' ? capabilities.ghCli : capabilities.glabCli;

  const suggestion = useMemo(() => {
    if (!slug) return null;
    return provider === 'github' ? `https://github.com/${slug}` : `https://gitlab.com/${slug}`;
  }, [slug, provider]);

  const canSubmit = slug.trim().length > 0 || localPath.trim().length > 0;

  const submit = () => {
    if (!canSubmit) return;
    send({
      t: 'createRepo',
      payload: {
        slug: slug.trim() || `local/${localPath.split('/').filter(Boolean).pop() ?? 'checkout'}`,
        provider,
        localPath: localPath.trim() || null,
        theme,
      },
    });
    onClose();
  };

  return (
    <aside className="panel" role="dialog" aria-label="Add a repository">
      <header className="panel__head">
        <h2 className="panel__title">Bind a repository</h2>
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
          <label className="field">
            <span className="field__label">Provider</span>
            <div className="chiprow">
              {PROVIDERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip ${provider === option ? 'chip--active' : ''}`}
                  onClick={() => setProvider(option)}
                >
                  {option}
                  <span className={`dot ${capabilities[option === 'github' ? 'ghCli' : 'glabCli'] ? 'dot--ok' : 'dot--off'}`} />
                </button>
              ))}
            </div>
          </label>

          <label className="field">
            <span className="field__label">Repository slug</span>
            <input
              className="input"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder={provider === 'github' ? 'owner/name' : 'group/project'}
              autoComplete="off"
              spellCheck={false}
            />
            {suggestion && <span className="muted small">{suggestion}</span>}
          </label>

          <label className="field">
            <span className="field__label">Floor theme</span>
            <select className="input" value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              {THEMES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Local checkout (optional)</span>
            <input
              className="input"
              value={localPath}
              onChange={(event) => setLocalPath(event.target.value)}
              placeholder="/absolute/path/to/repo"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="muted small">
              With a local path the floor works without any CLI, and agents run directly in that folder.
            </span>
          </label>

          {!cliAvailable && !localPath.trim() && (
            <p className="warn small">
              The {provider === 'github' ? '`gh`' : '`glab`'} CLI was not found on this host, so the floor will show as
              unlinked until you install and authenticate it.
            </p>
          )}

          <div className="chiprow">
            <button type="submit" className="button button--primary" disabled={!canSubmit}>
              raise a new floor
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