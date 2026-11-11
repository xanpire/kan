// Grudges: the dark mirror of romance.
//
// Love in Kan is slow and earned; so is hatred. When a bond sours far enough
// (affinity at GRUDGE_AFFINITY or below), or the story shows Kan truly wrong
// someone (the state tracker's grudges: wronged), that person starts holding
// a grudge. It lives on their bond:
//
// - heat (0-100) grows while it is left alone (stewing), grows when Kan hurts
//   them again, and cools only when the bond really improves.
// - The stage follows the heat: resentful → vengeful → hunting. Original
//   characters can reach hunting and come after Kan wherever he is. Canon
//   characters stop at vengeful, the way lore-locked hearts never turn: they
//   stay on their canon path and act when paths cross or through others.
// - Now and then a vengeful or hunting grudge is offered to the narrator
//   (SOMEONE WANTS YOU TO PAY) in one style: an ambush, a trap, hired blades,
//   a threat, a message. When the prose shows it, the tracker marks it struck
//   and the clock for the next one starts again.
// - It ends only when the story earns it: real amends (the bond climbs back to
//   LET_GO_AFFINITY), a reckoning they accept (settled), forgiveness, or death.
//
// Each grudge also opens a "grudge" thread, so the narrator treats it as
// binding and the Journal shows it. Everything is deterministic per save and
// turn, so a regenerate gets the same offer.

import { daysBetween } from './calendar';
import { displayName, narratorName } from './names';
import { isCombatPace } from './canon';
import { isCompanion } from './companions';
import { isDeceased } from './deaths';
import { locationKindOf } from './encounters';
import { resolveEntity } from './entities';
import { makeId } from './id';
import { applyFactDiff, applyThreadDiff } from './facts';
import { isOriginalCharacter } from './returning';
import { clamp, hashText, playerTurnCount } from './util';
import type { AppDatabase, BondRecord, CalendarDate, EntityRecord, Grudge, TurnDiff } from './types';

/** A bond this cold turns into a grudge. */
export const GRUDGE_AFFINITY = -6;
/** A grudge fades once the bond climbs back this far. */
export const LET_GO_AFFINITY = -2;

export const VENGEFUL_HEAT = 40;
export const HUNTING_HEAT = 70;

/** Left alone, a grudge gains a point of heat every this many days... */
export const STEW_DAYS = 10;
/** ...up to this much since it last moved. */
export const STEW_CAP = 20;

/** Days between strikes, by stage. */
export const STRIKE_GAP_DAYS = { vengeful: 30, hunting: 14 } as const;
/** A strike this many days overdue is pressed on the narrator every turn. */
export const STRIKE_PRESS_DAYS = 10;
/** Before that, a due strike is offered on one turn in this many. */
const STRIKE_WINDOW_TURNS = 5;
const STRIKE_MIN_TURN = 6;

export type GrudgeStage = 'resentful' | 'vengeful' | 'hunting';

export const GRUDGE_EVENTS = ['wronged', 'struck', 'settled', 'forgiven'] as const;
export type GrudgeEvent = (typeof GRUDGE_EVENTS)[number];

export const GRUDGE_RULES = `ENEMIES
- Hatred is the dark mirror of love: slow, earned, and lasting. Someone Kan truly wronged remembers it. A grudge grows while it is left alone, never fades just because time passed, and ends only when the story earns it: real amends, a reckoning they accept, their revenge, or death.
- People with a grudge act in character and within their canon power. Original characters can hunt Kan down; canon characters stay on their canon path and act when paths cross, or through others (a message, a price, hired blades). They plan, wait, and pick their ground; they are rarely stupid.
- Strangers react to Kan through YOUR NAME OUT THERE: a bounty makes hunters bold and a cloak makes people afraid, but most people never look twice.`;

export function stageFor(heat: number, canCapHunt: boolean): GrudgeStage {
  if (heat >= HUNTING_HEAT && !canCapHunt) return 'hunting';
  if (heat >= VENGEFUL_HEAT) return 'vengeful';
  return 'resentful';
}

/** Heat now, counting the stewing since it last moved. */
export function grudgeHeat(grudge: Grudge, now: CalendarDate): number {
  const quiet = Math.max(0, daysBetween(grudge.updatedOn, now));

  return clamp(grudge.heat + Math.min(STEW_CAP, Math.floor(quiet / STEW_DAYS)), 0, 100);
}

/** Canon characters never leave their path to hunt Kan. */
function huntCapped(entity: EntityRecord | undefined) {
  return !entity || !isOriginalCharacter(entity);
}

export function grudgeStage(db: AppDatabase, bond: BondRecord): GrudgeStage | null {
  if (!bond.grudge) {
    return null;
  }

  const entity = db.entities.find((item) => item.id === bond.entityId);

  return stageFor(grudgeHeat(bond.grudge, db.state.inStoryDate), huntCapped(entity));
}

