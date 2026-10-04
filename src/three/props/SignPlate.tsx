/**
 * A carved wooden plaque with runic lettering.
 *
 * Used for the cauldron's label, floor nameplates outside each repository, desk
 * nameplates in front of each wizard, and the office's door sign. The text is
 * drawn to a canvas so long repo names stay legible without a font loader.
 */

import { useMemo } from 'react';

import { fitText, roundRect, useCanvasTexture } from '../canvasTexture';
import { Flat, GEO, Toon } from '../materials';
import { PALETTE } from '../theme';

export interface SignPlateProps {
  text: string;
  sub?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  /** World width of the plaque. */
  width?: number;
  color?: string;
  accent?: string;
  /** Draw the sign light-up (emissive glow) or plain parchment. */
  glow?: boolean;
}

export function SignPlate({
  text,
  sub,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  width = 2.4,
  color = PALETTE.woodDark,
  accent = PALETTE.gold,
  glow = false,
}: SignPlateProps) {
  const height = width * 0.3;
  const hasSub = Boolean(sub);

  const texture = useCanvasTexture({
    width: 1024,
    height: 256,
    transparent: true,
    deps: [text, sub, accent],
    draw: (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const mainSize = fitText(ctx, text, w - 120, hasSub ? 74 : 92, (px) =>
        `700 ${px}px Georgia, "Times New Roman", serif`,
      );
      ctx.font = `700 ${mainSize}px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = glow ? '#fff6dd' : PALETTE.parchment;
      ctx.shadowColor = glow ? accent : 'transparent';
      ctx.shadowBlur = glow ? 22 : 0;
      ctx.fillText(text, w / 2, hasSub ? h * 0.38 : h / 2, w - 110);
      ctx.shadowBlur = 0;

      if (sub) {
        ctx.font = `${Math.round(mainSize * 0.42)}px "Trebuchet MS", system-ui, sans-serif`;
        ctx.fillStyle = accent;
        ctx.fillText(sub, w / 2, h * 0.68, w - 120);
      }

      // Corner flourishes
      ctx.strokeStyle = `${accent}66`;
      ctx.lineWidth = 3;
      roundRect(ctx, 26, h * 0.5 - 44, w - 52, 88, 12);
      ctx.stroke();
    },
  });

  const frame = useMemo(() => width * 0.06, [width]);

  return (
    <group position={position} rotation={rotation} dispose={null}>
      <Toon
        geometry={GEO.box}
        color={color}
        scale={[width + frame * 2, height + frame * 2, 0.09]}
        outline={0.035}
        castShadow
      />
      <Toon
        geometry={GEO.box}
        color={accent}
        emissive={glow ? accent : '#000000'}
        emissiveIntensity={glow ? 0.7 : 0}
        rim={0.6}
        position={[0, 0, 0.04]}
        scale={[width + frame, height + frame, 0.08]}
        outline={0.015}
      />
      <Flat
        geometry={GEO.plane}
        map={texture}
        position={[0, 0, 0.1]}
        scale={[width, height, 1]}
        depthWrite
        renderOrder={2}
      />
    </group>
  );
}
