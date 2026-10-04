/**
 * The anime / cel-shading pipeline.
 *
 * Two pieces:
 *  - `createToonGradient` builds the N-step ramp that gives `MeshToonMaterial`
 *    its hard light terminator (the signature cel-shaded look).
 *  - `createToonMaterial` wraps it and injects a rim-light term through
 *    `onBeforeCompile`, so silhouettes catch a magical edge glow.
 *  - `createOutlineMaterial` is the inverted-hull outline pass.
 */

import {
  BackSide,
  Color,
  DataTexture,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  ShaderMaterial,
  UnsignedByteType,
  type IUniform,
} from 'three';

export const OUTLINE_COLOR = '#120a24';

const gradientCache = new Map<number, DataTexture>();

/**
 * A 1-D lookup texture with `steps` hard bands. `NearestFilter` is what makes
 * the bands hard-edged instead of smoothly interpolated.
 */
export function createToonGradient(steps = 3): DataTexture {
  const cached = gradientCache.get(steps);
  if (cached) return cached;

  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i += 1) {
    // Bias the ramp darker so the shadow side stays rich rather than muddy.
    const t = i / Math.max(1, steps - 1);
    data[i] = Math.round(28 + t * 214);
  }

  const texture = new DataTexture(data, steps, 1, RedFormat, UnsignedByteType);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  gradientCache.set(steps, texture);
  return texture;
}

export interface ToonMaterialOptions {
  color: string;
  steps?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** Rim-light strength, 0 disables the injection entirely. */
  rim?: number;
  rimColor?: string;
  transparent?: boolean;
  opacity?: number;
  side?: 0 | 1 | 2;
  map?: MeshToonMaterial['map'] | null;
}

/**
 * Cel-shaded material with a rim light. The injected chunk runs after lighting
 * and adds `rim * pow(1 - dot(N, V), p)` tinted by `rimColor`.
 */
export function createToonMaterial(options: ToonMaterialOptions): MeshToonMaterial {
  const { color, steps = 3, rim = 0.35, rimColor = '#ffd9a0' } = options;
  const material = new MeshToonMaterial({
    color: new Color(color),
    gradientMap: createToonGradient(steps),
    emissive: new Color(options.emissive ?? '#000000'),
    emissiveIntensity: options.emissiveIntensity ?? 1,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    map: options.map ?? null,
  });
  // `side: undefined` makes three warn, so only set it when it was asked for.
  if (options.side !== undefined) material.side = options.side;

  if (rim > 0) {
    const uniforms: Record<string, IUniform> = {
      uRim: { value: rim },
      uRimColor: { value: new Color(rimColor) },
    };
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uRim = uniforms.uRim!;
      shader.uniforms.uRimColor = uniforms.uRimColor!;
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uRim;
           uniform vec3 uRimColor;`,
        )
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>
           float rimFactor = 1.0 - saturate(dot(normalize(normal), normalize(vViewPosition)));
           gl_FragColor.rgb += uRimColor * pow(rimFactor, 2.5) * uRim;`,
        );
    };
    material.customProgramCacheKey = () => `toon-rim-${rim}-${rimColor}`;
  }

  return material;
}

export interface OutlineMaterialOptions {
  color?: string;
  /** World-space thickness, pushed along the surface normal. */
  thickness?: number;
}

/**
 * Inverted-hull outline.
 *
 * The plan called for a post-processing OutlinePass; this is the classic cel
 * shader technique instead (see docs/THEME.md for the rationale). Pushing along
 * the normal rather than scaling the object keeps the outline even on boxes and
 * other hard-edged geometry, where a uniform scale opens gaps at the corners.
 */
export function createOutlineMaterial(options: OutlineMaterialOptions = {}): ShaderMaterial {
  return new ShaderMaterial({
    side: BackSide,
    uniforms: {
      uColor: { value: new Color(options.color ?? OUTLINE_COLOR) },
      uThickness: { value: options.thickness ?? 0.035 },
    },
    vertexShader: /* glsl */ `
      uniform float uThickness;
      void main() {
        vec3 inflated = position + normal * uThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(inflated, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        gl_FragColor = vec4(uColor, 1.0);
      }
    `,
  });
}

/** Unlit flat colour, for glows, holograms and UI-ish planes. */
export function createFlatMaterial(
  color: string,
  options: { transparent?: boolean; opacity?: number; depthWrite?: boolean; side?: 0 | 1 | 2 } = {},
): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color: new Color(color),
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: options.depthWrite ?? true,
  });
  if (options.side !== undefined) material.side = options.side;
  return material;
}

export const GRADIENT_STEPS = { soft: 4, cel: 3, hard: 2 } as const;