export const STAGE_LABEL: Record<GrudgeStage, string> = {
  resentful: 'Resentful',
  vengeful: 'Vengeful',
  hunting: 'Hunting you',
};

function threadTitle(name: string) {
  return `${name}'s grudge against you`;
}

function canHold(entity: EntityRecord | undefined): entity is EntityRecord {
  return Boolean(
    entity &&
      entity.type === 'character' &&
      entity.name.trim().toLowerCase() !== 'kan' &&
      !entity.tags.includes('player') &&
      !isDeceased(entity)
  );
}

function setGrudge(db: AppDatabase, entityId: string, grudge: Grudge | undefined): AppDatabase {
  return {
    ...db,
    bonds: db.bonds.map((bond) => {
      if (bond.entityId !== entityId) {
        return bond;
      }

      if (grudge) {
        return { ...bond, grudge };
      }

      const { grudge: _old, ...rest } = bond;

      return rest;
    }),
  };
}

function startGrudge(db: AppDatabase, entity: EntityRecord, heat: number, reason: string): AppDatabase {
  const now = db.state.inStoryDate;
  const grudge: Grudge = {
    since: now,
    reason: reason.slice(0, 160) || 'You wronged them.',
    heat: clamp(Math.round(heat), 0, 100),
    updatedOn: now,
    strikes: 0,
  };

  let next = setGrudge(db, entity.id, grudge);
  next = applyThreadDiff(next, {
    action: 'open',
    type: 'grudge',
    title: threadTitle(displayName(db, entity)),
    description: grudge.reason,
    participants: [entity.name],
  });
  next = applyFactDiff(next, {
    action: 'add',
    type: 'other',
    text: `${displayName(db, entity)} holds a grudge against you: ${grudge.reason}`,
    subject: entity.name,
    whoKnows: [entity.name],
  });

  return next;
}

function endGrudge(db: AppDatabase, entity: EntityRecord, how: 'let-go' | 'settled' | 'forgiven' | 'died', reason?: string) {
  let next = setGrudge(db, entity.id, undefined);
  const outcome: Record<typeof how, string> = {
    'let-go': `${displayName(db, entity)} let go of their grudge against Kan.`,
    settled: `${displayName(db, entity)}'s grudge against Kan was settled${reason ? `: ${reason}` : '.'}`,
    forgiven: `${displayName(db, entity)} forgave Kan${reason ? `: ${reason}` : '.'}`,
    died: `${displayName(db, entity)} died still holding a grudge against Kan.`,
  };

  // Opened under the name Kan knew then: try that name, then the record's own.
  for (const title of [threadTitle(displayName(db, entity)), threadTitle(entity.name)]) {
    const before = next;
    next = applyThreadDiff(next, { action: 'resolve', title, description: outcome[how] });
    if (next !== before) break;
  }

  if (how !== 'died') {
    next = applyFactDiff(next, {
      action: 'add',
      type: 'other',
      text: outcome[how].slice(0, 200),
      subject: entity.name,
      whoKnows: [entity.name, 'Kan'],
    });
  }

  return next;
}

function entityOf(db: AppDatabase, ref: { entityId?: string; name?: string; character?: string }) {
  return (
    (ref.entityId ? db.entities.find((item) => item.id === ref.entityId) : undefined) ??
    resolveEntity(db, ref.name ?? ref.character ?? '') ??
    undefined
  );
}

function bondFor(db: AppDatabase, entityId: string) {
  return db.bonds.find((bond) => bond.entityId === entityId) ?? null;
}

/**
 * Runs after the turn's bonds and deaths. Bond moves heat or cool a grudge
 * (or start one), the tracker's grudge events start, mark or end one, and the
 * dead let go of theirs.
 */
