// Companions: people travelling with Kan. While someone is flagged
// (EntityRecord.companion) they are in every scene — the scene cast, presence
// and memories include them whether or not the state tracker listed them —
// until the story shows them leave (or they die). The scenes they share with
// Kan move their bond: the state tracker reports the big swings, and plain
// time together slowly builds familiarity on top.

import { applyBondDiff } from './bonds';
import { displayName } from './names';
import { daysBetween } from './calendar';
import { isDeceased } from './deaths';
import { applyFactDiff } from './facts';
import { resolveEntity } from './entities';
import { clamp, uniqueList } from './util';
import type { AppDatabase, EntityRecord, ScenePace, TurnDiff } from './types';

import { SCENE_CAST_LIMIT } from './sceneLimits';

export { SCENE_CAST_LIMIT };

/** More than this and scenes stop being readable; the scene cast holds six. */
export const MAX_COMPANIONS = 4;

/** Shared-time points per bond step: a calm scene is 1, a fight survived together is 2. */
export const BOND_POINTS_PER_STEP = 3;

/** Time together alone never lifts a bond above this; the story has to earn the rest. */
export const SHARED_TIME_AFFINITY_CAP = 6;

/** Below this, real hostility: familiarity alone does not soften it. */
export const SHARED_TIME_AFFINITY_FLOOR = -2;

function isKan(entity: Pick<EntityRecord, 'name'>) {
  return entity.name.trim().toLowerCase() === 'kan';
}

/** Everyone travelling with Kan right now, longest-standing first. */
export function companionsOf(db: AppDatabase): EntityRecord[] {
  return db.entities
    .filter(
      (entity) =>
        entity.type === 'character' && Boolean(entity.companion) && !isKan(entity) && !isDeceased(entity)
    )
    .sort((a, b) => daysBetween(b.companion!.since, a.companion!.since));
}

export function isCompanion(entity: Pick<EntityRecord, 'companion'> | null | undefined) {
  return Boolean(entity?.companion);
}

/** Whole in-story days together so far. */
export function daysTogether(db: AppDatabase, entity: EntityRecord) {
  return entity.companion ? Math.max(0, daysBetween(entity.companion.since, db.state.inStoryDate)) : 0;
}

export function formatTogether(days: number) {
  if (days <= 0) {
    return 'since today';
  }

  if (days < 60) {
    return days === 1 ? '1 day' : `${days} days`;
  }

  const months = Math.round(days / 30.4);

  return months < 24 ? `about ${months} months` : `about ${Math.round(days / 365)} years`;
}

function updateEntity(db: AppDatabase, id: string, patch: (entity: EntityRecord) => EntityRecord) {
  return { ...db, entities: db.entities.map((entity) => (entity.id === id ? patch(entity) : entity)) };
}

function withCast(db: AppDatabase, cast: string[]): AppDatabase {
  return { ...db, state: { ...db.state, sceneCast: uniqueList(cast.filter(Boolean)).slice(0, SCENE_CAST_LIMIT) } };
}

/** Starts someone travelling with Kan. No-op for Kan, the dead, existing companions, or a full party. */
export function startCompanion(db: AppDatabase, entityId: string, reason?: string): AppDatabase {
  const entity = db.entities.find((item) => item.id === entityId);

  if (
    !entity ||
    entity.type !== 'character' ||
    isKan(entity) ||
    isDeceased(entity) ||
    entity.companion ||
    companionsOf(db).length >= MAX_COMPANIONS
  ) {
    return db;
  }

  const cleanReason = reason?.trim().slice(0, 120) || undefined;
  let next = updateEntity(db, entity.id, (item) => {
    const updated: EntityRecord = {
      ...item,
      companion: {
        since: db.state.inStoryDate,
        sinceLocation: db.state.location || undefined,
        reason: cleanReason,
        sharedScenes: 0,
        bondPoints: 0,
      },
      lastSeen: db.state.inStoryDate,
      lastSeenAt: db.state.location || item.lastSeenAt,
    };
    delete updated.met;
    return updated;
  });

  // A companion always has a bond to move.
  if (!next.bonds.some((bond) => bond.entityId === entity.id)) {
    next = applyBondDiff(next, { entityId: entity.id, character: entity.name, status: 'Travelling with you' });
  }

  next = applyFactDiff(next, {
    action: 'add',
    type: 'event',
    text: `${displayName(next, entity)} began travelling with you${cleanReason ? ` (${cleanReason})` : ''}.`,
    subject: entity.name,
    whoKnows: ['Kan', entity.name],
  });

  return withCast(next, [entity.name, ...(next.state.sceneCast ?? [])]);
}

