/**
 * The Head Mistress' office (ground floor, east wing).
 *
 * Where repos and agents are managed. The room's centrepiece is a magical
 * mirror that plots every repository in the castle as a constellation, with a
 * line glowing for each repo whose agents are currently working.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { type Group } from 'three';

import type { Agent, AppState, Repo } from '../../core/types';
import { Interactable } from '../Interaction';
import { useCanvasTexture } from '../canvasTexture';
import { Flat, GEO, Toon } from '../materials';
import { PALETTE } from '../theme';
import { SignPlate } from '../props/SignPlate';
import { Sparkles } from '../props/Sparkles';
import { WallSconce, Brazier, PottedPlant } from './Props';

export interface HeadOfficeProps {
  repos: Repo[];
  agents: Agent[];
  state: AppState;
  position?: [number, number, number];
  onOpenRepoForm: () => void;
  onOpenIssueForm: () => void;
  onOpenManager: () => void;
  onReturnToHall: () => void;
}

const CENTER_X = 21.5;

export function HeadOffice({
  repos,
  agents,
  state,
  position = [0, 0, 0],
  onOpenRepoForm,
  onOpenIssueForm,
  onOpenManager,
  onReturnToHall,
}: HeadOfficeProps) {
  const mirrorGlow = useRef<Group>(null);
  const globe = useRef<Group>(null);

  const floors = useMemo(() => [...repos].sort((a, b) => a.floorNumber - b.floorNumber), [repos]);

  const mirrorTexture = useCanvasTexture({
    width: 1024,
    height: 640,
    deps: [
      floors.map((r) => `${r.id}:${r.floorNumber}:${r.connected}`).join(','),
      agents.map((a) => `${a.id}:${a.status}`).join(','),
    ],
    draw: (ctx, w, h) => drawMirror(ctx, w, h, floors, agents, state),
  });

  useFrame((clockState) => {
    const t = clockState.clock.elapsedTime;
    if (mirrorGlow.current) {
      mirrorGlow.current.scale.setScalar(0.96 + Math.sin(t * 1.1) * 0.05);
      mirrorGlow.current.rotation.z = Math.sin(t * 0.35) * 0.02;
    }
    if (globe.current) globe.current.rotation.y = t * 0.22;
  });

  return (
    <group position={position} dispose={null}>
      {/* Floor + ceiling for the office wing only */}
      <Toon
        geometry={GEO.box}
        color={PALETTE.woodDark}
        position={[CENTER_X, -0.15, 0]}
        scale={[15.4, 0.3, 27.4]}
        outline={0.06}
        receiveShadow
      />
      <Toon
        geometry={GEO.box}
        color="#2b2338"
        position={[CENTER_X, 7.0, 0]}
        scale={[15.4, 0.4, 27.4]}
        outline={0.05}
      />
      {/* North / south / east walls of the wing */}
      <Toon geometry={GEO.box} color="#4a2f3a" position={[CENTER_X, 3.5, -13.7]} scale={[15.4, 7, 0.7]} outline={0.05} />
      <Toon geometry={GEO.box} color="#4a2f3a" position={[CENTER_X, 3.5, 13.7]} scale={[15.4, 7, 0.7]} outline={0.05} />
      <Toon geometry={GEO.box} color="#4a2f3a" position={[29.7, 3.5, 0]} scale={[0.7, 7, 27.4]} outline={0.05} />

      {/* Magical mirror of the castle */}
      <group position={[29.1, 3.1, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <Toon
          geometry={GEO.box}
          color={PALETTE.goldDeep}
          scale={[9.4, 5.6, 0.24]}
          outline={0.05}
          castShadow
        />
        <Toon geometry={GEO.box} color={PALETTE.gold} position={[0, 0, 0.12]} scale={[9.0, 5.2, 0.2]} outline={0.03} />
        <Flat
          geometry={GEO.plane}
          map={mirrorTexture}
          position={[0, 0, 0.24]}
          scale={[8.7, 5.0, 1]}
          depthWrite
          renderOrder={2}
        />
        <group ref={mirrorGlow} position={[0, 0, 0.3]}>
          <Flat geometry={GEO.plane} color={PALETTE.arcane} opacity={0.14} additive scale={[9.0, 5.3, 1]} />
        </group>
        {[0, 1, 2, 3].map((i) => (
          <Toon
            key={i}
            geometry={GEO.octa}
            color={PALETTE.gold}
            emissive={PALETTE.gold}
            emissiveIntensity={1.4}
            outline={0}
            rim={1}
            position={[
              (i % 2 === 0 ? -1 : 1) * 4.7,
              (i < 2 ? -1 : 1) * 2.8,
              0.32,
            ]}
            scale={0.26}
          />
        ))}
      </group>

      {/* The Head Mistress' desk */}
      <group position={[19.6, 0, 0]}>
        <Toon geometry={GEO.box} color={PALETTE.wood} position={[0, 0.94, 0]} scale={[4.4, 0.18, 2.2]} outline={0.04} castShadow />
        <Toon geometry={GEO.box} color={PALETTE.woodDark} position={[0, 0.84, 0]} scale={[4.1, 0.12, 2]} outline={0.02} />
        {[-1.8, 1.8].map((x) => (
          <Toon key={x} geometry={GEO.box} color={PALETTE.woodDark} position={[x, 0.44, 0]} scale={[0.34, 0.88, 1.9]} outline={0.03} />
        ))}
        {/* High-backed chair */}
        <Toon geometry={GEO.box} color="#6a2233" position={[0, 1.0, -1.7]} scale={[1.5, 1.9, 0.3]} outline={0.04} castShadow />
        <Toon geometry={GEO.box} color="#7d2839" position={[0, 0.62, -1.55]} scale={[1.5, 0.2, 1.2]} outline={0.03} />
        {/* Quill + inkwell */}
        <Toon geometry={GEO.cylinder} color="#2b2438" position={[1.6, 1.1, 0.3]} scale={[0.24, 0.2, 0.24]} outline={0.02} />
        <Toon geometry={GEO.cylinder} color="#e8e2f5" position={[1.72, 1.36, 0.24]} rotation={[0, 0, 0.5]} scale={[0.04, 0.5, 0.04]} outline={0.012} />

        {/* Floating rune ledger: the repo list */}
        <Interactable label="Manage repositories" detail={`${repos.length} floors`} range={4} onInteract={onOpenRepoForm}>
          <group position={[-0.6, 2.2, 0]} dispose={null}>
            <Toon geometry={GEO.box} color="#3b2a5e" position={[-0.7, 0, 0]} scale={[1.3, 0.9, 0.12]} rotation={[0, 0.4, 0]} outline={0.03} />
            <Toon geometry={GEO.box} color="#3b2a5e" position={[0.7, 0, 0]} scale={[1.3, 0.9, 0.12]} rotation={[0, -0.4, 0]} outline={0.03} />
            <Flat
              geometry={GEO.plane}
              map={mirrorTexture}
              position={[0, 0.06, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              scale={[2.2, 1.4, 1]}
              renderOrder={3}
            />
            <Flat geometry={GEO.plane} color={PALETTE.gold} opacity={0.3} additive rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} scale={[2.6, 1.8, 1]} />
          </group>
        </Interactable>
      </group>

      {/* Terrestrial globe plotting the castle's connections */}
      <group position={[25.4, 0, -7.5]}>
        <Toon geometry={GEO.cylinder} color={PALETTE.woodDark} position={[0, 0.3, 0]} scale={[1.8, 0.6, 1.8]} outline={0.04} />
        <group ref={globe} position={[0, 1.9, 0]}>
          <Toon geometry={GEO.sphere} color="#3f6f9e" scale={1.7} outline={0.04} castShadow />
          <Toon geometry={GEO.torus} color={PALETTE.gold} rotation={[Math.PI / 2, 0, 0]} scale={1.9} outline={0.02} />
          {[0, 1, 2].map((i) => (
            <Toon
              key={i}
              geometry={GEO.torus}
              color={PALETTE.goldDeep}
              rotation={[0, (i / 3) * Math.PI, Math.PI / 2.4]}
              scale={1.82}
              outline={0.015}
            />
          ))}
          {/* Connection nodes: one glowing pin per repo */}
          {floors.slice(0, 8).map((repo, i) => {
            const angle = (i / Math.max(1, Math.min(floors.length, 8))) * Math.PI * 2;
            const busy = state.agents.some((a) => a.repoId === repo.id && a.status === 'working');
            return (
              <Toon
                key={repo.id}
                geometry={GEO.octa}
                color={busy ? PALETTE.gold : PALETTE.arcane}
                emissive={busy ? PALETTE.gold : PALETTE.arcane}
                emissiveIntensity={busy ? 2.4 : 1.1}
                outline={0}
                rim={1}
                position={[Math.cos(angle) * 0.86, Math.sin(angle) * 0.5 + 0.2, Math.sin(angle) * 0.86]}
                scale={0.14}
              />
            );
          })}
        </group>
        <Toon geometry={GEO.cylinder} color={PALETTE.goldDeep} position={[0, 1.05, 0]} scale={[0.16, 1.1, 0.16]} outline={0.02} />
      </group>

      {/* Three interactables, one per management task */}
      <Interactable label="Add a repository" detail="a new floor appears in the castle" range={3.6} onInteract={onOpenRepoForm}>
        <DeskTotem position={[18.2, 0, 5.4]} color={PALETTE.emerald} glyph="＋" caption="new floor" />
      </Interactable>
      <Interactable label="Write a new potion order" detail="file an issue" range={3.6} onInteract={onOpenIssueForm}>
        <DeskTotem position={[18.2, 0, 7.6]} color={PALETTE.gold} glyph="✎" caption="potion order" />
      </Interactable>
      <Interactable label="The agent roster" detail="spawn, restart or dismiss wizards" range={3.6} onInteract={onOpenManager}>
        <DeskTotem position={[18.2, 0, 9.8]} color={PALETTE.violet} glyph="⚑" caption="agent roster" />
      </Interactable>

      <Interactable label="Return to the Great Hall" detail="west through the arch" range={3.2} onInteract={onReturnToHall}>
        <group position={[15.4, 0, 0]} dispose={null}>
          <Flat
            geometry={GEO.plane}
            color={PALETTE.arcane}
            opacity={0.22}
            additive
            position={[0, 1.9, 0]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={[4, 5.4, 1]}
          />
          <SignPlate text="Great Hall" sub="west wing" position={[0, 4.1, 0]} rotation={[0, -Math.PI / 2, 0]} width={2.4} />
        </group>
      </Interactable>

      {/* Dressing */}
      <Brazier position={[16.6, 0, -8]} color={PALETTE.lantern} />
      <Brazier position={[16.6, 0, 8]} color={PALETTE.lantern} />
      {([-9, 9] as const).map((z) => (
        <WallSconce key={z} position={[29.4, 3.8, z]} color={PALETTE.lantern} rotationY={-Math.PI / 2} />
      ))}
      <PottedPlant position={[27.8, 0, 10.5]} accent={PALETTE.gold} seed={1.2} />
      <PottedPlant position={[27.8, 0, -10.5]} accent={PALETTE.gold} seed={2.4} />

      <Sparkles count={160} color={PALETTE.gold} intensity={0.32} radius={7} height={5} size={8} position={[CENTER_X, 0.4, 0]} seed="head-office" />
    </group>
  );
}

/** A floating task totem: glyph plate over a small plinth. */
function DeskTotem({
  position,
  color,
  glyph,
  caption,
}: {
  position: [number, number, number];
  color: string;
  glyph: string;
  caption: string;
}) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    const g = ref.current;
    if (!g) return;
    g.position.y = 1.5 + Math.sin(state.clock.elapsedTime * 1.3 + position[2]) * 0.06;
    g.rotation.y = state.clock.elapsedTime * 0.4;
  });

  return (
    <group position={position} dispose={null}>
      <Toon geometry={GEO.cylinder} color={PALETTE.woodDark} position={[0, 0.24, 0]} scale={[1.1, 0.48, 1.1]} outline={0.035} receiveShadow />
      <Toon geometry={GEO.cylinder} color={color} position={[0, 0.55, 0]} scale={[0.9, 0.16, 0.9]} outline={0.025} />
      <group ref={ref} position={[0, 1.5, 0]} dispose={null}>
        <Toon geometry={GEO.box} color={color} emissive={color} emissiveIntensity={0.8} scale={[1.5, 1.5, 0.12]} outline={0.03} />
        <Toon geometry={GEO.octa} color={color} emissive={color} emissiveIntensity={1.6} outline={0} rim={1} scale={0.3} />
        <SignPlate text={glyph} width={0.9} position={[0, 0, 0.09]} accent={color} />
        <SignPlate text={caption} width={1.7} position={[0, -1.05, 0]} rotation={[-0.3, 0, 0]} accent={color} glow />
      </group>
      <Sparkles
        count={40}
        color={color}
        intensity={0.5}
        radius={0.55}
        height={2.6}
        size={6}
        position={[0, 0.2, 0]}
        seed={caption}
      />
      <pointLight color={color} intensity={5} distance={7} decay={2} position={[0, 1.5, 0]} />
    </group>
  );
}

