/**
 * A repository floor.
 *
 * One per connected repo, themed after its `theme` field, dressed with that
 * repo's own kanban board, cauldron, potion shelf and the desks of its agents.
 * The floor shows the repo's connection state on a plaque at the stairwell, so a
 * disconnected repo is obvious without opening any UI.
 */

import { useMemo } from 'react';

import type { Agent, AppState, CheckState, Issue, PullRequest, Repo } from '../../core/types';
import { EMPTY_CHECKS } from '../../core/types';
import { DESK_RADIUS, DESK_SLOTS, levelY, STAIR } from '../layout';
import { Flat, GEO } from '../materials';
import { themeFor } from '../theme';
import { Cauldron } from '../props/Cauldron';
import { KanbanBoard } from '../props/KanbanBoard';
import { PotionShelf } from '../props/PotionShelf';
import { SignPlate } from '../props/SignPlate';
import { Sparkles } from '../props/Sparkles';
import { RoomShell } from './RoomShell';
import { Desk } from './Desk';
import { Stairwell, stairAccent } from './Corridor';
import { Brazier, PottedPlant, WallSconce } from './Props';

export interface FloorProps {
  repo: Repo;
  agents: Agent[];
  issues: Issue[];
  prs: PullRequest[];
  state: AppState;
  upLabel: string | null;
  downLabel: string | null;
  onAscend: () => void;
  onDescend: () => void;
  onOpenBoard: () => void;
  onOpenShelf: () => void;
  onOpenCauldron: () => void;
  onInspectAgent: (agentId: string) => void;
  /** The agent currently selected in the 2D overlay, highlighted in 3D. */
  selectedAgentId: string | null;
}

export function Floor({
  repo,
  agents,
  issues,
  prs,
  state,
  upLabel,
  downLabel,
  onAscend,
  onDescend,
  onOpenBoard,
  onOpenShelf,
  onOpenCauldron,
  onInspectAgent,
  selectedAgentId,
}: FloorProps) {
  const theme = themeFor(repo.theme);
  const y = levelY(repo.floorNumber);
  const accent = stairAccent(repo.floorNumber);

  const checks = useMemo<CheckState>(() => {
    const open = prs.filter((p) => p.status === 'open');
    if (open.length === 0) return { ...EMPTY_CHECKS };
    return open.reduce<CheckState>(
      (acc, pr) => ({
        total: acc.total + pr.checks.total,
        passing: acc.passing + pr.checks.passing,
        failing: acc.failing + pr.checks.failing,
        pending: acc.pending + pr.checks.pending,
      }),
      { ...EMPTY_CHECKS },
    );
  }, [prs]);

  const logs = state.logs;
  const working = agents.filter((a) => a.status === 'working').length;

  return (
    <group position={[0, y, 0]} dispose={null}>
      <RoomShell
        wallColor={theme.wall}
        floorColor={theme.floor}
        accentColor={theme.accent}
        northOpenings={[[STAIR.x - STAIR.radius - 0.4, STAIR.x + STAIR.radius + 0.4]]}
        seed={repo.floorNumber}
      >
        {/* Per-repo kanban board on the north wall */}
        <group position={[0, 0, 0]}>
          <KanbanBoard
            title={repo.name}
            subtitle={`${repo.provider} · ${repo.slug} · floor ${repo.floorNumber}`}
            issues={issues}
            position={[-1.5, 3.5, -13.1]}
            width={8.6}
            height={5}
            seed={repo.floorNumber}
            onRead={onOpenBoard}
          />
        </group>

        {/* Connection status plaque, near the stairwell */}
        <SignPlate
          text={repo.connected ? repo.name : `${repo.name} (unlinked)`}
          sub={repo.connected ? `${repo.provider} · ${repo.slug}` : (repo.statusReason ?? 'not connected')}
          position={[-4.4, 2.5, -12.9]}
          rotation={[0, 0.32, 0]}
          width={3.1}
          accent={repo.connected ? theme.accent : '#ff7a8a'}
          glow={!repo.connected}
        />

        {/* Cauldron: browser tests bubbling */}
        <Cauldron
          checks={checks}
          label="Test cauldron"
          position={[-9.4, 0, 6.2]}
          intensity={1}
          onInspect={onOpenCauldron}
        />

        {/* Potion shelf: bottled pull requests */}
        <group position={[-12.4, 0, -4.5]} rotation={[0, Math.PI / 2, 0]}>
          <PotionShelf prs={prs} width={3.4} onInspect={onOpenShelf} />
        </group>

        {/* Desks, one per agent on this floor */}
        {agents.map((agent) => (
          <Desk
            key={agent.id}
            agent={agent}
            task={state.issues.find((i) => i.id === agent.currentTaskId)}
            log={logs[agent.id] ?? []}
            onInspect={() => onInspectAgent(agent.id)}
            light={agent.id === selectedAgentId || agents.length <= 4}
          />
        ))}

        {/* Selected-agent marker: a rune circle under the chosen desk */}
        {selectedAgentId &&
          agents
            .filter((a) => a.id === selectedAgentId)
            .map((agent) => {
              const slot = DESK_SLOTS[agent.desk % 8] ?? DESK_SLOTS[0]!;
              return (
                <Flat
                  key={`sel-${agent.id}`}
                  geometry={GEO.ring}
                  color={theme.accent}
                  opacity={0.45}
                  additive
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[slot.x, 0.03, slot.z]}
                  scale={[DESK_RADIUS * 4.6, DESK_RADIUS * 4.6, 1]}
                />
              );
            })}

        {/* Sconces, braziers and dressing */}
        {SCONCE_POSITIONS.map(([x, z]) => (
          <WallSconce key={`s${x}:${z}`} position={[x, 3.4, z]} color={theme.light} rotationY={z < 0 ? 0 : Math.PI} />
        ))}
        {BRAZIER_POSITIONS.map(([x, z]) => (
          <Brazier key={`b${x}:${z}`} position={[x, 0, z]} color={theme.accent} />
        ))}
        {PLANT_POSITIONS.map(([x, z]) => (
          <PottedPlant key={`p${x}:${z}`} position={[x, 0, z]} accent={theme.accent} />
        ))}
      </RoomShell>

      <Stairwell
        baseY={y}
        accent={accent}
        upLabel={upLabel}
        downLabel={downLabel}
        onAscend={onAscend}
        onDescend={onDescend}
      />

      <Sparkles
        count={180 + working * 90}
        color={theme.light}
        intensity={0.32 + working * 0.12}
        radius={12}
        height={6}
        size={8}
        position={[0, 0.3, 0]}
        seed={`floor-${repo.id}`}
      />
    </group>
  );
}

const SCONCE_POSITIONS: Array<[number, number]> = [
  [-8, -13.2],
  [6, -13.2],
];
const BRAZIER_POSITIONS: Array<[number, number]> = [
  [-6, 6],
  [6, 6],
  [0, 11.5],
];
const PLANT_POSITIONS: Array<[number, number]> = [
  [-12, 10],
  [12, -2],
];
