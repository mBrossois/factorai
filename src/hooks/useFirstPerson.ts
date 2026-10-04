/**
 * First-person controls: pointer lock, WASD, level transitions, interaction.
 *
 * Movement is deliberately kinematic rather than physics-based. Each castle
 * level is a room at a fixed height, so the player is clamped to that level's
 * floor and eased towards it. Changing floors (stairs, daises, warp pads) is an
 * explicit teleport, which keeps navigation predictable with no collision
 * solver to tune.
 *
 * Must be called inside a `<Canvas>` because it drives the camera from
 * `useFrame`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Euler, MathUtils, Vector3 } from 'three';

import { CenterPicker, useInteraction, type InteractionTarget } from '../three/Interaction';
import { clampToRegions } from '../three/layout';

export const EYE_HEIGHT = 1.68;

const WALK_SPEED = 4.4;
const SPRINT_SPEED = 7.6;
const PLAYER_RADIUS = 0.42;
const LOOK_SENSITIVITY = 0.0016;
const PICK_EVERY_N_FRAMES = 3;

export interface Obstacle {
  x: number;
  z: number;
  radius: number;
}

export interface WalkBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface FirstPersonOptions {
  enabled: boolean;
  /** Ground height of the current level. */
  floorY: number;
  /**
   * Walkable rectangles. The player may be in any of them; movement that would
   * leave all of them is clamped back to the one they are standing in, which is
   * what lets the Great Hall and the office be joined by a doorway.
   */
  regions: ReadonlyArray<WalkBounds>;
  /** Solid circles to push out of (desks, cauldrons). */
  obstacles: RefObject<Obstacle[]>;
  /** Where the player stands when entering this level. */
  spawn: [number, number];
  /** Facing (radians) on entering this level. */
  spawnYaw: number;
  onInteractEmpty?: () => void;
  /** Notified whenever pointer lock is engaged or released. */
  onLockChange?: (locked: boolean) => void;
}

export interface FirstPersonApi {
  locked: boolean;
  requestLock: () => void;
  teleport: (x: number, z: number) => void;
}

const KEY_MAP: Record<string, keyof Movement> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
};

interface Movement {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  sprint: boolean;
}

const NO_MOVEMENT: Movement = { forward: false, back: false, left: false, right: false, sprint: false };

