/**
 * The magical kanban board: potion orders, three columns, drawn to a canvas.
 *
 * Issues arrive as `Issue` records; the board groups them into
 * Todo / In Progress / Done and paints each one as a pinned parchment card.
 * Re-drawing only happens when the issue set actually changes, so a busy swarm
 * does not thrash the texture.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';

import type { Issue, IssueStatus } from '../../core/types';
import { fitText, roundRect, useCanvasTexture, wrapText } from '../canvasTexture';
import { Flat, GEO, Toon } from '../materials';
import { PALETTE } from '../theme';
import { Interactable } from '../Interaction';

const COLUMNS: Array<{ status: IssueStatus; title: string; tint: string }> = [
  { status: 'todo', title: 'TO BREW', tint: '#8f7ad6' },
  { status: 'in-progress', title: 'AT THE CAULDRON', tint: '#f5c451' },
  { status: 'done', title: 'BOTTLED', tint: '#2fbf71' },
];

const PRIORITY_MARK: Record<Issue['priority'], string> = {
  high: '#e0405f',
  medium: '#f5c451',
  low: '#6a7bd6',
};

export interface KanbanBoardProps {
  title: string;
  subtitle?: string;
  issues: Issue[];
  /** Rendered width in world units. */
  width?: number;
  height?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
  onRead?: () => void;
  interactive?: boolean;
  /** Slight per-instance offset so stacked boards do not look cloned. */
  seed?: number;
}

