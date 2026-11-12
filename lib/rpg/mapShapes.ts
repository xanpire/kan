// The world map's outlines (map rework, after the r/Naruto "Map of the Naruto
// World" research map and the manga/anime maps it collects: Kakashi's scroll
// (ch. 9), the Chunin Exam board (ch. 39), the Kage summit map (ch. 515), the
// fanbook's Hidden Villages page and the Tea/Sea maps from the anime).
//
// Board: 100 × 100, x east, y south. The canon continent fills y 0-57; the
// anime-only south (Tea, its islands, the Sea) sits below it, as on the
// reference.
//
// Every land border is written once and shared by both countries, so
// neighbours always meet exactly. Coasts are open edges; the sea is whatever
// no country covers.

import type { Region } from './geography';

export type Pt = readonly [number, number];
type Path = readonly Pt[];

const rev = (path: Path): Path => [...path].reverse();

/** Joins border paths into one closed ring, dropping the repeated junction points. */
function ring(...parts: Path[]): Pt[] {
  const out: Pt[] = [];

  for (const part of parts) {
    for (const point of part) {
      const last = out[out.length - 1];

      if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
    }
  }

  const first = out[0];
  const last = out[out.length - 1];

  if (out.length > 1 && first[0] === last[0] && first[1] === last[1]) out.pop();

  return out;
}

// Junctions where three or more lands (or a land border and the coast) meet.
const S0: Pt = [0, 21]; // Earth / Silence, at the map's west edge
const S1: Pt = [0, 27.5]; // Silence / Wind, at the map's west edge
const EBS: Pt = [12.5, 25]; // Earth / Birds / Silence
const EBR: Pt = [21, 25.5]; // Earth / Birds / Rain
const EGR: Pt = [24.6, 27.6]; // Earth / Grass / Rain
const G1: Pt = [29.8, 22.7]; // Earth / Grass / Waterfall / Fire
const GRF: Pt = [29.8, 29.4]; // Grass / Rain / Fire
const RFR: Pt = [29.6, 33.8]; // Rain / Fire / Rivers
const RRW: Pt = [26, 33.6]; // Rain / Rivers / Wind
const BRW: Pt = [21.5, 31.5]; // Birds / Rain / Wind
const BSW: Pt = [12, 28.5]; // Birds / Silence / Wind
const W1: Pt = [30.5, 13]; // Earth / Waterfall, on the coast
const WG1: Pt = [36.5, 13.2]; // Waterfall / Graveyard, on the coast
const WGF: Pt = [36.5, 22.7]; // Waterfall / Graveyard / Fire
const GSF: Pt = [40.3, 22.6]; // Graveyard / Sound / Fire
const GSH: Pt = [46, 18]; // Graveyard / Sound / Hot Water, on the gulf
const SHF: Pt = [46, 22.4]; // Sound / Hot Water / Fire
const I1: Pt = [38.2, 8]; // Iron / Graveyard, west coast
const I2: Pt = [48.1, 9]; // Iron / Graveyard, east coast
const HF1: Pt = [49, 17.5]; // Hot Water / Frost, on the gulf
const FL1: Pt = [56.5, 15]; // Frost / Lightning, on the gulf
const FLH: Pt = [57, 20]; // Frost / Lightning / Hot Water, on the east coast
const HF2: Pt = [57.3, 32.8]; // Hot Water / Fire, on the east coast
const RF1: Pt = [36.9, 48.5]; // Rivers / Fire, on the southern bay
const RW1: Pt = [29.9, 52]; // Rivers / Wind, on the southern coast
const FW1: Pt = [58.7, 44.6]; // Fire / Woods, north
const FW2: Pt = [59.9, 46.3]; // Fire / Woods, south
const FT1: Pt = [45.2, 59.2]; // Fire / Tea, west
const FT2: Pt = [50, 59.6]; // Fire / Tea, east

