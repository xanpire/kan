import { describe, expect, test } from 'bun:test';
import { dragInTurnedFrame, turnByDefault, turnedBox } from '../lib/rpg/viewerTurn';

describe('the image viewer turns on an upright phone (audit 11c)', () => {
  test('opens turned only when the screen is taller than wide', () => {
    expect(turnByDefault(390, 844)).toBe(true);
    expect(turnByDefault(1280, 800)).toBe(false);
  });

  test('the turned box swaps the sides, so a 16:9 image fills the height', () => {
    expect(turnedBox(350, 600)).toEqual({ width: 600, height: 350 });
  });

  test('a drag follows the finger in the turned frame', () => {
    // Dragging down the screen moves along the turned image's own x axis.
    expect(dragInTurnedFrame(0, 50)).toEqual({ x: 50, y: -0 });
    expect(dragInTurnedFrame(30, 0)).toEqual({ x: 0, y: -30 });
  });
});
