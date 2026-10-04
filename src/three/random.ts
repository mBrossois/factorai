/**
 * Deterministic pseudo-randomness.
 *
 * Sparkle clouds and cauldron bubbles need per-instance jitter, but they are
 * built during render, where `Math.random()` is both impure and a remount
 * hazard. A seeded PRNG keeps every cloud stable across re-renders, and lets
 * two floors seeded differently look hand-placed rather than cloned.
 */

export type Rng = () => number;

/** mulberry32: small, fast, good enough for scattering glitter. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash an arbitrary label into a stable seed, so "floor-3" always matches. */
export function seedFrom(label: string | number): number {
  const text = String(label);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}