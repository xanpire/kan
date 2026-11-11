// News delivery: who brings Kan the news, and how it reaches him.
//
// canon.ts decides WHAT Kan has not heard yet. This module decides how the
// next piece reaches him this turn:
//
// - Bearers: anyone in the scene who could plausibly know (a companion, an
//   original contact, a local in a town) is offered first, then the fixed
//   lists from canonData.ts, with the dead removed.
// - Delivery style: one way of hearing it that fits the place and the kind
//   of news (teahouse gossip, a new bounty poster, a wounded messenger, a
//   sealed scroll at a dead drop, a summoned animal...). The pick is
//   deterministic per turn, so a regenerate gets the same one, and it varies
//   from turn to turn.
// - Catch-up reports: when Kan has heard nothing for a while (a time skip, a
//   long stretch in the wilds) and news has piled up, it can come as ONE
//   report — a bundle of letters at an inn, a companion catching him up over
//   a fire — covering several events at once.

import {
  NEWS_PER_TURN,
  PERSONAL_OFFERS_PER_TURN,
  activeCanonMilestones,
  upcomingCanonMilestones,
  isCombatPace,
  lastNewsHeardDate,
  newsUrgency,
  unheardCanonNews,
  type UnheardNews,
} from './canon';
import { displayName, narratorName } from './names';
import { BEARER_TENURE } from './canonData';
import { daysBetween } from './calendar';
import { castWithCompanions } from './companions';
import { isDeceased } from './deaths';
import { locationKindOf } from './encounters';
import { resolveEntity } from './entities';
import { isOriginalCharacter } from './returning';
import { hashText, playerTurnCount, uniqueList } from './util';
import type { AppDatabase, EntityRecord, LocationKind } from './types';

/** Kan has heard nothing for this many in-story days: piled-up news comes as one report. */
export const CATCH_UP_QUIET_DAYS = 14;

/** At most this many events in one catch-up report. */
export const CATCH_UP_MAX = 4;

export type NewsOffer = {
  mode: 'single' | 'catch-up';
  items: OfferedNews[];
  /** How it reaches Kan this time. */
  style: string;
  /** catch-up: days since Kan last heard any news. */
  quietDays: number;
};

export type OfferedNews = UnheardNews & {
  /** People in the scene who could know, best first, with a short label. */
  sceneBearers: string[];
  /** The fixed fallbacks, minus the dead and anyone already in the scene. */
  otherBearers: string[];
  urgency: 'fresh' | 'due' | 'overdue';
};

// ---------------------------------------------------------------------------
// Bearers

function isKan(entity: EntityRecord) {
  return entity.name.trim().toLowerCase() === 'kan' || entity.tags.includes('player');
}

function sceneEntities(db: AppDatabase): EntityRecord[] {
  const names = castWithCompanions(db, db.state.sceneCast ?? []);
  const seen = new Set<string>();
  const people: EntityRecord[] = [];

  for (const name of names) {
    const entity = resolveEntity(db, name);

    if (!entity || seen.has(entity.id) || isKan(entity) || isDeceased(entity)) {
      continue;
    }

    seen.add(entity.id);
    people.push(entity);
  }

  return people;
}

function profileText(entity: EntityRecord) {
  return `${entity.role ?? ''} ${entity.status ?? ''} ${entity.notes ?? ''} ${entity.tags.join(' ')}`.toLowerCase();
}

function sameEntity(db: AppDatabase, entity: EntityRecord, names: string[]) {
  return names.some((name) => resolveEntity(db, name)?.id === entity.id);
}

/** Could this person in the scene plausibly know about this event? */
export function couldKnow(db: AppDatabase, entity: EntityRecord, item: UnheardNews): boolean {
  const named = item.bearers;

  switch (item.knowledge) {
    case 'secret':
    case 'witnesses':
      return sameEntity(db, entity, named);
    case 'akatsuki':
      // Canon members know the organization's business only while they are in it.
      if (!inTenure(db, entity.name)) return false;
      return entity.tags.includes('akatsuki') || /akatsuki/.test(profileText(entity)) || sameEntity(db, entity, named);
    case 'village':
      return entity.tags.includes('leaf') || /\bleaf\b/.test(profileText(entity)) || sameEntity(db, entity, named);
    case 'public':
    default:
      // Public news is everywhere: anyone in the scene may have heard it.
      return true;
  }
}

function bearerLabel(db: AppDatabase, entity: EntityRecord) {
  const name = narratorName(db, entity);
  if (entity.companion) return `${name} (travelling with you)`;
  if (isOriginalCharacter(entity)) return `${name} (here with you; someone you know)`;
  return `${name} (here with you)`;
}

