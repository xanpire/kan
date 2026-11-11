// Delayed consequences (living-world Stage 3, section 11).
//
// A choice that could come back later is kept as a seed: who was involved,
// who saw it, what they would want, and roughly when and where it could come
// back. The state tracker plants them (consequences); intercepted letters
// plant them too (letters.ts).
//
// A seed only comes back when that is realistic: the person is alive and
// could plausibly cross Kan's path (near where they are, or present for a
// lie to come out), and enough time has passed. It comes back softly, as an
// optional offer to the narrator like a personal beat (SOMETHING COMES
// BACK), never forced; the tracker marks it returned when it plays out. A
// witness Kan left alive does not need to find him: when the time comes they
// talk, and the village they talk to wants him more. Seeds that never find a
// fitting moment fade.
//
// Canon characters stay on their canon path: a consequence changes how they
// see Kan, not their story.

import { daysBetween, dateSortValue, shiftDate } from './calendar';
import { isCombatPace } from './canon';
import { castWithCompanions } from './companions';
import { isDeceased } from './deaths';
import { resolveEntity } from './entities';
import { regionOf, travelDaysBetween, whereaboutsRegion, type Region } from './geography';
import { makeId } from './id';
import { grudgeOffer } from './grudges';
import { canonStoryWeight, isCanonFigure } from './lives';
import { applyReputationChanges, VILLAGE_NAME } from './reputation';
import { hashText, playerTurnCount } from './util';
import type { AppDatabase, ConsequenceKind, ConsequenceSeed, EntityRecord, TurnDiff } from './types';
import { narratorName } from './names';

/** Waiting seeds kept at once; the oldest fade first. */
const MAX_WAITING = 24;
/** Ended seeds kept for the world clock. */
const MAX_ENDED = 20;
/** Close enough to cross paths, in shinobi days. */
const CROSS_PATHS_DAYS = 2.5;
/** An eligible seed is pressed (offered every fitting turn) this long after it could first return. */
const PRESS_AFTER_DAYS = 90;
/** How much a witness who talks raises a village's heat. */
const WITNESS_HEAT = 8;

const KINDS = new Set<ConsequenceKind>(['spared', 'lie', 'helped', 'witness', 'betrayal', 'humiliated', 'promise', 'debt', 'intercepted', 'found']);

export function seedsOf(db: AppDatabase): ConsequenceSeed[] {
  return Array.isArray(db.state.consequences) ? db.state.consequences : [];
}

function withSeeds(db: AppDatabase, seeds: ConsequenceSeed[]): AppDatabase {
  const waiting = seeds.filter((seed) => seed.status === 'waiting');
  const ended = seeds.filter((seed) => seed.status !== 'waiting');
  const kept = [...ended.slice(-MAX_ENDED), ...waiting.slice(-MAX_WAITING)];

  return { ...db, state: { ...db.state, consequences: kept } };
}

export function normalizeConsequences(raw: unknown): ConsequenceSeed[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  return raw.filter(
    (seed): seed is ConsequenceSeed =>
      Boolean(seed) &&
      typeof seed === 'object' &&
      typeof seed.id === 'string' &&
      KINDS.has(seed.kind) &&
      Boolean(seed.after) &&
      Boolean(seed.before)
  );
}

function windowDays(when: 'weeks' | 'months' | 'years' | undefined, seed: string): number {
  const roll = hashText(seed);

  switch (when) {
    case 'weeks':
      return 14 + (roll % 28);
    case 'years':
      return 300 + (roll % 600);
    default:
      return 45 + (roll % 120);
  }
}

function isKan(entity: EntityRecord) {
  return entity.name.trim().toLowerCase() === 'kan' || entity.tags.includes('player');
}

/** Someone whose memory of Kan matters to the story. */
export function isImportant(db: AppDatabase, entity: EntityRecord): boolean {
  const bond = db.bonds.find((item) => item.entityId === entity.id);

  return Boolean(
    bond?.isMajor || (bond && Math.abs(bond.affinity) >= 5) || (isCanonFigure(entity) && canonStoryWeight(entity) >= 3)
  );
}