/** Ends a companionship: the flag goes, a fact records how long it lasted, and they leave the scene. */
export function endCompanion(db: AppDatabase, entityId: string, reason?: string): AppDatabase {
  const entity = db.entities.find((item) => item.id === entityId);

  if (!entity?.companion) {
    return db;
  }

  const days = daysTogether(db, entity);
  const cleanReason = reason?.trim().slice(0, 120) || undefined;
  let next = updateEntity(db, entity.id, (item) => {
    const updated = { ...item };
    delete updated.companion;
    return updated;
  });

  next = applyFactDiff(next, {
    action: 'add',
    type: 'event',
    text: `${displayName(next, entity)} parted ways with you after ${days <= 0 ? 'less than a day' : formatTogether(days)} together${cleanReason ? ` (${cleanReason})` : ''}.`,
    subject: entity.name,
    whoKnows: ['Kan', entity.name],
  });

  // Gone from the scene, unless the story still has them standing there (a death on screen).
  const names = new Set([entity.name, ...entity.aliases].map((name) => name.toLowerCase()));
  const cast = (next.state.sceneCast ?? []).filter((name) => !names.has(name.toLowerCase()));

  return isDeceased(entity) ? next : withCast(next, cast);
}

/** Flips the flag by hand (bond screen), for when the story and the app disagree. */
export function setCompanion(db: AppDatabase, entityId: string, travelling: boolean): AppDatabase {
  return travelling ? startCompanion(db, entityId) : endCompanion(db, entityId);
}

function refId(db: AppDatabase, ref: { entityId?: string; name: string }) {
  if (ref.entityId && db.entities.some((entity) => entity.id === ref.entityId)) {
    return ref.entityId;
  }

  return resolveEntity(db, ref.name)?.id ?? null;
}

/**
 * The turn's joins and partings, after people (and deaths) are applied so
 * someone introduced this turn can join and someone who died is let go.
 */
export function applyCompanionChanges(
  db: AppDatabase,
  diff: TurnDiff,
  options: { presentIds?: ReadonlySet<string> } = {}
): AppDatabase {
  let next = db;

  for (const entity of next.entities) {
    if (entity.companion && isDeceased(entity)) {
      next = endCompanion(next, entity.id, entity.deceased?.cause ? `died: ${entity.deceased.cause}` : 'died');
    }
  }

  for (const leaving of diff.companionsLeft ?? []) {
    const id = refId(next, leaving);

    if (id) {
      next = endCompanion(next, id, leaving.reason);
    }
  }

  for (const joining of diff.companionsJoined ?? []) {
    const id = refId(next, joining);
    const entity = id ? next.entities.find((item) => item.id === id) : undefined;

    // Someone unmet only joins from inside the scene cast: joining never
    // stands in for meeting them.
    if (entity?.met === false && options.presentIds && !options.presentIds.has(entity.id)) {
      continue;
    }

    if (id) {
      next = startCompanion(next, id, joining.reason);
    }
  }

  return next;
}

/** Companion names first, then the rest of the cast: companions are always in the scene. */
export function castWithCompanions(db: AppDatabase, cast: string[]): string[] {
  return uniqueList([...companionsOf(db).map((entity) => entity.name), ...cast]);
}

/**
 * A scene ended with the companions at Kan's side. Each one's count of shared
 * scenes grows; when the state tracker did not move their bond this turn,
 * shared time adds points (fights count double) and every
 * BOND_POINTS_PER_STEP points lift the bond by one — never above
 * SHARED_TIME_AFFINITY_CAP and never out of real hostility. A bond the story
 * moved this turn starts counting again from zero.
 */
export function applySharedScene(
  db: AppDatabase,
  options: { pace?: ScenePace; storyMovedBond: ReadonlySet<string> }
): AppDatabase {
  const companions = companionsOf(db);

  if (companions.length === 0) {
    return db;
  }

  const points = options.pace === 'combat' || options.pace === 'chase' ? 2 : 1;
  let next = db;

  for (const entity of companions) {
    const companion = entity.companion!;
    const moved = options.storyMovedBond.has(entity.id);
    let bondPoints = moved ? 0 : companion.bondPoints + points;
    let step = 0;

    if (bondPoints >= BOND_POINTS_PER_STEP) {
      bondPoints -= BOND_POINTS_PER_STEP;
      step = 1;
    }

    next = updateEntity(next, entity.id, (item) => ({
      ...item,
      companion: { ...companion, sharedScenes: companion.sharedScenes + 1, bondPoints },
    }));

    if (step === 0) {
      continue;
    }

    next = {
      ...next,
      bonds: next.bonds.map((bond) =>
        bond.entityId === entity.id &&
        bond.affinity >= SHARED_TIME_AFFINITY_FLOOR &&
        bond.affinity < SHARED_TIME_AFFINITY_CAP
          ? {
              ...bond,
              affinity: clamp(bond.affinity + step, -10, SHARED_TIME_AFFINITY_CAP),
              updatedInStoryDate: next.state.inStoryDate,
            }
          : bond
      ),
    };
  }

  return next;
}
