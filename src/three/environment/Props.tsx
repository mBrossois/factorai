/**
 * Small set-dressing props shared by every room.
 *
 * These are the details that make the castle feel inhabited rather than
 * assembled: flickering sconces, standing braziers, and the plants that creep
 * into the corners of the less hostile floors.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group } from 'three';

import { Flat, GEO, Toon } from '../materials';
import { PALETTE } from '../theme';
import { Sparkles } from '../props/Sparkles';

export function WallSconce({
  position,
  color,
  rotationY = 0,
}: {
  position: [number, number, number];
  color: string;
  rotationY?: number;
}) {
  const flame = useRef<Group>(null);

  useFrame((state) => {
    const group = flame.current;
    if (!group) return;
    const t = state.clock.elapsedTime + position[0];
    group.rotation.y = t * 1.4;
    group.scale.setScalar(0.9 + Math.sin(t * 7) * 0.12);
  });

  return (
    <group position={position} rotation={[0, rotationY, 0]} dispose={null}>
      <Toon
        geometry={GEO.box}
        color={PALETTE.goldDeep}
        position={[0, -0.35, 0.16]}
        scale={[0.16, 0.7, 0.16]}
        outline={0.02}
      />
      <Toon
        geometry={GEO.cone}
        color={PALETTE.gold}
        position={[0, 0.05, 0.28]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[0.5, 0.5, 0.5]}
        outline={0.02}
      />
      <group ref={flame} position={[0, 0.06, 0.42]}>
        <Toon
          geometry={GEO.octa}
          color={color}
          emissive={color}
          emissiveIntensity={2.2}
          outline={0}
          rim={1}
          scale={0.22}
        />
        <Flat geometry={GEO.plane} color={color} opacity={0.45} additive scale={1.5} />
      </group>
      <pointLight color={color} intensity={5} distance={8} decay={2} position={[0, 0.1, 0.5]} />
    </group>
  );
}

export function Brazier({ position, color }: { position: [number, number, number]; color: string }) {
  const flames = useMemo(() => [0, 1, 2].map((i) => i), []);
  const group = useRef<Group>(null);

  useFrame((state) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime + position[0] * 0.7;
    g.scale.setScalar(1 + Math.sin(t * 5.5) * 0.06);
    g.rotation.y = t * 0.6;
  });

  return (
    <group position={position} dispose={null}>
      {/* Tripod */}
      {[0, 1, 2].map((i) => {
        const angle = (i / 3) * Math.PI * 2;
        return (
          <Toon
            key={i}
            geometry={GEO.box}
            color={PALETTE.stoneDark}
            position={[Math.cos(angle) * 0.28, 0.5, Math.sin(angle) * 0.28]}
            rotation={[Math.cos(angle) * 0.18, -angle, Math.sin(angle) * 0.18]}
            scale={[0.11, 1.05, 0.11]}
            outline={0.02}
            castShadow
          />
        );
      })}
      <Toon
        geometry={GEO.cylinder}
        color={PALETTE.stoneDark}
        position={[0, 1.06, 0]}
        scale={[0.9, 0.3, 0.9]}
        outline={0.035}
      />
      <Toon
        geometry={GEO.cylinder}
        color={PALETTE.goldDeep}
        position={[0, 1.22, 0]}
        scale={[0.95, 0.08, 0.95]}
        outline={0.02}
      />

      <group ref={group} position={[0, 1.3, 0]}>
        {flames.map((i) => (
          <Toon
            key={i}
            geometry={GEO.octa}
            color={color}
            emissive={color}
            emissiveIntensity={2.6}
            outline={0}
            rim={1}
            position={[Math.cos((i / 3) * Math.PI * 2) * 0.2, 0.12 + i * 0.05, Math.sin((i / 3) * Math.PI * 2) * 0.2]}
            scale={0.3 - i * 0.04}
          />
        ))}
        <Flat geometry={GEO.circle} color={color} opacity={0.35} additive rotation={[-Math.PI / 2, 0, 0]} scale={2.4} />
      </group>

      <pointLight color={color} intensity={9} distance={11} decay={2} position={[0, 1.5, 0]} />
      <Sparkles count={40} color={color} intensity={0.5} radius={0.5} height={1.6} size={5} position={[0, 1.2, 0]} seed={`brazier-${position[0]}-${position[2]}`} />
    </group>
  );
}

export function PottedPlant({
  position,
  accent,
  seed = 0,
}: {
  position: [number, number, number];
  accent: string;
  seed?: number;
}) {
  const leaves = useMemo(() => {
    const out: Array<{ angle: number; lean: number; height: number }> = [];
    for (let i = 0; i < 7; i += 1) {
      out.push({
        angle: (i / 7) * Math.PI * 2 + seed,
        lean: 0.32 + (i % 3) * 0.12,
        height: 0.9 + (i % 4) * 0.22,
      });
    }
    return out;
  }, [seed]);

  return (
    <group position={position} dispose={null}>
      <Toon
        geometry={GEO.cylinder}
        color="#6b4a33"
        position={[0, 0.28, 0]}
        scale={[0.8, 0.56, 0.8]}
        outline={0.035}
        castShadow
      />
      <Toon
        geometry={GEO.cylinder}
        color="#54381f"
        position={[0, 0.58, 0]}
        scale={[0.92, 0.14, 0.92]}
        outline={0.02}
      />
      <Toon geometry={GEO.lowSphere} color="#2f4a34" position={[0, 0.62, 0]} scale={[0.8, 0.2, 0.8]} outline={0.02} />
      {leaves.map((leaf, i) => (
        <Toon
          key={i}
          geometry={GEO.cone}
          color={i % 2 === 0 ? '#3f6b47' : '#4f8256'}
          position={[
            Math.cos(leaf.angle) * 0.26 * leaf.lean * 3,
            0.62 + leaf.height * 0.5,
            Math.sin(leaf.angle) * 0.26 * leaf.lean * 3,
          ]}
          rotation={[Math.sin(leaf.angle) * leaf.lean, leaf.angle, Math.cos(leaf.angle) * leaf.lean]}
          scale={[0.34, leaf.height, 0.34]}
          outline={0.02}
          castShadow
        />
      ))}
      {leaves.slice(0, 3).map((leaf, i) => (
        <Toon
          key={`f${i}`}
          geometry={GEO.octa}
          color={accent}
          emissive={accent}
          emissiveIntensity={1.1}
          outline={0}
          rim={0.9}
          position={[
            Math.cos(leaf.angle) * 0.34,
            0.62 + leaf.height,
            Math.sin(leaf.angle) * 0.34,
          ]}
          scale={0.12}
        />
      ))}
    </group>
  );
}