export type NewSeed = Omit<ConsequenceSeed, 'id' | 'createdOn' | 'after' | 'before' | 'status'> & {
  when?: 'weeks' | 'months' | 'years';
};

/** Plants one seed (letters.ts uses this for interceptions). */
export function plantSeed(db: AppDatabase, seed: NewSeed): AppDatabase {
  const now = db.state.inStoryDate;
  const id = makeId('seed');
  const window = windowDays(seed.when, `${db.meta.slotId}:${seed.kind}:${seed.who}:${seed.what}`);
  const after = shiftDate(now, window);
  const { when: _when, ...rest } = seed;

  return withSeeds(db, [
    ...seedsOf(db),
    {
      ...rest,
      id,
      createdOn: now,
      after,
      before: shiftDate(after, Math.max(120, window * 3)),
      status: 'waiting',
    },
  ]);
}

/**
 * The tracker's consequences: plant each, unless the same thing is already
 * waiting. Characters remember it through the seed; nothing is shown to you.
 */
export function applyConsequences(
  db: AppDatabase,
  planted: TurnDiff['consequences'],
  returned: TurnDiff['consequencesReturned'],
  offered: ConsequenceSeed | null
): { db: AppDatabase; remembered: string | null } {
  let next = db;
  let remembered: string | null = null;
  const now = db.state.inStoryDate;

  // Only the offered seed can be marked returned (it was the one in the prompt).
  if (offered && returned?.includes(offered.id)) {
    next = withSeeds(
      next,
      seedsOf(next).map((seed) => (seed.id === offered.id ? { ...seed, status: 'returned', resolvedOn: now } : seed))
    );
  }

  for (const item of planted ?? []) {
    const what = item.what.trim();
    const who = item.who.trim();

    if (!what || !who || !KINDS.has(item.kind)) continue;

    const entity = item.entityId ? next.entities.find((person) => person.id === item.entityId) : resolveEntity(next, who);

    if (entity && isKan(entity)) continue;

    const duplicate = seedsOf(next).some(
      (seed) =>
        seed.status === 'waiting' &&
        seed.kind === item.kind &&
        (seed.entityId ? seed.entityId === entity?.id : seed.who.toLowerCase() === who.toLowerCase())
    );

    if (duplicate) continue;

    const witnesses = (item.witnesses ?? [])
      .map((name) => resolveEntity(next, name)?.id)
      .filter((id): id is string => Boolean(id) && id !== entity?.id);

    next = plantSeed(next, {
      kind: item.kind,
      entityId: entity?.id,
      who: entity?.name ?? who,
      what,
      want: item.want?.trim() || undefined,
      witnesses,
      faction: item.faction,
      region: regionOf(db.state.location) ?? undefined,
      when: item.when,
    });

    if (!remembered && entity && isImportant(next, entity)) {
      remembered = entity.name;
    }
  }

  return { db: next, remembered };
}

/** Seeds whose time ran out fade; witnesses whose time came talk. Runs every turn. */
export function advanceConsequences(db: AppDatabase): AppDatabase {
  const now = db.state.inStoryDate;
  let next = db;
  let changed = false;
  const seeds = seedsOf(db).map((seed) => {
    if (seed.status !== 'waiting') return seed;

    const person = seed.entityId ? db.entities.find((entity) => entity.id === seed.entityId) : null;

    // The person it would come back through is gone.
    if (person && isDeceased(person)) {
      changed = true;
      return { ...seed, status: 'faded' as const, resolvedOn: now };
    }

    if (dateSortValue(now) > dateSortValue(seed.before)) {
      changed = true;
      return { ...seed, status: 'faded' as const, resolvedOn: now };
    }

    // A witness Kan left alive talks: the village they talk to wants him more.
    if (seed.kind === 'witness' && seed.faction && seed.faction !== 'akatsuki' && dateSortValue(now) >= dateSortValue(seed.after)) {
      next = applyReputationChanges(next, [{ faction: seed.faction, change: WITNESS_HEAT, reason: `A witness talked: ${seed.what}` }], []);
      changed = true;
      return { ...seed, status: 'returned' as const, resolvedOn: now };
    }

    return seed;
  });

  return changed ? withSeeds(next, seeds) : db;
}