// Land borders, each drawn once.
const B = {
  earthSilence: [S0, [3, 22], [8, 23.5], EBS],
  earthBirds: [EBS, [17, 24.5], EBR],
  earthRain: [EBR, [23, 26.8], EGR],
  earthGrass: [EGR, [24.8, 25], [25, 23], [27, 22.3], G1],
  earthWaterfall: [G1, [30, 18], W1],
  waterfallFire: [G1, [33, 22.9], WGF],
  grassFire: [G1, [30.5, 26], GRF],
  grassRain: [GRF, [27, 28.8], EGR],
  rainFire: [GRF, [30, 31.5], RFR],
  rainRivers: [RFR, [28, 33.4], RRW],
  rainWind: [RRW, [24, 32.8], BRW],
  birdsRain: [BRW, [21.5, 28.5], EBR],
  birdsWind: [BSW, [17, 30.5], BRW],
  birdsSilence: [EBS, [13, 26.8], BSW],
  silenceWind: [S1, [6, 28.2], BSW],
  waterfallGraveyard: [WG1, [36.6, 18], WGF],
  graveyardFire: [WGF, [38.5, 22.9], GSF],
  graveyardSound: [GSF, [41, 18.2], [43.5, 17.8], GSH],
  soundFire: [GSF, [43, 23.2], SHF],
  soundHot: [GSH, [46.3, 20], SHF],
  hotFire: [SHF, [49, 26], [55, 30], HF2],
  hotFrost: [HF1, [49.5, 19.5], [52, 21], [55.5, 21.3], FLH],
  frostLightning: [FL1, [57.2, 17.5], FLH],
  ironGraveyard: [I1, [41.5, 9.2], [45, 9.6], I2],
  riversFire: [RFR, [32, 35], [34.2, 36.8], [36.6, 41.1], [36.9, 46], RF1],
  riversWind: [RRW, [28.1, 36], [28.1, 44.2], [29.5, 48.5], RW1],
  fireWoods: [FW1, [59.4, 45.5], FW2],
  fireTea: [FT1, [47.6, 59.8], FT2],
} satisfies Record<string, Path>;

// Coasts.
const C = {
  earth: [[0, 0], [27.7, 0], [27, 3], [29, 6], [33, 9.5], [32.5, 12.5], W1],
  waterfall: [W1, [33.5, 13.6], WG1],
  graveyardWest: [WG1, [37.2, 10], I1],
  iron: [I1, [39, 6.5], [42, 4], [45, 2.8], [47.6, 4], [48.4, 7], I2],
  graveyardEast: [I2, [47.5, 11.5], [46.6, 15], GSH],
  hotNorth: [GSH, [47.5, 17.6], HF1],
  frost: [HF1, [50, 15.5], [53, 15.2], FL1],
  lightning: [FL1, [59, 12], [62.5, 9], [64, 5], [66.5, 0], [82, 0], [80, 5], [78, 12.5], [75, 16.5], [70, 19], [65, 20.5], [60, 20.5], FLH],
  hotEast: [FLH, [56, 22.5], [55.3, 24.5], [57, 27], [59.5, 28], [60.3, 30], [59.5, 32.5], HF2],
  fireEast: [HF2, [56.3, 35], [55.8, 38], [56.5, 41.5], FW1],
  woods: [FW1, [62, 42.3], [66, 41.2], [68, 41.8], [67, 44], [63, 45.8], FW2],
  // Fire's south-east runs down in a long tongue to the Land of Tea.
  tongueEast: [FW2, [57.5, 49.5], [55.6, 52.1], [51.6, 57.9], FT2],
  tea: [FT2, [49.6, 62], [48, 66], [47.5, 73], [49, 79], [53.5, 84.8], [51.5, 85.3], [47, 82.5], [43, 77.5], [40.7, 70], [40.5, 63], [42.8, 60.5], FT1],
  // ... and its west shore closes the bay south of the Leaf, where Waves lies.
  tongueWest: [FT1, [44.6, 57], [46, 55.5], [47.5, 54], [49.5, 51.8], [53, 47.5], [54.4, 45.7], [52.5, 44.2], [47, 44.4], [42.1, 44.2], [39.5, 46], RF1],
  rivers: [RF1, [34.5, 49], [32.6, 49.4], RW1],
  wind: [RW1, [29.2, 56], [27, 59], [22, 61], [14, 62], [6, 61], [0, 62]],
} satisfies Record<string, Path>;

