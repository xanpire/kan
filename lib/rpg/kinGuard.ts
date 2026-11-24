// Kinship words belong to whoever says them (third test, 23 Nov 2026):
// Itachi said "Father and Mother in the main hall of our home", and the
// tracker filed "your parents in the main hall of your home". Kan's parents,
// Erisa and Banri, died in the Nine-Tails attack, eight years before the story.

import type { AppDatabase, EntityRecord } from './types';

const YOUR_PARENTS = /\byour (parents|mother|father|mom|dad)\b/i;
const KAN_PARENTS_OWN = /\b(nine-tails|kyūbi|kyubi|erisa|banri|uzushio)\b/i;
/** Only where someone's parents lie dead: "your father's scrolls" is still Kan's father. */
const DEAD_SOMEWHERE = /\b(fell|lay|lies|lying|found|died|dead|killed|bod(?:y|ies)|corpses?)\b/i;
const kinTouches = (text: string) => YOUR_PARENTS.test(text) && DEAD_SOMEWHERE.test(text) && !KAN_PARENTS_OWN.test(text);

function pronoun(entity: EntityRecord | undefined) {
  if (!entity) return null;
  if (entity.gender === 'female') return 'her';
  if (entity.gender === 'male') return 'his';
  return 'their';
}

function speakerOf(db: AppDatabase, ref: string | undefined): EntityRecord | undefined {
  if (!ref) return undefined;
  const key = ref.trim().toLowerCase();
  return db.entities?.find(
    (entity) =>
      entity.id === ref ||
      entity.name.toLowerCase() === key ||
      entity.name.toLowerCase().replace(/\s+/g, '-') === key ||
      (entity.aliases ?? []).some((alias) => alias.toLowerCase() === key)
  );
}

/**
 * A line that puts "your parents" somewhere new: rewritten to the speaker's
 * own ("his parents … his home") when someone said it, null when nobody did
 * (it can't be Kan's), and unchanged when it is about Kan's own parents.
 */
export function speakerKin(db: AppDatabase, text: string, speakerRef?: string): string | null {
  if (!kinTouches(text)) return text;
  const speaker = speakerOf(db, speakerRef);
  if (!speaker || speaker.name.toLowerCase() === 'kan') return null;
  const own = pronoun(speaker)!;
  return text
    .replace(/\byour (parents|mother|father|mom|dad)\b/gi, `${own} $1`)
    .replace(/\byour (home|house|family['’]s house|family)\b/gi, `${own} $1`);
}

/** Old saves: facts and profile lines that filed someone's parents as Kan's. */
export function repairSpeakerKin(db: AppDatabase): AppDatabase {
  if (!Array.isArray(db.facts) || !Array.isArray(db.entities)) return db;
  let changed = false;
  const facts = db.facts.flatMap((fact) => {
    if (fact.validTo !== null || !kinTouches(fact.text) || !fact.claimedBy) return [fact];
    const text = speakerKin(db, fact.text, fact.claimedBy);
    if (text === fact.text) return [fact];
    changed = true;
    return text ? [{ ...fact, text }] : [];
  });
  const entities = db.entities.map((entity) => {
    if (!Array.isArray(entity.kanView)) return entity;
    let viewChanged = false;
    const kanView = entity.kanView.map((line) => {
      if (!kinTouches(line.text)) return line;
      const text = speakerKin(db, line.text, line.toldBy ?? entity.id);
      if (!text || text === line.text) return line;
      viewChanged = true;
      return { ...line, text };
    });
    if (!viewChanged) return entity;
    changed = true;
    return { ...entity, kanView };
  });
  return changed ? { ...db, facts, entities } : db;
}
