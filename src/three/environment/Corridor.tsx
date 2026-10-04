/**
 * The stairwell: the vertical link between castle levels.
 *
 * A spiral tower in the corner of every room. The staircase is real geometry
 * (it reads as a stairwell even though movement is a warp), and the glowing dais
 * at its foot is the actual navigation device: step on it, press E, and you are
 * teleported to the same spot one floor up or down.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, type Group } from 'three';

import { Interactable, Occluder } from '../Interaction';
import { Flat, GEO, Toon } from '../materials';
import { CEILING_Y, LEVEL_HEIGHT, STAIR } from '../layout';
import { PALETTE } from '../theme';
import { Sparkles } from '../props/Sparkles';
import { SignPlate } from '../props/SignPlate';

export interface StairwellProps {
  /** Ground height of the level this tower stands on. */
  baseY: number;
  accent: string;
  /** Floor the player would land on going up (null on the top floor). */
  upLabel: string | null;
  downLabel: string | null;
  onAscend: () => void;
  onDescend: () => void;
}

const STEPS = 22;

export function Stairwell({
  baseY,
  accent,
  upLabel,
  downLabel,
  onAscend,
  onDescend,
}: StairwellProps) {
  const dais = useRef<Group>(null);
  const runeRing = useRef<Group>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (dais.current) dais.current.position.y = baseY + 0.06 + Math.sin(t * 1.5) * 0.04;
    if (runeRing.current) runeRing.current.rotation.y = t * 0.5;
  });

  const steps = useMemo(
    () =>
      Array.from({ length: STEPS }, (_, i) => ({
        angle: (i / STEPS) * Math.PI * 1.75 + 0.4,
        y: (i / STEPS) * LEVEL_HEIGHT,
        inner: 0.55,
        outer: STAIR.radius - 0.15,
      })),
    [],
  );

  return (
    <group position={[STAIR.x, baseY, STAIR.z]} dispose={null}>
      {/* Tower shell: a ring of stone, open towards the room */}
      <Occluder>
        {Array.from({ length: 12 }, (_, i) => {
          const angle = (i / 12) * Math.PI * 2;
          // Leave the quadrant facing the room open so the stair is visible.
          if (angle > Math.PI * 1.05 && angle < Math.PI * 1.95) return null;
          return (
            <Toon
              key={i}
              geometry={GEO.box}
              color="#3b3350"
              position={[Math.cos(angle) * (STAIR.radius + 0.2), LEVEL_HEIGHT / 2, Math.sin(angle) * (STAIR.radius + 0.2)]}
              rotation={[0, -angle, 0]}
              scale={[0.5, LEVEL_HEIGHT + 0.6, 1.3]}
              outline={0.04}
              receiveShadow
            />
          );
        })}
      </Occluder>

      {/* Spiral steps */}
      {steps.map((step, i) => {
        const width = step.outer - step.inner;
        const mid = (step.inner + step.outer) / 2;
        return (
          <Toon
            key={i}
            geometry={GEO.box}
            color={i % 2 === 0 ? '#584a72' : '#4b3f63'}
            position={[Math.cos(step.angle) * mid, step.y + 0.12, Math.sin(step.angle) * mid]}
            rotation={[0, -step.angle, 0]}
            scale={[width, 0.22, 1.15]}
            outline={0.03}
            castShadow
          />
        );
      })}

      {/* Central newel with a glowing crystal */}
      <Toon geometry={GEO.cylinder} color="#3b3350" position={[0, LEVEL_HEIGHT / 2, 0]} scale={[0.8, LEVEL_HEIGHT + 0.4, 0.8]} outline={0.04} />
      <group ref={runeRing} position={[0, LEVEL_HEIGHT * 0.55, 0]}>
        <Toon
          geometry={GEO.octa}
          color={accent}
          emissive={accent}
          emissiveIntensity={1.8}
          outline={0}
          rim={1}
          scale={0.5}
        />
        {Array.from({ length: 4 }, (_, i) => (
          <Toon
            key={i}
            geometry={GEO.octa}
            color={accent}
            emissive={accent}
            emissiveIntensity={1.2}
            outline={0}
            rim={1}
            position={[
              Math.cos((i / 4) * Math.PI * 2) * 0.7,
              Math.sin(i * 1.3) * 0.3,
              Math.sin((i / 4) * Math.PI * 2) * 0.7,
            ]}
            scale={0.18}
          />
        ))}
      </group>

      {/* Warp dais */}
      <Interactable
        label={upLabel ? `Ascend to ${upLabel}` : 'The stairwell is sealed above'}
        detail="press E"
        range={4.2}
        onInteract={upLabel ? onAscend : () => undefined}
      >
        <group ref={dais} position={[0, 0.06, 0]} dispose={null}>
          <Toon geometry={GEO.cylinder} color="#2f2740" position={[0, 0, 0]} scale={[4.4, 0.24, 4.4]} outline={0.05} receiveShadow />
          <Flat
            geometry={GEO.circle}
            color={accent}
            opacity={0.32}
            additive
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.14, 0]}
            scale={[3.7, 3.7, 1]}
          />
          <Toon
            geometry={GEO.ring}
            color={accent}
            emissive={accent}
            emissiveIntensity={0.9}
            outline={0.02}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.16, 0]}
            scale={[4.0, 4.0, 1]}
          />
          {/* Up / down arrows carved into the dais */}
          {upLabel && (
            <Toon
              geometry={GEO.cone}
              color={accent}
              emissive={accent}
              emissiveIntensity={1.2}
              outline={0.02}
              rotation={[0, 0, 0]}
              position={[0, 0.4, -0.9]}
              scale={[0.5, 0.7, 0.5]}
            />
          )}
          {/* Down arrow carved into the dais */}
          {downLabel && (
            <Toon
              geometry={GEO.cone}
              color="#8ea2d6"
              emissive="#8ea2d6"
              emissiveIntensity={0.9}
              outline={0.02}
              rotation={[Math.PI, 0, 0]}
              position={[0, 0.34, 0.9]}
              scale={[0.45, 0.6, 0.45]}
            />
          )}
        </group>
      </Interactable>

      {/* Descend is a separate smaller pad, offset from the ascent dais. */}
      {downLabel && (
        <Interactable
          label={`Descend to ${downLabel}`}
          detail="press E"
          range={3.4}
          onInteract={onDescend}
        >
          <group position={[0, 0.06, -2.2]} dispose={null}>
            <Toon geometry={GEO.cylinder} color="#2b2a44" position={[0, 0, 0]} scale={[2.4, 0.16, 2.4]} outline={0.04} />
            <Flat
              geometry={GEO.circle}
              color="#8ea2d6"
              opacity={0.28}
              additive
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.1, 0]}
              scale={[1.9, 1.9, 1]}
            />
            <Toon
              geometry={GEO.cone}
              color="#8ea2d6"
              emissive="#8ea2d6"
              emissiveIntensity={1.2}
              outline={0.02}
              rotation={[Math.PI, 0, 0]}
              position={[0, 0.3, 0]}
              scale={[0.42, 0.56, 0.42]}
            />
            <SignPlate
              text="Downward passage"
              position={[0, 0.85, -1.05]}
              rotation={[-0.5, 0, 0]}
              width={1.6}
              accent="#8ea2d6"
              glow
            />
          </group>
        </Interactable>
      )}

      <SignPlate
        text={upLabel ? 'Upward passage' : 'The top of the castle'}
        sub={upLabel ?? 'no floors above'}
        position={[-1.9, 1.9, -1.2]}
        rotation={[0, -0.5, 0]}
        width={1.7}
        glow
      />

      <Sparkles
        count={170}
        color={accent}
        intensity={0.55}
        radius={STAIR.radius + 0.6}
        height={LEVEL_HEIGHT}
        size={7}
        position={[0, 0.2, 0]}
        seed={`stair-${baseY}`}
      />

      {/* Ceiling rose: frames where the tower would open into the floor above. */}
      <Toon
        geometry={GEO.ring}
        color="#2a2338"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, CEILING_Y - 0.06, 0]}
        scale={[STAIR.radius * 2.4, STAIR.radius * 2.4, 1]}
        outline={0.04}
      />
      <Flat
        geometry={GEO.circle}
        color={accent}
        opacity={0.12}
        additive
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, CEILING_Y - 0.08, 0]}
        scale={[STAIR.radius * 2.1, STAIR.radius * 2.1, 1]}
      />
    </group>
  );
}

/** Stairwell accent colour per level, so each floor's tower is its own. */
export function stairAccent(index: number): string {
  const accents = [PALETTE.gold, '#7ad7ff', '#2fbf71', '#a45cff', '#ff8a5c', '#8ef07a'];
  return accents[MathUtils.clamp(index, 0, accents.length - 1)] ?? PALETTE.gold;
}
