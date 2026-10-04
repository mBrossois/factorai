/**
 * Application shell: the 3D castle, the HUD, and the 2D overlay panels.
 *
 * This component owns everything that is UI state rather than world state:
 * which floor the player is on, which panel is open, and whether the pointer is
 * locked. All swarm data arrives from the WebSocket hook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FirstPersonApi } from './hooks/useFirstPerson';
import { useSwarmSocket } from './hooks/useWebSocket';
import { Scene, useFloorNames, type Panel } from './three/Scene';
import { orderedFloors } from './core/types';
import { KanbanOverlay, useExitPointerLock } from './ui/KanbanOverlay';

export default function App() {
  const socket = useSwarmSocket();
  const { state } = socket;

  const [level, setLevel] = useState(0);
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [locked, setLocked] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);
  const [focus, setFocus] = useState<{ label: string; detail?: string } | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const controls = useRef<FirstPersonApi | null>(null);

  const floorNames = useFloorNames(state);
  const floors = useMemo(() => orderedFloors(state), [state]);
  const panelOpen = panel.kind !== 'none';

  useExitPointerLock(panelOpen);

  // Removing a repo can delete the floor the player is standing on. Clamp
  // during render rather than correcting in an effect, which would show the
  // deleted room for a frame.
  const safeLevel = Math.min(level, floors.length);

  const openPanel = useCallback((next: Panel) => setPanel(next), []);
  const closePanel = useCallback(() => setPanel({ kind: 'none' }), []);

  const onControls = useCallback((api: FirstPersonApi) => {
    controls.current = api;
  }, []);

  const enter = useCallback(() => {
    if (!panelOpen) controls.current?.requestLock();
  }, [panelOpen]);

  const onLockChange = useCallback((isLocked: boolean) => {
    setLocked(isLocked);
    if (isLocked) setHasEntered(true);
  }, []);

  // Number keys jump between floors; F toggles the panel; Esc closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (event.code === 'Escape' && panelOpen) {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.code === 'KeyF' && !panelOpen) {
        event.preventDefault();
        setPanel({ kind: 'office' });
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (!Number.isNaN(digit) && digit >= 1 && digit <= 9 && !panelOpen) {
        const nextLevel = digit - 1;
        if (nextLevel <= floors.length) {
          event.preventDefault();
          setLevel(nextLevel);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel, floors.length]);

  const currentRepo = safeLevel === 0 ? undefined : floors[safeLevel - 1];
  const working = state.agents.filter((a) => a.status === 'working').length;
  const openIssues = state.issues.filter((i) => i.status !== 'done').length;

  return (
    <div className="app">
      <div className="app__stage">
        <Scene
          state={state}
          level={safeLevel}
          onLevelChange={setLevel}
          onOpenPanel={openPanel}
          onEnter={enter}
          selectedAgentId={selectedAgentId}
          onLockChange={onLockChange}
          onControls={onControls}
          onFocusChange={(next) =>
            setFocus((current) =>
              current?.label === next?.label && current?.detail === next?.detail ? current : next,
            )
          }
        />
      </div>

      <Hud
        floorNames={floorNames}
        level={safeLevel}
        onLevelChange={setLevel}
        repoName={currentRepo?.name}
        repoSub={currentRepo ? `${currentRepo.provider} · ${currentRepo.slug}` : 'every repository in the castle'}
        repoConnected={currentRepo ? currentRepo.connected : state.repos.length === 0}
        repoReason={currentRepo?.statusReason ?? null}
        status={socket.status}
        stats={{ repos: state.repos.length, agents: state.agents.length, working, issues: openIssues, prs: state.prs.length }}
        capabilities={state.capabilities}
        locked={locked}
        onOpenHelp={() => openPanel({ kind: 'help' })}
        onOpenBoard={() => openPanel({ kind: 'board', repoId: currentRepo?.id ?? null })}
        onOpenOffice={() => openPanel({ kind: 'office' })}
      />

      {locked && <Crosshair />}
      {locked && focus && (
        <div className="prompt" aria-live="polite">
          <kbd>E</kbd>
          <span>{focus.label}</span>
          {focus.detail && <span className="prompt__detail">{focus.detail}</span>}
        </div>
      )}

      {!hasEntered && !panelOpen && (
        <div className="gate">
          <div className="gate__card">
            <h1 className="gate__title">FactorAI</h1>
            <p className="gate__tagline">the wizarding school of the coding swarm</p>
            <p className="gate__body">
              One floor per repository. One wizard per coding agent. Issues are potion orders, pull requests are bottled
              potions, and the cauldron tells you whether CI is happy.
            </p>
            <button type="button" className="button button--primary button--big" onClick={enter}>
              {socket.status === 'open' ? 'enter the castle' : 'connecting…'}
            </button>
            <ul className="gate__keys">
              <li><kbd>W A S D</kbd> walk</li>
              <li><kbd>E</kbd> interact</li>
              <li><kbd>Esc</kbd> menus</li>
              <li><kbd>F</kbd> office</li>
            </ul>
            {socket.status !== 'open' && <p className="gate__status">socket: {socket.status}</p>}
          </div>
        </div>
      )}

      {socket.message && (
        <div className={`toast toast--${socket.message.kind}`} role="status">
          <span>{socket.message.text}</span>
          <button type="button" onClick={socket.dismissMessage} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <KanbanOverlay
        panel={panel}
        state={state}
        send={socket.send}
        onOpen={openPanel}
        onClose={closePanel}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * HUD
 * ------------------------------------------------------------------ */

