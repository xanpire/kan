// Reputation: what the world has on Kan.
//
// - Bingo books. Each great village keeps a `heat` for Kan (0-100): how badly
//   it wants him. Deeds its shinobi survive to report raise it (the state
//   tracker's `reputation`); time without new deeds cools it slowly. Past
//   LIST_HEAT he is in that village's bingo book with a rank (C → S) and a
//   bounty, and an entry, once written, is never torn out.
// - Akatsuki standing (-100..100): how the organization regards him, which
//   changes how Pain, Konan and his partners treat him once he is a member.
// - Kan does not know what is written about him until the story shows him
//   (a poster, a hunter naming his price, someone telling him): the tracker's
//   `bounty_seen` marks a village's entry as known. The narrator always knows,
//   so strangers react honestly; the player's screen shows only what Kan has
//   seen.
//
// The narrator gets YOUR NAME OUT THERE: how the people where Kan stands
// would react to his face, and, now and then, an optional bounty hunter.

import { dateSortValue, daysBetween, timeOfDayOf } from './calendar';
import { isCombatPace } from './canon';
import { encounterRisk, locationKindOf } from './encounters';
import { localizePlaceNames } from './glossary';
import { TERRITORY_OF_REGION, currentRegion, regionOf } from './geography';
import { clamp, hashText, playerTurnCount } from './util';
import type {
  AppDatabase,
  BingoEntry,
  CalendarDate,
  ReputationFaction,
  ReputationState,
  TurnDiff,
  VillageFaction,
} from './types';

export const VILLAGES: VillageFaction[] = ['leaf', 'sand', 'mist', 'cloud', 'stone'];
export const REPUTATION_FACTIONS: ReputationFaction[] = [...VILLAGES, 'akatsuki'];

export const VILLAGE_NAME: Record<VillageFaction, string> = {
  leaf: 'Hidden Leaf',
  sand: 'Hidden Sand',
  mist: 'Hidden Mist',
  cloud: 'Hidden Cloud',
  stone: 'Hidden Stone',
};

/** Heat at which a village writes Kan into its bingo book. */
export const LIST_HEAT = 15;

/** Rank thresholds (heat at or above). */
const RANKS: Array<[number, BingoRank]> = [
  [85, 'S'],
  [60, 'A'],
  [35, 'B'],
  [LIST_HEAT, 'C'],
];

export type BingoRank = 'C' | 'B' | 'A' | 'S';

/** Days without a new deed before a village's heat starts to cool. */
export const COOL_AFTER_DAYS = 60;
/** Once cooling, one point of heat per this many days. */
export const COOL_DAYS_PER_POINT = 20;

/** Per turn, one village's heat moves at most this much. */
const MAX_RISE = 25;
const MAX_FALL = 15;

/** The Leaf's entry: he vanished the night of the massacre (the story starts that night). */
export const LEAF_LISTS_ON: CalendarDate = { year: 13, month: 10, day: 2, hour: 6, minute: 0 };
export const LEAF_START_HEAT = 40;
export const LEAF_START_REASON =
  "Vanished from ANBU the night of the Uchiha massacre; wanted as Itachi Uchiha's suspected accomplice.";

/** Bounty hunters: one optional offer per window of player turns, at most. */
export const HUNTER_WINDOW_TURNS = 10;
const HUNTER_MIN_TURN = 8;

export function reputationOf(db: AppDatabase): ReputationState {
  return db.state.reputation ?? emptyReputation();
}

function withReputation(db: AppDatabase, reputation: ReputationState): AppDatabase {
  return { ...db, state: { ...db.state, reputation } };
}

function emptyReputation(): ReputationState {
  return { villages: {}, akatsuki: { standing: 0 }, recent: [] };
}

/**
 * The morning after the massacre night the Leaf finds Kan gone from ANBU and
 * writes him into its book beside Itachi. Before that, nobody has anything on
 * him. Runs every turn; an entry, once there, is never touched again here.
 */