/** Locals who carry public talk, by kind of place. */
const LOCAL_BEARERS: Partial<Record<LocationKind, string>> = {
  settlement: 'someone local here (an innkeeper, a teahouse regular, a bounty-board keeper)',
  road: 'a traveler or merchant passing on this road',
};

function sceneBearersFor(db: AppDatabase, item: UnheardNews, present: EntityRecord[]): string[] {
  const knowing = present
    .filter((entity) => couldKnow(db, entity, item))
    // Companions first: they are the ones Kan talks to.
    .sort((a, b) => Number(Boolean(b.companion)) - Number(Boolean(a.companion)));
  const labels = knowing.map((entity) => bearerLabel(db, entity));
  const local = item.knowledge === 'public' ? LOCAL_BEARERS[locationKindOf(db)] : undefined;

  return local ? [...labels, local] : labels;
}

/** True while a fixed bearer belongs to the organization (see BEARER_TENURE). */
export function inTenure(db: AppDatabase, name: string): boolean {
  const tenure = BEARER_TENURE[name];

  if (!tenure) {
    return true;
  }

  const completed = new Set(db.state.canonProgress?.completed ?? []);

  if (tenure.joins && !completed.has(tenure.joins)) {
    return false;
  }

  return !(tenure.leaves && completed.has(tenure.leaves));
}

/**
 * The fixed list for an event, minus the dead, anyone not (or no longer) in
 * the organization at this point in the story, and anyone already in the scene.
 */
export function livingBearers(db: AppDatabase, item: UnheardNews, present: EntityRecord[] = []): string[] {
  const presentIds = new Set(present.map((entity) => entity.id));

  return uniqueList(
    item.bearers.filter((name) => {
      if (!inTenure(db, name)) {
        return false;
      }

      const entity = resolveEntity(db, name);

      return !entity || (!isDeceased(entity) && !presentIds.has(entity.id));
    })
  );
}

// ---------------------------------------------------------------------------
// Delivery styles

const PLACE_STYLES: Record<LocationKind, string[]> = {
  settlement: [
    'gossip overheard at the next table in a teahouse or tavern',
    'a fresh poster nailed to the bounty board, still smelling of ink',
    'a town crier or a notice read aloud at the gate',
    'a merchant grumbling about prices, because a border closed or a road turned dangerous',
    'the innkeeper passing it on while pouring tea',
    'a cheap broadsheet or wanted notice changing hands in the market',
  ],
  road: [
    'a wounded or exhausted messenger met on the road',
    'a merchant comparing prices, because a border closed or a route shut',
    'travelers or refugees heading the other way, talking about what they left behind',
    'a checkpoint with doubled guards and new orders posted',
    'a caravan guard swapping stories at a waystation',
  ],
  wilderness: [
    'a summoned animal or a messenger bird that finds you',
    'a sealed scroll waiting at a dead drop',
    'a hunter or woodcutter who heard it in the last town',
    'a lone shinobi crossing your path, talking more than they should',
  ],
  structure: [
    'a sealed scroll waiting at a dead drop',
    'a message left where only a shinobi would look',
    'a summoned animal or a messenger bird that finds you',
  ],
};

const KNOWLEDGE_STYLES: Partial<Record<UnheardNews['knowledge'], string[]>> = {
  akatsuki: [
    "Itachi's crow, or Konan's paper butterfly unfolding into a message",
    'Zetsu rising out of the ground or a wall with a report',
    "a summons through your ring: the Leader's projection passes it on",
    'a coded scroll at an Akatsuki dead drop',
  ],
  village: [
    'a Leaf messenger hawk overhead, or a Leaf patrol overheard at a distance',
    'an updated bingo book or Leaf bulletin that changed hands',
  ],
  secret: ['told privately, face to face, away from other ears'],
  witnesses: ['someone who was actually there, still shaken, telling it'],
};

const CATCH_UP_STYLES: Record<LocationKind, string[]> = {
  settlement: [
    'a bundle of letters, notices, and messages waiting for you at an inn',
    'an informant or contact in town running through everything that changed',
    'a stack of old broadsheets and bounty posters at the waystation, read one after another',
  ],
  road: [
    'a long talk at a waystation with travelers who have heard it all',
    'a merchant caravan full of news from every border it crossed',
  ],
  wilderness: [
    'a messenger bird carrying a whole bundle of messages at once',
    'a dead drop stuffed with weeks of unread scrolls',
  ],
  structure: [
    'a dead drop stuffed with weeks of unread scrolls',
    'a ring summons where the Leader runs through what the organization learned',
  ],
};

