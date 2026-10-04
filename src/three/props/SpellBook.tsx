/**
 * The floating spell book at an agent's desk.
 *
 * Doubles as the agent's live output: the last few log lines are rendered as
 * "runic" text on the open pages, and the book floats and glows brighter while
 * the agent is working.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group } from 'three';

import type { Agent, AgentStatus } from '../../core/types';
import { useCanvasTexture } from '../canvasTexture';
import { Flat, GEO, Toon } from '../materials';
import { AGENT_STATES, PALETTE } from '../theme';
import { Sparkles } from './Sparkles';

export interface SpellBookProps {
  agent: Agent;
  lines: string[];
  position?: [number, number, number];
  /** 0.7 idle, 1.0 focused, 1.2 when the player is reading it. */
  scale?: number;
}

const MAX_LINES = 7;

export function SpellBook({ agent, lines, position = [0, 1.5, 0], scale = 1 }: SpellBookProps) {
  const group = useRef<Group>(null);
  const pages = useRef<Group>(null);
  const status: AgentStatus = agent.status;
  const state = AGENT_STATES[status];

  const tail = useMemo(
    () => lines.filter((l) => l.trim()).slice(-MAX_LINES),
    [lines],
  );

  const texture = useCanvasTexture({
    width: 1024,
    height: 700,
    transparent: true,
    deps: [tail.join('\n'), status],
    draw: (ctx, w, h) => drawRunes(ctx, w, h, tail, status, agent.name),
  });

  const tint = state.glow;

  useFrame((clockState, delta) => {
    const t = clockState.clock.elapsedTime;
    const g = group.current;
    if (g) {
      g.position.y = position[1] + Math.sin(t * 1.1 + agent.desk) * 0.055;
      g.rotation.z = Math.sin(t * 0.7 + agent.desk) * 0.05;
    }
    const p = pages.current;
    if (p) {
      // Pages flutter a little faster while the agent is producing output.
      const rate = status === 'working' ? 9 : 3;
      p.rotation.y = Math.sin(t * rate + agent.desk) * 0.05;
    }
    void delta;
  });

  return (
    <group position={position} scale={scale} dispose={null}>
      <group ref={group} dispose={null}>
        {/* Cover + pages, split down the middle like an open book. */}
        <group ref={pages} dispose={null}>
          <Toon
            geometry={GEO.box}
            color="#5b2f8a"
            position={[-0.34, 0, 0]}
            rotation={[0, 0.22, 0.06]}
            scale={[0.66, 0.05, 0.5]}
            outline={0.02}
            castShadow
          />
          <Toon
            geometry={GEO.box}
            color="#5b2f8a"
            position={[0.34, 0, 0]}
            rotation={[0, -0.22, -0.06]}
            scale={[0.66, 0.05, 0.5]}
            outline={0.02}
            castShadow
          />
          <Toon
            geometry={GEO.box}
            color={PALETTE.parchment}
            position={[-0.34, 0.032, 0]}
            rotation={[0, 0.22, 0.06]}
            scale={[0.6, 0.012, 0.45]}
            outline={0}
            rim={0.15}
          />
          <Toon
            geometry={GEO.box}
            color={PALETTE.parchment}
            position={[0.34, 0.032, 0]}
            rotation={[0, -0.22, -0.06]}
            scale={[0.6, 0.012, 0.45]}
            outline={0}
            rim={0.15}
          />
        </group>

        {/* The runes: the agent's live output. */}
        <Flat
          geometry={GEO.plane}
          map={texture}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.075, 0]}
          scale={[1.24, 0.86, 1]}
          renderOrder={4}
        />

        {/* Spine clasp */}
        <Toon
          geometry={GEO.box}
          color={PALETTE.gold}
          position={[0, 0.05, 0]}
          scale={[0.07, 0.08, 0.5]}
          outline={0.015}
        />

        {/* A status light on the book, driven by the agent's state. */}
        <Toon
          geometry={GEO.octa}
          color={tint}
          emissive={tint}
          emissiveIntensity={status === 'working' ? 2.4 : 1.1}
          rim={1}
          outline={0}
          position={[0, 0.3, 0]}
          scale={status === 'working' ? 0.16 : 0.1}
        />
      </group>

      <Sparkles
        count={status === 'working' ? 90 : 30}
        color={tint}
        intensity={status === 'working' ? 1.1 : 0.45}
        radius={0.55}
        height={1.1}
        size={status === 'working' ? 7 : 5}
        position={[0, 0.1, 0]}
        seed={agent.id}
      />
    </group>
  );
}

function drawRunes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  lines: string[],
  status: AgentStatus,
  name: string,
): void {
  ctx.clearRect(0, 0, w, h);

  // Glowing page wash
  const wash = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.6);
  const tint = AGENT_STATES[status].glow;
  wash.addColorStop(0, `${tint}44`);
  wash.addColorStop(1, 'rgba(240,226,189,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (lines.length === 0) {
    ctx.fillStyle = 'rgba(240,226,189,0.5)';
    ctx.font = 'italic 34px Georgia, serif';
    ctx.fillText('the pages are blank…', w / 2, h / 2);
    ctx.font = '22px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(name, w / 2, h / 2 + 44);
    return;
  }

  const lineHeight = h / (lines.length + 1.2);
  lines.forEach((line, index) => {
    const y = lineHeight * (index + 1.15);
    const recent = index >= lines.length - 2;
    ctx.fillStyle = recent ? tint : 'rgba(240,226,189,0.62)';
    ctx.font = `${recent ? 600 : 400} ${Math.min(30, lineHeight * 0.5)}px "SF Mono", ui-monospace, monospace`;

    // Older lines fade out, so the newest rune always reads first.
    const alpha = 0.35 + 0.65 * (index / Math.max(1, lines.length - 1));
    ctx.globalAlpha = alpha;

    let text = line.replace(/\s+/g, ' ').trim();
    if (text.length > 58) text = `…${text.slice(-57)}`;
    ctx.fillText(text, w / 2, y, w - 80);
  });
  ctx.globalAlpha = 1;
}
