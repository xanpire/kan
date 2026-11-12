// The image viewer turned on its side (audit 11c, decided by Xan): scene
// images stay 16:9, so on an upright phone the viewer turns them a quarter
// turn to fill the screen instead of showing a thin strip. Pure helpers.

/** Turn by default when the space is taller than it is wide. */
export function turnByDefault(width: number, height: number) {
  return height > width;
}

/**
 * The image's box inside a space of `width` × `height` once turned a quarter
 * turn clockwise: its own width runs down the screen.
 */
export function turnedBox(width: number, height: number) {
  return { width: Math.max(0, height), height: Math.max(0, width) };
}

/**
 * A drag on the screen, in the turned image's own axes: with a quarter turn
 * clockwise, its x axis points down the screen and its y axis points left.
 */
export function dragInTurnedFrame(dx: number, dy: number) {
  'worklet';
  return { x: dy, y: -dx };
}
