/**
 * "E to interact" plumbing for the 3D world.
 *
 * Interactables register themselves on mount; wall meshes register as occluders.
 * The first-person controller raycasts from the centre of the screen every few
 * frames, and the first thing the ray hits decides the focus: if it is an
 * interactable, that becomes the HUD prompt; if it is a wall, nothing is
 * focused, so you cannot open a board through a wall.
 *
 * Deliberately independent of the post-processing stack and of any third-party
 * picking library, so it stays easy to reason about.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Raycaster, Vector2, type Camera, type Group, type Object3D } from 'three';

export interface InteractionTarget {
  id: string;
  label: string;
  /** Small extra hint rendered next to the label, e.g. "12 potion orders". */
  detail?: string;
  object: Object3D;
  onInteract: () => void;
  /** How far the player may stand away, in world units. */
  range: number;
}

export interface InteractionApi {
  register: (target: InteractionTarget) => () => void;
  registerOccluder: (object: Object3D) => () => void;
  targets: React.RefObject<Map<string, InteractionTarget>>;
  occluders: React.RefObject<Set<Object3D>>;
  setFocus: (target: InteractionTarget | null, distance: number | null) => void;
  /** The interactable currently under the crosshair, if any. */
  focused: InteractionTarget | null;
  distance: number | null;
}

const InteractionContext = createContext<InteractionApi | null>(null);

let nextId = 0;

export interface FocusReport {
  label: string;
  detail?: string;
  distance: number | null;
}

export function InteractionProvider({
  children,
  onFocusChange,
}: {
  children: ReactNode;
  /** Reports the focused target to the HUD, which lives outside the Canvas. */
  onFocusChange?: (focus: FocusReport | null) => void;
}) {
  const targets = useRef(new Map<string, InteractionTarget>());
  const occluders = useRef(new Set<Object3D>());
  const [focused, setFocused] = useState<InteractionTarget | null>(null);
  const [distance, setDistance] = useState<number | null>(null);
  const report = useRef(onFocusChange);
  report.current = onFocusChange;

  const register = useCallback((target: InteractionTarget) => {
    targets.current.set(target.id, target);
    return () => {
      targets.current.delete(target.id);
    };
  }, []);

  const registerOccluder = useCallback((object: Object3D) => {
    occluders.current.add(object);
    return () => {
      occluders.current.delete(object);
    };
  }, []);

  const setFocus = useCallback((target: InteractionTarget | null, dist: number | null) => {
    setFocused((current) => {
      // Skip the re-render when the same thing stays focused.
      if (current?.id === target?.id && current?.label === target?.label) return current;
      return target;
    });
    setDistance((current) => (current === dist ? current : dist));
    report.current?.(
      target ? { label: target.label, detail: target.detail, distance: dist } : null,
    );
  }, []);

  const api = useMemo<InteractionApi>(
    () => ({ register, registerOccluder, targets, occluders, setFocus, focused, distance }),
    [register, registerOccluder, setFocus, focused, distance],
  );

  return <InteractionContext.Provider value={api}>{children}</InteractionContext.Provider>;
}

export function useInteraction(): InteractionApi {
  const ctx = useContext(InteractionContext);
  if (!ctx) throw new Error('useInteraction must be used inside <InteractionProvider>');
  return ctx;
}

/**
 * Wraps children in a group that becomes interactable while mounted.
 *
 * `label`, `detail` and `onInteract` are read through a ref so that a wizard's
 * live counter does not re-register it every frame.
 */
export function Interactable({
  label,
  detail,
  onInteract,
  range = 4.2,
  children,
}: {
  label: string;
  detail?: string;
  onInteract: () => void;
  range?: number;
  children: ReactNode;
}) {
  const { register } = useInteraction();
  const ref = useRef<Group>(null);
  const live = useRef({ label, detail, onInteract });
  live.current = { label, detail, onInteract };

  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    const id = `interactable-${nextId++}`;
    return register({
      id,
      label,
      detail,
      object: group,
      range,
      onInteract: () => live.current.onInteract(),
    });
  }, [register, range, label, detail]);

  return (
    <group ref={ref} dispose={null}>
      {children}
    </group>
  );
}

/**
 * Marks its children as blocking line of sight for interaction raycasts.
 * Room walls use this so a board cannot be opened from the next room.
 */
export function Occluder({ children }: { children: ReactNode }) {
  const { registerOccluder } = useInteraction();
  const ref = useRef<Group>(null);
  useEffect(() => {
    const group = ref.current;
    if (!group) return;
    return registerOccluder(group);
  }, [registerOccluder]);
  return (
    <group ref={ref} dispose={null}>
      {children}
    </group>
  );
}

const MAX_REACH = 7;

/**
 * Centre-of-screen picker, driven from `useFrame`. Writes to React state only
 * when the focused target changes.
 */
export class CenterPicker {
  private raycaster = new Raycaster();
  private pointer = new Vector2(0, 0);
  private focusId: string | null = null;
  private scratch: Object3D[] = [];

  constructor(private api: InteractionApi) {}

  update(camera: Camera): void {
    this.raycaster.setFromCamera(this.pointer, camera);
    this.raycaster.far = MAX_REACH;

    const owner = new Map<Object3D, InteractionTarget>();
    const roots = this.scratch;
    roots.length = 0;

    for (const occluder of this.api.occluders.current) {
      if (occluder.parent) roots.push(occluder);
    }
    for (const target of this.api.targets.current.values()) {
      if (target.object.parent) {
        roots.push(target.object);
        owner.set(target.object, target);
      }
    }
    if (roots.length === 0) return;

    const hits = this.raycaster.intersectObjects(roots, true);
    let best: InteractionTarget | null = null;
    let bestDistance: number | null = null;

    for (const hit of hits) {
      const target = findOwner(hit.object, owner);
      if (!target) break; // a wall got in the way
      if (hit.distance > target.range) break;
      best = target;
      bestDistance = Number(hit.distance.toFixed(2));
      break;
    }

    const nextId = best?.id ?? null;
    if (nextId !== this.focusId) {
      this.focusId = nextId;
      this.api.setFocus(best, bestDistance);
    } else if (best && bestDistance !== null) {
      this.api.setFocus(best, bestDistance);
    }
  }
}

function findOwner(object: Object3D | null, owner: Map<Object3D, InteractionTarget>): InteractionTarget | null {
  let node: Object3D | null = object;
  while (node) {
    const found = owner.get(node);
    if (found) return found;
    node = node.parent;
  }
  return null;
}
