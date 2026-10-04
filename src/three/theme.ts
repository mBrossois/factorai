/**
 * The castle palette and the per-floor themes.
 *
 * Every colour in the 3D world comes from here so the whole castle reads as one
 * hand-painted anime background: deep violet stone, candle gold, emerald
 * potion-glass and lantern blue.
 */

import type { Theme } from '../core/types';

export const PALETTE = {
  void: '#0b0618',
  fog: '#150c2c',
  stone: '#4b3d6b',
  stoneDark: '#332a4d',
  stoneLight: '#6a5a92',
  marble: '#cfc6e6',
  marbleDark: '#9a90bb',
  gold: '#f5c451',
  goldDeep: '#b8862b',
  emerald: '#2fbf71',
  ruby: '#e0405f',
  lantern: '#ffb765',
  arcane: '#7ad7ff',
  violet: '#a45cff',
  parchment: '#f0e2bd',
  ink: '#2a1e3f',
  wood: '#6b4526',
  woodDark: '#4a2f1a',
  robe: '#3c2a63',
  skin: '#f6d3b4',
} as const;

export interface FloorTheme {
  id: Theme;
  label: string;
  wall: string;
  wallAccent: string;
  floor: string;
  accent: string;
  light: string;
  fogTint: string;
  props: 'library' | 'lab' | 'observatory' | 'garden' | 'crystal' | 'dragons' | 'music' | 'dungeon' | 'clock';
}

export const FLOOR_THEMES: Record<Theme, FloorTheme> = {
  library: {
    id: 'library',
    label: 'The Restricted Library',
    wall: '#4a3a52',
    wallAccent: '#6d4f63',
    floor: '#3b2b34',
    accent: PALETTE.gold,
    light: '#ffd79a',
    fogTint: '#1d1428',
    props: 'library',
  },
  'alchemy-lab': {
    id: 'alchemy-lab',
    label: 'Potions Dungeon',
    wall: '#3b4560',
    wallAccent: '#54648c',
    floor: '#2f3a4d',
    accent: PALETTE.emerald,
    light: '#8affc4',
    fogTint: '#101c26',
    props: 'lab',
  },
  observatory: {
    id: 'observatory',
    label: 'Astronomy Tower',
    wall: '#2f3a63',
    wallAccent: '#44528c',
    floor: '#2a3050',
    accent: PALETTE.arcane,
    light: '#a8c8ff',
    fogTint: '#0d1330',
    props: 'observatory',
  },
  greenhouse: {
    id: 'greenhouse',
    label: 'Glass Greenhouse',
    wall: '#3d5c48',
    wallAccent: '#557a5c',
    floor: '#33472f',
    accent: '#8ef07a',
    light: '#d6ffb0',
    fogTint: '#12241c',
    props: 'garden',
  },
  'crystal-halls': {
    id: 'crystal-halls',
    label: 'Crystal Halls',
    wall: '#3d3560',
    wallAccent: '#5a4d8c',
    floor: '#332d52',
    accent: PALETTE.violet,
    light: '#e0c4ff',
    fogTint: '#160f33',
    props: 'crystal',
  },
  'dragon-roosts': {
    id: 'dragon-roosts',
    label: 'Dragon Roosts',
    wall: '#5c3a3a',
    wallAccent: '#7a4a44',
    floor: '#42292b',
    accent: '#ff8a5c',
    light: '#ffb08a',
    fogTint: '#2a1414',
    props: 'dragons',
  },
  herbarium: {
    id: 'herbarium',
    label: 'Herbarium',
    wall: '#4a4a35',
    wallAccent: '#66664a',
    floor: '#3b3b2a',
    accent: '#d6d06a',
    light: '#f0f0b8',
    fogTint: '#1e1e12',
    props: 'garden',
  },
  'music-room': {
    id: 'music-room',
    label: 'Music Room',
    wall: '#4a3556',
    wallAccent: '#6a4a78',
    floor: '#3a2a44',
    accent: '#ff9ee0',
    light: '#ffc8ef',
    fogTint: '#22122a',
    props: 'music',
  },
  dungeons: {
    id: 'dungeons',
    label: 'The Dungeons',
    wall: '#2f2f38',
    wallAccent: '#43434f',
    floor: '#26262d',
    accent: '#9fe0c0',
    light: '#b8ffe0',
    fogTint: '#0e0e12',
    props: 'dungeon',
  },
  clockwork: {
    id: 'clockwork',
    label: 'Clockwork Loft',
    wall: '#4a4235',
    wallAccent: '#6a5f47',
    floor: '#39332a',
    accent: PALETTE.gold,
    light: '#ffe1a8',
    fogTint: '#1c1710',
    props: 'clock',
  },
};

export function themeFor(theme: string | undefined): FloorTheme {
  return FLOOR_THEMES[(theme ?? 'library') as Theme] ?? FLOOR_THEMES.library;
}

/** Accent colour per agent type, so Claude and Kilo wizards read apart. */
export const AGENT_COLORS = {
  claude: { robe: '#c2683a', accent: '#ffb066', hat: '#7a3a22', hair: '#4a2412' },
  kilo: { robe: '#2f6fa8', accent: '#7ad7ff', hat: '#1d3f66', hair: '#12304f' },
} as const;

export const AGENT_STATES = {
  idle: { glow: '#5c6a9e', sparkRate: 0.25 },
  working: { glow: '#ffd166', sparkRate: 1 },
  error: { glow: '#ff5470', sparkRate: 0.6 },
} as const;