function Hud({
  floorNames,
  level,
  onLevelChange,
  repoName,
  repoSub,
  repoConnected,
  repoReason,
  status,
  stats,
  capabilities,
  locked,
  onOpenHelp,
  onOpenBoard,
  onOpenOffice,
}: {
  floorNames: string[];
  level: number;
  onLevelChange: (level: number) => void;
  repoName: string | undefined;
  repoSub: string;
  repoConnected: boolean;
  repoReason: string | null;
  status: 'connecting' | 'open' | 'closed';
  stats: { repos: number; agents: number; working: number; issues: number; prs: number };
  capabilities: { claudeCli: boolean; kiloCli: boolean; ghCli: boolean; glabCli: boolean };
  locked: boolean;
  onOpenHelp: () => void;
  onOpenBoard: () => void;
  onOpenOffice: () => void;
}) {
  return (
    <div className="hud">
      <div className="hud__topleft">
        <div className="panel-mini">
          <div className="panel-mini__title">
            {level === 0 ? 'Great Hall' : `Floor ${level}`}
            <span className={`dot ${status === 'open' ? 'dot--ok' : 'dot--warn'}`} />
          </div>
          <div className="panel-mini__sub">{repoName ?? repoSub}</div>
          {level > 0 && !repoConnected && repoReason && <div className="panel-mini__warn">{repoReason}</div>}
          <nav className="floors">
            {floorNames.map((name, index) => (
              <button
                key={`${index}-${name}`}
                type="button"
                className={`floors__item ${index === level ? 'floors__item--active' : ''}`}
                onClick={() => onLevelChange(index)}
                title={name}
              >
                <span className="floors__key">{index === 0 ? 'H' : index}</span>
                <span className="floors__name">{name}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="hud__topright">
        <div className="panel-mini panel-mini--right">
          <div className="stats">
            <Stat label="floors" value={stats.repos} />
            <Stat label="wizards" value={stats.agents} />
            <Stat label="at work" value={stats.working} tone={stats.working > 0 ? 'warn' : 'flat'} />
            <Stat label="orders" value={stats.issues} />
            <Stat label="potions" value={stats.prs} />
          </div>
          <div className="clis">
            <span className={`tag ${capabilities.claudeCli ? 'tag--working' : 'tag--idle'}`}>claude</span>
            <span className={`tag ${capabilities.kiloCli ? 'tag--working' : 'tag--idle'}`}>kilo</span>
            <span className={`tag ${capabilities.ghCli ? 'tag--working' : 'tag--idle'}`}>gh</span>
            <span className={`tag ${capabilities.glabCli ? 'tag--working' : 'tag--idle'}`}>glab</span>
          </div>
          <div className="chiprow">
            <button type="button" className="chip" onClick={onOpenBoard}>
              kanban
            </button>
            <button type="button" className="chip" onClick={onOpenOffice}>
              office
            </button>
            <button type="button" className="chip" onClick={onOpenHelp}>
              keys
            </button>
          </div>
        </div>
      </div>

      <div className="hud__bottomleft">
        <div className="panel-mini panel-mini--dim">
          <span className="muted small">
            {locked ? 'WASD to walk · shift to stride · E to interact · Esc for menus' : 'click the castle to take control'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'flat' }: { label: string; value: number; tone?: 'flat' | 'warn' }) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

function Crosshair() {
  return (
    <div className="crosshair" aria-hidden="true">
      <span />
    </div>
  );
}