function pick<T>(list: T[], seed: string): T {
  return list[hashText(seed) % list.length];
}

function turnSeed(db: AppDatabase) {
  return `${db.meta.slotId}:${playerTurnCount(db)}`;
}

function singleStyle(db: AppDatabase, item: OfferedNews, present: EntityRecord[]): string {
  const knowledgeStyles = KNOWLEDGE_STYLES[item.knowledge] ?? [];

  // Secret and witnessed news only travels face to face.
  if (item.knowledge === 'secret' || item.knowledge === 'witnesses') {
    return knowledgeStyles[0];
  }

  const pool = [...PLACE_STYLES[locationKindOf(db)], ...knowledgeStyles];
  const knowingCompanion = present.find((entity) => entity.companion && couldKnow(db, entity, item));

  if (knowingCompanion) {
    pool.push(`${displayName(db, knowingCompanion)} bringing it up in passing, from word they picked up`);
  }

  // Overdue news cannot wait for a chance meeting: it comes looking for Kan.
  if (item.urgency === 'overdue') {
    return pick(
      [item.channel, 'a messenger bird or a summoned animal that finds you', 'a rider or runner who tracked you down'],
      `${turnSeed(db)}:${item.eventId}`
    );
  }

  return pick(pool, `${turnSeed(db)}:${item.eventId}`);
}

function catchUpStyle(db: AppDatabase, present: EntityRecord[]): string {
  const companion = present.find((entity) => entity.companion);
  const pool = [...CATCH_UP_STYLES[locationKindOf(db)]];

  if (companion) {
    pool.unshift(`${displayName(db, companion)} catching you up over a fire on everything they have heard`);
  }

  return pick(pool, `${turnSeed(db)}:catch-up`);
}

// ---------------------------------------------------------------------------
// The offer

function offered(db: AppDatabase, item: UnheardNews, present: EntityRecord[]): OfferedNews {
  return {
    ...item,
    sceneBearers: sceneBearersFor(db, item, present),
    // As Kan knows them: the masked man is not "Tobi" to him before he hears it.
    otherBearers: livingBearers(db, item, present).map((name) => {
      const entity = db.entities.find((person) => person.type === 'character' && person.name === name);

      return entity ? narratorName(db, entity) : name;
    }),
    urgency: newsUrgency(item),
  };
}

/**
 * The news that may reach Kan this turn, or null (nothing unheard, or a
 * fight). Pass `ignoreCombat` to size the allowance after a turn.
 */
export function newsOffer(db: AppDatabase, options: { ignoreCombat?: boolean } = {}): NewsOffer | null {
  if (!options.ignoreCombat && isCombatPace(db.state.scenePace)) {
    return null;
  }

  const unheard = unheardCanonNews(db, 99);

  if (unheard.length === 0) {
    return null;
  }

  const present = sceneEntities(db);
  const quietDays = Math.max(0, daysBetween(lastNewsHeardDate(db), db.state.inStoryDate));
  // Secrets and eyewitness accounts never travel in a bundle.
  const bundleable = unheard.filter((item) => item.knowledge !== 'secret' && item.knowledge !== 'witnesses');

  if (quietDays >= CATCH_UP_QUIET_DAYS && bundleable.length >= 2) {
    return {
      mode: 'catch-up',
      items: bundleable.slice(0, CATCH_UP_MAX).map((item) => offered(db, item, present)),
      style: catchUpStyle(db, present),
      quietDays,
    };
  }

  const item = offered(db, unheard[0], present);

  return { mode: 'single', items: [item], style: singleStyle(db, item, present), quietDays };
}

/** How many news relays the state step may record for a turn built on `db`. */
export function newsAllowance(db: AppDatabase): number {
  const offer = newsOffer(db, { ignoreCombat: true });

  return Math.max(NEWS_PER_TURN, offer?.mode === 'catch-up' ? offer.items.length : 0);
}

// ---------------------------------------------------------------------------
// Prompt text

function bearerLine(item: OfferedNews) {
  const parts: string[] = [];

  if (item.sceneBearers.length > 0) {
    parts.push(`In the scene: ${item.sceneBearers.slice(0, 4).join(', ')}.`);
  }

  if (item.otherBearers.length > 0) {
    parts.push(`${parts.length > 0 ? 'Elsewhere' : 'Could be known by'}: ${item.otherBearers.slice(0, 4).join(', ')}.`);
  }

  if (parts.length === 0) {
    parts.push('Only someone who was there could know.');
  }

  return parts.join(' ');
}

