/**
 * The Great Hall (ground floor, level 0).
 *
 * The entrance room: a floating master kanban board listing every potion order
 * in the castle, the stairwell up to the repo floors, a lit doorway east into
 * the Head Mistress' office, and a floor marker for every repo so you can warp
 * straight to a floor without climbing.
 */

import { useMemo } from 'react';

import type { Agent, AppState, Issue, Repo } from '../../core/types';
import { levelY, STAIR } from '../layout';
import { Flat, GEO, Toon } from '../materials';
import { PALETTE } from '../theme';
import { Interactable, Occluder } from '../Interaction';
import { KanbanBoard } from '../props/KanbanBoard';
import { SignPlate } from '../props/SignPlate';
import { Sparkles } from '../props/Sparkles';
import { RoomShell } from './RoomShell';
import { Stairwell, stairAccent } from './Corridor';
import { Brazier, PottedPlant, WallSconce } from './Props';

export interface MainHallProps {
  repos: Repo[];
  issues: Issue[];
  agents: Agent[];
  state: AppState;
  onOpenBoard: () => void;
  onOpenOffice: () => void;
  onGoToFloor: (floorNumber: number) => void;
  onAscend: () => void;
}

const DOORWAY: Array<[number, number]> = [[-2.2, 2.2]];

export function MainHall({
  repos,
  issues,
  agents,
  state,
  onOpenBoard,
  onOpenOffice,
  onGoToFloor,
  onAscend,
}: MainHallProps) {
  const working = agents.filter((a) => a.status === 'working').length;
  const open = issues.filter((i) => i.status !== 'done');

  const floors = useMemo(
    () => [...repos].sort((a, b) => a.floorNumber - b.floorNumber),
    [repos],
  );

  return (
    <group position={[0, levelY(0), 0]} dispose={null}>
      <RoomShell
        wallColor={PALETTE.stone}
        floorColor="#3a3050"
        accentColor={PALETTE.gold}
        eastDoorways={DOORWAY}
        northOpenings={[[STAIR.x - STAIR.radius - 0.4, STAIR.x + STAIR.radius + 0.4]]}
        seed={0}
      >
        {/* Great Hall: brighter than the repo floors */}
        {[-9, -3, 3, 9].map((x) => (
          <Occluder key={x}>
            <ToonColumn x={x} />
          </Occluder>
        ))}

        {/* Master kanban board on the north wall */}
        <KanbanBoard
          title="The Grand Board"
          subtitle={`${open.length} potion orders in the castle · ${repos.length} floors`}
          issues={issues}
          position={[-1.5, 3.6, -13.1]}
          width={9.4}
          height={5.4}
          seed={0}
          onRead={onOpenBoard}
        />

        <SignPlate
          text="FactorAI"
          sub="the wizarding school of the coding swarm"
          position={[-1.5, 6.1, -13.0]}
          width={5.4}
          glow
        />

        {/* Warp markers: one per repo floor, along the south wall */}
        {floors.map((repo, i) => {
          const x = -((floors.length - 1) * 3.4) / 2 + i * 3.4;
          return (
            <Interactable
              key={repo.id}
              label={`Warp to ${repo.name}`}
              detail={`floor ${repo.floorNumber} · ${state.agents.filter((a) => a.repoId === repo.id).length} wizards`}
              range={3.6}
              onInteract={() => onGoToFloor(repo.floorNumber)}
            >
              <group position={[x, 0, 12.6]} dispose={null}>
                <Flat
                  geometry={GEO.circle}
                  color={stairAccent(repo.floorNumber)}
                  opacity={0.3}
                  additive
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[0, 0.03, 0]}
                  scale={[2.8, 2.8, 1]}
                />
                <Toon
                  geometry={GEO.ring}
                  color={stairAccent(repo.floorNumber)}
                  emissive={stairAccent(repo.floorNumber)}
                  emissiveIntensity={0.9}
                  outline={0.02}
                  rotation={[-Math.PI / 2, 0, 0]}
                  position={[0, 0.05, 0]}
                  scale={[3.0, 3.0, 1]}
                />
                <Toon
                  geometry={GEO.cone}
                  color={stairAccent(repo.floorNumber)}
                  emissive={stairAccent(repo.floorNumber)}
                  emissiveIntensity={1.3}
                  outline={0.02}
                  position={[0, 1.1, 0]}
                  scale={[0.55, 1.1, 0.55]}
                />
                <SignPlate
                  text={repo.name}
                  sub={`floor ${repo.floorNumber}`}
                  position={[0, 1.95, 0]}
                  rotation={[-0.35, 0, 0]}
                  width={2.4}
                  accent={stairAccent(repo.floorNumber)}
                  glow
                />
                <Sparkles
                  count={70}
                  color={stairAccent(repo.floorNumber)}
                  intensity={0.55}
                  radius={0.9}
                  height={2.6}
                  size={7}
                  position={[0, 0.1, 0]}
                  seed={`warp-${repo.id}`}
                />
              </group>
            </Interactable>
          );
        })}

        {/* Doorway to the Head Mistress' office */}
        <Interactable label="Enter the Head Mistress' office" detail="manage repos and agents" range={3.4} onInteract={onOpenOffice}>
          <group position={[13.6, 0, 0]} dispose={null}>
            <Flat
              geometry={GEO.plane}
              color={PALETTE.arcane}
              opacity={0.2}
              additive
              position={[0, 1.9, 0]}
              rotation={[0, Math.PI / 2, 0]}
              scale={[4.2, 5.6, 1]}
            />
            <Toon
              geometry={GEO.box}
              color={PALETTE.gold}
              emissive={PALETTE.gold}
              emissiveIntensity={0.5}
              outline={0.03}
              position={[0, 2.9, 0]}
              scale={[0.3, 0.24, 4.6]}
            />
          </group>
        </Interactable>

        {/* Dressing */}
        {[-7, 7].map((x) => (
          <Brazier key={x} position={[x, 0, 8.5]} color={PALETTE.lantern} />
        ))}
        {([[-11, -6], [11, -6], [-11, 4], [11, 4]] as Array<[number, number]>).map(([x, z]) => (
          <WallSconce key={`s${x}:${z}`} position={[x, 3.6, z]} color={PALETTE.lantern} rotationY={x < 0 ? Math.PI / 2 : -Math.PI / 2} />
        ))}
        {([[-12.6, 8], [12.6, 8]] as Array<[number, number]>).map(([x, z], i) => (
          <PottedPlant key={`p${x}`} position={[x, 0, z]} accent={PALETTE.gold} seed={i} />
        ))}

        {/* Welcome mat at the entrance */}
        <Flat
          geometry={GEO.ring}
          color={PALETTE.gold}
          opacity={0.25}
          additive
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.015, 12]}
          scale={[8, 8, 1]}
        />
      </RoomShell>

      <Stairwell
        baseY={0}
        accent={PALETTE.gold}
        upLabel={floors[0] ? floors[0].name : null}
        downLabel={null}
        onAscend={onAscend}
        onDescend={() => undefined}
      />

      <Sparkles count={220 + working * 80} color={PALETTE.lantern} intensity={0.3} radius={13} height={6.4} size={9} position={[0, 0.4, 0]} seed="great-hall" />
    </group>
  );
}

function ToonColumn({ x }: { x: number }) {
  return (
    <group position={[x, 0, 0]} dispose={null}>
      <Toon
        geometry={GEO.cylinder}
        color={PALETTE.stoneLight}
        position={[0, 3.4, 0]}
        scale={[1.1, 6.8, 1.1]}
        outline={0.045}
        castShadow
      />
      <Toon geometry={GEO.box} color={PALETTE.stoneDark} position={[0, 0.22, 0]} scale={[1.8, 0.44, 1.8]} outline={0.04} />
      <Toon geometry={GEO.box} color={PALETTE.goldDeep} position={[0, 6.7, 0]} scale={[1.9, 0.3, 1.9]} outline={0.03} />
    </group>
  );
}