export function ensureLeafListing(db: AppDatabase): AppDatabase {
  const reputation = reputationOf(db);

  if (reputation.villages.leaf || dateSortValue(db.state.inStoryDate) < dateSortValue(LEAF_LISTS_ON)) {
    return db;
  }

  const now = db.state.inStoryDate;

  return withReputation(db, {
    ...reputation,
    villages: {
      ...reputation.villages,
      leaf: { heat: LEAF_START_HEAT, listedOn: now, lastDeedOn: now, lastReason: LEAF_START_REASON, known: false },
    },
  });
}

export function normalizeReputation(raw: unknown): ReputationState {
  if (!raw || typeof raw !== 'object') {
    return emptyReputation();
  }

  const value = raw as Partial<ReputationState>;
  const villages: ReputationState['villages'] = {};

  for (const village of VILLAGES) {
    const entry = value.villages?.[village];

    if (entry && typeof entry.heat === 'number' && Number.isFinite(entry.heat)) {
      villages[village] = { ...entry, heat: clamp(Math.round(entry.heat), 0, 100), known: Boolean(entry.known) };
    }
  }

  const standing = value.akatsuki?.standing;

  return {
    villages,
    akatsuki: {
      ...(value.akatsuki ?? {}),
      standing: typeof standing === 'number' && Number.isFinite(standing) ? clamp(Math.round(standing), -100, 100) : 0,
    },
    recent: Array.isArray(value.recent)
      ? value.recent.filter((item) => item && typeof item.faction === 'string').slice(-12)
      : [],
  };
}

/** Heat today: a village forgets slowly, but never takes Kan out of its book. */
export function currentHeat(entry: BingoEntry | undefined, now: CalendarDate): number {
  if (!entry) {
    return 0;
  }

  const quiet = entry.lastDeedOn ? daysBetween(entry.lastDeedOn, now) : 0;
  const cooled = quiet > COOL_AFTER_DAYS ? Math.floor((quiet - COOL_AFTER_DAYS) / COOL_DAYS_PER_POINT) : 0;
  const floor = entry.listedOn ? LIST_HEAT : 0;

  return Math.max(Math.min(entry.heat, floor), entry.heat - cooled);
}

export function rankFor(heat: number): BingoRank | null {
  for (const [threshold, rank] of RANKS) {
    if (heat >= threshold) {
      return rank;
    }
  }

  return null;
}

/** Bounty in ryō, rounded to 100,000: about 1.4M at C, 7M at B, 22M at A, 43M+ at S. */
export function bountyFor(heat: number): number {
  if (heat < LIST_HEAT) {
    return 0;
  }

  return Math.round((heat * heat * 6000) / 100000) * 100000;
}

export function formatRyo(amount: number) {
  return `${amount.toLocaleString('en-US')} ryō`;
}

export type BingoListing = {
  village: VillageFaction;
  name: string;
  heat: number;
  rank: BingoRank;
  bounty: number;
  known: boolean;
  listedOn?: CalendarDate;
  lastReason?: string;
};

/** Every village that has Kan in its book, worst first. */
export function bingoListings(db: AppDatabase): BingoListing[] {
  const reputation = reputationOf(db);
  const now = db.state.inStoryDate;
  const listings: BingoListing[] = [];

  for (const village of VILLAGES) {
    const entry = reputation.villages[village];
    const heat = currentHeat(entry, now);
    const rank = rankFor(heat);

    if (entry && rank) {
      listings.push({
        village,
        name: VILLAGE_NAME[village],
        heat,
        rank,
        bounty: bountyFor(heat),
        known: Boolean(entry.known),
        listedOn: entry.listedOn,
        lastReason: entry.lastReason,
      });
    }
  }

  return listings.sort((a, b) => b.heat - a.heat);
}

/** The highest price on Kan's head anywhere: what a bounty hunter would chase. */
export function topBounty(db: AppDatabase): BingoListing | null {
  return bingoListings(db)[0] ?? null;
}

export type StandingBand = 'suspected' | 'doubted' | 'unproven' | 'trusted' | 'valued';

export function standingBand(standing: number): StandingBand {
  if (standing <= -50) return 'suspected';
  if (standing <= -15) return 'doubted';
  if (standing < 15) return 'unproven';
  if (standing < 50) return 'trusted';
  return 'valued';
}