const URGENCY_TEXT: Record<OfferedNews['urgency'], (item: OfferedNews) => string> = {
  fresh: (item) => (item.major ? '' : ' Minor news: only if it comes up naturally.'),
  due: () => ' It has waited a while: bring it in this turn if any bearer or the delivery fits.',
  overdue: (item) => ` OVERDUE: deliver it this turn; if nobody here could know, it comes to you (${item.channel}).`,
};

export function formatNewsOffer(offer: NewsOffer | null): string {
  if (!offer) {
    return '';
  }

  if (offer.mode === 'catch-up') {
    return [
      `NEWS & RUMORS — CATCH-UP (you have heard no news for about ${offer.quietDays} days, and these events piled up). Deliver them together as ONE report this turn, not one at a time: ${offer.style}. Each event can only come from someone or something that could know it (listed per line), so split the report between sources where needed, like public news from the bundle and organization business from a comrade. Make clear who or what brings each part, and that some of it is old news by now. Never deliver any other world news.`,
      ...offer.items.map((item) => `- ${item.title} (${item.location}, ${item.region}). ${bearerLine(item)}`),
    ].join('\n');
  }

  const [item] = offer.items;

  return [
    'NEWS & RUMORS (an event Kan has NOT learned yet; deliver at most this one this turn). Prefer a bearer already in the scene. Make clear who tells him. Never deliver any other world news.',
    `- ${item.title} (${item.location}, ${item.region}). ${bearerLine(item)} Delivery this time: ${offer.style}.${URGENCY_TEXT[item.urgency](item)}`,
  ].join('\n');
}

/**
 * The canon beats the state tracker is shown this turn: up to two active
 * beats and the offered personal beats. `formatCanonTracking` prints exactly
 * these, and the state step accepts canon marks only for them (audit 6.18).
 */
export function trackedCanonBeats(db: AppDatabase) {
  return {
    active: activeCanonMilestones(db).slice(0, TRACKED_ACTIVE_BEATS),
    offered: upcomingCanonMilestones(db, PERSONAL_OFFERS_PER_TURN),
  };
}

/** How many active beats the state tracker sees per turn. */
export const TRACKED_ACTIVE_BEATS = 2;

/**
 * Keeps only the canon marks the tracker was allowed to make this turn.
 * Built from the save the turn's prompt was built on. A news id sent as
 * completed is read as news someone relayed, not as a beat Kan witnessed.
 */
export function filterCanonMarks(
  db: AppDatabase,
  marks: {
    completed?: string[];
    engaged?: string[];
    passed?: string[];
    relayed?: { id: string; from?: string }[];
  }
) {
  const { active, offered } = trackedCanonBeats(db);
  const activeIds = new Set(active.map((milestone) => milestone.id));
  const offeredIds = new Set(offered.map((milestone) => milestone.id));
  const newsIds = new Set(newsOffer(db, { ignoreCombat: true })?.items.map((item) => item.milestoneId) ?? []);
  const dropped: { id: string; as: 'completed' | 'engaged' | 'passed'; reason: string }[] = [];
  const relayed = [...(marks.relayed ?? [])];

  const keep = (ids: string[] | undefined, as: 'completed' | 'engaged' | 'passed', allowed: (id: string) => boolean) =>
    [...new Set(ids ?? [])].filter((id) => {
      if (allowed(id)) {
        return true;
      }

      if (as === 'completed' && newsIds.has(id)) {
        if (!relayed.some((relay) => relay.id === id)) {
          relayed.push({ id });
        }

        dropped.push({ id, as, reason: 'news, read as relayed' });
        return false;
      }

      dropped.push({ id, as, reason: 'not offered this turn' });
      return false;
    });

  return {
    completed: keep(marks.completed, 'completed', (id) => activeIds.has(id) || offeredIds.has(id)),
    engaged: keep(marks.engaged, 'engaged', (id) => activeIds.has(id) || offeredIds.has(id)),
    passed: keep(marks.passed, 'passed', (id) => activeIds.has(id)),
    relayed,
    dropped,
  };
}

/** Lines for the state tracker's CANON TRACKING block. */
export function newsTrackingLines(offer: NewsOffer | null): string[] {
  if (!offer) {
    return [];
  }

  if (offer.mode === 'catch-up') {
    return offer.items.map(
      (item) =>
        `- ${item.milestoneId}: ${item.title} (news, part of a catch-up report). news_relayed with "from" = the speaker or channel, for each event the report actually told Kan this turn.`
    );
  }

  return offer.items.map(
    (item) =>
      `- ${item.milestoneId}: ${item.title} (news Kan has not heard). news_relayed with "from" = the speaker or channel, only if someone actually told Kan this turn.`
  );
}
