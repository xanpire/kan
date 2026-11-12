// The world map's outlines, labels and roads (audit 11e.2). The outlines in
// mapShapes.ts are Xan's and must not change; these tests guard them and
// check that the labels and travel times agree with them.

import { describe, expect, test } from 'bun:test';

import { REGION_NAME, ROADS, SEA_LANES, travelDaysBetween, type Region } from '../lib/rpg/geography';
import { MAP_PLACES } from '../lib/rpg/mapData';
import { REGION_SHAPES, UNCLAIMED_LAND, labelLayout, regionAt, type Pt } from '../lib/rpg/mapShapes';

const REGIONS = Object.keys(REGION_NAME) as Region[];

// ---------------------------------------------------------------------------
// Geometry helpers

function insideRing(x: number, y: number, points: readonly Pt[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const insideRegion = (region: Region, x: number, y: number) => REGION_SHAPES[region].rings.some((ring) => insideRing(x, y, ring));
const insideUnclaimed = (x: number, y: number) => UNCLAIMED_LAND.some((ring) => insideRing(x, y, ring));

/** Proper crossing of two segments (shared end points do not count). */
function cross(a: Pt, b: Pt, c: Pt, d: Pt) {
  const orient = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = orient(c, d, a);
  const d2 = orient(c, d, b);
  const d3 = orient(a, b, c);
  const d4 = orient(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

const key = (p: Pt) => `${p[0]},${p[1]}`;

/** Edges of a ring as point-key pairs, either direction. */
function edges(ring: readonly Pt[]) {
  const out = new Set<string>();
  for (let i = 0; i < ring.length; i += 1) {
    const a = key(ring[i]);
    const b = key(ring[(i + 1) % ring.length]);
    out.add(`${a}|${b}`);
    out.add(`${b}|${a}`);
  }
  return out;
}

/** Countries that share a stretch of border (not just a corner). */
function neighbours(): Array<[Region, Region]> {
  const pairs: Array<[Region, Region]> = [];
  for (let i = 0; i < REGIONS.length; i += 1) {
    for (let j = i + 1; j < REGIONS.length; j += 1) {
      const a = REGIONS[i];
      const b = REGIONS[j];
      const edgesA = new Set(REGION_SHAPES[a].rings.flatMap((ring) => [...edges(ring)]));
      const shared = REGION_SHAPES[b].rings.some((ring) => [...edges(ring)].some((edge) => edgesA.has(edge)));
      if (shared) pairs.push([a, b]);
    }
  }
  return pairs;
}

// Manrope SemiBold advance widths, in ems (from the font file the map uses).
const ADVANCE: Record<string, number> = {
  A: 0.658, B: 0.625, C: 0.731, D: 0.691, E: 0.58, F: 0.516, G: 0.723, H: 0.71, I: 0.265, J: 0.488, K: 0.629, L: 0.525, M: 0.851,
  N: 0.707, O: 0.741, P: 0.627, Q: 0.741, R: 0.65, S: 0.643, T: 0.604, U: 0.714, V: 0.628, W: 0.963, X: 0.639, Y: 0.593, Z: 0.647,
  a: 0.57, b: 0.608, c: 0.569, d: 0.609, e: 0.597, f: 0.37, g: 0.608, h: 0.615, i: 0.265, j: 0.276, k: 0.524, l: 0.265, m: 0.882,
  n: 0.615, o: 0.61, p: 0.608, q: 0.609, r: 0.387, s: 0.536, t: 0.422, u: 0.615, v: 0.538, w: 0.79, x: 0.545, y: 0.548, z: 0.532,
  ' ': 0.2, "'": 0.244, '-': 0.42, '·': 0.254,
};
const CAP_HEIGHT = 0.72;

function textWidth(text: string, size: number, letterSpacing: number) {
  let width = 0;
  for (const char of text) {
    const advance = ADVANCE[char];
    if (advance === undefined) throw new Error(`no width for "${char}"`);
    width += advance * size + letterSpacing;
  }
  return width - letterSpacing;
}

/** The ink box of each label line, as the board draws it. */
function labelBoxes(region: Region) {
  return labelLayout(REGION_SHAPES[region]).map((line) => {
    const width = textWidth(line.text, line.size, line.letterSpacing);
    return { text: line.text, left: line.x - width / 2, right: line.x + width / 2, top: line.y - line.size * CAP_HEIGHT, bottom: line.y };
  });
}

/** Every country under a grid of points over a box, other than `own`. */
function intruders(own: Region, box: { left: number; right: number; top: number; bottom: number }) {
  const found = new Set<string>();
  for (let x = box.left; x <= box.right + 1e-9; x += Math.max(0.1, (box.right - box.left) / 40)) {
    for (let y = box.top; y <= box.bottom + 1e-9; y += Math.max(0.1, (box.bottom - box.top) / 6)) {
      const under = regionAt(x, y);
      if (under && under !== own) found.add(under);
      if (insideUnclaimed(x, y)) found.add('unclaimed land');
    }
  }
  return [...found];
}

// ---------------------------------------------------------------------------

describe('outlines (never change: Xan’s condition)', () => {
  test('no country overlaps another or the unclaimed land', () => {
    // A 0.1-unit grid; each ring is only tested inside its bounding box.
    type Box = { owner: string; ring: readonly Pt[]; minX: number; maxX: number; minY: number; maxY: number };
    const boxOf = (owner: string, ring: readonly Pt[]): Box => ({
      owner,
      ring,
      minX: Math.min(...ring.map((p) => p[0])),
      maxX: Math.max(...ring.map((p) => p[0])),
      minY: Math.min(...ring.map((p) => p[1])),
      maxY: Math.max(...ring.map((p) => p[1])),
    });
    const boxes = [
      ...REGIONS.flatMap((region) => REGION_SHAPES[region].rings.map((ring) => boxOf(region, ring))),
      ...UNCLAIMED_LAND.map((ring) => boxOf('unclaimed land', ring)),
    ];
    const problems: string[] = [];
    for (let x = 0.05; x < 100 && problems.length < 5; x += 0.1) {
      const column = boxes.filter((box) => x >= box.minX && x <= box.maxX);
      for (let y = 0.05; y < 100; y += 0.1) {
        const owners = new Set<string>();
        for (const box of column) {
          if (y >= box.minY && y <= box.maxY && insideRing(x, y, box.ring)) owners.add(box.owner);
        }
        if (owners.size > 1) problems.push(`${[...owners].join(' + ')} at ${x.toFixed(2)},${y.toFixed(2)}`);
      }
    }
    expect(problems).toEqual([]);
  }, 30000);

  test('no outline crosses itself', () => {
    const problems: string[] = [];
    const rings = [...REGIONS.flatMap((region) => REGION_SHAPES[region].rings.map((ring) => [region, ring] as const)), ...UNCLAIMED_LAND.map((ring) => ['unclaimed', ring] as const)];
    for (const [name, ring] of rings) {
      for (let i = 0; i < ring.length; i += 1) {
        for (let j = i + 2; j < ring.length; j += 1) {
          if (i === 0 && j === ring.length - 1) continue;
          if (cross(ring[i], ring[(i + 1) % ring.length], ring[j], ring[(j + 1) % ring.length])) problems.push(`${name}: edge ${i} crosses edge ${j}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test('every anchor and the edges of its stop spread are inside its own country', () => {
    const problems: string[] = [];
    for (const region of REGIONS) {
      const { x, y, rx, ry } = REGION_SHAPES[region];
      for (const [px, py] of [[x, y], [x - rx, y], [x + rx, y], [x, y - ry], [x, y + ry]] as const) {
        if (!insideRegion(region, px, py)) problems.push(`${region}: ${px.toFixed(1)},${py.toFixed(1)}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('every place dot is inside its country (the Island Turtle and the Great Naruto Bridge sit on water)', () => {
    const onWater = new Set(['genbu', 'naruto-bridge']);
    const placed = MAP_PLACES.filter((place) => !place.unplaced && place.region);
    const problems = placed.filter((place) => !onWater.has(place.id) && !insideRegion(place.region!, place.x, place.y)).map(
      (place) => `${place.id} (${place.region}) at ${place.x},${place.y} is in ${regionAt(place.x, place.y) ?? 'the sea'}`,
    );
    expect(problems).toEqual([]);
    for (const id of onWater) {
      const place = MAP_PLACES.find((entry) => entry.id === id)!;
      expect(regionAt(place.x, place.y)).toBeNull();
    }
  });
});

describe('labels', () => {
  test('no country name is printed over another country or the unclaimed land', () => {
    const problems: string[] = [];
    for (const region of REGIONS) {
      for (const box of labelBoxes(region)) {
        const over = intruders(region, box);
        if (over.length) problems.push(`${region} "${box.text}" runs over ${over.join(', ')}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('no country name covers a place dot', () => {
    const problems: string[] = [];
    const dots = MAP_PLACES.filter((place) => !place.unplaced && place.region);
    for (const region of REGIONS) {
      for (const box of labelBoxes(region)) {
        for (const place of dots) {
          // The dot's radius as drawn, plus half its stroke.
          const r = (place.kind === 'village' ? 0.85 : 0.55) + 0.14;
          const nearX = Math.max(box.left, Math.min(place.x, box.right));
          const nearY = Math.max(box.top, Math.min(place.y, box.bottom));
          if (Math.hypot(place.x - nearX, place.y - nearY) < r) problems.push(`${region} "${box.text}" covers ${place.id}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  test('the small countries’ names sit on their own land', () => {
    // A small country's name is read as its own only when it is on it: its
    // name line's middle must be inside the outline. (The island countries,
    // Whirlpools, Waves and Water, are named in the sea beside them.)
    const offshore = new Set<Region>(['whirlpools', 'waves', 'water', 'sea', 'woods', 'tea']);
    const problems: string[] = [];
    for (const region of REGIONS) {
      if (offshore.has(region) || REGION_SHAPES[region].size === 'large') continue;
      const lines = labelLayout(REGION_SHAPES[region]).filter((line) => line.name);
      for (const line of lines) {
        if (!insideRegion(region, line.x, line.y - line.size * 0.36)) problems.push(`${region} "${line.text}" at ${line.x},${line.y}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('Rain’s name is inside Rain', () => {
    const rain = labelLayout(REGION_SHAPES.rain).find((line) => line.name)!;
    expect(regionAt(rain.x, rain.y - 0.5)).toBe('rain');
  });
});

describe('roads and travel times', () => {
  test('every pair of countries that share a border has a direct road', () => {
    const direct = new Set([...ROADS, ...SEA_LANES].flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
    const missing = neighbours()
      .filter(([a, b]) => !direct.has(`${a}|${b}`))
      .map(([a, b]) => `${a} – ${b}`);
    expect(missing).toEqual([]);
  });

  test('no overland road is slower than about 4 board units a day', () => {
    const slow: string[] = [];
    for (const [a, b, days] of ROADS) {
      const from = REGION_SHAPES[a];
      const to = REGION_SHAPES[b];
      const distance = Math.hypot(from.x - to.x, from.y - to.y);
      if (distance / days < 3.5) slow.push(`${a} – ${b}: ${distance.toFixed(1)} units in ${days} days`);
    }
    expect(slow).toEqual([]);
  });

  test('the sea lanes: Lightning to Water about 4 days, the Graveyard to Hot Water across the gulf', () => {
    expect(travelDaysBetween('lightning', 'water')).toBe(4);
    expect(travelDaysBetween('graveyard', 'hot-water')).toBe(1.5);
    // The Leaf's own times don't change (Hidden Cloud is 5.5 by Frost, Hidden Mist 4.5 by Uzushio).
    expect(travelDaysBetween('fire', 'water')).toBe(4.5);
    expect(travelDaysBetween('fire', 'lightning')).toBe(5.5);
  });

  test('every road and lane names two real countries', () => {
    for (const [a, b, days] of [...ROADS, ...SEA_LANES]) {
      expect(REGIONS).toContain(a);
      expect(REGIONS).toContain(b);
      expect(days).toBeGreaterThan(0);
    }
  });
});
