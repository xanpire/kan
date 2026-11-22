// The engine's guard on love and trust (audit 6.12). Every romance rule used
// to live only in the narrator prompt, and the engine took whatever the state
// tracker reported, so one reply could take someone from a first meeting to
// "lover" in a single turn. These rules hold whatever the tracker says.
//
// Pure: takes the save before the bond change and the tracker's bond line,
// returns the line it may apply, the marks to store on the bond, and what was
// refused (for the Debug panel).

import { daysBetween, entityAge } from './calendar';
import { hasHeardNews } from './canon';
import { endgamePhase } from './canonEndgame';
import { kanKnowsDeath } from './deaths';
import { loreProfileFor, normalizeAttraction, normalizeRelationship, type Attraction, type RelationshipStage } from './romance';
import type { AppDatabase, BondRecord, CalendarDate, EntityRecord, TurnDiff } from './types';

type BondDiff = NonNullable<TurnDiff['bonds']>[number];

/** Most a bond's feelings move in one turn (decided in the audit brief: ±2); more on a turn that matters (`isBigTurn`). */
export const BOND_STEP = 2;
export const BIG_TURN_BOND_STEP = 4;
/** How long "romantic interest" must hold before "lover". */
export const ROMANCE_BEFORE_LOVER_DAYS = 30;
/** Romance and attraction wait until Kan and the other person are both this old. */
export const ROMANCE_MIN_AGE = 18;

/** The one ladder a relationship climbs, one step per scene. */
export const RELATIONSHIP_LADDER: RelationshipStage[] = [
  'stranger',
  'acquaintance',
  'friendly',
  'close',
  'romantic interest',
  'lover',
];

/** Where a sideways label sits on the ladder, for climbing from it. */
const SIDEWAYS_RUNG: Partial<Record<RelationshipStage, number>> = {
  enemy: 0,
  rival: 1,
  teammate: 2,
  'former teammate': 2,
  'former sensei': 2,
  partner: 2,
  mentor: 2,
  student: 2,
  rejected: 2,
  'old friend': 3,
  family: 3,
  ex: 3,
};

const ATTRACTION_ORDER: Attraction[] = ['none', 'warm', 'strong'];

function rungOf(stage: RelationshipStage) {
  const onLadder = RELATIONSHIP_LADDER.indexOf(stage);
  return onLadder !== -1 ? onLadder : (SIDEWAYS_RUNG[stage] ?? 1);
}

/**
 * The highest Kan's own feelings can reach toward someone he holds a wound
 * against, or null when nothing holds them. Itachi (decided by Xan, 15 Nov
 * 2026): once Kan knows Izumi and Hazuki are dead, the bond is hatred, cold
 * partnership and cracks, and "softens only for real story reasons, slowly".
 * The tracker kept warming it a point a turn because Itachi was steady beside
 * him (Session 4: 3 to 9 in four days), so the engine holds it at a cold
 * working level until Kan learns of the illness or Itachi dies.
 */
export const HELD_FEELINGS_CEILING = 3;
/** The status Itachi's bond is seeded with, from before the night. */
const ITACHI_SEEDED_STATUS = /^closest friend, like an older brother$/i;
export const ITACHI_AFTER_THE_NIGHT = 'He killed Izumi and Hazuki. You go with him anyway.';

export function heldFeelingsCeiling(db: AppDatabase, entity: EntityRecord): number | null {
  if (entity.name !== 'Itachi Uchiha' || entity.deceased || entity.status === 'Deceased') {
    return null;
  }

  const izumi = db.entities.find((item) => item.name === 'Izumi Uchiha');

  if (!izumi || !kanKnowsDeath(db, izumi)) {
    return null;
  }

  if (hasHeardNews(db, 'itachi-illness') || db.state.canonProgress?.completed?.includes('itachi-illness')) {
    return null;
  }

  return HELD_FEELINGS_CEILING;
}

export type BondMarks = Pick<BondRecord, 'stepSceneSeq' | 'attractionSceneSeq' | 'romanticSince'>;

export type GuardedBond = {
  bond: BondDiff;
  marks: BondMarks;
  refused: string[];
};

/**
 * Why this person cannot turn romantic toward Kan right now, or null.
 * The rules already in ROMANCE_RULES, enforced.
 */
export function romanceBlock(db: AppDatabase, entity: EntityRecord): string | null {
  const date = db.state.inStoryDate;
  const profile = loreProfileFor(entity.name);
  const access = profile?.romanceAccessibility ?? entity.romanceAccessibility;

  if (entity.deceased || entity.status === 'Deceased') {
    return 'they are dead';
  }

  // Kan is straight: men are never romance options, whatever their lore says.
  if (entity.gender === 'male' || access === 'not-applicable') {
    return 'romance is not possible with them';
  }

  if (access === 'lore-locked') {
    return 'their heart is lore-locked';
  }

  if (endgamePhase(profile, date) === 'settled') {
    return 'their canon ending has come';
  }

  const kan = db.entities.find((item) => item.name.toLowerCase() === 'kan');
  const kanAge = kan ? entityAge(date, kan) : undefined;
  const theirAge = entityAge(date, entity);

  if (kanAge !== undefined && kanAge < ROMANCE_MIN_AGE) {
    return `you are ${kanAge}; romance waits until you are both adults`;
  }

  if (theirAge !== undefined && theirAge < ROMANCE_MIN_AGE) {
    return `they are ${theirAge}; romance waits until you are both adults`;
  }

  return null;
}

