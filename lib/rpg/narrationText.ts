/**
 * How a reply's paragraph is drawn: `*action lines*` in the dim italic style
 * without their asterisks, everything else plain (audit 10.1, decided by Xan).
 * Speech is never italic, even when the narrator wraps it in asterisks.
 */
export type NarrationSegment = { text: string; action: boolean };

const ACTION_SPAN = /(\*[^*\n]+\*)/g;
const QUOTE = /("[^"\n]*"|“[^”\n]*”)/g;

export function narrationSegments(paragraph: string): NarrationSegment[] {
  const out: NarrationSegment[] = [];
  const push = (text: string, action: boolean) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.action === action) last.text += text;
    else out.push({ text, action });
  };

  for (const part of paragraph.split(ACTION_SPAN)) {
    if (!part) continue;

    const isAction = part.length > 2 && part.startsWith('*') && part.endsWith('*');

    if (!isAction) {
      push(part, false);
      continue;
    }

    for (const piece of part.slice(1, -1).split(QUOTE)) {
      if (!piece) continue;
      const quoted = /^["“]/.test(piece);
      push(piece, !quoted && piece.trim().length > 0);
    }
  }

  return out;
}