export type RegionShape = {
  /** Anchor: where Kan's marker goes when only the country is known. */
  x: number;
  y: number;
  /** How far stops in this country spread around the anchor. */
  rx: number;
  ry: number;
  /** The full name; drawn on two lines, "Land of" small above the name (see labelLines). */
  label: string;
  /** Where the name line sits, if not on the anchor. */
  labelX?: number;
  labelY?: number;
  /** Label size; small countries get small labels. */
  size?: 'large' | 'medium' | 'small';
  /** The name split over lines when it is wider than the country ("Water-", "falls"). */
  nameLines?: readonly string[];
  /** Shown in the anime only (Tea, the Sea, Birds, Woods): dashed outline. */
  animeOnly?: boolean;
  rings: Pt[][];
};

export const REGION_SHAPES: Record<Region, RegionShape> = {
  earth: {
    x: 14, y: 12, rx: 6, ry: 5, label: 'Land of Earth', labelY: 8, size: 'large',
    rings: [ring(C.earth, rev(B.earthWaterfall), rev(B.earthGrass), rev(B.earthRain), rev(B.earthBirds), rev(B.earthSilence))],
  },
  silence: {
    x: 6, y: 25, rx: 2.5, ry: 1, label: 'Land of Silence', labelX: 7.6, labelY: 26.8, size: 'small',
    rings: [ring(B.earthSilence, B.birdsSilence, rev(B.silenceWind))],
  },
  birds: {
    x: 16.5, y: 27.5, rx: 2.5, ry: 1, label: 'Land of Birds', labelY: 27.4, size: 'small', animeOnly: true,
    rings: [ring(B.earthBirds, rev(B.birdsRain), rev(B.birdsWind), rev(B.birdsSilence))],
  },
  rain: {
    x: 25, y: 30.8, rx: 1.8, ry: 1, label: 'Land of Rain', labelX: 26, labelY: 32.5, size: 'small',
    rings: [ring(B.earthRain, rev(B.grassRain), B.rainFire, B.rainRivers, B.rainWind, B.birdsRain)],
  },
  grass: {
    x: 27.5, y: 25, rx: 1.2, ry: 1.2, label: 'Land of Grass', labelX: 27.7, labelY: 25.15, size: 'small',
    rings: [ring(B.earthGrass, B.grassFire, B.grassRain)],
  },
  waterfall: {
    x: 33.3, y: 18, rx: 1.5, ry: 2.5, label: 'Land of Waterfalls', labelY: 22.2, size: 'small', nameLines: ['Water-', 'falls'],
    rings: [ring(C.waterfall, B.waterfallGraveyard, rev(B.waterfallFire), B.earthWaterfall)],
  },
  graveyard: {
    x: 42.5, y: 14, rx: 2.5, ry: 2, label: 'Mountain Graveyard', labelX: 41.8, labelY: 16.4, size: 'small',
    rings: [ring(C.graveyardWest, B.ironGraveyard, C.graveyardEast, rev(B.graveyardSound), rev(B.graveyardFire), rev(B.waterfallGraveyard))],
  },
  iron: {
    x: 44, y: 6.3, rx: 2, ry: 1, label: 'Land of Iron', labelX: 43.6, labelY: 8.8, size: 'small',
    rings: [ring(C.iron, rev(B.ironGraveyard))],
  },
  rice: {
    x: 43.5, y: 20.5, rx: 1.4, ry: 0.9, label: 'Land of Sound', labelX: 43.2, labelY: 22.2, size: 'small',
    rings: [ring(B.graveyardSound, B.soundHot, rev(B.soundFire))],
  },
  'hot-water': {
    x: 51, y: 24.5, rx: 2, ry: 1.2, label: 'Land of Hot Water', labelX: 52.3, labelY: 23.6, size: 'small',
    rings: [ring(C.hotNorth, B.hotFrost, C.hotEast, rev(B.hotFire), rev(B.soundHot))],
  },
  frost: {
    x: 53, y: 18, rx: 1.5, ry: 1, label: 'Land of Frost', labelY: 16.9, size: 'small',
    rings: [ring(C.frost, B.frostLightning, rev(B.hotFrost))],
  },
  lightning: {
    x: 70, y: 8, rx: 6, ry: 4, label: 'Land of Lightning', labelY: 6, size: 'large',
    rings: [
      ring(C.lightning, rev(B.frostLightning)),
      // The long island south of Lightning's coast.
      [[73, 22.2], [73.8, 23], [71, 26.5], [68, 29.5], [65.5, 31.8], [64.6, 31.2], [66.5, 28], [69.5, 25], [72, 22.8]],
    ],
  },
  fire: {
    x: 45, y: 36, rx: 6, ry: 5, label: 'Land of Fire', labelY: 29.5, size: 'large',
    rings: [
      ring(
        B.waterfallFire,
        B.graveyardFire,
        B.soundFire,
        B.hotFire,
        C.fireEast,
        B.fireWoods,
        C.tongueEast,
        rev(B.fireTea),
        C.tongueWest,
        rev(B.riversFire),
        rev(B.rainFire),
        rev(B.grassFire)
      ),
    ],
  },
  rivers: {
    x: 32.5, y: 42, rx: 1.3, ry: 3, label: 'Land of Rivers', labelY: 40.5, size: 'small',
    rings: [ring(B.riversFire, C.rivers, rev(B.riversWind), rev(B.rainRivers))],
  },
  wind: {
    x: 14, y: 45, rx: 7, ry: 6, label: 'Land of Wind', labelY: 38, size: 'large',
    rings: [ring(B.silenceWind, B.birdsWind, rev(B.rainWind), B.riversWind, C.wind)],
  },
  woods: {
    x: 63.5, y: 43.4, rx: 1.5, ry: 0.6, label: 'Land of Woods', labelY: 43.9, size: 'small', animeOnly: true,
    rings: [ring(C.woods, rev(B.fireWoods))],
  },
  whirlpools: {
    x: 60.1, y: 36.7, rx: 0.4, ry: 0.4, label: 'Land of Whirlpools', labelX: 62, labelY: 40, size: 'small',
    rings: [[[58.8, 35.6], [60.2, 35.2], [61.4, 35.9], [61.2, 37.4], [60, 38.2], [58.9, 37.5]]],
  },
  water: {
    x: 82, y: 37.5, rx: 2.5, ry: 2.5, label: 'Land of Water', labelX: 83.3, labelY: 41, size: 'large',
    rings: [
      [[78, 34.5], [80.5, 32.8], [84, 33], [86.5, 35.5], [86.8, 39], [85, 41.8], [81.5, 42.3], [78.5, 40.8], [77.4, 37.8]],
      [[74.2, 32.2], [76.3, 31.8], [77, 33.6], [75.4, 35], [74, 34]],
      [[85.3, 30.8], [87.5, 31], [87.8, 33.6], [86, 34.6], [85, 33]],
      [[87.3, 37.2], [89.3, 37], [89.6, 39.3], [88, 40.1]],
      [[72.2, 39.2], [74.6, 39], [75, 40.6], [72.8, 41]],
      [[86.2, 44.3], [89.5, 43.8], [91, 45.7], [89.2, 48.4], [86.5, 47.6]],
      [[80.6, 43.6], [82.4, 43.8], [82.2, 46.8], [80.7, 46.5]],
      [[77, 42.3], [79.6, 42.3], [79.3, 44.3], [77.3, 44.2]],
    ],
  },
  waves: {
    x: 39.3, y: 55.2, rx: 0.8, ry: 0.6, label: 'Land of Waves', labelY: 58.6, size: 'small',
    rings: [
      [[37.2, 54], [39, 53.3], [40.8, 53.8], [41.6, 55.2], [40.6, 56.6], [38.6, 56.9], [37.1, 56]],
      [[36, 53], [36.8, 52.7], [37, 53.4], [36.3, 53.7]],
      [[41.8, 53], [42.6, 52.9], [42.7, 53.6], [42, 53.8]],
    ],
  },
  tea: {
    x: 44.5, y: 70, rx: 1.5, ry: 4, label: 'Land of Tea', labelY: 72.6, size: 'medium', animeOnly: true,
    rings: [
      ring(B.fireTea, C.tea),
      // Nagi Island and Ouza Island, joined by a suspension bridge.
      [[61.2, 61], [63, 59.6], [66.5, 59.2], [70, 60], [73.5, 61.5], [74.5, 63.5], [72.5, 65.8], [69, 66.2], [66.5, 65.6], [64, 64.8], [62, 63.5]],
      [[74.5, 65.5], [77, 64.3], [80.5, 65.5], [82.8, 69], [83.7, 74], [83, 79], [80.5, 83.2], [78.8, 83.6], [79.2, 80], [80, 75], [79.5, 70], [77.2, 67.5]],
    ],
  },
  sea: {
    x: 62, y: 92, rx: 3, ry: 1.2, label: 'Land of the Sea', labelX: 60, labelY: 87.5, size: 'medium', animeOnly: true,
    rings: [
      [[65, 85], [67, 84.4], [68.2, 86.2], [66.5, 87.8], [65.1, 87]],
      [[49.8, 89.8], [52.5, 89.4], [53.6, 91], [52.3, 92.6], [50.2, 92.2]],
      [[56.5, 91.3], [59, 89.8], [63, 89.6], [67.5, 90], [70, 91], [68, 93.3], [64, 94.5], [60, 95.4], [57, 94.2]],
      [[58.1, 96.8], [59.5, 96.6], [59.8, 98], [58.5, 98.4]],
    ],
  },
};

