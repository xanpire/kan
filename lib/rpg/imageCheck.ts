// The swapped-roles check (#14): a cheap vision call after each scene image
// that compares the picture with its ACTION. When the roles came out
// reversed (Kan choking himself instead of the other person), the image is
// redone once with a sharper actor rule built from the check's note.

import { completeChat, type CallUsage } from '../openrouter';
import { loadModelLists, modelSeesImages } from './modelCheck';
import { kanProtectorPlace, kanProtectorScratched } from './kanLook';
import type { AppDatabase } from './types';

export type ImageCheck = {
  rolesOk: boolean;
  extraPeople: boolean;
  /** false: Kan's protector is on his forehead, drawn whole though scratched, or on him with the cloak (audit 11c.1, 14 Nov 2026). */
  protectorOk?: boolean;
  note: string;
  usage: CallUsage;
  model: string;
};

export function imageCheckEnabled(db: Pick<AppDatabase, 'settings'>) {
  return db.settings.imageCheck !== false;
}

/** The vision model for the check: the director's, which defaults to the narrator's. */
export function imageCheckModel(db: Pick<AppDatabase, 'settings'>) {
  return db.settings.imageDirectorModel?.trim() || db.settings.narrationModel;
}

/** Reads the check's JSON, forgiving code fences and stray prose. */
export function parseImageCheck(text: string): { rolesOk: boolean; extraPeople: boolean; protectorOk?: boolean; note: string } | null {
  const match = /\{[\s\S]*\}/.exec(text);

  if (!match) return null;

  try {
    const value = JSON.parse(match[0]) as { roles_ok?: unknown; extra_people?: unknown; protector_ok?: unknown; note?: unknown };

    if (typeof value.roles_ok !== 'boolean') return null;

    return {
      rolesOk: value.roles_ok,
      extraPeople: value.extra_people === true,
      ...(value.protector_ok === false ? { protectorOk: false } : {}),
      note: typeof value.note === 'string' ? value.note.slice(0, 300) : '',
    };
  } catch {
    return null;
  }
}

/** The first person named in the action: who should be doing it. */
function actorOf(action: string) {
  return /^\s*([A-Z][\w'-]*(?:\s[A-Z][\w'-]*)?)/.exec(action)?.[1] ?? 'Kan';
}

export async function checkSceneImage(
  apiKey: string,
  db: AppDatabase,
  image: string,
  action: string,
  signal?: AbortSignal,
  /** Why the check gave no answer, for the Debug log (audit 11c). */
  onFail?: (model: string, reason: string) => void
): Promise<ImageCheck | null> {
  const model = imageCheckModel(db);
  const actor = actorOf(action);
  const protectorQuestion = protectorCheckQuestion(kanProtectorPlace(db), kanProtectorScratched(db));

  // A model that cannot see images would answer "fine" without looking.
  const lists = await loadModelLists().catch(() => null);

  if (lists && !modelSeesImages(lists, model)) {
    onFail?.(model, 'skipped: this model cannot look at images');
    return null;
  }

  try {
    const result = await completeChat({
      apiKey,
      model,
      messages: [
        {
          role: 'user',
          content: `ACTION: ${action}\nIn this image, is ${actor} the one doing the action to the others, or is it reversed (someone else doing it, or ${actor} doing it to himself)? Are there extra people who shouldn't be there (recognisable faces not in the ACTION)? ${protectorQuestion} Answer only JSON: { "roles_ok": true|false, "extra_people": true|false, "protector_ok": true|false, "note": "what is wrong, in one short sentence" }`,
          images: [image],
        },
      ],
      temperature: 0,
      // A thinking model can spend a small allowance thinking and say nothing.
      maxTokens: 600,
      reasoning: { effort: 'low', exclude: true },
      signal,
    });
    const parsed = parseImageCheck(result.text);

    if (!parsed) onFail?.(model, result.text.trim() ? 'answer was not the JSON asked for' : 'empty answer');

    return parsed ? { ...parsed, usage: result.usage, model } : null;
  } catch (error) {
    onFail?.(model, error instanceof Error ? error.message.slice(0, 120) : 'failed');
    return null;
  }
}

/**
 * What the check asks about Kan's Leaf protector (14 Nov 2026): never on his
 * forehead; at his waist before the cloak (scratched once he scratched it);
 * out of sight with the cloak.
 */
export function protectorCheckQuestion(place: 'waist' | 'hidden', scratched: boolean): string {
  if (place === 'hidden') {
    return 'Kan (in the Akatsuki cloak) must wear no Leaf forehead protector at all, on his forehead or anywhere else. protector_ok: false if one is drawn on him.';
  }
  return scratched
    ? "Kan's Leaf protector belongs on his belt at his left hip, never on his forehead, with a horizontal scratch through the Leaf symbol. protector_ok: false if it is on his forehead or drawn whole; true when it is right or not visible."
    : "Kan's Leaf protector belongs on his belt at his left hip, never on his forehead. protector_ok: false if it is on his forehead; true when it is at his waist or not visible.";
}

/** A sharper actor rule for the retry, from what the check saw. */
/** The check found something worth one repaint: reversed roles, or the protector wrong. */
export function checkWantsRepaint(check: Pick<ImageCheck, 'rolesOk' | 'protectorOk'> | null) {
  return Boolean(check && (!check.rolesOk || check.protectorOk === false));
}

export function sharperActorRule(action: string, check: Pick<ImageCheck, 'note' | 'extraPeople' | 'rolesOk' | 'protectorOk'>) {
  const actor = actorOf(action);

  return [
    !check.rolesOk
      ? `CORRECTION: a previous attempt got the roles wrong${check.note ? ` (${check.note.replace(/\.$/, '')})` : ''}. ${actor} is the one DOING the action; the others receive it. Draw it exactly that way round.`
      : '',
    check.extraPeople ? 'CORRECTION: a previous attempt added people who are not in the ACTION. Draw only the people the ACTION names.' : '',
    check.protectorOk === false
      ? `CORRECTION: a previous attempt got Kan's Leaf protector wrong${check.note ? ` (${check.note.replace(/\.$/, '')})` : ''}. It is never on his forehead: before the Akatsuki it hangs on his belt at his left hip (scratched through once he scratched it); with the cloak it is not on him at all.`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}
