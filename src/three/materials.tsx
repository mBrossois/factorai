/**
 * Shared unit geometries and the cel-shaded primitives every prop is built from.
 *
 * Geometry singletons are intentional: the castle re-uses a couple of dozen
 * buffers across hundreds of meshes, which keeps GPU memory and draw-call setup
 * low. `Toon` therefore sets `dispose={null}` -- these buffers must outlive any
 * individual component.
 */

import { useMemo, type ReactNode } from 'react';
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  FrontSide,
  IcosahedronGeometry,
  LatheGeometry,
  MeshBasicMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  type Material,
} from 'three';

import { createFlatMaterial, createOutlineMaterial, createToonMaterial, OUTLINE_COLOR } from './shaders/toon';

export const GEO = {
  box: new BoxGeometry(1, 1, 1),
  sphere: new SphereGeometry(0.5, 20, 14),
  lowSphere: new SphereGeometry(0.5, 10, 7),
  cylinder: new CylinderGeometry(0.5, 0.5, 1, 20),
  openCylinder: new CylinderGeometry(0.5, 0.5, 1, 20, 1, true),
  cone: new ConeGeometry(0.5, 1, 20),
  capsule: new CapsuleGeometry(0.25, 0.5, 6, 12),
  plane: new PlaneGeometry(1, 1),
  circle: new CircleGeometry(0.5, 28),
  ring: new RingGeometry(0.36, 0.5, 32),
  torus: new TorusGeometry(0.4, 0.1, 10, 26),
  ico: new IcosahedronGeometry(0.5, 0),
  octa: new OctahedronGeometry(0.5, 0),
} as const;

/** Tall tapered wizard hat. */
export const HAT_CONE = new ConeGeometry(0.42, 1.1, 18);

/** Robe silhouette: a lathed profile so the hem flares like fabric. */
export const ROBE = new LatheGeometry(
  [
    new Vector2(0.0, 0.0),
    new Vector2(0.48, 0.02),
    new Vector2(0.46, 0.2),
    new Vector2(0.35, 0.58),
    new Vector2(0.25, 0.98),
    new Vector2(0.18, 1.26),
    new Vector2(0.0, 1.32),
  ],
  20,
);

/** A potion bottle: round body with a narrow neck. */
export const BOTTLE = new LatheGeometry(
  [
    new Vector2(0.0, 0.0),
    new Vector2(0.26, 0.02),
    new Vector2(0.3, 0.16),
    new Vector2(0.26, 0.42),
    new Vector2(0.11, 0.56),
    new Vector2(0.09, 0.78),
    new Vector2(0.0, 0.8),
  ],
  14,
);

export type ToonProps = {
  geometry?: BufferGeometry;
  color: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  /** Gradient bands: 2 = hard cel, 3 = classic, 4 = soft. */
  steps?: 2 | 3 | 4;
  emissive?: string;
  emissiveIntensity?: number;
  rim?: number;
  rimColor?: string;
  /** Inverted-hull thickness; 0 disables the outline. */
  outline?: number;
  outlineColor?: string;
  castShadow?: boolean;
  receiveShadow?: boolean;
  visible?: boolean;
  renderOrder?: number;
  onClick?: (event: { stopPropagation: () => void }) => void;
  onPointerOver?: (event: { stopPropagation: () => void }) => void;
  onPointerOut?: (event: { stopPropagation: () => void }) => void;
  children?: ReactNode;
};

/**
 * A cel-shaded mesh with an inverted-hull outline.
 *
 * The outline mesh renders first with `BackSide`, so the inflated back faces sit
 * behind the surface and only the silhouette fringe survives.
 */
export function Toon({
  geometry = GEO.box,
  color,
  position,
  rotation,
  scale = 1,
  steps = 3,
  emissive,
  emissiveIntensity,
  rim = 0.3,
  rimColor,
  outline = 0.035,
  outlineColor = OUTLINE_COLOR,
  castShadow = false,
  receiveShadow = false,
  visible = true,
  renderOrder,
  onClick,
  onPointerOver,
  onPointerOut,
  children,
}: ToonProps) {
  const material = useMemo<Material>(
    () => createToonMaterial({ color, steps, rim, rimColor, emissive, emissiveIntensity }),
    [color, steps, rim, rimColor, emissive, emissiveIntensity],
  );

  const outlineMaterial = useMemo(
    () => (outline > 0 ? createOutlineMaterial({ color: outlineColor, thickness: outline }) : null),
    [outline, outlineColor],
  );

  return (
    <group
      position={position}
      rotation={rotation}
      scale={scale}
      visible={visible}
      dispose={null}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {outlineMaterial && <mesh geometry={geometry} material={outlineMaterial} renderOrder={renderOrder} />}
      <mesh
        geometry={geometry}
        material={material}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
        renderOrder={renderOrder}
      />
      {children}
    </group>
  );
}

/** A flat unlit panel -- glows, holograms, light shafts, canvas textures. */
export function Flat({
  geometry = GEO.plane,
  color,
  opacity = 1,
  transparent = true,
  position,
  rotation,
  scale,
  side = FrontSide,
  depthWrite = false,
  additive = false,
  map,
  renderOrder = 1,
  children,
}: {
  geometry?: BufferGeometry;
  color?: string;
  opacity?: number;
  transparent?: boolean;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  side?: 0 | 1 | 2;
  depthWrite?: boolean;
  additive?: boolean;
  map?: MeshBasicMaterial['map'];
  renderOrder?: number;
  children?: ReactNode;
}) {
  const material = useMemo(() => {
    const base = createFlatMaterial(color ?? '#ffffff', { transparent, opacity, depthWrite, side });
    base.toneMapped = false;
    if (additive) base.blending = AdditiveBlending;
    if (map) base.map = map;
    return base;
  }, [color, transparent, opacity, depthWrite, side, additive, map]);

  return (
    <group position={position} rotation={rotation} scale={scale} dispose={null} renderOrder={renderOrder}>
      <mesh geometry={geometry} material={material} />
      {children}
    </group>
  );
}

export const SIDES = { FrontSide, DoubleSide } as const;
export const BLEND = { AdditiveBlending } as const;
export { Color };