export function KanbanBoard({
  title,
  subtitle,
  issues,
  width = 9,
  height = 5.2,
  position = [0, 3, 0],
  rotation = [0, 0, 0],
  onRead,
  interactive = true,
  seed = 0,
}: KanbanBoardProps) {
  const grouped = useMemo(() => {
    const byStatus: Record<IssueStatus, Issue[]> = { todo: [], 'in-progress': [], done: [] };
    for (const issue of issues) byStatus[issue.status].push(issue);
    for (const list of Object.values(byStatus)) {
      list.sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[a.priority] - rank[b.priority] || a.createdAt - b.createdAt;
      });
    }
    return byStatus;
  }, [issues]);

  const signature = useMemo(
    () => `${title}|${seed}|` + issues.map((i) => `${i.id}:${i.status}:${i.priority}:${i.assigneeId ?? '-'}`).join(','),
    [title, seed, issues],
  );

  const texture = useCanvasTexture({
    width: 1400,
    height: 810,
    deps: [signature],
    draw: (ctx, w, h) => drawBoard(ctx, w, h, title, subtitle ?? '', grouped, seed),
  });

  const glow = useMemo(() => 0.35 + 0.12 * Math.sin(seed), [seed]);
  const boardRef = useRef<Group>(null);

  useFrame((state) => {
    const group = boardRef.current;
    if (!group) return;
    group.position.setY(position[1] + Math.sin(state.clock.elapsedTime * 0.6 + seed) * 0.03);
  });

  const board = (
    <group position={position} rotation={rotation} ref={boardRef} dispose={null}>
      {/* Frame */}
      <Toon
        geometry={GEO.box}
        color={PALETTE.goldDeep}
        scale={[width + 0.7, height + 0.7, 0.18]}
        outline={0.05}
        castShadow
      />
      <Toon
        geometry={GEO.box}
        color={PALETTE.gold}
        position={[0, 0, 0.1]}
        scale={[width + 0.2, height + 0.2, 0.12]}
        outline={0.02}
      />
      {/* Parchment surface */}
      <Flat
        geometry={GEO.plane}
        map={texture}
        position={[0, 0, 0.2]}
        scale={[width, height, 1]}
        depthWrite
        renderOrder={2}
      />
      {/* Enchanted sheen */}
      <Flat
        geometry={GEO.plane}
        color="#8ad7ff"
        opacity={0.1 + glow * 0.05}
        additive
        position={[0, 0, 0.22]}
        scale={[width * 0.98, height * 0.98, 1]}
        renderOrder={3}
      />
      {/* Corner runes */}
      {(
        [
          [-1, 1],
          [1, 1],
          [-1, -1],
          [1, -1],
        ] as Array<[number, number]>
      ).map(([sx, sy]) => (
        <Toon
          key={`${sx}-${sy}`}
          geometry={GEO.octa}
          color={PALETTE.arcane}
          emissive={PALETTE.arcane}
          emissiveIntensity={1.6}
          rim={0.9}
          outline={0.02}
          position={[sx * (width / 2 - 0.05), sy * (height / 2 - 0.05), 0.28]}
          scale={0.34}
        />
      ))}
    </group>
  );

  if (!interactive || !onRead) return board;

  return (
    <Interactable label={`Read the kanban: ${title}`} detail={`${issues.length} potion orders`} onInteract={onRead}>
      {board}
    </Interactable>
  );
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  subtitle: string,
  grouped: Record<IssueStatus, Issue[]>,
  seed: number,
): void {
  // Parchment backdrop with a woven grain.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1030');
  grad.addColorStop(1, '#0d0720');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = PALETTE.gold;
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y + (seed % 8));
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  // Header
  ctx.fillStyle = PALETTE.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const titleSize = fitText(ctx, title.toUpperCase(), w * 0.62, 62, (px) => `700 ${px}px Georgia, serif`);
  ctx.font = `700 ${titleSize}px Georgia, serif`;
  ctx.fillText(title.toUpperCase(), 54, 92);

  ctx.fillStyle = 'rgba(240,226,189,0.55)';
  ctx.font = '26px "Trebuchet MS", system-ui, sans-serif';
  ctx.fillText(subtitle, 56, 128);

  // Divider
  ctx.strokeStyle = 'rgba(245,196,81,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(50, 152);
  ctx.lineTo(w - 50, 152);
  ctx.stroke();

  const marginX = 50;
  const gap = 26;
  const columnWidth = (w - marginX * 2 - gap * 2) / 3;
  const top = 178;
  const bottom = h - 44;

  COLUMNS.forEach((column, index) => {
    const x = marginX + index * (columnWidth + gap);

    // Column plate
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    roundRect(ctx, x, top, columnWidth, bottom - top, 16);
    ctx.fill();
    ctx.strokeStyle = `${column.tint}55`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Column header
    ctx.fillStyle = column.tint;
    ctx.font = '700 24px "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(column.title, x + 20, top + 42);
    ctx.textAlign = 'right';
    ctx.fillText(String(grouped[column.status].length), x + columnWidth - 20, top + 42);
    ctx.textAlign = 'left';

    // Cards
    const cards = grouped[column.status].slice(0, 6);
    let y = top + 66;
    for (const issue of cards) {
      const cardH = 128;
      if (y + cardH > bottom) break;

      ctx.fillStyle = 'rgba(240,226,189,0.94)';
      roundRect(ctx, x + 14, y, columnWidth - 28, cardH, 12);
      ctx.fill();

      // Priority spine
      ctx.fillStyle = PRIORITY_MARK[issue.priority];
      roundRect(ctx, x + 14, y, 8, cardH, 4);
      ctx.fill();

      // Pin
      ctx.fillStyle = issue.assigneeId ? PALETTE.emerald : '#9a90bb';
      ctx.beginPath();
      ctx.arc(x + columnWidth - 34, y + 22, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = PALETTE.ink;
      ctx.font = '700 22px "Trebuchet MS", system-ui, sans-serif';
      const heading = issue.number ? `#${issue.number} ${issue.title}` : issue.title;
      const headingSize = fitText(ctx, heading, columnWidth - 74, 22);
      ctx.font = `700 ${headingSize}px "Trebuchet MS", system-ui, sans-serif`;
      ctx.fillText(heading, x + 34, y + 36, columnWidth - 78);

      ctx.fillStyle = 'rgba(42,30,63,0.72)';
      ctx.font = '17px "Trebuchet MS", system-ui, sans-serif';
      wrapText(ctx, issue.body || 'No description written yet.', x + 34, y + 66, columnWidth - 74, 24, 3);

      ctx.fillStyle = issue.priority === 'high' ? '#a3324a' : 'rgba(42,30,63,0.55)';
      ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(issue.priority.toUpperCase(), x + 34, y + cardH - 12);

      y += cardH + 14;
    }

    if (grouped[column.status].length > cards.length) {
      ctx.fillStyle = 'rgba(240,226,189,0.45)';
      ctx.font = 'italic 18px Georgia, serif';
      ctx.fillText(`+${grouped[column.status].length - cards.length} more scrolls…`, x + 20, bottom - 12);
    }
    if (cards.length === 0) {
      ctx.fillStyle = 'rgba(240,226,189,0.3)';
      ctx.font = 'italic 20px Georgia, serif';
      ctx.fillText('nothing here yet', x + 20, top + 96);
    }
  });
}
