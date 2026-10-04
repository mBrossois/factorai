/**
 * The 3D scene: canvas, lighting, post-processing, level routing and the
 * first-person controller.
 *
 * One Canvas renders exactly one level at a time. Only the current level is
 * mounted, so the GPU is never paying for four rooms the player cannot see, and
 * the whole castle is cheap enough to hold 60fps on a laptop.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import { Bloom, EffectComposer, SMAA, Vignette } from '@react-three/postprocessing';
import { BlendFunction, KernelSize } from 'postprocessing';

import type { AppState } from '../core/types';
import { orderedFloors } from '../core/types';
import { InteractionProvider } from './Interaction';
import { CAULDRON, FLOOR_REGION, GROUND_REGIONS, levelY, spawnForLevel, STAIR } from './layout';
import { PALETTE, themeFor } from './theme';
import { Floor } from './environment/Floor';
import { MainHall } from './environment/MainHall';
import { HeadOffice } from './environment/HeadOffice';
import { RoomShell } from './environment/RoomShell';
import { Stairwell } from './environment/Corridor';
import { deskObstacle } from './environment/Desk';
import { Interactable } from './Interaction';
import { SignPlate } from './props/SignPlate';
import { Sparkles } from './props/Sparkles';
import { Toon, GEO } from './materials';
import { useFirstPerson, type FirstPersonApi } from '../hooks/useFirstPerson';
import type { Obstacle } from '../hooks/useFirstPerson';

export type Panel =
  | { kind: 'none' }
  | { kind: 'board'; repoId: string | null }
  | { kind: 'shelf'; repoId: string | null }
  | { kind: 'cauldron'; repoId: string }
  | { kind: 'agent'; agentId: string }
  | { kind: 'repo-form' }
  | { kind: 'issue-form'; repoId?: string }
  | { kind: 'office'; repoId?: string }
  | { kind: 'help' };

export interface SceneProps {
  state: AppState;
  /** Level index: 0 = ground floor, N = the repo with floorNumber N. */
  level: number;
  onLevelChange: (level: number) => void;
  onOpenPanel: (panel: Panel) => void;
  /** Called when the player presses E with nothing in reach (re-engages the mouse). */
  onEnter: () => void;
  selectedAgentId: string | null;
  onLockChange?: (locked: boolean) => void;
  /** Reports what the crosshair is pointing at, for the HUD prompt. */
  onFocusChange?: (focus: { label: string; detail?: string; distance: number | null } | null) => void;
  /** Hands the first-person API up so the HUD can request/release pointer lock. */
  onControls?: (api: FirstPersonApi) => void;
}

export function Scene(props: SceneProps) {
  return (
    <Canvas
      // three 0.186 removed PCFSoftShadowMap, which is what R3F's `shadows`
      // boolean selects; ask for PCF explicitly.
      shadows="percentage"
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      camera={{ fov: 72, near: 0.1, far: 400, position: [0, 1.68, 12] }}
      onCreated={({ gl }) => gl.setClearColor(PALETTE.void)}
    >
      <InteractionProvider onFocusChange={props.onFocusChange}>
        <Suspense fallback={null}>
          <World {...props} />
        </Suspense>
      </InteractionProvider>
    </Canvas>
  );
}

function World({ state, level, onLevelChange, onOpenPanel, onEnter, selectedAgentId, onLockChange, onControls }: SceneProps) {
  const floors = useMemo(() => orderedFloors(state), [state]);
  const spawn = useMemo(() => spawnForLevel(level), [level]);
  const controlsRef = useRef<FirstPersonApi | null>(null);

  /** Desks and cauldrons are solid: the player walks around them. */
  const obstacles = useMemo<Obstacle[]>(() => {
    const list: Obstacle[] = [{ x: CAULDRON.x, z: CAULDRON.z, radius: 1.5 }];
    for (const agent of state.agents) list.push(deskObstacle(agent));
    return list;
  }, [state.agents]);

  const obstaclesRef = useRef<Obstacle[]>(obstacles) as RefObject<Obstacle[]>;
  useEffect(() => {
    obstaclesRef.current = obstacles;
  }, [obstacles]);

  const regions = level === 0 ? GROUND_REGIONS : [FLOOR_REGION];
  const floorY = levelY(level);
  const currentFloor = level === 0 ? undefined : floors[level - 1];
  const theme = themeFor(currentFloor?.theme);

  const upLabel =
    level < floors.length ? (level === 0 ? (floors[0]?.name ?? null) : (floors[level]?.name ?? null)) : null;
  const downLabel =
    level === 0 ? null : level === 1 ? 'the Great Hall' : (floors[level - 2]?.name ?? 'the Great Hall');

  const goUp = useCallback(() => {
    if (level < floors.length) onLevelChange(level + 1);
  }, [level, floors.length, onLevelChange]);

  const goDown = useCallback(() => {
    if (level > 0) onLevelChange(level - 1);
  }, [level, onLevelChange]);

  const controls = useFirstPerson({
    enabled: true,
    floorY,
    regions,
    obstacles: obstaclesRef,
    spawn: spawn.position,
    spawnYaw: spawn.yaw,
    onInteractEmpty: onEnter,
    onLockChange,
  });
  controlsRef.current = controls;
  useEffect(() => {
    onControls?.(controls);
  }, [controls, onControls]);

  const agents = useMemo(
    () => (currentFloor ? state.agents.filter((a) => a.repoId === currentFloor.id) : []),
    [state.agents, currentFloor],
  );
  const issues = useMemo(
    () => (currentFloor ? state.issues.filter((i) => i.repoId === currentFloor.id) : state.issues),
    [state.issues, currentFloor],
  );
  const prs = useMemo(
    () => (currentFloor ? state.prs.filter((p) => p.repoId === currentFloor.id) : state.prs),
    [state.prs, currentFloor],
  );

  return (
    <>
      <color attach="background" args={[PALETTE.void]} />
      <fogExp2 attach="fog" args={[PALETTE.fog, 0.019]} />

      <Lighting level={level} accent={theme.accent} lightColor={theme.light} />

      {level === 0 ? (
        <>
          <MainHall
            repos={floors}
            issues={state.issues}
            agents={state.agents}
            state={state}
            onOpenBoard={() => onOpenPanel({ kind: 'board', repoId: null })}
            onOpenOffice={() => onOpenPanel({ kind: 'office' })}
            onGoToFloor={onLevelChange}
            onAscend={goUp}
          />
          <HeadOffice
            repos={floors}
            agents={state.agents}
            state={state}
            onOpenRepoForm={() => onOpenPanel({ kind: 'repo-form' })}
            onOpenIssueForm={() => onOpenPanel({ kind: 'issue-form' })}
            onOpenManager={() => onOpenPanel({ kind: 'office' })}
            onReturnToHall={() => controlsRef.current?.teleport(0, 11.4)}
          />
        </>
      ) : currentFloor ? (
        <Floor
          repo={currentFloor}
          agents={agents}
          issues={issues}
          prs={prs}
          state={state}
          upLabel={upLabel}
          downLabel={downLabel}
          onAscend={goUp}
          onDescend={goDown}
          onOpenBoard={() => onOpenPanel({ kind: 'board', repoId: currentFloor.id })}
          onOpenShelf={() => onOpenPanel({ kind: 'shelf', repoId: currentFloor.id })}
          onOpenCauldron={() => onOpenPanel({ kind: 'cauldron', repoId: currentFloor.id })}
          onInspectAgent={(agentId) => onOpenPanel({ kind: 'agent', agentId })}
          selectedAgentId={selectedAgentId}
        />
      ) : (
        <VacantFloor level={level} accent={theme.accent} onDescend={goDown} />
      )}

      <PostProcessing />
    </>
  );
}

