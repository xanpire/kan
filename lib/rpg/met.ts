// Meeting someone: the moment a person is first in the scene cast
// (characters_present) they lose the "Not yet met" placeholder and get a bond
// to grow. Nothing else meets them: being named, a bond or grudge change, a
// fact or a character update leaves someone unmet.

import { makeId } from './id';
import { priorBondFor } from './priorBonds';
import type { AppDatabase, BondRecord, EntityRecord } from './types';

export const UNMET_STATUS = 'Not yet met';
export const NEWLY_MET_STATUS = 'Newly met';

/** A placeholder status that says nothing about how they relate to Kan. */
export function isPlaceholderStatus(status: string | undefined) {
  const value = status?.trim().toLowerCase();
  return !value || value === 'not yet met' || value === 'newly met' || value === 'unknown';
}

function isUnmetStatus(status: string | undefined) {
  return status?.trim().toLowerCase() === 'not yet met';
}

function canMeet(entity: EntityRecord) {
  return (
    entity.type === 'character' &&
    entity.name.toLowerCase() !== 'kan' &&
    !entity.deceased &&
    entity.status !== 'Deceased'
  );
}

function newBond(db: AppDatabase, entity: EntityRecord): BondRecord {
  return {
    id: makeId('bond'),
    entityId: entity.id,
    characterName: entity.name,
    affinity: 0,
    status: NEWLY_MET_STATUS,
    lastKeyEventId: null,
    note: '',
    isMajor: false,
    relationship: 'stranger',
    attraction: 'none',
    updatedInStoryDate: db.state.inStoryDate,
    // Someone who knew Kan before the story starts where they left off.
    ...(priorBondFor(entity.name) ?? {}),
  };
}

/**
 * Marks these people as met: met flag on, "Not yet met" becomes "Newly met",
 * and anyone without a bond gets one.
 */
export function markMet(db: AppDatabase, entityIds: Iterable<string>): AppDatabase {
  const ids = new Set(entityIds);

  if (ids.size === 0) {
    return db;
  }

  const bonded = new Set(db.bonds.map((bond) => bond.entityId));
  const bonds = [...db.bonds];
  let changed = false;

  const entities = db.entities.map((entity) => {
    if (!ids.has(entity.id) || !canMeet(entity)) {
      return entity;
    }

    let next = entity;

    if (entity.met === false || isUnmetStatus(entity.status)) {
      next = {
        ...entity,
        met: true,
        status: isUnmetStatus(entity.status) ? NEWLY_MET_STATUS : entity.status,
      };
      changed = true;
    }

    // A one-scene character gets no bond card unless they come back.
    if (!bonded.has(entity.id) && entity.tier !== 'minor') {
      bonds.push(newBond(db, next));
      bonded.add(entity.id);
      changed = true;
    }

    return next;
  });

  return changed ? { ...db, entities, bonds } : db;
}

/**
 * After a turn: everyone met for the first time this turn (unmet before, or
 * new to the save) gets marked properly. Also clears a stray "Not yet met"
 * left on anyone already met.
 */
export function settleNewlyMet(before: AppDatabase, after: AppDatabase): AppDatabase {
  const previous = new Map(before.entities.map((entity) => [entity.id, entity]));
  const firstSeen: string[] = [];

  for (const entity of after.entities) {
    if (!canMeet(entity) || entity.met === false) {
      continue;
    }

    const old = previous.get(entity.id);

    if (!old || old.met === false || isUnmetStatus(entity.status)) {
      firstSeen.push(entity.id);
    }
  }

  return markMet(after, firstSeen);
}

/**
 * Repairs saves from before this fix: anyone met but still labelled
 * "Not yet met" gets "Newly met" and, if they lack one, a bond.
 */
export function repairUnmetLabels(db: AppDatabase): AppDatabase {
  const stuck = db.entities
    .filter((entity) => canMeet(entity) && entity.met !== false && isUnmetStatus(entity.status))
    .map((entity) => entity.id);

  return markMet(db, stuck);
}
