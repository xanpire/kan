/** Which reference images go with an image request. Pure, so it can be tested. */
export type ReferenceKind = 'face' | 'outfit' | 'character' | 'cast' | 'alternate' | 'previous' | 'edit';

export type PlannedReference = {
  kind: ReferenceKind;
  uri: string;
  /** For 'character': who it shows, and whether it is their face reference or a painted portrait. */
  name?: string;
  source?: 'face' | 'portrait';
  /** For 'cast': the people on the cast sheet, left to right. */
  names?: string[];
};

/**
 * Picks the references that fit the model's limit, most important first:
 * the image being retouched (only for a retouch), then Kan's face, so it is
 * the last thing to be left out, then his outfit, then the people in the
 * scene (one by one or packed on a cast sheet), then an earlier scene for style.
 * `faceDropped` is true when the face could not be sent, so the caller can
 * warn instead of silently drawing a stranger.
 */
export function planReferences(
  candidates: PlannedReference[],
  maxReferences: number
): {
  references: PlannedReference[];
  /** Why Kan's face isn't in the request, or null when it is. */
  faceDropped: 'no-references' | 'not-loaded' | null;
  leftOut: ReferenceKind[];
} {
  // Other people's faces outrank older scenes: drifting faces are worse than drifting style.
  const order: ReferenceKind[] = ['edit', 'face', 'outfit', 'character', 'cast', 'previous', 'alternate'];
  const available = candidates
    .filter((candidate) => Boolean(candidate.uri))
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        order.indexOf(a.candidate.kind) - order.indexOf(b.candidate.kind) || a.index - b.index
    )
    .map((entry) => entry.candidate);
  const references = available.slice(0, Math.max(0, maxReferences));
  const leftOut = available.slice(references.length).map((reference) => reference.kind);
  const faceLoaded = available.some((reference) => reference.kind === 'face');
  const faceSent = references.some((reference) => reference.kind === 'face');

  return {
    references,
    faceDropped: faceSent ? null : faceLoaded ? 'no-references' : 'not-loaded',
    leftOut,
  };
}

export function faceDroppedWarning(
  reason: 'no-references' | 'not-loaded',
  model: string
) {
  return reason === 'not-loaded'
    ? 'Kan’s face reference couldn’t be loaded, so this image went without it and his face may not match.'
    : `Kan’s face reference wasn’t sent: ${model} doesn’t accept reference images, so his face may not match. Pick a reference-capable image model in Settings.`;
}

export type KanReferences = { face: string; outfit: string; alternate: string };

/**
 * Puts each loaded sheet in its own slot (audit 11c). The old code dropped
 * failed loads with filter(Boolean) and then read by position, so a missing
 * face sheet sent the black outfit as his face. A failed sheet stays ''.
 */
export function pickKanReferences(
  [face, black, akatsuki]: readonly [string, string, string],
  wearsAkatsukiCloak: boolean
): KanReferences {
  return {
    face: face || '',
    outfit: (wearsAkatsukiCloak ? akatsuki : black) || '',
    alternate: (wearsAkatsukiCloak ? black : akatsuki) || '',
  };
}

/** Only image data can be sent: a plain URL is something the image model cannot open. */
export function isImageData(uri: string) {
  return uri.startsWith('data:image/');
}

