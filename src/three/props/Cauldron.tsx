/**
 * The central cauldron: browser-test results bubbling up.
 *
 * Bubbling intensity tracks the check rollup across the floor's pull requests,
 * so a red, violently bubbling cauldron literally means CI is unhappy.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  ShaderMaterial,
  type Group,
  type Mesh,
  type Points,
} from 'three';

import type { CheckState } from '../../core/types';
import { Interactable } from '../Interaction';
import { makeRng, seedFrom } from '../random';
import { Flat, GEO, Toon } from '../materials';
import { PALETTE } from '../theme';
import { SignPlate } from './SignPlate';
import { Sparkles } from './Sparkles';

export interface CauldronProps {
  checks: CheckState;
  label?: string;
  position?: [number, number, number];
  /** 0..1 multiplier, lets a floor run a hotter or calmer brew. */
  intensity?: number;
  onInspect?: () => void;
}

const BUBBLES = 30;

export function Cauldron({ checks, label, position = [0, 0, 0], intensity = 1, onInspect }: CauldronProps) {
  const liquid = useRef<Mesh>(null);
  const bubbles = useRef<Points>(null);
  const rim = useRef<Group>(null);

  const failing = checks.failing > 0;
  const brew = failing ? '#ff4f6d' : checks.total === 0 ? '#5a4f8f' : PALETTE.emerald;
  const brewGlow = failing ? '#ff8a9c' : checks.total === 0 ? '#9a8fd0' : '#7dffbe';

  const { geometry, material } = useMemo(() => {
    const rng = makeRng(seedFrom(label ?? 'cauldron'));
    const positions = new Float32Array(BUBBLES * 3);
    const seeds = new Float32Array(BUBBLES);
    for (let i = 0; i < BUBBLES; i += 1) {
      const angle = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * 0.6;
      positions[i * 3] = Math.cos(angle) * r;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = Math.sin(angle) * r;
      seeds[i] = rng();
    }

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1));

    const mat = new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(brewGlow) },
        uRate: { value: 1 },
        uSize: { value: 10 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uRate;
        uniform float uSize;
        varying float vLife;
        void main() {
          float life = fract(uTime * (0.22 + aSeed * 0.38) * uRate + aSeed);
          vec3 p = position;
          p.y = life * 1.2;
          p.x += sin(uTime * 2.0 + aSeed * 12.0) * 0.09 * life;
          p.z += cos(uTime * 1.7 + aSeed * 9.0) * 0.09 * life;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (0.4 + aSeed) * (1.0 - life * 0.45) * (12.0 / max(0.001, -mv.z));
          gl_Position = projectionMatrix * mv;
          vLife = 1.0 - life;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vLife;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.05, d) * 0.9;
          gl_FragColor = vec4(uColor, a * vLife);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    return { geometry: geo, material: mat };
  }, [brewGlow, label]);

  const boil = useMemo(() => {
    if (checks.total === 0) return 0.2 * intensity;
    if (failing) return Math.min(1.6, 0.7 + checks.failing * 0.3) * intensity;
    return Math.min(1.2, 0.35 + checks.passing * 0.12 + checks.pending * 0.1) * intensity;
  }, [checks, failing, intensity]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    material.uniforms.uTime!.value = t;
    material.uniforms.uRate!.value = boil;

    const surface = liquid.current;
    if (surface) {
      surface.position.y = 1.3 + Math.sin(t * (1.4 + boil * 2.4)) * 0.035;
      surface.scale.setScalar(1 + Math.sin(t * 1.7) * 0.02 * boil);
    }
    if (rim.current) rim.current.rotation.y = t * 0.18;
    if (bubbles.current) bubbles.current.visible = boil > 0.22;
  });

  const pot = (
    <group position={position} dispose={null}>
      {/* Fire base */}
      <Toon
        geometry={GEO.cylinder}
        color={failing ? '#ff6b4a' : '#ff9b45'}
        emissive={failing ? '#ff3b2f' : '#ff7a2a'}
        emissiveIntensity={1.2 + boil * 0.8}
        rim={0.8}
        outline={0}
        position={[0, 0.08, 0]}
        scale={[1.15, 0.3, 1.15]}
      />
      <Toon
        geometry={GEO.cylinder}
        color={PALETTE.stoneDark}
        position={[0, 0.26, 0]}
        scale={[1.5, 0.22, 1.5]}
        outline={0.04}
        receiveShadow
      />
      {LEGS.map(([x, z]) => (
        <Toon
          key={`${x}:${z}`}
          geometry={GEO.box}
          color={PALETTE.stoneDark}
          position={[x * 1.18, 0.16, z * 1.18]}
          rotation={[0, Math.atan2(z, x), 0]}
          scale={[0.16, 0.34, 0.16]}
          outline={0.02}
        />
      ))}

      {/* Belly + rim of the pot */}
      <Toon geometry={GEO.sphere} color="#2b2438" position={[0, 1.0, 0]} scale={[2.2, 1.9, 2.2]} outline={0.05} castShadow />
      <Toon geometry={GEO.cylinder} color="#241d30" position={[0, 0.72, 0]} scale={[1.5, 0.5, 1.5]} outline={0.04} />
      <Toon geometry={GEO.cylinder} color="#241d30" position={[0, 1.5, 0]} scale={[1.34, 0.36, 1.34]} outline={0.04} />

      {/* Brew surface */}
      <mesh ref={liquid} position={[0, 1.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.66, 28]} />
        <meshBasicMaterial color={brew} toneMapped={false} />
      </mesh>
      <Flat
        geometry={GEO.circle}
        color={brewGlow}
        opacity={0.3 + Math.min(0.5, boil * 0.4)}
        additive
        position={[0, 1.32, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={1.55}
      />
      <points
        ref={bubbles}
        geometry={geometry}
        material={material}
        position={[0, 1.3, 0]}
        frustumCulled={false}
        dispose={null}
      />

      {/* Rim ring with orbiting runes */}
      <group ref={rim} position={[0, 1.68, 0]}>
        <Toon geometry={GEO.torus} color={PALETTE.goldDeep} rotation={[Math.PI / 2, 0, 0]} scale={2.7} outline={0.03} />
        {Array.from({ length: 6 }, (_, i) => (
          <Toon
            key={i}
            geometry={GEO.octa}
            color={brewGlow}
            emissive={brewGlow}
            emissiveIntensity={1.4}
            outline={0}
            rim={1}
            position={[
              Math.cos((i / 6) * Math.PI * 2) * 1.3,
              0.08,
              Math.sin((i / 6) * Math.PI * 2) * 1.3,
            ]}
            scale={0.16}
          />
        ))}
      </group>

      {label && <SignPlate text={label} sub={checkSummary(checks)} position={[0, 2.5, 0]} rotation={[0.3, 0, 0]} width={2} />}

      <Sparkles
        count={failing ? 150 : 80}
        color={brewGlow}
        intensity={0.3 + Math.min(0.8, boil * 0.5)}
        radius={1.15}
        height={2.6}
        size={7}
        position={[0, 1.3, 0]}
        seed={label ?? 'cauldron'}
      />
    </group>
  );

  if (!onInspect) return pot;
  return (
    <Interactable
      label="Inspect the cauldron"
      detail={checkSummary(checks)}
      range={4.6}
      onInteract={onInspect}
    >
      {pot}
    </Interactable>
  );
}

const LEGS: Array<[number, number]> = [
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5],
];

export function checkSummary(checks: CheckState): string {
  if (checks.total === 0) return 'no tests yet';
  const parts = [`${checks.passing} passing`];
  if (checks.failing > 0) parts.push(`${checks.failing} failing`);
  if (checks.pending > 0) parts.push(`${checks.pending} pending`);
  return parts.join(' · ');
}
