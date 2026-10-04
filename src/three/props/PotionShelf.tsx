/**
 * Potion shelf: one bottled pull request per bottle.
 *
 * Bottle colour encodes CI state (green passing, red failing, gold merged,
 * violet pending) and the cork glows while the PR is open. An open PR with
 * failing checks makes the whole shelf flicker, which reads from across the room.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group } from 'three';

import type { PullRequest } from '../../core/types';
import { Interactable } from '../Interaction';
import { BOTTLE, Flat, GEO, Toon } from '../materials';
import { PALETTE } from '../theme';
import { Sparkles } from './Sparkles';

export interface PotionShelfProps {
  prs: PullRequest[];
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** World width of the shelf unit. */
  width?: number;
  onInspect?: () => void;
}

const ROWS = 3;
const SHELF_THICKNESS = 0.12;
const SHELF_DEPTH = 0.55;

const GLASS: Record<PullRequest['status'], { liquid: string; glow: string; cap: string }> = {
  open: { liquid: '#3ddc84', glow: '#8affbe', cap: '#f5c451' },
  merged: { liquid: '#f5c451', glow: '#ffe4a0', cap: '#8a6a2b' },
  closed: { liquid: '#5b4a72', glow: '#8d7fae', cap: '#3a2f4d' },
};

export function PotionShelf({ prs, position = [0, 0, 0], rotation = [0, 0, 0], width = 3.4, onInspect }: PotionShelfProps) {
  const glowRef = useRef<Group>(null);
  const perRow = Math.max(4, Math.ceil(Math.min(prs.length, 18) / ROWS) || 4);
  const open = prs.filter((p) => p.status === 'open');
  const failing = open.some((p) => p.checks.failing > 0);

  const bottleColor = useMemo(() => {
    if (failing) return '#ff5a74';
    if (open.length === 0) return '#8d7fae';
    return '#7dffbe';
  }, [failing, open.length]);

  useFrame((state) => {
    const group = glowRef.current;
    if (!group) return;
    const t = state.clock.elapsedTime;
    const pulse = failing ? 0.6 + 0.4 * Math.sin(t * 5.5) : 0.85 + 0.15 * Math.sin(t * 1.6);
    group.scale.setScalar(pulse);
  });

  const shelfHeight = ROWS * 0.72;
  const visible = prs.slice(0, perRow * ROWS);

  const unit = (
    <group position={position} rotation={rotation} dispose={null}>
      {/* Carcass */}
      <Toon
        geometry={GEO.box}
        color={PALETTE.woodDark}
        position={[0, shelfHeight / 2, -SHELF_DEPTH / 2]}
        scale={[width + 0.2, shelfHeight + 0.2, 0.14]}
        outline={0.04}
        castShadow
      />
      {Array.from({ length: ROWS + 1 }, (_, i) => (
        <Toon
          key={i}
          geometry={GEO.box}
          color={PALETTE.wood}
          position={[0, i * 0.72 + 0.06, 0]}
          scale={[width, SHELF_THICKNESS, SHELF_DEPTH]}
          outline={0.03}
          receiveShadow
        />
      ))}
      {[-1, 1].map((side) => (
        <Toon
          key={side}
          geometry={GEO.box}
          color={PALETTE.wood}
          position={[(side * width) / 2, shelfHeight / 2, 0]}
          scale={[0.1, shelfHeight, SHELF_DEPTH]}
          outline={0.025}
        />
      ))}

      {/* Bottles */}
      {visible.map((pr, index) => {
        const row = Math.floor(index / perRow);
        const slot = index % perRow;
        const count = Math.min(perRow, visible.length - row * perRow);
        const spacing = width / (count + 1);
        const x = -width / 2 + spacing * (slot + 1);
        const y = row * 0.72 + 0.12;
        const palette = GLASS[pr.status];
        return (
          <group key={pr.id} position={[x, y, 0]} dispose={null}>
            <Toon geometry={BOTTLE} color={palette.liquid} scale={0.62} outline={0.014} emissive={palette.liquid} emissiveIntensity={0.35} />
            <Toon geometry={GEO.cylinder} color={palette.cap} position={[0, 0.5, 0]} scale={[0.17, 0.16, 0.17]} outline={0.012} />
            <Flat
              geometry={GEO.plane}
              color={palette.glow}
              opacity={pr.status === 'open' ? 0.5 : 0.18}
              additive
              position={[0, 0.26, 0.2]}
              scale={[0.9, 0.9, 1]}
            />
          </group>
        );
      })}

      {/* Empty-shelf message when there is nothing bottled yet */}
      {prs.length === 0 && (
        <Toon
          geometry={GEO.box}
          color={PALETTE.woodDark}
          position={[0, shelfHeight / 2, 0.1]}
          scale={[width * 0.8, 0.1, 0.1]}
          outline={0}
          rim={0.2}
        />
      )}

      <group ref={glowRef} position={[0, shelfHeight / 2, 0.35]} dispose={null}>
        <Flat
          geometry={GEO.plane}
          color={bottleColor}
          opacity={failing ? 0.3 : 0.16}
          additive
          scale={[width + 0.6, shelfHeight + 0.6, 1]}
        />
      </group>

      <Sparkles
        count={prs.length > 0 ? 60 : 0}
        color={bottleColor}
        intensity={failing ? 0.9 : 0.4}
        radius={width * 0.5}
        height={shelfHeight}
        size={6}
        position={[0, shelfHeight / 2, 0]}
      />
    </group>
  );

  if (!onInspect) return unit;
  return (
    <Interactable
      label="Inspect the potion shelf"
      detail={`${prs.length} bottled pull requests · ${open.length} open`}
      range={4.4}
      onInteract={onInspect}
    >
      {unit}
    </Interactable>
  );
}