export const STANDING_LABEL: Record<StandingBand, string> = {
  suspected: 'Suspected',
  doubted: 'Doubted',
  unproven: 'Unproven',
  trusted: 'Trusted',
  valued: 'Valued',
};

export function isAkatsukiMember(db: AppDatabase) {
  return (db.state.canonProgress?.completed ?? []).includes('kan-joins-akatsuki');
}

// ---------------------------------------------------------------------------
// Applying the state tracker's report

export function applyReputationChanges(
  db: AppDatabase,
  changes: TurnDiff['reputation'],
  seen: TurnDiff['bountySeen']
): AppDatabase {
  db = ensureLeafListing(db);

  if ((!changes || changes.length === 0) && (!seen || seen.length === 0)) {
    return db;
  }

  const now = db.state.inStoryDate;
  const current = reputationOf(db);
  const villages = { ...current.villages };
  let akatsuki = { ...(current.akatsuki ?? { standing: 0 }) };
  const recent = [...current.recent];
  // One move per faction per turn, however the tracker split it up.
  const moved = new Set<ReputationFaction>();

  for (const change of changes ?? []) {
    if (!REPUTATION_FACTIONS.includes(change.faction) || moved.has(change.faction)) {
      continue;
    }

    const delta = clamp(Math.round(change.change), -MAX_FALL, MAX_RISE);

    if (!Number.isFinite(delta) || delta === 0) {
      continue;
    }

    moved.add(change.faction);
    const reason = change.reason?.trim().slice(0, 160) || undefined;
    recent.push({ faction: change.faction, change: delta, reason, date: now });

    if (change.faction === 'akatsuki') {
      akatsuki = {
        standing: clamp(akatsuki.standing + delta, -100, 100),
        lastReason: reason ?? akatsuki.lastReason,
        updatedOn: now,
      };
      continue;
    }

    const entry = villages[change.faction];
    // Bake in the cooling so far, then add the new deed.
    const heat = clamp(currentHeat(entry, now) + delta, 0, 100);
    const listedOn = entry?.listedOn ?? (heat >= LIST_HEAT ? now : undefined);

    villages[change.faction] = {
      heat: listedOn ? Math.max(LIST_HEAT, heat) : heat,
      ...(listedOn ? { listedOn } : {}),
      lastDeedOn: delta > 0 ? now : (entry?.lastDeedOn ?? now),
      lastReason: delta > 0 ? (reason ?? entry?.lastReason) : entry?.lastReason,
      known: entry?.known ?? false,
    };
  }

  for (const village of seen ?? []) {
    const entry = villages[village];

    if (entry?.listedOn) {
      villages[village] = { ...entry, known: true };
    }
  }

  return withReputation(db, { villages, akatsuki, recent: recent.slice(-12) });
}

// ---------------------------------------------------------------------------
// Where Kan stands, and who would know his face

/**
 * The great village whose land a place is in, or null in the small countries
 * and the wilds between. Read from the region (audit 6b.1), so "a valley
 * thick with the mist" is not the Hidden Mist.
 */
export function territoryOf(location: string): VillageFaction | null {
  const region = regionOf(location);
  return region ? (TERRITORY_OF_REGION[region] ?? null) : null;
}

/** Whose land Kan stands on now: from where he is, or the last region on his road when the text names none. */
export function territoryHere(db: AppDatabase): VillageFaction | null {
  const region = regionOf(`${db.state.location} ${db.state.scene ?? ''}`) ?? currentRegion(db);
  return TERRITORY_OF_REGION[region] ?? null;
}

function shinobiLine(name: string, listing: BingoListing | undefined) {
  if (!listing) {
    return `${name} has nothing on you: its shinobi see a stranger.`;
  }

  const entry = `${name}'s bingo book lists you ${listing.rank}-rank (${formatRyo(listing.bounty)})`;

  switch (listing.rank) {
    case 'S':
      return `${entry}. Nearly every one of its shinobi knows your face; patrols attack or flee and send for help on sight.`;
    case 'A':
      return `${entry}. Most of its chunin and jonin would know your face; a patrol that spots you reports it or moves on you.`;
    case 'B':
      return `${entry}. Its jonin, hunter-nin and sensor teams may know your face; most genin and chunin would not.`;
    default:
      return `${entry}. Only a hunter-nin or someone who studies the book would place you, and only with a good look.`;
  }
}

