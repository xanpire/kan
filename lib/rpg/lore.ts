// Lore entries that switch on or off as the story reaches things: the
// "you have no Sharingan" note ends when it awakens, "Itachi holds back the
// truth" ends once he has explained, and so on.

import { trialOpen } from './akatsukiTrial';
import { kanKnowsDeath } from './deaths';
import type { AppDatabase, LoreCondition, LoreFlag, LoreRecord } from './types';

function hasAbility(db: AppDatabase, pattern: RegExp) {
  return (db.state.player.abilities ?? []).some((ability) => pattern.test(ability.name));
}

/** State flags lore can wait for. */
export const LORE_FLAGS: Record<LoreFlag, (db: AppDatabase) => boolean> = {
  hasSharingan: (db) => hasAbility(db, /sharingan/i),
  hasMangekyo: (db) => hasAbility(db, /mangeky/i),
  knowsIzumiDead: (db) => {
    const izumi = db.entities.find((entity) => entity.name === 'Izumi Uchiha');
    return Boolean(izumi && kanKnowsDeath(db, izumi));
  },
  headbandScratched: (db) =>
    db.state.inventory.some((item) => /(forehead protector|headband)/i.test(item) && /scratch|slash/i.test(item)),
  joinedAkatsuki: (db) => {
    const progress = db.state.canonProgress;
    return Boolean(progress?.completed.includes('kan-joins-akatsuki'));
  },
  // Kan's Akatsuki trial has a mission done well (or ran its two months).
  akatsukiTrialOpen: (db) => trialOpen(db),
  // Someone living is your romantic interest or lover.
  inRomance: (db) =>
    db.bonds.some((bond) => {
      if (bond.relationship !== 'lover' && bond.relationship !== 'romantic interest') return false;
      const entity = db.entities.find((item) => item.id === bond.entityId);
      return Boolean(entity && !entity.deceased);
    }),
};

export function conditionHolds(db: AppDatabase, condition: LoreCondition): boolean {
  if (condition.milestone) {
    const progress = db.state.canonProgress;
    const reached =
      progress?.completed.includes(condition.milestone) || progress?.engaged.includes(condition.milestone);

    if (!reached) return false;
  }

  if (condition.thread) {
    const wanted = condition.thread.trim().toLowerCase();
    const status = condition.threadStatus ?? 'resolved';
    const thread = db.threads.find((item) => item.title.trim().toLowerCase() === wanted);

    if (!thread || thread.status !== status) return false;
  }

  if (condition.fact) {
    const wanted = condition.fact.toLowerCase();

    if (!db.facts.some((fact) => fact.validTo === null && fact.text.toLowerCase().includes(wanted))) return false;
  }

  if (condition.flag && !LORE_FLAGS[condition.flag]?.(db)) {
    return false;
  }

  return true;
}

/** Whether a lore entry applies right now: enabled, past its activeAfter, not yet at its activeUntil. */
export function loreActive(db: AppDatabase, lore: LoreRecord): boolean {
  if (!lore.enabled) return false;
  if (lore.activeAfter && !conditionHolds(db, lore.activeAfter)) return false;
  if (lore.activeUntil && conditionHolds(db, lore.activeUntil)) return false;
  return true;
}