function Lighting({ level, accent, lightColor }: { level: number; accent: string; lightColor: string }) {
  const y = levelY(level);
  return (
    <>
      <hemisphereLight args={['#6a5a92', '#1a1030', 0.55]} />
      <ambientLight intensity={0.28} color="#8f7ad6" />
      <directionalLight
        position={[14, 26, 10]}
        intensity={1.15}
        color="#fff0d0"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0016}
        shadow-camera-near={1}
        shadow-camera-far={110}
        shadow-camera-left={-26}
        shadow-camera-right={26}
        shadow-camera-top={26}
        shadow-camera-bottom={-26}
      />
      <directionalLight position={[-16, 14, -12]} intensity={0.5} color={accent} />
      <pointLight position={[0, y + 5.4, 0]} intensity={26} distance={32} decay={2} color={lightColor} />
      <pointLight position={[STAIR.x, y + 3.6, STAIR.z]} intensity={12} distance={18} decay={2} color={accent} />
      {/* Keeps the void beyond the windows from reading as pure black. */}
      <pointLight position={[0, y + 3, -16]} intensity={9} distance={32} decay={2} color="#5a4a8f" />
    </>
  );
}

function PostProcessing() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.7}
        luminanceThreshold={0.42}
        luminanceSmoothing={0.28}
        kernelSize={KernelSize.LARGE}
        mipmapBlur
      />
      <Vignette offset={0.28} darkness={0.7} blendFunction={BlendFunction.NORMAL} />
      <SMAA />
    </EffectComposer>
  );
}

/**
 * A level with no repo behind it -- reachable only in the instant between
 * removing a repo and the player walking back down. Kept walkable so the
 * castle never dumps the camera into the void.
 */
function VacantFloor({ level, accent, onDescend }: { level: number; accent: string; onDescend: () => void }) {
  return (
    <group position={[0, levelY(level), 0]}>
      <RoomShell wallColor={PALETTE.stoneDark} floorColor="#2a2438" accentColor={accent} northOpenings={[[STAIR.x - STAIR.radius - 0.4, STAIR.x + STAIR.radius + 0.4]]} seed={level}>
        <SignPlate
          text="Vacant floor"
          sub="this repository is no longer bound"
          position={[0, 3.2, -12.9]}
          width={5}
          accent="#ff7a8a"
          glow
        />
        <Interactable label="Go back down" detail="press E" range={6} onInteract={onDescend}>
          <Toon geometry={GEO.box} color={accent} emissive={accent} emissiveIntensity={0.8} position={[0, 1.4, -4]} scale={[2.4, 2.4, 0.2]} outline={0.05} />
        </Interactable>
      </RoomShell>
      <Stairwell baseY={0} accent={accent} upLabel={null} downLabel="the floor below" onAscend={() => undefined} onDescend={onDescend} />
      <Sparkles count={90} color="#8d7fae" intensity={0.25} radius={10} height={6} size={7} position={[0, 0.3, 0]} seed={`vacant-${level}`} />
    </group>
  );
}

/** Floor names for the HUD selector: index 0 is the Great Hall. */
export function useFloorNames(state: AppState): string[] {
  return useMemo(() => ['Great Hall', ...orderedFloors(state).map((r) => r.name)], [state]);
}