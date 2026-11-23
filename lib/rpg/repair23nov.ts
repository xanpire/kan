// One-time repair for saves touched by two bugs found in the test run of
// 23 Nov 2026 (save slot_mwtlxm6u1pumwg):
// 1. "Water runs down your neck … your forehead protector sits at your left
//    hip" read as Kan scratching his protector, so it turned "scratched
//    through" on the first turn without Kan ever doing it.
// 2. Itachi got a grudge against Kan for the massacre ("He killed Hazuki and
//    Izumi…"), Kan's anger filed on the wrong side.

import { ITACHI_AFTER_THE_NIGHT, ITACHI_AFTER_THE_NIGHT_OLD } from './bondGuard';
import { applyThreadDiff } from './facts';
import { isTheirOwnDeed } from './grudges';
import { isScratchedProtector, scratchProtectorFromProse } from './inventory';
import type { AppDatabase } from './types';

const KAN_SCRATCHES = /\b(scratch\w*|carv\w*|goug\w*|slash\w*|cut\w*)\b/i;

export function repairTestRun23Nov(db: AppDatabase): AppDatabase {
  if (!db.state || db.state.repaired23Nov || !Array.isArray(db.rawLog)) return db;
  let next: AppDatabase = { ...db, state: { ...db.state, repaired23Nov: true } };

  // 1. Unscratch a protector nothing on the page scratched.
  const inventory = Array.isArray(next.state.inventory) ? next.state.inventory : [];
  const index = inventory.findIndex((item) => isScratchedProtector(item));
  if (index !== -1) {
    const story = next.rawLog.filter((entry) => entry.kind === 'story' || !entry.kind);
    const shown = story.some(
      (entry) =>
        (entry.role === 'assistant' && scratchProtectorFromProse(['Hidden Leaf headband'], entry.content) !== null) ||
        (entry.role === 'user' && KAN_SCRATCHES.test(entry.content) && /\b(headband|protector|plate)\b/i.test(entry.content))
    );
    if (!shown) {
      const items = [...inventory];
      items[index] = 'Hidden Leaf headband';
      next = { ...next, state: { ...next.state, inventory: items } };
    }
  }

  // 3 (below 2). Itachi's status said you go with him before you chose.
  next = {
    ...next,
    bonds: (next.bonds ?? []).map((bond) => (bond.status === ITACHI_AFTER_THE_NIGHT_OLD ? { ...bond, status: ITACHI_AFTER_THE_NIGHT } : bond)),
  };

  // 2. Grudges whose reason has them doing the harm.
  const wrong = new Set<string>();
  for (const entity of next.entities ?? []) {
    const prefix = `${entity.name} holds a grudge against you: `;
    for (const fact of next.facts ?? []) {
      if (fact.subjectEntityId === entity.id && fact.text.startsWith(prefix) && isTheirOwnDeed(entity, fact.text.slice(prefix.length))) {
        wrong.add(entity.id);
      }
    }
  }
  if (wrong.size > 0) {
    const names = next.entities.filter((entity) => wrong.has(entity.id)).map((entity) => entity.name);
    const grudgeFact = (text: string) =>
      names.some((name) => text.startsWith(`${name} holds a grudge against you`) || text.startsWith(`${name} let go of their grudge`));
    next = {
      ...next,
      facts: next.facts.filter((fact) => !(wrong.has(fact.subjectEntityId ?? "") && grudgeFact(fact.text))),
      threads: next.threads.filter((thread) => !(thread.type === 'grudge' && names.some((name) => thread.title === `${name}'s grudge against you`))),
      bonds: next.bonds.map((bond) => {
        if (!wrong.has(bond.entityId) || !bond.grudge) return bond;
        const { grudge: _drop, ...rest } = bond;
        return rest;
      }),
    };
  }
  return settleItachiExplains(next);
}

/**
 * "Make Itachi explain" (seeded) is answered once Itachi has told Kan why:
 * the tracker opened and closed its own "Why did Itachi kill the clan?"
 * instead, so the seeded one stayed open and kept the "tell him the truth"
 * lore live (test run 23 Nov: the narrator kept re-explaining the coup).
 */
export function settleItachiExplains(db: AppDatabase): AppDatabase {
  const open = (db.threads ?? []).find((thread) => thread.title === 'Make Itachi explain' && thread.status === 'open');
  if (!open) return db;
  const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha');
  const told =
    (db.state.alreadySaid ?? []).some((said) => /why itachi killed the clan|\bcoup\b/i.test(said.text)) ||
    (db.facts ?? []).some((fact) => fact.subjectEntityId === itachi?.id && /\bcoup\b/i.test(fact.text) && fact.whoKnows.includes(db.entities.find((entity) => entity.name.toLowerCase() === 'kan')?.id ?? ''));
  if (!told) return db;
  return applyThreadDiff(db, { action: 'resolve', title: open.title });
}