/** Land that belongs to no country Kan knows: drawn, never named. */
export const UNCLAIMED_LAND: Pt[][] = [
  // The far east, past Lightning and the Mist.
  [[100, 9], [96, 10.5], [92, 13], [88.5, 17], [88, 21.5], [90, 25], [93, 27], [100, 27.5]],
  [[100, 28.5], [95.5, 30.5], [91.5, 34], [90.2, 38.5], [92, 41.5], [96, 41], [100, 40]],
  // The big island south of the Mist.
  [[70.5, 45.5], [73, 45], [75, 46.5], [74.5, 49.5], [72.5, 52], [70.8, 50.5], [70, 48]],
  // Islets off Nagi.
  [[66.5, 57.8], [68, 57.6], [68.2, 59], [66.8, 59.2]],
];

/** Bridges drawn as lines: the Great Naruto Bridge, and Nagi to Ouza. */
export const BRIDGES: Array<readonly [Pt, Pt]> = [
  [[41.6, 55.2], [46, 55.5]],
  [[74.5, 63.5], [75.8, 65]],
];


/** Label sizes in board units. */
export const LABEL_SIZE = { large: 2.6, medium: 2.1, small: 1.6 } as const;

export type LabelLine = {
  text: string;
  x: number;
  /** Baseline. */
  y: number;
  size: number;
  letterSpacing: number;
  /** The name itself (true) or the small "Land of" line above it (false). */
  name: boolean;
};

