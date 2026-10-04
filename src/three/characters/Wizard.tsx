/**
 * The wizards: one per coding agent, sitting at a desk on its repo floor.
 *
 * Built entirely from cel-shaded primitives (no rig, no glTF) so the whole
 * cast shares the castle's palette and outline pass. Behaviour is driven by the
 * agent's status:
 *
 *   idle    - slow breathing, wand idles, dim aura
 *   working - faster bob, hands move as if casting, bright aura, extra motes
 *   error   - slumped, red sparks, hat droops
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group, type Mesh } from 'three';

import type { Agent, AgentStatus } from '../../core/types';
import { Flat, GEO, HAT_CONE, ROBE, Toon } from '../materials';
import { AGENT_COLORS, AGENT_STATES, PALETTE } from '../theme';
import { Sparkles } from '../props/Sparkles';

export interface WizardProps {
  agent: Agent;
  position?: [number, number, number];
  /** Faces the desk, i.e. roughly +Z in desk-local space. */
  rotation?: [number, number, number];
  scale?: number;
}

export function Wizard({ agent, position = [0, 0, 0], rotation = [0, 0, 0], scale = 1 }: WizardProps) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const armLeft = useRef<Group>(null);
  const armRight = useRef<Group>(null);
  const hat = useRef<Group>(null);
  const wand = useRef<Group>(null);
  const aura = useRef<Mesh>(null);

  const colors = AGENT_COLORS[agent.type];
  const status: AgentStatus = agent.status;
  const state = AGENT_STATES[status];
  const phase = useMemo(() => agent.desk * 1.7, [agent.desk]);

  useFrame((clockState, delta) => {
    const t = clockState.clock.elapsedTime;
    const working = status === 'working';
    const rate = working ? 3.4 : status === 'error' ? 1.1 : 1.5;
    const dt = Math.min(delta, 0.05);

    if (root.current) {
      const slump = status === 'error' ? -0.06 : 0;
      root.current.position.y = position[1] + Math.sin(t * rate + phase) * (working ? 0.045 : 0.022) + slump;
    }
    if (body.current) {
      // Lean into the work when casting; sag when errored.
      const targetPitch = status === 'error' ? 0.28 : working ? 0.16 : 0.04;
      body.current.rotation.x += (targetPitch - body.current.rotation.x) * Math.min(1, dt * 6);
      body.current.rotation.z = Math.sin(t * 0.8 + phase) * 0.02;
    }
    if (armLeft.current && armRight.current) {
      // Arms rise and flutter faster while the agent is producing output.
      const cast = working ? Math.sin(t * 7 + phase) : Math.sin(t * 1.6 + phase);
      const lift = working ? -0.55 : -0.18;
      armLeft.current.rotation.x = lift + cast * (working ? 0.32 : 0.08);
      armRight.current.rotation.x = lift - cast * (working ? 0.32 : 0.08);
    }
    if (hat.current) {
      const droop = status === 'error' ? 0.4 : 0;
      hat.current.rotation.x += (droop - hat.current.rotation.x) * Math.min(1, dt * 4);
      hat.current.rotation.z = Math.sin(t * 1.9 + phase) * (working ? 0.09 : 0.04);
    }
    if (wand.current) {
      const flick = working ? 0.5 + 0.5 * Math.sin(t * 12 + phase) : 0.35;
      wand.current.rotation.z = Math.sin(t * 3 + phase) * 0.4;
      wand.current.scale.setScalar(0.9 + flick * 0.2);
    }
    if (aura.current) {
      const mat = aura.current.material as { opacity: number };
      mat.opacity = (status === 'idle' ? 0.12 : 0.3) + 0.06 * Math.sin(t * 2.2 + phase);
    }
  });

  return (
    <group position={position} rotation={rotation} scale={scale} dispose={null}>
      <group ref={root} dispose={null}>
        <group ref={body} dispose={null}>
          {/* Chair back peeking behind the robe */}
          <Toon
            geometry={GEO.box}
            color={PALETTE.woodDark}
            position={[0, 0.78, -0.3]}
            scale={[0.62, 0.7, 0.08]}
            outline={0.03}
            castShadow
          />

          {/* Robe */}
          <Toon geometry={ROBE} color={colors.robe} position={[0, 0, 0]} scale={1.05} outline={0.025} castShadow />
          {/* Sash */}
          <Toon
            geometry={GEO.cylinder}
            color={colors.accent}
            position={[0, 0.72, 0]}
            rotation={[0, 0, 0.12]}
            scale={[0.56, 0.14, 0.56]}
            outline={0.02}
          />
          {/* Collar */}
          <Toon
            geometry={GEO.cone}
            color={colors.hat}
            position={[0, 1.24, 0]}
            rotation={[Math.PI, 0, 0]}
            scale={[0.42, 0.22, 0.42]}
            outline={0.02}
          />

          {/* Head */}
          <Toon geometry={GEO.sphere} color={PALETTE.skin} position={[0, 1.45, 0]} scale={0.42} outline={0.022} castShadow />
          {/* Hair */}
          <Toon
            geometry={GEO.sphere}
            color={colors.hair}
            position={[0, 1.55, -0.03]}
            scale={[0.44, 0.36, 0.42]}
            outline={0.02}
          />
          {/* Anime eyes: large, dark, with a highlight */}
          {[-0.09, 0.09].map((x) => (
            <group key={x} position={[x, 1.44, 0.2]} dispose={null}>
              <Flat geometry={GEO.circle} color="#241a33" position={[0, 0, 0]} scale={0.12} depthWrite />
              <Flat geometry={GEO.circle} color="#ffffff" position={[0.03, 0.04, 0.005]} scale={0.038} depthWrite />
            </group>
          ))}
          {/* Blush */}
          {[-0.16, 0.16].map((x) => (
            <Flat
              key={x}
              geometry={GEO.circle}
              color="#ff9aa8"
              opacity={0.4}
              position={[x, 1.37, 0.19]}
              scale={0.1}
            />
          ))}

          {/* Hat */}
          <group ref={hat} position={[0, 1.66, 0]} dispose={null}>
            <Toon
              geometry={GEO.cylinder}
              color={colors.hat}
              position={[0, 0.01, 0]}
              scale={[0.62, 0.05, 0.62]}
              outline={0.02}
            />
            <Toon
              geometry={HAT_CONE}
              color={colors.hat}
              position={[0, 0.56, 0]}
              scale={[0.52, 0.95, 0.52]}
              outline={0.024}
            />
            <Toon
              geometry={GEO.torus}
              color={colors.accent}
              position={[0, 0.3, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              scale={0.5}
              outline={0.015}
            />
            <Toon
              geometry={GEO.octa}
              color={state.glow}
              emissive={state.glow}
              emissiveIntensity={2}
              outline={0}
              rim={1}
              position={[0.04, 0.98, 0.1]}
              scale={0.1}
            />
          </group>

          {/* Arms */}
          <group ref={armLeft} position={[-0.28, 1.12, 0.04]} rotation={[-0.18, 0, 0.3]} dispose={null}>
            <Toon geometry={GEO.capsule} color={colors.robe} position={[0, -0.24, 0.16]} scale={0.8} outline={0.02} />
            <Toon geometry={GEO.sphere} color={PALETTE.skin} position={[0, -0.44, 0.26]} scale={0.16} outline={0.015} />
          </group>
          <group ref={armRight} position={[0.28, 1.12, 0.04]} rotation={[-0.18, 0, -0.3]} dispose={null}>
            <Toon geometry={GEO.capsule} color={colors.robe} position={[0, -0.24, 0.16]} scale={0.8} outline={0.02} />
            <Toon geometry={GEO.sphere} color={PALETTE.skin} position={[0, -0.44, 0.26]} scale={0.16} outline={0.015} />
          </group>

          {/* Wand with a glowing tip */}
          <group ref={wand} position={[0.34, 0.78, 0.34]} rotation={[0.6, 0, -0.5]} dispose={null}>
            <Toon geometry={GEO.cylinder} color={PALETTE.wood} position={[0, 0.18, 0]} scale={[0.05, 0.42, 0.05]} outline={0.012} />
            <Toon
              geometry={GEO.octa}
              color={state.glow}
              emissive={state.glow}
              emissiveIntensity={2.4}
              outline={0}
              rim={1}
              position={[0, 0.44, 0]}
              scale={0.11}
            />
            <Flat
              geometry={GEO.plane}
              color={state.glow}
              opacity={status === 'working' ? 0.5 : 0.22}
              additive
              position={[0, 0.46, 0]}
              scale={0.8}
            />
          </group>
        </group>

        {/* Status aura on the floor */}
        <mesh ref={aura} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.34, 0.62, 28]} />
          <meshBasicMaterial color={state.glow} transparent opacity={0.2} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>

      <Sparkles
        count={status === 'working' ? 70 : status === 'error' ? 40 : 18}
        color={state.glow}
        intensity={state.sparkRate}
        radius={0.75}
        height={2.2}
        size={status === 'working' ? 7 : 5}
        position={[0, 0.1, 0]}
        pulse={status !== 'error'}
        seed={agent.id}
      />
    </group>
  );
}
