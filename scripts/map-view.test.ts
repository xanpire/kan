/**
 * The map board's pinch, drag and double tap (audit 11a). Only the window
 * moves: the outlines are never touched (Xan: borders and shapes stay).
 */
import { describe, expect, test } from 'bun:test';

import { REGION_SHAPES } from '../lib/rpg/mapShapes';
import { MIN_SPAN, WHOLE_MAP, boardPoint, clampView, panBy, viewOrigin, zoomTo } from '../lib/rpg/mapView';

const WIDTH = 350;

describe('the map window', () => {
  test('starts on the whole board', () => {
    expect(viewOrigin(WHOLE_MAP)).toEqual({ x: 0, y: 0 });
    expect(WHOLE_MAP.span).toBe(100);
  });

  test('pinching keeps the point under the fingers where it was', () => {
    const focal = { x: 100, y: 200 };
    const before = boardPoint(WHOLE_MAP, WIDTH, focal.x, focal.y);
    const zoomed = zoomTo(WHOLE_MAP, 50, WIDTH, focal);
    const after = boardPoint(zoomed, WIDTH, focal.x, focal.y);

    expect(zoomed.span).toBe(50);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  test('zoom stops at the closest and the whole map', () => {
    expect(zoomTo(WHOLE_MAP, 1, WIDTH, { x: 0, y: 0 }).span).toBe(MIN_SPAN);
    expect(zoomTo(WHOLE_MAP, 400, WIDTH, { x: 0, y: 0 }).span).toBe(100);
  });

  test('dragging moves the board with the finger and never off the edge', () => {
    const zoomed = clampView({ cx: 50, cy: 50, span: 50 });
    const moved = panBy(zoomed, WIDTH, -WIDTH / 5, 0);
    expect(moved.cx).toBeCloseTo(60, 6);
    expect(panBy(zoomed, WIDTH, -10_000, -10_000)).toEqual({ cx: 75, cy: 75, span: 50 });
    expect(panBy(zoomed, WIDTH, 10_000, 10_000)).toEqual({ cx: 25, cy: 25, span: 50 });
  });

  test('the outlines are untouched by any of it', () => {
    const before = JSON.stringify(REGION_SHAPES);
    zoomTo(WHOLE_MAP, 30, WIDTH, { x: 10, y: 10 });
    panBy(clampView({ cx: 50, cy: 50, span: 30 }), WIDTH, 40, 40);
    expect(JSON.stringify(REGION_SHAPES)).toBe(before);
  });
});
