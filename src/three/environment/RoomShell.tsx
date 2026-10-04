/**
 * Shared room shell: floor, four walls, ceiling, beams and skirting.
 *
 * Walls are registered as interaction occluders, so you cannot read a kanban
 * board or a spell book through a wall.
 */

import { Occluder } from '../Interaction';
import { Flat, GEO, Toon } from '../materials';
import { CEILING_Y, ROOM_HALF, WALL_HEIGHT, WALL_THICKNESS } from '../layout';

export interface RoomShellProps {
  wallColor: string;
  floorColor: string;
  accentColor: string;
  /** Half-extent of the room; the ground hall uses the default. */
  halfX?: number;
  halfZ?: number;
  /** Skip the ceiling (used where a stairwell pierces it). */
  ceiling?: boolean;
  /** Punched openings in the east wall, as z ranges. */
  eastDoorways?: Array<[number, number]>;
  /** Punched openings in the north wall, as x ranges (the stairwell shaft). */
  northOpenings?: Array<[number, number]>;
  children?: React.ReactNode;
  seed?: number;
}

export function RoomShell({
  wallColor,
  floorColor,
  accentColor,
  halfX = ROOM_HALF,
  halfZ = ROOM_HALF,
  ceiling = true,
  eastDoorways = [],
  northOpenings = [],
  children,
  seed = 0,
}: RoomShellProps) {
  const SKIRTING: Skirting[] = [
    { key: 'n', position: [0, 0.16, -halfZ - 0.02], scale: [halfX * 2, 0.32, 0.16] },
    { key: 's', position: [0, 0.16, halfZ + 0.02], scale: [halfX * 2, 0.32, 0.16] },
    { key: 'w', position: [-halfX - 0.02, 0.16, 0], scale: [0.16, 0.32, halfZ * 2] },
    { key: 'e', position: [halfX + 0.02, 0.16, 0], scale: [0.16, 0.32, halfZ * 2] },
  ];

  return (
    <group dispose={null}>
      {/* Floor slab */}
      <Toon
        geometry={GEO.box}
        color={floorColor}
        position={[0, -0.15, 0]}
        scale={[halfX * 2, 0.3, halfZ * 2]}
        outline={0.06}
        receiveShadow
      />
      {/* Inlaid rune circle in the middle of the floor */}
      <Flat
        geometry={GEO.ring}
        color={accentColor}
        opacity={0.22}
        additive
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.012, 0]}
        scale={[11, 11, 1]}
        renderOrder={0}
      />
      <Flat
        geometry={GEO.ring}
        color={accentColor}
        opacity={0.14}
        additive
        rotation={[-Math.PI / 2, 0, seed * 0.7]}
        position={[0, 0.014, 0]}
        scale={[16, 16, 1]}
        renderOrder={0}
      />

      <Occluder>
        {/* North wall (z = -halfZ), optionally with the stairwell shaft opened. */}
        {segments(-halfX, halfX, northOpenings).map(([a, b], i) => (
          <Wall key={`n${i}`} color={wallColor} position={[(a + b) / 2, WALL_HEIGHT / 2, -halfZ - WALL_THICKNESS / 2]} scale={[b - a, WALL_HEIGHT, WALL_THICKNESS]} />
        ))}

        {/* South wall (z = +halfZ) */}
        <Wall color={wallColor} position={[0, WALL_HEIGHT / 2, halfZ + WALL_THICKNESS / 2]} scale={[halfX * 2 + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]} />

        {/* West wall (x = -halfX) */}
        <Wall color={wallColor} position={[-halfX - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0]} scale={[WALL_THICKNESS, WALL_HEIGHT, halfZ * 2]} />

        {/* East wall (x = +halfX), with doorways punched out of it */}
        {segments(-halfZ, halfZ, eastDoorways).map(([a, b], i) => (
          <Wall key={`e${i}`} color={wallColor} position={[halfX + WALL_THICKNESS / 2, WALL_HEIGHT / 2, (a + b) / 2]} scale={[WALL_THICKNESS, WALL_HEIGHT, b - a]} />
        ))}
        {/* Lintel above each doorway */}
        {eastDoorways.map(([a, b], i) => (
          <Wall
            key={`el${i}`}
            color={wallColor}
            position={[halfX + WALL_THICKNESS / 2, WALL_HEIGHT - 0.6, (a + b) / 2]}
            scale={[WALL_THICKNESS, 1.2, b - a]}
          />
        ))}
      </Occluder>

      {/* Skirting rail: the detail that makes stone read as masonry rather than a box */}
      {SKIRTING.map((s) => (
        <Toon
          key={s.key}
          geometry={GEO.box}
          color={accentColor}
          position={s.position}
          scale={s.scale}
          outline={0.02}
        />
      ))}

      {ceiling && (
        <>
          <Toon
            geometry={GEO.box}
            color="#2a2338"
            position={[0, CEILING_Y + 0.2, 0]}
            scale={[halfX * 2 + 0.4, 0.4, halfZ * 2 + 0.4]}
            outline={0.05}
          />
          {BEAM_X.map((x) => (
            <Toon key={x} geometry={GEO.box} color="#3a2f4c" position={[x, CEILING_Y - 0.22, 0]} scale={[0.5, 0.5, halfZ * 2]} outline={0.03} />
          ))}
          {BEAM_Z.map((z) => (
            <Toon key={z} geometry={GEO.box} color="#3a2f4c" position={[0, CEILING_Y - 0.45, z]} scale={[halfX * 2, 0.34, 0.4]} outline={0.03} />
          ))}
        </>
      )}

      {children}
    </group>
  );
}

function Wall({
  color,
  position,
  scale,
}: {
  color: string;
  position: [number, number, number];
  scale: [number, number, number];
}) {
  return <Toon geometry={GEO.box} color={color} position={position} scale={scale} outline={0.05} receiveShadow />;
}

const BEAM_X = [-10.5, -5.25, 0, 5.25, 10.5];
const BEAM_Z = [-10.5, -5.25, 0, 5.25, 10.5];

interface Skirting {
  key: string;
  position: [number, number, number];
  scale: [number, number, number];
}

/**
 * Split a wall span into the solid pieces between the given openings.
 * Returns `[[from, doorStart], [doorEnd, to], ...]`, dropping empty spans.
 */
export function segments(
  from: number,
  to: number,
  openings: Array<[number, number]>,
): Array<[number, number]> {
  const sorted = [...openings].sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let cursor = from;
  for (const [start, end] of sorted) {
    const lo = Math.max(from, start);
    const hi = Math.min(to, end);
    if (hi <= lo) continue;
    if (lo > cursor) out.push([cursor, lo]);
    cursor = Math.max(cursor, hi);
  }
  if (cursor < to) out.push([cursor, to]);
  return out;
}