export function applyGrudgeChanges(
  db: AppDatabase,
  diff: TurnDiff,
  options: { presentIds?: ReadonlySet<string> } = {}
): AppDatabase {
  let next = db;
  const now = next.state.inStoryDate;
  const touched = new Set<string>();

  for (const event of diff.grudges ?? []) {
    const entity = entityOf(next, event);

    if (!canHold(entity)) {
      continue;
    }

    const bond = bondFor(next, entity.id);
    const reason = event.reason?.trim() ?? '';
    touched.add(entity.id);

    if (event.event === 'wronged') {
      // Someone unmet who isn't here only hears of it: no grudge, no bond,
      // and they stay unmet. Only the scene cast makes someone met.
      if (entity.met === false && !options.presentIds?.has(entity.id)) {
        continue;
      }

      if (!bond) {
        // Hatred needs a bond to live on; give them one.
        next = {
          ...next,
          bonds: [
            ...next.bonds,
            {
              id: makeId('bond'),
              entityId: entity.id,
              characterName: entity.name,
              affinity: GRUDGE_AFFINITY,
              status: 'Wronged by you',
              lastKeyEventId: null,
              note: reason,
              isMajor: false,
              relationship: 'stranger',
              attraction: 'none',
              updatedInStoryDate: now,
            },
          ],
        };
      }

      const current = bondFor(next, entity.id)!;

      next = current.grudge
        ? setGrudge(next, entity.id, {
            ...current.grudge,
            heat: clamp(grudgeHeat(current.grudge, now) + 25, 0, 100),
            updatedOn: now,
            reason: current.grudge.reason,
          })
        : startGrudge(next, entity, 45, reason || 'You wronged them.');
      continue;
    }

    if (!bond?.grudge) {
      continue;
    }

    if (event.event === 'struck') {
      next = setGrudge(next, entity.id, {
        ...bond.grudge,
        heat: grudgeHeat(bond.grudge, now),
        updatedOn: now,
        lastStrike: now,
        strikes: bond.grudge.strikes + 1,
      });
    } else {
      next = endGrudge(next, entity, event.event, reason || undefined);
    }
  }

  for (const change of diff.bonds ?? []) {
    const entity = entityOf(next, change);

    if (!canHold(entity) || touched.has(entity.id)) {
      continue;
    }

    const bond = bondFor(next, entity.id);
    const delta = typeof change.affinityDelta === 'number' ? change.affinityDelta : 0;

    if (!bond) {
      continue;
    }

    if (bond.grudge) {
      if (bond.affinity >= LET_GO_AFFINITY) {
        next = endGrudge(next, entity, 'let-go');
        continue;
      }

      if (delta !== 0) {
        const heat = grudgeHeat(bond.grudge, now) + (delta < 0 ? -delta * 4 : -delta * 5);
        next = setGrudge(next, entity.id, { ...bond.grudge, heat: clamp(heat, 0, 100), updatedOn: now });
      }

      continue;
    }

    if (delta < 0 && bond.affinity <= GRUDGE_AFFINITY) {
      const reason = (change.note?.trim() || change.status?.trim() || bond.note || bond.status || 'You turned them against you.').slice(0, 160);
      next = startGrudge(next, entity, 30 + (GRUDGE_AFFINITY - bond.affinity) * 5, reason);
    }
  }

  // The dead carry their grudges to the grave.
  for (const bond of next.bonds) {
    if (!bond.grudge) continue;
    const entity = next.entities.find((item) => item.id === bond.entityId);

    if (entity && isDeceased(entity)) {
      next = endGrudge(next, entity, 'died');
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// When they come for him

export type GrudgeOffer = {
  entity: EntityRecord;
  bond: BondRecord;
  grudge: Grudge;
  stage: Exclude<GrudgeStage, 'resentful'>;
  /** Days since the grudge last struck (or began). */
  daysQuiet: number;
  pressed: boolean;
  style: string;
};

function inScene(db: AppDatabase) {
  const ids = new Set<string>();

  for (const name of db.state.sceneCast ?? []) {
    const entity = resolveEntity(db, name);

    if (entity) ids.add(entity.id);
  }

  return ids;
}

/** Everyone whose grudge is due to strike, hottest first. Ignores cadence. */
export function dueGrudges(db: AppDatabase): Array<Omit<GrudgeOffer, 'pressed' | 'style'> & { overdue: number }> {
  const now = db.state.inStoryDate;
  const here = inScene(db);
  const due: Array<Omit<GrudgeOffer, 'pressed' | 'style'> & { overdue: number; heat: number }> = [];

  for (const bond of db.bonds) {
    if (!bond.grudge) continue;
    const entity = db.entities.find((item) => item.id === bond.entityId);

    // At his side or in the scene: they act in the scene itself, not as an offer.
    if (!canHold(entity) || isCompanion(entity) || here.has(entity.id) || entity.met === false) {
      continue;
    }

    const stage = grudgeStage(db, bond);

    if (stage !== 'vengeful' && stage !== 'hunting') {
      continue;
    }

    const daysQuiet = Math.max(0, daysBetween(bond.grudge.lastStrike ?? bond.grudge.since, now));
    const overdue = daysQuiet - STRIKE_GAP_DAYS[stage];

    if (overdue < 0) {
      continue;
    }

    due.push({ entity, bond, grudge: bond.grudge, stage, daysQuiet, overdue, heat: grudgeHeat(bond.grudge, now) });
  }

  return due
    .sort((a, b) => b.heat - a.heat || b.overdue - a.overdue)
    .map(({ heat: _heat, ...item }) => item);
}

function isStrikeTurn(db: AppDatabase, turn: number) {
  if (turn < STRIKE_MIN_TURN) {
    return false;
  }

  const window = Math.floor(turn / STRIKE_WINDOW_TURNS);

  return turn % STRIKE_WINDOW_TURNS === hashText(`${db.meta.slotId}:grudge:${window}`) % STRIKE_WINDOW_TURNS;
}

function styleFor(db: AppDatabase, offer: Omit<GrudgeOffer, 'pressed' | 'style'>, turn: number): string {
  const kind = locationKindOf(db);
  // The narrator writes these lines into the story: names as Kan knows them.
  const name = narratorName(db, offer.entity);
  // Someone Kan cares about, for a hunter who has struck before and failed.
  const dear = db.bonds
    .filter((bond) => bond.affinity >= 5 && bond.entityId !== offer.entity.id && !bond.grudge)
    .map((bond) => db.entities.find((item) => item.id === bond.entityId))
    .find((entity): entity is EntityRecord => Boolean(entity) && !isDeceased(entity!) && !isCompanion(entity));

  const styles =
    offer.stage === 'hunting'
      ? [
          kind === 'settlement'
            ? `${name} waits for night and comes for you where you sleep`
            : `${name} has tracked you here and attacks or confronts you on ground they chose`,
          `a trap ${name} laid on the way you are likely to go: wire, seals, poisoned water, a false trail`,
          `blades ${name} hired: mercenaries or bounty hunters who know your face and your habits`,
          `signs that ${name} is close: watchers, tracks around your camp, a message left where only you would find it`,
          ...(dear && offer.grudge.strikes > 0
            ? [`a threat aimed at ${narratorName(db, dear)} rather than you, so you know ${name} has found what you care about`]
            : []),
        ]
      : [
          `word that ${name} is selling your movements to anyone who pays`,
          `a message from ${name}: a warning, a demand, or a promise of what is coming`,
          `blades ${name} paid to find you, without coming themselves`,
          `${name} turning up in person if this place is on their path, cold and ready`,
        ];

  return styles[hashText(`${db.meta.slotId}:${offer.entity.id}:style:${turn}`) % styles.length];
}

/** The one grudge to offer this turn, or null. Never mid-fight. */
export function grudgeOffer(db: AppDatabase): GrudgeOffer | null {
  if (isCombatPace(db.state.scenePace)) {
    return null;
  }

  const due = dueGrudges(db);

  if (due.length === 0) {
    return null;
  }

  const turn = playerTurnCount(db);
  const pressed = due.find((item) => item.overdue >= STRIKE_PRESS_DAYS);
  const pick = pressed ?? (isStrikeTurn(db, turn) ? due[0] : null);

  if (!pick) {
    return null;
  }

  const { overdue: _overdue, ...offer } = pick;

  return { ...offer, pressed: Boolean(pressed), style: styleFor(db, offer, turn) };
}

function formatAgo(days: number) {
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  if (days < 730) return `${Math.max(2, Math.round(days / 30))} months`;

  return `${Math.round(days / 365)} years`;
}

export function formatGrudgeOffer(db: AppDatabase, offer: GrudgeOffer | null): string {
  if (!offer) {
    return '';
  }

  const { entity, grudge, stage, daysQuiet } = offer;
  const since = formatAgo(Math.max(0, daysBetween(grudge.since, db.state.inStoryDate)));
  const role = entity.role && entity.role !== 'Unknown' ? `, ${entity.role}` : '';
  const last = grudge.lastStrike ? `They last struck ${formatAgo(daysQuiet)} ago.` : 'They have not acted on it yet.';

  return [
    `SOMEONE WANTS YOU TO PAY (${offer.pressed ? 'it has waited too long: bring it in this turn unless it truly cannot fit' : 'optional'})`,
    `${narratorName(db, entity)}${role}, ${stage === 'hunting' ? 'is hunting you' : 'wants revenge'}. They have held this grudge for ${since}: ${grudge.reason} ${last}`,
    `This turn it could come as ${offer.style}.`,
    stage === 'hunting'
      ? 'Show it on the page in their own way and at their canon power. It is this turn\'s encounter; it can be fought, escaped, talked down, or turned around. It does not end the grudge unless the story truly settles it.'
      : 'They are not leaving their own path for this: use it only in a way that fits where they are and what they would do. It is this turn\'s encounter, and it does not end the grudge unless the story truly settles it.',
  ].join('\n');
}

export function grudgeTrackingLines(offer: GrudgeOffer | null, idOf: (entity: EntityRecord) => string): string[] {
  return [
    'grudges: { character_id, event, reason }. wronged: Kan truly wrongs someone this turn (kills or maims someone they love, betrays them, humiliates or ruins them); a cold word is a bond change, not this. struck: someone with a grudge, or people they sent, acts on it on the page this turn. settled: the grudge is truly resolved between them (a reckoning they accept, a debt paid). forgiven: they clearly forgive Kan. Otherwise [].',
    offer ? `This turn's offered grudge is ${idOf(offer.entity)}: struck only if the prose shows their move.` : '',
  ].filter(Boolean);
}
