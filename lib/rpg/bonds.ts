// Bonds: affinity, status and romance stage for each person Kan knows.

import { priorBondFor } from './priorBonds';
import { resolveEntity } from './entities';
import { makeId } from './id';
import { normalizeAttraction, normalizeRelationship } from './romance';
import { clamp } from './util';
import type { AppDatabase, TurnDiff } from './types';

type BondDiff = NonNullable<TurnDiff['bonds']>[number];

/**
 * A bond status is a short label of who someone is to Kan ("Akatsuki leader",
 * "Travelling with you"). The tracker sometimes writes a story sentence there
 * instead ("The pierced man took your report without warmth: ..."); that is
 * not a label, so it is dropped (undefined) and the caller falls back.
 */
export function statusLabel(status: string | null | undefined): string | undefined {
  const text = status?.trim();

  if (!text) return undefined;
  if (text.length > 40 || text.split(/\s+/).length > 6) return undefined;
  if (/[:;!?]|\.\s|\.$/.test(text)) return undefined;

  return text;
}

export type BondOptions = {
  /**
   * The turn's scene cast. Given for bonds from the state tracker: someone
   * unmet who isn't here gets no bond. Left out by the app's own callers
   * (letters, companions), which only touch people Kan already knows.
   */
  presentIds?: ReadonlySet<string>;
};

/**
 * A bond change. Never marks anyone met (only the scene cast does, and the
 * first-meeting step gives them their first bond), and never creates a
 * person: the tracker adds people through new_characters.
 */
export function applyBondDiff(db: AppDatabase, bond: BondDiff, options: BondOptions = {}): AppDatabase {
  if (!bond?.character || typeof bond.character !== 'string') {
    return db;
  }

  const characterName = bond.character.trim();

  if (!characterName) {
    return db;
  }

  const existingEntity =
    (bond.entityId ? db.entities.find((item) => item.id === bond.entityId) : undefined) ??
    resolveEntity(db, characterName);

  const byEntity = existingEntity
    ? db.bonds.findIndex((item) => item.entityId === existingEntity.id)
    : -1;
  const existingIndex =
    byEntity !== -1
      ? byEntity
      : db.bonds.findIndex(
          (item) => item.characterName.toLowerCase() === characterName.toLowerCase()
        );

  if (!existingEntity) {
    return db;
  }

  // Talked about, not met: no bond until they are in a scene with Kan.
  if (existingEntity.met === false && options.presentIds && !options.presentIds.has(existingEntity.id)) {
    return db;
  }

  if (existingIndex === -1) {
    const bondEntity = existingEntity;

    // Someone who knew Kan before the story starts where they left off.
    const prior = priorBondFor(bondEntity.name);
    const theirs = clamp((prior?.theirFeelings?.affinity ?? 0) + (typeof bond.affinityDelta === 'number' ? bond.affinityDelta : 0), -10, 10);
    const yours = clamp((prior?.yourFeelings?.affinity ?? 0) + (typeof bond.yourDelta === 'number' ? bond.yourDelta : 0), -10, 10);
    const newBond = {
      id: makeId('bond'),
      theirFeelings: { affinity: theirs, note: bond.note?.trim() || prior?.note || '' },
      yourFeelings: { affinity: yours, note: bond.yourNote?.trim() || prior?.yourFeelings?.note || '' },
      entityId: bondEntity.id,
      characterName: bondEntity.name,
      affinity: theirs,
      // With no label from the tracker, the status follows the relationship (test run §3: "Acquaintance" / stranger).
      status: bond.status?.trim() || prior?.status || relationshipStatus(normalizeRelationship(bond.relationship)) || 'Acquaintance',
      lastKeyEventId: null,
      note: bond.note?.trim() || prior?.note || '',
      isMajor: Boolean(bond.isMajor),
      relationship: normalizeRelationship(bond.relationship) ?? prior?.relationship,
      attraction: normalizeAttraction(bond.attraction),
      romanceNote: bond.romanceNote?.trim() || undefined,
      updatedInStoryDate: db.state.inStoryDate,
    };

    return {
      ...db,
      bonds: [...db.bonds, newBond],
    };
  }

  const bonds = [...db.bonds];
  const existing = bonds[existingIndex];

  const affinity = clamp(
    existing.affinity + (typeof bond.affinityDelta === 'number' ? bond.affinityDelta : 0),
    -10,
    10
  );
  const note = bond.note?.trim() || existing.note;
  const yourBefore = existing.yourFeelings ?? { affinity: existing.affinity, note: '' };

  bonds[existingIndex] = {
    ...existing,
    characterName: existingEntity?.name ?? existing.characterName,
    affinity,
    theirFeelings: { affinity, note },
    yourFeelings: {
      affinity: clamp(yourBefore.affinity + (typeof bond.yourDelta === 'number' ? bond.yourDelta : 0), -10, 10),
      note: bond.yourNote?.trim() || yourBefore.note,
    },
    status:
      bond.status?.trim() ||
      (normalizeRelationship(bond.relationship) && GENERIC_STATUS.test(existing.status ?? '')
        ? relationshipStatus(normalizeRelationship(bond.relationship)) ?? existing.status
        : existing.status),
    note,
    isMajor: typeof bond.isMajor === 'boolean' ? bond.isMajor : existing.isMajor,
    relationship:
      normalizeRelationship(bond.relationship) ?? existing.relationship ?? 'stranger',
    attraction:
      normalizeAttraction(bond.attraction) ?? existing.attraction ?? 'none',
    romanceNote: bond.romanceNote?.trim() || existing.romanceNote,
    updatedInStoryDate: db.state.inStoryDate,
  };

  return {
    ...db,
    bonds,
  };
}

/** A status that is only a relationship word, which a new relationship may replace. */
const GENERIC_STATUS = /^(acquaintance|stranger|newly met|friendly|close|old friend|teammate|former teammate|partner|rival|enemy|unknown)?$/i;

/** "old friend" → "Old friend": a relationship as a bond's status label. */
function relationshipStatus(relationship: string | undefined | null): string | undefined {
  if (!relationship || /^(romantic interest|lover|rejected|ex)$/i.test(relationship)) return undefined;
  return relationship.charAt(0).toUpperCase() + relationship.slice(1);
}

/**
 * Keeps theirFeelings in step with affinity/note (the many places that move
 * how someone feels about Kan write those), and gives every bond a yours side.
 */
export function syncBondSides(db: AppDatabase): AppDatabase {
  let changed = false;

  const bonds = db.bonds.map((bond) => {
    const theirs = bond.theirFeelings;
    const inStep = theirs && theirs.affinity === bond.affinity && theirs.note === bond.note && bond.yourFeelings;

    if (inStep) {
      return bond;
    }

    changed = true;
    return {
      ...bond,
      theirFeelings: { affinity: bond.affinity, note: bond.note },
      yourFeelings: bond.yourFeelings ?? { affinity: bond.affinity, note: '' },
    };
  });

  return changed ? { ...db, bonds } : db;
}
