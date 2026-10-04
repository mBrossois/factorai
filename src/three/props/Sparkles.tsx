/**
 * Magic dust.
 *
 * A GPU-animated point cloud: all motion happens in the vertex shader from a
 * per-particle seed, so a few thousand sparkles cost one draw call and no CPU
 * work per frame. Used for ambient atmosphere in every room, and for the denser
 * swirl above an agent that is actively working.
 */

import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, ShaderMaterial } from 'three';

import { makeRng, seedFrom } from '../random';

const VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uSize;
  uniform float uHeight;
  uniform float uRadius;
  varying float vTwinkle;

  void main() {
    vec3 p = position;
    float rise = 0.10 + aSeed * 0.30;
    p.y = mod(p.y + uTime * rise, uHeight);
    p.x += sin(uTime * 0.45 + aSeed * 17.0) * 0.32;
    p.z += cos(uTime * 0.37 + aSeed * 11.0) * 0.32;
    // Keep the cloud inside its cylindrical volume.
    p.xz = normalize(p.xz + vec2(0.0001)) * min(length(p.xz), uRadius);

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (0.6 + aSeed) * (14.0 / max(0.001, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
    vTwinkle = 0.35 + 0.65 * sin(uTime * 2.1 + aSeed * 24.0);
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vTwinkle;

  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float falloff = smoothstep(0.5, 0.02, length(d));
    float alpha = falloff * vTwinkle * uIntensity;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export interface SparklesProps {
  count?: number;
  color?: string;
  /** Higher means denser/brighter: 0.4 ambient, 1 busy agent, 2 celebration. */
  intensity?: number;
  radius?: number;
  height?: number;
  size?: number;
  position?: [number, number, number];
  /** Adds a slow breathing modulation on top of `intensity`. */
  pulse?: boolean;
  /** Stable seed for the particle layout; identical seeds look identical. */
  seed?: string | number;
}

export function Sparkles({
  count = 220,
  color = '#ffd9a0',
  intensity = 0.5,
  radius = 6,
  height = 5,
  size = 9,
  position,
  pulse = true,
  seed = 'dust',
}: SparklesProps) {
  const { geometry, material } = useMemo(() => {
    const rng = makeRng(seedFrom(seed));
    const positions: number[] = [];
    const seeds: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      positions.push(Math.cos(angle) * r, rng() * height, Math.sin(angle) * r);
      seeds.push(rng());
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));

    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: size },
        uHeight: { value: height },
        uRadius: { value: radius },
        uColor: { value: new Color(color) },
        uIntensity: { value: intensity },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [count, radius, height, size, color, intensity, seed]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state) => {
    const uniforms = material.uniforms;
    uniforms.uTime!.value = state.clock.elapsedTime;
    const breathing = pulse ? 1 + Math.sin(state.clock.elapsedTime * 1.4) * 0.18 : 1;
    uniforms.uIntensity!.value = intensity * breathing;
  });

  return <points geometry={geometry} material={material} position={position} frustumCulled={false} dispose={null} />;
}