// ---------------------------------------------------------------------------
// Coming back

function sceneIds(db: AppDatabase): Set<string> {
  const ids = new Set<string>();

  for (const name of castWithCompanions(db, db.state.sceneCast ?? [])) {
    const entity = resolveEntity(db, name);

    if (entity) ids.add(entity.id);
  }

  return ids;
}

function near(a: Region | null, b: Region | null | undefined, days = CROSS_PATHS_DAYS) {
  if (!a || !b) return false;
  return travelDaysBetween(a, b as Region) <= days;
}

/** Could this seed realistically come back here and now? */
export function canReturn(db: AppDatabase, seed: ConsequenceSeed): boolean {
  if (seed.status !== 'waiting' || dateSortValue(db.state.inStoryDate) < dateSortValue(seed.after)) return false;

  const here = sceneIds(db);
  const kind = db.state.locationKind ?? 'wilderness';
  const peopled = kind === 'road' || kind === 'settlement';
  const kanRegion = regionOf(db.state.location) ?? regionOf(db.state.scene);
  const person = seed.entityId ? db.entities.find((entity) => entity.id === seed.entityId) ?? null : null;

  if (person && (isDeceased(person) || (person.companion && !['lie', 'betrayal', 'promise', 'debt'].includes(seed.kind)))) {
    return false;
  }

  switch (seed.kind) {
    // These come out face to face: the person has to be here.
    case 'lie':
    case 'betrayal':
    case 'promise':
    case 'debt':
      return person ? here.has(person.id) : peopled && near(kanRegion, seed.region as Region);
    case 'helped':
      return kanRegion !== null && kanRegion === seed.region && peopled;
    case 'witness':
      // Without a village to talk to, the talk reaches a town near the place.
      return peopled && kind === 'settlement' && near(kanRegion, seed.region as Region, 4);
    case 'found':
      // They come to the place they found, while Kan is there (safehouses.ts searches it while he is away).
      return Boolean(seed.safehouseId) && db.state.safehouses?.current === seed.safehouseId && !db.state.flashbacks?.active;
    case 'intercepted':
      if (seed.faction === 'akatsuki') {
        return db.entities.some((entity) => here.has(entity.id) && entity.tags.includes('akatsuki'));
      }
      return peopled;
    default: {
      // Spared, humiliated: they have to be able to cross his path.
      if (!peopled) return false;
      if (person) {
        if (here.has(person.id)) return true;
        return near(kanRegion, whereaboutsRegion(person) ?? (seed.region as Region));
      }
      return near(kanRegion, seed.region as Region, 3);
    }
  }
}

/** The one seed that may come back this turn, or null. Deterministic per turn. */
export function consequenceOffer(db: AppDatabase): ConsequenceSeed | null {
  if (isCombatPace(db.state.scenePace)) return null;

  const turn = playerTurnCount(db);
  const now = db.state.inStoryDate;
  const eligible = seedsOf(db)
    .filter((seed) => canReturn(db, seed))
    .sort((a, b) => dateSortValue(a.after) - dateSortValue(b.after));

  for (const seed of eligible) {
    const pressed = daysBetween(seed.after, now) >= PRESS_AFTER_DAYS;

    if (pressed || hashText(`${db.meta.slotId}:seed:${seed.id}:${turn}`) % 3 === 0) return seed;
  }

  return null;
}

/** The seed the narrator is offered this turn: only when no grudge takes the turn (one pressure per turn). */
export function turnConsequenceOffer(db: AppDatabase): ConsequenceSeed | null {
  return grudgeOffer(db) ? null : consequenceOffer(db);
}

function agoLabel(days: number) {
  if (days >= 700) return `${Math.round(days / 365)} years`;
  if (days >= 330) return 'about a year';
  if (days >= 50) return `${Math.round(days / 30)} months`;
  return `${Math.max(1, Math.round(days / 7))} weeks`;
}

