/**
 * Castle layout.
 *
 * Every room, desk and stairwell in the castle is positioned from this file so
 * the 3D world, the first-person collision bounds and the HUD floor list can
 * never drift apart.
 *
 * Vertical: level 0 is the ground floor (Great Hall + Head Mistress' office).
 * Level N is the floor of the repo with `floorNumber === N`.
 */

import { Vector3 } from 'three';

export const LEVEL_HEIGHT = 7.4;
export const ROOM_HALF = 14;
export const WALL_HEIGHT = 7.0;
export const CEILING_Y = 6.8;
export const WALL_THICKNESS = 0.7;

/** Where the player may walk on level 0: hall, the doorway, then the office. */
export const GROUND_REGIONS = [
  { minX: -13.3, maxX: 13.3, minZ: -13.3, maxZ: 13.3 },
  { minX: 13.3, maxX: 14.6, minZ: -2.2, maxZ: 2.2 },
  { minX: 14.6, maxX: 29.3, minZ: -13.3, maxZ: 13.3 },
] as const;

/** Every repo floor is the same square room. */
export const FLOOR_REGION = { minX: -13.3, maxX: 13.3, minZ: -13.3, maxZ: 13.3 } as const;

export const STAIR = {
  x: 10.4,
  z: 10.4,
  radius: 3.1,
  /** Where a wizard appears when they warp onto a floor. */
  spawnX: 5.6,
  spawnZ: 10.4,
} as const;

export const CAULDRON = { x: -9.4, z: 6.2 } as const;
export const SHELF = { x: -12.5, z: -4.5, rotationY: Math.PI / 2 } as const;
export const BOARD = { z: -13.2, y: 3.5, width: 8.6, height: 5 } as const;

/**
 * Desk slots, two rows of four. Slot index is `agent.desk` from the server, so
 * a wizard keeps its seat for the life of the agent.
 */
export const DESK_SLOTS: ReadonlyArray<{ x: number; z: number; rotationY: number }> = [
  { x: -8.6, z: -6.4, rotationY: 0 },
  { x: -3.2, z: -6.4, rotationY: 0 },
  { x: 2.2, z: -6.4, rotationY: 0 },
  { x: 7.6, z: -6.4, rotationY: 0 },
  { x: -8.6, z: -1.4, rotationY: 0 },
  { x: -3.2, z: -1.4, rotationY: 0 },
  { x: 2.2, z: -1.4, rotationY: 0 },
  { x: 7.6, z: -1.4, rotationY: 0 },
];

export const DESK_RADIUS = 1.15;

/** Where the player stands when a level is entered, and where they look. */
export function spawnForLevel(level: number): { position: [number, number]; yaw: number } {
  if (level === 0) {
    return { position: [0, 11.4], yaw: 0 };
  }
  return { position: [STAIR.spawnX, STAIR.spawnZ], yaw: yawToward(STAIR.spawnX, STAIR.spawnZ, -2, -4) };
}

/**
 * Yaw such that the camera's forward vector points from (fromX, fromZ) at
 * (toX, toZ). The controller's forward is (0,0,-1) rotated by yaw around Y.
 */
export function yawToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const length = Math.hypot(dx, dz) || 1;
  return Math.atan2(-dx / length, -dz / length);
}

export function levelY(level: number): number {
  return level * LEVEL_HEIGHT;
}

export function clampToRegions(
  x: number,
  z: number,
  prevX: number,
  prevZ: number,
  regions: ReadonlyArray<{ minX: number; maxX: number; minZ: number; maxZ: number }>,
  radius: number,
  out: Vector3,
): void {
  const inside = (r: (typeof regions)[number]) =>
    x >= r.minX + radius && x <= r.maxX - radius && z >= r.minZ + radius && z <= r.maxZ - radius;

  for (const region of regions) {
    if (inside(region)) {
      out.set(x, 0, z);
      return;
    }
  }

  // Blocked: clamp into whichever region the player was already standing in.
  let best = regions[0]!;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const region of regions) {
    const cx = Math.max(region.minX, Math.min(prevX, region.maxX));
    const cz = Math.max(region.minZ, Math.min(prevZ, region.maxZ));
    const dist = (cx - prevX) ** 2 + (cz - prevZ) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = region;
    }
  }
  out.set(
    Math.max(best.minX + radius, Math.min(x, best.maxX - radius)),
    0,
    Math.max(best.minZ + radius, Math.min(z, best.maxZ - radius)),
  );
}