export function guardBondDiff(
  db: AppDatabase,
  entity: EntityRecord,
  existing: BondRecord | undefined,
  bond: BondDiff,
  options: { bigTurn: boolean }
): GuardedBond {
  const refused: string[] = [];
  const marks: BondMarks = {};
  const sceneSeq = db.state.sceneSeq ?? 0;
  const date = db.state.inStoryDate;
  const step = options.bigTurn ? BIG_TURN_BOND_STEP : BOND_STEP;
  const next: BondDiff = { ...bond };
  const who = entity.name;

  const clampDelta = (value: number | undefined, side: string) => {
    if (typeof value !== 'number' || Math.abs(value) <= step) {
      return value;
    }

    const kept = Math.sign(value) * step;
    refused.push(`${who}: ${side} ${value > 0 ? '+' : ''}${value} held to ${kept > 0 ? '+' : ''}${kept} for one turn.`);
    return kept;
  };

  next.affinityDelta = clampDelta(bond.affinityDelta, 'their feelings');
  next.yourDelta = clampDelta(bond.yourDelta, 'your feelings');

  // A wound Kan holds keeps his side down, whatever the tracker says.
  const ceiling = heldFeelingsCeiling(db, entity);

  if (ceiling !== null) {
    const now = existing?.yourFeelings?.affinity ?? existing?.affinity ?? 0;
    const after = now + (next.yourDelta ?? 0);

    if (after > ceiling) {
      const kept = Math.min(next.yourDelta ?? 0, ceiling - now);
      refused.push(`${who}: your feelings held at ${ceiling} or below (what you hold against them has not softened).`);
      next.yourDelta = kept;
    }

    if (existing?.status && ITACHI_SEEDED_STATUS.test(existing.status.trim()) && !next.status) {
      next.status = ITACHI_AFTER_THE_NIGHT;
    }
  }

  // Relationship: one rung up per scene; down or sideways freely.
  const current: RelationshipStage = existing?.relationship ?? 'stranger';
  const asked = normalizeRelationship(bond.relationship);
  const block = romanceBlock(db, entity);

  if (asked && asked !== current && RELATIONSHIP_LADDER.includes(asked)) {
    const from = rungOf(current);
    const to = RELATIONSHIP_LADDER.indexOf(asked);

    if (to > from) {
      let target = RELATIONSHIP_LADDER[Math.min(to, from + 1)];

      if (existing?.stepSceneSeq === sceneSeq) {
        refused.push(`${who}: "${asked}" refused, the relationship already moved this scene.`);
        target = current;
      } else if (target !== asked) {
        refused.push(`${who}: "${asked}" held to "${target}", one step at a time.`);
      }

      if (target === 'romantic interest' || target === 'lover') {
        if (block) {
          refused.push(`${who}: "${target}" refused, ${block}.`);
          target = current;
        } else if (target === 'lover') {
          const since = existing?.romanticSince;
          const held = since ? daysBetween(since, date) : 0;

          if (current !== 'romantic interest' || held < ROMANCE_BEFORE_LOVER_DAYS) {
            refused.push(
              `${who}: "lover" refused, "romantic interest" has held ${held} of ${ROMANCE_BEFORE_LOVER_DAYS} days.`
            );
            target = current;
          }
        }
      }

      if (target === current) {
        delete next.relationship;
      } else {
        next.relationship = target;
        marks.stepSceneSeq = sceneSeq;
      }
    }
  }

  const finalStage = normalizeRelationship(next.relationship) ?? current;

  if (finalStage === 'romantic interest' && current !== 'romantic interest') {
    marks.romanticSince = { ...date } as CalendarDate;
  }

  // Attraction: one level up per scene, and never up where romance is blocked.
  const wanted = normalizeAttraction(bond.attraction);
  const had = existing?.attraction ?? 'none';

  if (wanted && ATTRACTION_ORDER.indexOf(wanted) > ATTRACTION_ORDER.indexOf(had)) {
    if (block) {
      refused.push(`${who}: attraction "${wanted}" refused, ${block}.`);
      delete next.attraction;
    } else if (existing?.attractionSceneSeq === sceneSeq) {
      refused.push(`${who}: attraction "${wanted}" refused, it already moved this scene.`);
      delete next.attraction;
    } else {
      const level = ATTRACTION_ORDER[ATTRACTION_ORDER.indexOf(had) + 1];

      if (level !== wanted) {
        refused.push(`${who}: attraction "${wanted}" held to "${level}".`);
      }

      next.attraction = level;
      marks.attractionSceneSeq = sceneSeq;
    }
  }

  return { bond: next, marks, refused };
}

/** A turn that matters enough for feelings to move further (±4). */
export function isBigTurn(diff: TurnDiff) {
  return Boolean(
    (diff.consequences?.length ?? 0) > 0 ||
      (diff.deaths?.length ?? 0) > 0 ||
      (diff.scene?.ended && diff.scene.importance === 5)
  );
}