function civilianLine(listing: BingoListing | undefined, year: number, cloak: boolean) {
  const parts: string[] = [];

  if (listing?.rank === 'S') {
    parts.push('Your face is on wanted posters here; even civilians may recognize you and run for the guards.');
  } else {
    parts.push('Civilians do not know your face.');
  }

  if (cloak) {
    parts.push(
      year < 17
        ? 'If you wear the Akatsuki cloak, it means little to ordinary people yet; hunter-nin and the underworld already fear it.'
        : 'If you wear the Akatsuki cloak, anyone who sees it knows what it means: fear, silence, shut doors, or a hand on a weapon.'
    );
  }

  return parts.join(' ');
}

function hasCloak(db: AppDatabase) {
  return db.state.inventory.some((item) => /akatsuki/i.test(item) && /cloak|robe/i.test(item));
}

function standingLine(db: AppDatabase) {
  if (!isAkatsukiMember(db)) {
    return '';
  }

  const standing = reputationOf(db).akatsuki?.standing ?? 0;
  const band = standingBand(standing);
  const text: Record<StandingBand, string> = {
    suspected:
      'Pain suspects you. Your partner watches you and reports on you, missions are tests, and you are told nothing you do not need.',
    doubted: 'The others doubt you: curt orders, short leashes, and nobody shares more than they must.',
    unproven: 'You are still unproven: you get orders, not explanations.',
    trusted: 'You are trusted: harder missions, more freedom between them, and partners who speak a little more openly.',
    valued:
      'Pain and Konan value you: they give you room to choose your own methods and share plans above your rank (never the masked man\'s identity or anyone\'s secrets).',
  };

  return `Within the Akatsuki (${STANDING_LABEL[band].toLowerCase()}): ${text[band]}`;
}

/**
 * The narrator block: how people where Kan stands would react to him. Skipped
 * where nobody would be around, except for his standing inside the Akatsuki.
 */