const HOW: Record<ConsequenceKind, string> = {
  spared: 'They could turn up grateful or bitter: a warning, a favour repaid, or a knife.',
  lie: 'The lie can come out now: something they saw, heard, or were told.',
  helped: 'The people you helped remember: shelter, a warning, food, a door that opens.',
  witness: 'The witness talked: people here have heard a version of it, and it has grown.',
  betrayal: 'They have not forgotten, and they have not forgiven.',
  humiliated: 'They have not forgotten how it felt.',
  promise: 'Someone comes to see whether you kept your word.',
  debt: 'Someone comes to collect.',
  intercepted: '',
  found: 'They know where you stay now: watchers on the approach, a visit, an ambush at night, a question at the door. Show how they found it.',
};

function interceptHow(seed: ConsequenceSeed): string {
  switch (seed.faction) {
    case 'leaf':
      return 'Root read it on the way: watchers, a question put to the person you wrote to, or a Root agent who knows something he should not.';
    case 'akatsuki':
      return 'Zetsu read it: someone in the Akatsuki brings it up, or tests your loyalty.';
    default:
      return `${seed.faction ? VILLAGE_NAME[seed.faction] : 'A village'} read it at a checkpoint: their hunter-nin now know a name tied to you.`;
  }
}

export function formatConsequenceOffer(db: AppDatabase, seed: ConsequenceSeed | null): string {
  if (!seed) return '';

  const person = seed.entityId ? db.entities.find((entity) => entity.id === seed.entityId) : null;
  const ago = agoLabel(daysBetween(seed.createdOn, db.state.inStoryDate));
  const how =
    seed.kind === 'intercepted'
      ? interceptHow(seed)
      : seed.kind === 'found' && seed.faction === 'akatsuki'
        ? 'Someone in the Akatsuki knows of your private place: a question, a test of your loyalty, or Zetsu in the walls.'
        : HOW[seed.kind];
  const canon = person && isCanonFigure(person) ? ' They stay on their canon path; this changes only how they see you.' : '';

  return [
    `SOMETHING COMES BACK (optional: use it only if it fits this scene; never forced). ${ago} ago: ${seed.what} (${person ? narratorName(db, person) : seed.who}).`,
    seed.want ? `What they want now: ${seed.want}.` : '',
    how,
    `Make it realistic: show how it found you.${canon} If it does not fit, leave it for another time.`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function consequenceTrackingLines(seed: ConsequenceSeed | null): string[] {
  const lines = [
    "consequences: only for a real choice someone would remember that could plausibly come back later: you spare an enemy, lie to someone, help a village or a person in need, leave a witness alive after a deed a village would want you for, betray, humiliate, promise, or owe someone. kind (spared, lie, helped, witness, betrayal, humiliated, promise, debt); character_id (their id, or null for someone unnamed); who (their name, or a short description: 'the bandit you spared at the ford'); what (what you did, second person); want (what they would want now); witnesses (ids); faction (the village whose people would hear of it, or null); when (weeks, months, years: how soon it could return). Most turns [].",
  ];

  if (seed) {
    lines.push(`consequence ${seed.id} (${seed.what}): consequences_returned ["${seed.id}"] only if it actually came back on the page this turn.`);
  }

  return lines;
}

/** Applying the turn's offer: remember it was offered today. */
export function markConsequenceOffered(db: AppDatabase, seed: ConsequenceSeed | null): AppDatabase {
  if (!seed) return db;

  return withSeeds(
    db,
    seedsOf(db).map((item) => (item.id === seed.id && item.status === 'waiting' ? { ...item, offeredOn: db.state.inStoryDate } : item))
  );
}

/** Seeds still waiting, soonest first (the world clock screen; spoilers). */
export function waitingConsequences(db: AppDatabase): ConsequenceSeed[] {
  return seedsOf(db)
    .filter((seed) => seed.status === 'waiting')
    .sort((a, b) => dateSortValue(a.after) - dateSortValue(b.after));
}
