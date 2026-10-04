/**
 * Canvas-backed textures.
 *
 * Readable text inside the 3D world (kanban cards, spell book runes, the office
 * mirror, floor plaques) is drawn to a 2D canvas and uploaded as a texture.
 * One shared helper keeps the sizing, colour space and disposal handling in a
 * single place.
 */

import { useEffect, useMemo, useRef } from 'react';
import { CanvasTexture, LinearFilter, SRGBColorSpace, type Texture } from 'three';

export interface CanvasTextureSpec {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  /** Any change here re-draws the texture. */
  deps: readonly unknown[];
  /** Transparent background instead of opaque parchment. */
  transparent?: boolean;
}

/**
 * Creates a `CanvasTexture` that is re-drawn whenever `deps` change. The
 * texture is disposed on unmount.
 */
export function useCanvasTexture({
  width,
  height,
  draw,
  deps,
  transparent = false,
}: CanvasTextureSpec): Texture {
  const drawRef = useRef(draw);
  drawRef.current = draw;

  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.minFilter = LinearFilter;
    map.magFilter = LinearFilter;
    map.anisotropy = 4;
    map.needsUpdate = true;
    return map;
  }, [width, height]);

  useEffect(() => {
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (!transparent) {
      ctx.fillStyle = '#0b0618';
      ctx.fillRect(0, 0, width, height);
    }
    drawRef.current(ctx, width, height);
    texture.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texture, width, height, transparent, ...deps]);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}

/* ------------------------------------------------------------------ *
 * Drawing helpers shared by the canvas panels
 * ------------------------------------------------------------------ */

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  font = (px: number) => `${px}px "Trebuchet MS", system-ui, sans-serif`,
): number {
  let px = startPx;
  ctx.font = font(px);
  while (ctx.measureText(text).width > maxWidth && px > 8) {
    px -= 1;
    ctx.font = font(px);
  }
  return px;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): number {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  let drawn = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + drawn * lineHeight);
      drawn += 1;
      line = word;
      if (drawn >= maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (drawn < maxLines && line) {
    ctx.fillText(line, x, y + drawn * lineHeight);
    drawn += 1;
  }
  while (drawn < maxLines) {
    ctx.fillText('…', x, y + drawn * lineHeight);
    drawn += 1;
    if (!text) break;
  }
  return drawn;
}
