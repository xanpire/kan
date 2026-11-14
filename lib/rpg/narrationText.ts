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

/**
 * How Kan's own turn is drawn. Only "quoted text" is speech; everything else
 * is what he does or thinks. When a turn has both, the speech stays plain and
 * the rest is dim italics; a turn with no speech at all is left plain, since
 * there is nothing to tell apart. Asterisks from older turns still mark
 * actions and are never shown.
 */
export function playerSegments(text: string): NarrationSegment[] {
  const out: NarrationSegment[] = [];
  const push = (piece: string, action: boolean) => {
    if (!piece) return;
    const last = out[out.length - 1];
    if (last && last.action === action) last.text += piece;
    else out.push({ text: piece, action });
  };
  const hasSpeech = /"[^"\n]*"|“[^”\n]*”/.test(text);

  for (const part of text.split(ACTION_SPAN)) {
    if (!part) continue;

    const starred = part.length > 2 && part.startsWith('*') && part.endsWith('*');
    const body = starred ? part.slice(1, -1) : part;

    if (!starred && !hasSpeech) {
      push(body, false);
      continue;
    }

    for (const piece of body.split(QUOTE)) {
      if (!piece) continue;
      const quoted = /^["“]/.test(piece);
      // Whitespace between two pieces takes the style of what came before it.
      push(piece, piece.trim().length > 0 ? !quoted : (out[out.length - 1]?.action ?? false));
    }
  }

  return out;
}