/** Draws the castle constellation: one star per repo, wired by agent activity. */
function drawMirror(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  repos: Repo[],
  agents: Agent[],
  state: AppState,
): void {
  const sky = ctx.createRadialGradient(w / 2, h / 2, 30, w / 2, h / 2, w * 0.7);
  sky.addColorStop(0, '#1c1440');
  sky.addColorStop(1, '#080417');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Starfield
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * 1.6 + 0.3;
    ctx.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.gold;
  ctx.font = '600 34px Georgia, serif';
  ctx.fillText('THE CASTLE, AS THE HEADMISTRESS SEES IT', w / 2, 56);

  if (repos.length === 0) {
    ctx.fillStyle = 'rgba(240,226,189,0.5)';
    ctx.font = 'italic 30px Georgia, serif';
    ctx.fillText('no repositories have been bound yet', w / 2, h / 2);
    return;
  }

  const cx = w / 2;
  const cy = h / 2 + 40;
  const ring = Math.min(w, h) * 0.3;

  // Connection lines from the castle centre to each repo star
  repos.forEach((repo) => {
    const angle = (repo.floorNumber / Math.max(1, repos.length)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * ring;
    const y = cy + Math.sin(angle) * ring * 0.72;
    const busy = state.agents.some((a) => a.repoId === repo.id && a.status === 'working');
    ctx.strokeStyle = busy ? 'rgba(255,214,102,0.75)' : 'rgba(122,215,255,0.3)';
    ctx.lineWidth = busy ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Star
    const color = repo.connected ? (busy ? '#ffd666' : '#7ad7ff') : '#ff7a8a';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, busy ? 11 : 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `${color}66`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, busy ? 20 : 15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = PALETTE.parchment;
    ctx.font = '600 20px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(repo.name, x, y + 38);
    ctx.fillStyle = repo.connected ? 'rgba(122,215,255,0.8)' : 'rgba(255,122,138,0.9)';
    ctx.font = '16px "Trebuchet MS", system-ui, sans-serif';
    ctx.fillText(`floor ${repo.floorNumber}`, x, y + 58);
  });

  // The castle itself at the centre
  ctx.fillStyle = PALETTE.gold;
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(240,226,189,0.9)';
  ctx.font = '600 22px Georgia, serif';
  ctx.fillText('castle', cx, cy - 26);

  const working = agents.filter((a) => a.status === 'working').length;
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(240,226,189,0.6)';
  ctx.font = '20px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(
    `${repos.length} floors · ${agents.length} wizards · ${working} at work`,
    40,
    h - 32,
  );
}