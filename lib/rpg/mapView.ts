// The map board's window (audit 11a): pinch to zoom, drag to pan, double tap
// to look closer. Only the window moves; the outlines in mapShapes.ts are
// never touched. Pure, so the gestures can be tested.

import { MAP_HEIGHT, MAP_WIDTH } from './mapData';

/** The window: its centre and how much of the board it shows, in board units. */
export type MapView = { cx: number; cy: number; span: number };

/** Closest the board zooms in. */
export const MIN_SPAN = 20;
/** At or under this span every place is named (the old "Zoom in" window was 50). */
export const NAMES_SPAN = 60;
/** A double tap zooms in this far. */
export const DOUBLE_TAP_SPAN = 50;

export const WHOLE_MAP: MapView = { cx: MAP_WIDTH / 2, cy: MAP_HEIGHT / 2, span: MAP_WIDTH };

/** Keeps the window on the board and the zoom within bounds. */
export function clampView(view: MapView): MapView {
  const span = Math.max(MIN_SPAN, Math.min(MAP_WIDTH, view.span));
  const half = span / 2;

  return {
    span,
    cx: Math.max(half, Math.min(MAP_WIDTH - half, view.cx)),
    cy: Math.max(half, Math.min(MAP_HEIGHT - half, view.cy)),
  };
}

/** The top-left corner of the window, for the SVG viewBox. */
export function viewOrigin(view: MapView) {
  return { x: view.cx - view.span / 2, y: view.cy - view.span / 2 };
}

/** The board point under a spot on screen (px from the board's top-left). */
export function boardPoint(view: MapView, widthPx: number, x: number, y: number) {
  const origin = viewOrigin(view);
  const scale = widthPx / view.span;
  return { x: origin.x + x / scale, y: origin.y + y / scale };
}

/**
 * Zooms to `span`, keeping the board point under the fingers (`focal`, px)
 * where it was: pinching over the Rain zooms into the Rain.
 */
export function zoomTo(start: MapView, span: number, widthPx: number, focal: { x: number; y: number }): MapView {
  if (!widthPx) return clampView({ ...start, span });

  const anchor = boardPoint(start, widthPx, focal.x, focal.y);
  const next = Math.max(MIN_SPAN, Math.min(MAP_WIDTH, span));
  const ratio = next / start.span;

  return clampView({
    span: next,
    cx: anchor.x + (start.cx - anchor.x) * ratio,
    cy: anchor.y + (start.cy - anchor.y) * ratio,
  });
}

/** Drags the window: the board follows the finger. */
export function panBy(start: MapView, widthPx: number, dx: number, dy: number): MapView {
  if (!widthPx) return start;
  const scale = widthPx / start.span;
  return clampView({ ...start, cx: start.cx - dx / scale, cy: start.cy - dy / scale });
}

/**
 * One step of a pinch: zooms by `scaleChange` around the fingers' midpoint
 * (`focal`, px from the board's top-left) and, when the midpoint itself moved
 * since the last step (`previous`), carries the board along with it. Each
 * step starts from the window as it is now, so a pinch and a drag never
 * fight over where the gesture began.
 */
export function pinchStep(
  view: MapView,
  scaleChange: number,
  widthPx: number,
  focal: { x: number; y: number },
  previous: { x: number; y: number } | null
): MapView {
  if (!widthPx || !Number.isFinite(scaleChange) || scaleChange <= 0) return view;

  const zoomed = zoomTo(view, view.span / scaleChange, widthPx, focal);

  return previous ? panBy(zoomed, widthPx, focal.x - previous.x, focal.y - previous.y) : zoomed;
}

/**
 * What the browser may do with a finger on the board: on the whole map a
 * vertical drag scrolls the page past it; zoomed in, every drag is the map's.
 */
export function boardTouchAction(view: MapView): 'pan-y' | 'none' {
  return view.span < WHOLE_MAP.span ? 'none' : 'pan-y';
}
