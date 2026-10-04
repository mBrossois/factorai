/**
 * An agent's desk: the seat of a wizard on its repo floor.
 *
 * Wooden desk, chair, the wizard, their floating spell book showing live output,
 * and a nameplate. The desk is also the agent's interaction target: walk up and
 * press E to open that wizard's detail panel.
 */

import { useMemo } from 'react';

import type { Agent, Issue } from '../../core/types';
import { Interactable } from '../Interaction';
import { Flat, GEO, Toon } from '../materials';
import { DESK_RADIUS, DESK_SLOTS } from '../layout';
import { AGENT_STATES, PALETTE } from '../theme';
import { Wizard } from '../characters/Wizard';
import { SignPlate } from '../props/SignPlate';
import { SpellBook } from '../props/SpellBook';

export interface DeskProps {
  agent: Agent;
  task: Issue | undefined;
  log: string[];
  onInspect: () => void;
  /** Forward bench light aimed at the desk. */
  light?: boolean;
}

/** Solid circle the player cannot walk through, for this desk. */
export function deskObstacle(agent: Agent): { x: number; z: number; radius: number } {
  const slot = DESK_SLOTS[agent.desk % DESK_SLOTS.length] ?? DESK_SLOTS[0]!;
  return { x: slot.x, z: slot.z - 0.5, radius: DESK_RADIUS };
}

export function Desk({ agent, task, log, onInspect, light = true }: DeskProps) {
  const slot = useMemo(
    () => DESK_SLOTS[agent.desk % DESK_SLOTS.length] ?? DESK_SLOTS[0]!,
    [agent.desk],
  );
  const state = AGENT_STATES[agent.status];
  const taskLine = task ? task.title : 'awaiting a potion order';

  const unit = (
    <group position={[slot.x, 0, slot.z]} rotation={[0, slot.rotationY, 0]} dispose={null}>
      {/* Carpet under the desk */}
      <Flat
        geometry={GEO.ring}
        color={state.glow}
        opacity={agent.status === 'working' ? 0.24 : 0.12}
        additive
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.02, 0.2]}
        scale={[4.4, 4.4, 1]}
      />

      {/* Wizard sits behind the desk, facing +Z towards the room */}
      <Wizard agent={agent} position={[0, 0, -1.1]} />

      {/* Desk top + trestle legs */}
      <Toon
        geometry={GEO.box}
        color={PALETTE.wood}
        position={[0, 0.86, 0.55]}
        scale={[2.9, 0.14, 1.5]}
        outline={0.035}
        castShadow
        receiveShadow
      />
      <Toon
        geometry={GEO.box}
        color={PALETTE.woodDark}
        position={[0, 0.78, 0.55]}
        scale={[2.7, 0.1, 1.32]}
        outline={0.02}
      />
      {[-1.15, 1.15].map((x) => (
        <Toon
          key={x}
          geometry={GEO.box}
          color={PALETTE.woodDark}
          position={[x, 0.4, 0.55]}
          scale={[0.22, 0.8, 1.2]}
          outline={0.025}
          castShadow
        />
      ))}
      {/* Quill jar */}
      <Toon geometry={GEO.cylinder} color="#5c3f6b" position={[1.05, 1.02, 0.9]} scale={[0.24, 0.28, 0.24]} outline={0.02} />
      {[-1, 1].map((s) => (
        <Toon
          key={s}
          geometry={GEO.cylinder}
          color="#e8e2f5"
          position={[1.05 + s * 0.05, 1.26, 0.9]}
          rotation={[0, 0, s * 0.28]}
          scale={[0.03, 0.3, 0.03]}
          outline={0.01}
        />
      ))}

      {/* Desk lamp: a floating flame that brightens while the agent works */}
      <Toon
        geometry={GEO.cylinder}
        color={PALETTE.goldDeep}
        position={[-1.1, 1.1, 0.9]}
        scale={[0.16, 0.36, 0.16]}
        outline={0.02}
      />
      <Toon
        geometry={GEO.octa}
        color={state.glow}
        emissive={state.glow}
        emissiveIntensity={agent.status === 'working' ? 2.4 : 1.2}
        outline={0}
        rim={1}
        position={[-1.1, 1.36, 0.9]}
        scale={0.16}
      />

      {light && (
        <pointLight
          position={[-1.1, 1.6, 0.9]}
          color={state.glow}
          intensity={agent.status === 'working' ? 7 : 3}
          distance={7}
          decay={2}
        />
      )}

      {/* Floating spell book with the live log */}
      <SpellBook agent={agent} lines={log} position={[0, 1.42, 0.62]} scale={0.92} />

      {/* Nameplate on the front edge of the desk */}
      <SignPlate
        text={agent.name}
        sub={`${agent.type} · ${taskLine}`}
        position={[0, 0.62, 1.34]}
        rotation={[-0.42, 0, 0]}
        width={1.9}
        accent={state.glow}
        glow={agent.status !== 'idle'}
      />
    </group>
  );

  return (
    <Interactable
      label={`${agent.name} (${agent.type})`}
      detail={`${agent.status} · ${task ? task.title : 'idle'}`}
      range={4}
      onInteract={onInspect}
    >
      {unit}
    </Interactable>
  );
}