/**
 * Where a country's label lines go: the small "Land of" line, then the name
 * (on several lines when `nameLines` splits it), the last name line's
 * baseline on the label point. The map draws these; `scripts/map.test.ts`
 * measures them against the outlines.
 */
export function labelLayout(shape: RegionShape): LabelLine[] {
  const size = LABEL_SIZE[shape.size ?? 'small'];
  const large = shape.size === 'large';
  const [first, name] = labelLines(shape.label);
  const x = shape.labelX ?? shape.x;
  const y = shape.labelY ?? shape.y;
  const names = (shape.nameLines ?? [name]).map((line) => (large ? line.toUpperCase() : line));
  const step = size * 0.95;
  const lines: LabelLine[] = names.map((text, index) => ({
    text,
    x,
    y: y - (names.length - 1 - index) * step,
    size,
    letterSpacing: large ? 0.35 : 0,
    name: true,
  }));
  if (first) lines.unshift({ text: first, x, y: lines[0].y - size * 0.92, size: size * 0.58, letterSpacing: 0, name: false });
  return lines;
}

/** A label split for the board: a small first line ("Land of", "Mountain") and the name. */
export function labelLines(label: string): [string, string] {
  if (label.startsWith('Land of the ')) return ['Land of the', label.slice('Land of the '.length)];
  if (label.startsWith('Land of ')) return ['Land of', label.slice('Land of '.length)];

  const space = label.indexOf(' ');

  return space > 0 ? [label.slice(0, space), label.slice(space + 1)] : ['', label];
}

export function ringPath(points: readonly Pt[]): string {
  return `M${points.map(([x, y]) => `${x},${y}`).join('L')}Z`;
}

function insideRing(x: number, y: number, points: readonly Pt[]): boolean {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }

  return inside;
}

/** The country under a point on the board, or null for the sea and unclaimed land. */
export function regionAt(x: number, y: number): Region | null {
  for (const [region, shape] of Object.entries(REGION_SHAPES) as Array<[Region, RegionShape]>) {
    if (shape.rings.some((points) => insideRing(x, y, points))) return region;
  }

  return null;
}