export function formatReputationBlock(db: AppDatabase): string {
  const lines: string[] = [];
  const standing = standingLine(db);
  const risk = encounterRisk(locationKindOf(db), timeOfDayOf(db.state.inStoryDate));

  if (risk !== 'none') {
    const listings = bingoListings(db);
    const byVillage = new Map(listings.map((listing) => [listing.village, listing]));
    const here = territoryHere(db);
    const cloak = hasCloak(db);

    if (here) {
      lines.push(shinobiLine(VILLAGE_NAME[here], byVillage.get(here)));
    } else if (listings.length > 0) {
      lines.push(
        `No great village holds this land. Bingo books still travel with bounty hunters and mercenaries: ${listings
          .map((listing) => `${listing.name} ${listing.rank}-rank (${formatRyo(listing.bounty)})`)
          .join(', ')}.`
      );
    }

    const elsewhere = listings.filter((listing) => listing.village !== here);

    if (here && elsewhere.length > 0) {
      lines.push(
        `Also wanted by: ${elsewhere.map((listing) => `${listing.name} (${listing.rank}-rank)`).join(', ')}; their shinobi here would know you as well as their book does.`
      );
    }

    lines.push(civilianLine(here ? byVillage.get(here) : undefined, db.state.inStoryDate.year, cloak));
  }

  if (standing) {
    lines.push(standing);
  }

  if (lines.length === 0) {
    return '';
  }

  const unknown = bingoListings(db).filter((listing) => !listing.known);

  return [
    'YOUR NAME OUT THERE (how strangers react to you; never state these numbers as narration)',
    ...lines.map((line) => `- ${line}`),
    unknown.length > 0
      ? `- Kan has not seen what ${unknown.map((listing) => listing.name).join(' or ')} wrote about him; he can find out through a bounty poster, a hunter naming his price, or someone telling him.`
      : '',
    '- Recognition takes a good look and someone who would know. When it happens, show it: a double take, a lowered voice, a sudden exit, a price named. Nobody recognizes Kan just because he is wanted.',
  ]
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Bounty hunters

/** True on the one turn of each window that may carry a hunter. */
function isHunterTurn(db: AppDatabase, turn: number) {
  if (turn < HUNTER_MIN_TURN) {
    return false;
  }

  const window = Math.floor(turn / HUNTER_WINDOW_TURNS);
  const slot = hashText(`${db.meta.slotId}:hunter:${window}`) % HUNTER_WINDOW_TURNS;

  return turn % HUNTER_WINDOW_TURNS === slot;
}

/** Chance a window's hunter turn actually carries one, by the top rank, in quarters. */
const HUNTER_ODDS: Record<BingoRank, number> = { C: 1, B: 2, A: 3, S: 4 };

const HUNTER_KINDS = [
  'a lone bounty hunter who has been asking about you along this road',
  'a pair of mercenaries who think the price on you is worth the risk',
  'a bounty-station keeper who recognizes your face and quietly sends word',
  'a hunter-nin team following a weeks-old report of you',
  'an informant who would sell your whereabouts to whoever pays',
];

export type HunterOffer = { listing: BingoListing; kind: string };

export function hunterOffer(db: AppDatabase): HunterOffer | null {
  if (isCombatPace(db.state.scenePace)) {
    return null;
  }

  const kind = locationKindOf(db);

  if (kind !== 'road' && kind !== 'settlement') {
    return null;
  }

  if (encounterRisk(kind, timeOfDayOf(db.state.inStoryDate)) === 'none') {
    return null;
  }

  const listing = topBounty(db);
  const turn = playerTurnCount(db);

  if (!listing || !isHunterTurn(db, turn)) {
    return null;
  }

  const window = Math.floor(turn / HUNTER_WINDOW_TURNS);

  if (hashText(`${db.meta.slotId}:hunter-odds:${window}`) % 4 >= HUNTER_ODDS[listing.rank]) {
    return null;
  }

  // Hunter-nin only come for him on their own village's land.
  const kinds = territoryHere(db) === listing.village
    ? HUNTER_KINDS
    : HUNTER_KINDS.filter((item) => !item.includes('hunter-nin'));

  return { listing, kind: kinds[hashText(`${db.meta.slotId}:hunter-kind:${window}`) % kinds.length] };
}

export function formatHunterOffer(offer: HunterOffer | null): string {
  if (!offer) {
    return '';
  }

  return [
    'A PRICE ON YOUR HEAD (optional)',
    `${offer.listing.name} pays ${formatRyo(offer.listing.bounty)} for you. Here that could mean ${offer.kind}.`,
    'If it fits the scene, bring them in: someone watching too long, a name asked at the counter, or an ambush on the road. They are this turn\'s encounter, fight at canon power for their rank, and can be bought off, outrun, fooled, or beaten. If it does not fit, ignore this.',
  ].join('\n');
}

export function reputationTrackingLines(db: AppDatabase): string[] {
  const unknown = bingoListings(db).filter((listing) => !listing.known);

  return [
    'reputation: a village id (leaf, sand, mist, cloud, stone) or akatsuki, with change and a short reason, only when THIS turn gave that village something to report: its shinobi saw Kan and lived, he hurt or killed its people, worked openly in its land, or was linked to a deed by witnesses. Usually 3-10; 15-25 for killing a known jonin or a public massacre; negative only when Kan clearly clears his name or does that village a real service. akatsuki: missions done well or badly, loyalty shown or doubted, defying Pain; usually -10..10. Otherwise [].',
    unknown.length > 0
      ? `bounty_seen: village ids whose bingo-book entry or bounty on Kan he sees or is told about this turn (not yet seen: ${unknown.map((listing) => listing.village).join(', ')}). Otherwise [].`
      : 'bounty_seen: village ids whose bingo-book entry or bounty on Kan he sees or is told about this turn; otherwise [].',
  ];
}