export function useFirstPerson(options: FirstPersonOptions): FirstPersonApi {
  const { camera, gl } = useThree();
  const [locked, setLocked] = useState(false);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const keys = useRef<Movement>({ ...NO_MOVEMENT });
  const position = useRef(new Vector3(options.spawn[0], EYE_HEIGHT, options.spawn[1]));
  const velocity = useRef(new Vector3());
  const yaw = useRef(Math.PI);
  const pitch = useRef(0);
  const targetY = useRef(options.floorY + EYE_HEIGHT);
  const bobPhase = useRef(0);
  const frame = useRef(0);
  const placed = useRef(false);
  const lastFloor = useRef(options.floorY);

  // Pre-allocated scratch so the render loop does not allocate.
  const euler = useMemo(() => new Euler(0, 0, 0, 'YXZ'), []);
  const forward = useMemo(() => new Vector3(), []);
  const right = useMemo(() => new Vector3(), []);
  const wish = useMemo(() => new Vector3(), []);
  const next = useMemo(() => new Vector3(), []);
  const target = useMemo(() => new Vector3(), []);

  const interaction = useInteraction();
  const picker = useMemo(() => new CenterPicker(interaction), [interaction]);
  const focusedRef = useRef<InteractionTarget | null>(null);
  useEffect(() => {
    focusedRef.current = interaction.focused;
  });

  /* ------------------------- pointer lock ------------------------- */

  const requestLock = useCallback(() => {
    if (!optionsRef.current.enabled) return;
    void gl.domElement.requestPointerLock();
  }, [gl]);

  useEffect(() => {
    const canvas = gl.domElement;
    const onChange = () => {
      const isLocked = document.pointerLockElement === canvas;
      setLocked(isLocked);
      if (!isLocked) keys.current = { ...NO_MOVEMENT };
      optionsRef.current.onLockChange?.(isLocked);
    };
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, [gl]);

  /* --------------------------- keyboard --------------------------- */

  useEffect(() => {
    const isTyping = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    };

    const down = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      const slot = KEY_MAP[event.code];
      if (slot) {
        keys.current[slot] = true;
        event.preventDefault();
        return;
      }
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
        keys.current.sprint = true;
        return;
      }
      if (event.code === 'KeyE' && document.pointerLockElement) {
        event.preventDefault();
        const focused = focusedRef.current;
        if (focused) focused.onInteract();
        else optionsRef.current.onInteractEmpty?.();
      }
    };

    const up = (event: KeyboardEvent) => {
      const slot = KEY_MAP[event.code];
      if (slot) keys.current[slot] = false;
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') keys.current.sprint = false;
    };

    const blur = () => {
      keys.current = { ...NO_MOVEMENT };
    };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  /* ----------------------------- mouse ----------------------------- */

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) return;
      yaw.current -= event.movementX * LOOK_SENSITIVITY;
      pitch.current = MathUtils.clamp(pitch.current - event.movementY * LOOK_SENSITIVITY, -1.35, 1.35);
    };
    document.addEventListener('mousemove', onMouseMove);
    return () => document.removeEventListener('mousemove', onMouseMove);
  }, [gl]);

  const teleport = useCallback((x: number, z: number) => {
    position.current.set(x, targetY.current, z);
    velocity.current.set(0, 0, 0);
  }, []);

  /* --------------------------- level entry -------------------------- */

  useEffect(() => {
    if (placed.current) return;
    placed.current = true;
    enterLevel(options, yaw);
    camera.position.copy(position.current);
  }, [camera, options]);

  useEffect(() => {
    if (options.floorY === lastFloor.current) return;
    lastFloor.current = options.floorY;
    enterLevel(options, yaw);
  }, [options]);

  /* ---------------------------- per-frame ---------------------------- */

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const opt = optionsRef.current;
    const engaged = opt.enabled && document.pointerLockElement === gl.domElement;
    targetY.current = opt.floorY + EYE_HEIGHT;

    if (engaged) {
      const move = keys.current;
      const speed = move.sprint ? SPRINT_SPEED : WALK_SPEED;

      euler.set(pitch.current, yaw.current, 0);
      forward.set(0, 0, -1).applyEuler(euler);
      right.set(1, 0, 0).applyEuler(euler);
      forward.y = 0;
      forward.normalize();
      right.y = 0;
      right.normalize();

      wish.set(0, 0, 0);
      if (move.forward) wish.add(forward);
      if (move.back) wish.sub(forward);
      if (move.right) wish.add(right);
      if (move.left) wish.sub(right);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

      velocity.current.lerp(wish, 1 - Math.exp(-14 * dt));
    } else {
      velocity.current.multiplyScalar(Math.exp(-10 * dt));
    }

    next.copy(position.current).addScaledVector(velocity.current, dt);
    resolve(next, position.current, opt);
    position.current.copy(next);

    const speed = velocity.current.length();
    target.set(position.current.x, targetY.current, position.current.z);
    if (engaged && speed > 0.25) {
      bobPhase.current += dt * (5.5 + speed * 0.9);
      target.y += Math.sin(bobPhase.current) * 0.045 * Math.min(speed / WALK_SPEED, 1.6);
    }
    camera.position.lerp(target, 1 - Math.exp(-9 * dt));
    camera.rotation.set(pitch.current, yaw.current, 0, 'YXZ');

    frame.current += 1;
    if (opt.enabled && frame.current % PICK_EVERY_N_FRAMES === 0) picker.update(camera);
  });

  return { locked, requestLock, teleport };

  function enterLevel(next: FirstPersonOptions, yawRef: { current: number }): void {
    position.current.set(next.spawn[0], next.floorY + EYE_HEIGHT, next.spawn[1]);
    velocity.current.set(0, 0, 0);
    bobPhase.current = 0;
    yawRef.current = next.spawnYaw;
  }
}

/** Clamp to the walkable regions, then push out of any solid circle. */
function resolve(
  next: Vector3,
  prev: Vector3,
  options: FirstPersonOptions,
): void {
  clampToRegions(next.x, next.z, prev.x, prev.z, options.regions, PLAYER_RADIUS, next);

  for (const obstacle of options.obstacles.current) {
    const dx = next.x - obstacle.x;
    const dz = next.z - obstacle.z;
    const min = obstacle.radius + PLAYER_RADIUS;
    const distSq = dx * dx + dz * dz;
    if (distSq >= min * min || distSq < 1e-6) continue;
    const dist = Math.sqrt(distSq);
    next.x = obstacle.x + (dx / dist) * min;
    next.z = obstacle.z + (dz / dist) * min;
  }
}
