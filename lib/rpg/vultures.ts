// Kan's three vultures are all female (Xan, 23 Nov 2026). Only Kan and Itachi
// know: everyone else says "it" or "the bird" until Kan tells them (a test
// run had Itachi saying "she" while Kan only wrote "her" in his action; that
// was right for Itachi, and would be wrong for anyone else).

import { makeId } from './id';
import type { AppDatabase, FactRecord, LoreRecord } from './types';

export const VULTURES_FEMALE_TEXT = 'Your three vultures, Okuri, Hōmuri and Tomurai, are all female.';

export const VULTURES_FEMALE_LORE =
  'Your vultures Okuri, Hōmuri and Tomurai are all female. Only you and Itachi know it, and he says "she". Anyone else who sees or talks about one says "it", "the bird" or "your vulture", never "she" or "her", until you tell them they are female (then they know: a fact says who has been told). The narration may call them "she", since it is your view.';

export function ensureVultureFacts(db: AppDatabase): AppDatabase {
  const kan = db.entities?.find((entity) => entity.name.toLowerCase() === 'kan');
  const itachi = db.entities?.find((entity) => entity.name === 'Itachi Uchiha');
  if (!kan || !Array.isArray(db.facts) || !Array.isArray(db.loreEntries)) return db;
  let next = db;

  if (!db.facts.some((fact) => fact.text === VULTURES_FEMALE_TEXT)) {
    const fact: FactRecord = {
      id: makeId('fact'),
      subjectEntityId: kan.id,
      type: 'secret',
      text: VULTURES_FEMALE_TEXT,
      whoKnows: [kan.id, ...(itachi ? [itachi.id] : [])],
      validFrom: { ...db.state.inStoryDate },
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: null,
    } as FactRecord;
    next = { ...next, facts: [...next.facts, fact] };
  }

  if (!db.loreEntries.some((lore) => lore.text === VULTURES_FEMALE_LORE)) {
    const lore: LoreRecord = {
      id: makeId('lore'),
      keywords: ['vulture', 'vultures', 'okuri', 'hōmuri', 'homuri', 'tomurai', 'bird', 'birds'],
      priority: 4,
      text: VULTURES_FEMALE_LORE,
      enabled: true,
      hidden: true,
    } as LoreRecord;
    next = { ...next, loreEntries: [...next.loreEntries, lore] };
  }

  return next;
}
