// Reputation, rumours and nicknames (before-variety-ideas section 7).
//
// - Deeds: every time people see Kan do something and live to tell it (the
//   state tracker's `reputation`), the deed is kept with where and when it
//   happened. What they saw is read from it: drained bodies (most common), the
//   vultures, his eyes, the black flame, the chains, the cloak.
// - Talk travels at map speed: a village's own shinobi report home within the
//   days of road; everyone else hears it as talk, about four days per day of
//   road. Towns and farmland hear what reached the land Kan stands in; the
//   bounty trade passes it on twice as fast as gossip.
// - Each audience grows its picture in stages: nameless whispers, then a name
//   sticks, then a bingo-book entry (a village) or a name everyone uses, then a
//   name people fear. The names are fixed (NICKNAMES), and Kan only learns one
//   when he hears it in the story.
// - Nobody links the names to Kan at first: the Leaf's file says "Kan,
//   missing, presumed dead", and its bingo book lists an unknown Red-Eyed
//   Ghost it suspects is Itachi. The name gets out four ways: Kan says it
//   himself (offered, never forced), someone who knew him recognises him (the
//   Leaf then moves him into its book), the Akatsuki become known (Gaara's
//   capture, once he is a member), and at the latest the Kage Summit.
// - Wanted posters and bingo books: an entry on an unlinked nickname has a
//   description and deeds, no face. A bingo book Kan carries keeps the page on
//   him as it was printed, mistakes included, and the player reads exactly
//   that page.

import { firstNight } from './opening';
import { fullPlace } from './placeName';
import { dateSortValue, daysBetween, monthName, timeOfDayOf } from './calendar';
import { isCombatPace } from './canon';
import { castWithCompanions } from './companions';
import { encounterRisk, locationKindOf } from './encounters';
import { resolveEntity } from './entities';
import { currentRegion, regionName, regionOf, travelDaysBetween, type Region } from './geography';
import { makeId } from './id';
import {
  LEAF_FILE,
  OLD_LEAF_START_REASON,
  VILLAGES,
  VILLAGE_NAME,
  bingoListings,
  formatRyo,
  isAkatsukiMember,
  reputationOf,
  territoryHere,
  territoryOf,
  type BingoListing,
  type ListingSubject,
} from './reputation';
import { hashText, playerTurnCount } from './util';
import type {
  AppDatabase,
  Audience,
  CalendarDate,
  CarriedBingoBook,
  Deed,
  Epithet,
  NameOut,
  RenownState,
  TurnDiff,
  VillageFaction,
} from './types';

const MAX_DEEDS = 40;
const MAX_BOOKS = 6;
/** Weight that has reached an audience before a name sticks. */
export const NAME_AT = 12;
/** ...before the name is one everyone there uses (villages: when they list him). */
export const LISTED_AT = 35;
/** ...before it is a name people fear. */
export const FEARED_AT = 70;
/** One rumour turn in this many (in places where people talk). */
const RUMOUR_WINDOW_TURNS = 5;
const RUMOUR_MIN_TURN = 4;
/** Gossip walks about four days per day of road; a village's own shinobi report home at road speed. */
const TALK_DAYS_PER_ROAD_DAY = 4;
const TRADE_DAYS_PER_ROAD_DAY = 2;

export const AUDIENCES: Audience[] = [
  'leaf',
  'sand',
  'mist',
  'cloud',
  'stone',
  'rain',
  'grass',
  'underworld',
  'towns',
  'countryside',
  'akatsuki',
];

export const AUDIENCE_NAME: Record<Audience, string> = {
  leaf: 'the Hidden Leaf',
  sand: 'the Hidden Sand',
  mist: 'the Hidden Mist',
  cloud: 'the Hidden Cloud',
  stone: 'the Hidden Stone',
  rain: 'the people of the Rain',
  grass: 'the Grass and the Waterfall',
  underworld: 'bounty hunters and the underworld',
  towns: 'towns and the trade roads',
  countryside: 'farmland, temples and small villages',
  akatsuki: 'the Akatsuki',
};

export type Nickname = {
  name: string;
  japanese?: string;
  /** A second name some of them use, and who. */
  also?: { name: string; who: string };
};

/** Who calls him what (section 7). A name starts where it was first used and can travel. */
export const NICKNAMES: Record<Audience, Nickname> = {
  underworld: { name: 'the Vulture', japanese: 'Higewashi' },
  // Kakuzu knows the bounty trade's name for him.
  akatsuki: { name: 'the Vulture', japanese: 'Higewashi' },
  rain: { name: "Death's Bird", japanese: 'Shinigami no tori', also: { name: 'the Vulture of the Rain', who: 'outsiders' } },
  sand: { name: 'the Blood Vulture', japanese: 'Chi-washi' },
  stone: { name: 'the Corpse-Eater', japanese: 'Shikabane-kui' },
  mist: { name: 'Bone-Picker', japanese: 'Kotsuage', also: { name: 'the One Who Comes After', who: 'older Mist shinobi' } },
  cloud: { name: 'Black Fire' },
  // The Leaf's second file: a ghost they suspect is Itachi, never linked to the Kan they think is dead.
  leaf: { name: 'the Red-Eyed Ghost' },
  towns: { name: 'Kyūketsuki' },
  countryside: { name: 'the Hungry Ghost', japanese: 'Gaki' },
  grass: { name: 'the Red Flock' },
};

/** Where an audience lives, for how long talk takes to reach it (null: where Kan stands). */
const HOME: Record<Audience, Region | null> = {
  leaf: 'fire',
  sand: 'wind',
  mist: 'water',
  cloud: 'lightning',
  stone: 'earth',
  rain: 'rain',
  grass: 'grass',
  underworld: null,
  towns: null,
  countryside: null,
  akatsuki: null,
};

const VILLAGE_SET = new Set<string>(VILLAGES);
const isVillage = (audience: Audience): audience is VillageFaction => VILLAGE_SET.has(audience);

/** The milestones that put Kan's real name out (section 7, routes 3 and 4). */
export const AKATSUKI_KNOWN = 'gaara-captured';
export const NAME_FAMOUS = 'kage-summit';
/** After Taka's attack on Killer Bee the Cloud is sure Black Fire is an Uchiha. */
const CLOUD_SURE = 'killer-bee-fail';

const completed = (db: AppDatabase, id: string) => (db.state.canonProgress?.completed ?? []).includes(id);

export function renownOf(db: AppDatabase): RenownState {
  const renown = db.state.renown;

  return {
    deeds: Array.isArray(renown?.deeds) ? renown.deeds : [],
    epithets: renown?.epithets && typeof renown.epithets === 'object' ? renown.epithets : {},
    nameOut: Array.isArray(renown?.nameOut) ? renown.nameOut : [],
    heard: Array.isArray(renown?.heard) ? renown.heard : [],
    books: Array.isArray(renown?.books) ? renown.books : [],
  };
}

function withRenown(db: AppDatabase, renown: RenownState): AppDatabase {
  return { ...db, state: { ...db.state, renown } };
}

/**
 * Load-time repair. Old saves had names grown from themes ("Itachi's Shadow")
 * and the Leaf's automatic first deed: the theme names go (a name Kan had
 * heard is kept under `heard`), and the Leaf's old deed goes with its entry.
 */
export function normalizeRenown(raw: unknown): RenownState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const value = raw as Partial<RenownState>;
  const deeds = Array.isArray(value.deeds)
    ? value.deeds.filter(
        (deed): deed is Deed => Boolean(deed) && typeof deed.text === 'string' && Boolean(deed.date) && deed.text !== OLD_LEAF_START_REASON
      )
    : [];
  const epithets: RenownState['epithets'] = {};
  const heard = Array.isArray(value.heard) ? value.heard.filter((item) => item && typeof item.name === 'string' && item.since) : [];

  for (const audience of AUDIENCES) {
    const epithet = (value.epithets as RenownState['epithets'] | undefined)?.[audience];

    if (!epithet || typeof epithet.name !== 'string' || !epithet.since) continue;

    if (epithet.theme === 'fixed') {
      epithets[audience] = { ...epithet, name: NICKNAMES[audience].name };
    } else if (epithet.known && !heard.some((item) => item.name.toLowerCase() === epithet.name.toLowerCase())) {
      heard.push({ name: epithet.name, since: epithet.since });
    }
  }

  const nameOut = Array.isArray(value.nameOut)
    ? value.nameOut.filter((item): item is NameOut => Boolean(item?.date) && AUDIENCES.includes(item.audience))
    : [];
  const books = Array.isArray(value.books)
    ? value.books.filter((book): book is CarriedBingoBook => Boolean(book?.id) && typeof book.item === 'string' && AUDIENCES.includes(book.audience))
    : [];

  return { deeds: deeds.slice(-MAX_DEEDS), epithets, nameOut, heard: heard.slice(-8), books: books.slice(-MAX_BOOKS) };
}

// ---------------------------------------------------------------------------
// What people saw

export type DeedSign = 'bodies' | 'vultures' | 'eyes' | 'black-fire' | 'chains' | 'cloak' | 'mercy';

const SIGNS: Array<[DeedSign, RegExp]> = [
  ['bodies', /\b(drain(ed|ing|s)?|husks?|emptied|bloodless|pale (bodies|corpses?|dead)|withered|shrivell?ed|dried[- ]out|thousand souls|sky burial|sucked|siphon(ed)?|chakra (was |were )?(eaten|stolen|taken)|stole (their|his|her) chakra|corpses?|bodies)\b/i],
  ['vultures', /\b(vultures?|okuri|h[oō]muri|tomurai|red birds?|blood-red birds?|flock)\b/i],
  ['eyes', /\b(sharingan|mangeky[oō]|red eyes?|his eyes|genjutsu|susan[oō]o|tomoe|uchiha)\b/i],
  ['black-fire', /\b(okuribi|black (flames?|fire)|black-red (flames?|fire))\b/i],
  ['chains', /\b(chakra chains?|red chains?|chains|seal(ed|ing)?|uzumaki)\b/i],
  ['cloak', /\b(akatsuki|red clouds?|black cloak)\b/i],
  ['mercy', /\b(spared|saved|protected|helped|sheltered|healed|rescued|let (them|him|her) (live|go))\b/i],
];

export function signsOf(deed: Pick<Deed, 'text'>): DeedSign[] {
  return SIGNS.filter(([, test]) => test.test(deed.text)).map(([sign]) => sign);
}

/** Days for a deed to reach an audience, and how much of it arrives. */
function reach(db: AppDatabase, deed: Deed, audience: Audience): { days: number; share: number } | null {
  if (audience === 'akatsuki') return deed.faction === 'akatsuki' ? { days: 0, share: 1 } : null;

  const from = (deed.region as Region | undefined) ?? null;
  const home = HOME[audience] ?? currentRegion(db);
  const road = from ? travelDaysBetween(from, home) : 3;

  // Their own people saw it: they report home at road speed, all of it.
  if (deed.faction === audience) return { days: road, share: 1 };
  // What the Akatsuki think of his missions stays inside the Akatsuki.
  if (deed.faction === 'akatsuki') return null;

  const pace = audience === 'underworld' ? TRADE_DAYS_PER_ROAD_DAY : TALK_DAYS_PER_ROAD_DAY;
  const near = from === home ? 1 : Math.max(0.15, 1 - road / 12);

  return { days: road * pace, share: (audience === 'underworld' ? 0.6 : 1) * near };
}

type Arrived = { deed: Deed; weight: number; daysAgo: number };

/** The deeds that have reached an audience by now, with what they count for there. */
export function arrivedDeeds(db: AppDatabase, audience: Audience): Arrived[] {
  const now = db.state.inStoryDate;

  return renownOf(db).deeds.flatMap((deed) => {
    const path = reach(db, deed, audience);
    const daysAgo = Math.max(0, daysBetween(deed.date, now));

    if (!path || daysAgo < path.days) return [];

    const fresh = daysAgo > 730 ? 0.5 : 1;

    return [{ deed, weight: Math.abs(deed.weight) * path.share * fresh, daysAgo }];
  });
}

export type RenownStage = 0 | 1 | 2 | 3 | 4;

export const STAGE_LABEL: Record<RenownStage, string> = {
  0: 'nothing',
  1: 'whispers',
  2: 'a name',
  3: 'listed',
  4: 'feared',
};

/** How far an audience's picture of Kan has grown: whispers → a name → listed → feared. */
export function renownStage(db: AppDatabase, audience: Audience): RenownStage {
  const arrived = arrivedDeeds(db, audience);
  const weight = arrived.reduce((sum, item) => sum + item.weight, 0);
  const listed = isVillage(audience) && bingoListings(db).some((listing) => listing.village === audience);

  if (arrived.length === 0 && !listed) return 0;
  if (weight >= FEARED_AT) return 4;
  if (listed || weight >= LISTED_AT) return 3;
  if (weight >= NAME_AT) return 2;
  return 1;
}

/** What an audience has heard of, strongest first. */
function signWeights(db: AppDatabase, audience: Audience): Map<DeedSign, number> {
  const weights = new Map<DeedSign, number>();

  for (const item of arrivedDeeds(db, audience)) {
    for (const sign of signsOf(item.deed)) weights.set(sign, (weights.get(sign) ?? 0) + item.weight);
  }

  return weights;
}

/** True when the talk reaching an audience is mostly from far away or long ago (and so has grown). */
function distorted(db: AppDatabase, audience: Audience) {
  const arrived = arrivedDeeds(db, audience);
  const far = arrived.filter((item) => item.deed.faction !== audience && (item.daysAgo > 120 || item.weight < Math.abs(item.deed.weight) * 0.6));

  return arrived.length > 0 && far.length * 2 >= arrived.length;
}

/**
 * What an audience believes about the one behind its nickname, in a few
 * short clauses: what they saw, and what they get wrong. Empty when they have
 * heard nothing.
 */
export function beliefsOf(db: AppDatabase, audience: Audience): string[] {
  const signs = signWeights(db, audience);
  const grown = distorted(db, audience);
  const linked = linkedSince(db, audience) !== null;
  const beliefs: string[] = [];
  const has = (sign: DeedSign) => (signs.get(sign) ?? 0) > 0;

  if (has('bodies')) {
    beliefs.push(
      grown || audience === 'towns' || audience === 'countryside'
        ? 'the dead he leaves are pale and emptied, so they say he drinks their blood'
        : 'the dead he leaves are pale, dry and emptied of chakra'
    );
  }

  if (has('vultures')) {
    beliefs.push(
      audience === 'countryside' || audience === 'towns'
        ? 'red birds circle where he has been, and eat what he leaves'
        : 'blood-red vultures come with him; they take him for a vulture summoner'
    );
  }

  if (has('black-fire')) {
    beliefs.push(
      audience === 'cloud'
        ? completed(db, CLOUD_SURE)
          ? 'his black fire is Amaterasu, so he is an Uchiha: they are sure of it since the Uchiha attacked Killer Bee'
          : 'his black fire is Amaterasu, the Uchiha flame'
        : 'he burns with a black flame that leaves no burn'
    );
  }

  if (has('eyes')) {
    if (audience === 'leaf' && !linked) beliefs.push('he has a Sharingan: they suspect Itachi Uchiha himself');
    else if (!beliefs.some((item) => item.includes('Uchiha'))) beliefs.push('his eyes turn red: an Uchiha, Itachi or one nobody knew survived');
  }

  if (has('chains')) beliefs.push('he binds people with chains of chakra');
  if (has('cloak')) beliefs.push('he wears the black cloak with red clouds');
  if (has('mercy') && beliefs.length < 4) beliefs.push('he has let some of them live');

  if (beliefs.length === 0 && signs.size === 0 && arrivedDeeds(db, audience).length > 0) {
    beliefs.push('travellers and shinobi have died or vanished where he was seen');
  }

  return beliefs.slice(0, 4);
}

// ---------------------------------------------------------------------------
// When Kan's real name gets out

export type Linked = { how: NameOut['how'] | 'akatsuki' | 'summit' | 'member'; since?: CalendarDate };

/**
 * Whether an audience knows the one behind its nickname is Kan, and since
 * when. Null while they don't.
 */
export function linkedSince(db: AppDatabase, audience: Audience): Linked | null {
  const now = db.state.inStoryDate;

  if (audience === 'akatsuki' && isAkatsukiMember(db)) return { how: 'member' };
  if (completed(db, NAME_FAMOUS)) return { how: 'summit' };
  if (completed(db, AKATSUKI_KNOWN) && isAkatsukiMember(db)) return { how: 'akatsuki' };

  let best: Linked | null = null;

  for (const out of renownOf(db).nameOut ?? []) {
    let days = 0;

    if (out.audience !== audience) {
      const from = (out.region as Region | undefined) ?? currentRegion(db);
      const home = HOME[audience] ?? currentRegion(db);
      // The Leaf hears of a recognition fast: whoever knew him reports it home.
      const pace = out.how === 'recognised' && audience === 'leaf' ? 1 : audience === 'underworld' ? TRADE_DAYS_PER_ROAD_DAY : TALK_DAYS_PER_ROAD_DAY;
      days = travelDaysBetween(from, home) * pace;
    }

    if (daysBetween(out.date, now) < days) continue;

    if (!best || (best.since && dateSortValue(out.date) < dateSortValue(best.since))) {
      best = { how: out.how, since: out.date };
    }
  }

  return best;
}

/** Who a village's bingo-book entry is about, as that village knows it. */
export function listingSubject(db: AppDatabase, village: VillageFaction): ListingSubject {
  const nickname = NICKNAMES[village].name;

  if (linkedSince(db, village)) return { label: `you (Kan, also known as "${nickname}")`, linked: true };
  if (village === 'leaf') return { label: `"${nickname}", whom they suspect is Itachi Uchiha`, linked: false };

  return { label: `"${nickname}"`, linked: false };
}

/** The title an entry goes under: Kan's name once they know it, the nickname before. */
export function listingTitle(db: AppDatabase, village: VillageFaction): string {
  const nickname = NICKNAMES[village].name;

  return linkedSince(db, village) ? `Kan, also known as “${capitalise(nickname)}”` : `“${capitalise(nickname)}”`;
}

/** Heat a village gives an entry once it moves Kan's real name onto it. */
export const NAMED_HEAT = 40;

/**
 * A village that learns Kan is alive and behind its nickname moves his real
 * name onto its entry; the Leaf writes him into its book (route 2), closing
 * the "presumed dead" file.
 */
function settleNamedListings(db: AppDatabase): AppDatabase {
  const reputation = reputationOf(db);
  const villages = { ...reputation.villages };
  const now = db.state.inStoryDate;
  let changed = false;

  for (const village of VILLAGES) {
    const entry = villages[village];

    if (entry?.namedOn || !linkedSince(db, village)) continue;
    if (village !== 'leaf' && !entry) continue;

    villages[village] = {
      heat: Math.max(entry?.heat ?? 0, NAMED_HEAT),
      listedOn: entry?.listedOn ?? now,
      lastDeedOn: now,
      lastReason:
        village === 'leaf'
          ? 'Alive after all: Kan, formerly of the Leaf’s ANBU, missing since the night of the Uchiha massacre.'
          : (entry?.lastReason ?? undefined),
      known: entry?.known ?? false,
      namedOn: now,
    };
    changed = true;
  }

  return changed ? { ...db, state: { ...db.state, reputation: { ...reputation, villages } } } : db;
}

/** The Leaf still believes Kan dead. */
export function leafThinksDead(db: AppDatabase): boolean {
  return !linkedSince(db, 'leaf');
}

// ---------------------------------------------------------------------------
// The names

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The names that have stuck by now; a name, once it has stuck, stays. */
function settleEpithets(db: AppDatabase): AppDatabase {
  const now = db.state.inStoryDate;
  const renown = renownOf(db);
  const epithets = { ...renown.epithets };
  let changed = false;

  for (const audience of AUDIENCES) {
    if (epithets[audience] || renownStage(db, audience) < 2) continue;

    epithets[audience] = { name: NICKNAMES[audience].name, since: now, theme: 'fixed', known: false };
    changed = true;
  }

  return changed ? withRenown(db, { ...renown, epithets }) : db;
}

/**
 * Keeps this turn's deeds (from the tracker's reputation changes), lets the
 * names follow, and moves Kan's real name onto the entries of anyone who
 * now knows it.
 */
export function recordDeeds(db: AppDatabase, changes: TurnDiff['reputation']): AppDatabase {
  let renown = renownOf(db);
  const now = db.state.inStoryDate;
  const region = regionOf(db.state.location) ?? regionOf(db.state.scene) ?? currentRegion(db);
  const deeds = [...renown.deeds];

  for (const change of changes ?? []) {
    if (!change.reason?.trim() || change.change === 0) continue;
    // A deed that cooled them toward him (an Akatsuki punishment, say) still counts as something seen.
    if (change.faction !== 'akatsuki' && change.change < 0) continue;

    deeds.push({
      id: makeId('deed'),
      date: now,
      text: change.reason.trim(),
      faction: change.faction,
      region,
      weight: Math.min(25, Math.abs(change.change)),
    });
  }

  if (deeds.length !== renown.deeds.length) {
    renown = { ...renown, deeds: deeds.slice(-MAX_DEEDS) };
    db = withRenown(db, renown);
  }

  return settleNamedListings(settleEpithets(db));
}

/** Kan's real name got out this turn (the tracker's name_out). */
export function applyNameOut(db: AppDatabase, out: TurnDiff['nameOut']): AppDatabase {
  if (!out?.length) return db;

  const renown = renownOf(db);
  const region = regionOf(db.state.location) ?? regionOf(db.state.scene) ?? currentRegion(db);
  const added = out
    .filter((item) => AUDIENCES.includes(item.audience))
    .map((item): NameOut => ({ date: db.state.inStoryDate, how: item.how, audience: item.audience, region }));

  if (added.length === 0) return db;

  return settleNamedListings(withRenown(db, { ...renown, nameOut: [...(renown.nameOut ?? []), ...added].slice(-20) }));
}

const bare = (name: string) => name.toLowerCase().replace(/^["'“”]+|["'“”]+$/g, '').replace(/^the\s+/, '').trim();

/** Which audience a name belongs to, if it is one of the fixed ones. */
export function audienceOfName(name: string): Audience | null {
  const key = bare(name);

  for (const audience of AUDIENCES) {
    const nick = NICKNAMES[audience];
    const names = [nick.name, nick.japanese, nick.also?.name].filter((item): item is string => Boolean(item));

    if (names.some((item) => bare(item) === key)) return audience;
  }

  return null;
}

/**
 * The tracker's epithet: someone called Kan by a name on the page. A fixed
 * name teaches Kan that audience's name (and the audience starts using it if
 * it had not yet); anything else is kept as a name he has heard.
 */
export function applyEpithet(db: AppDatabase, heard: TurnDiff['epithet']): AppDatabase {
  if (!heard?.name?.trim()) return db;

  const renown = renownOf(db);
  const name = heard.name.trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 60);
  const owner = audienceOfName(name);

  if (!owner) {
    if (renown.heard?.some((item) => item.name.toLowerCase() === name.toLowerCase())) return db;
    return withRenown(db, { ...renown, heard: [...(renown.heard ?? []), { name, since: db.state.inStoryDate }].slice(-8) });
  }

  // "The Vulture" is the bounty trade's name; when Kakuzu uses it, the Akatsuki's too.
  const audiences: Audience[] = owner === 'underworld' && heard.audience === 'akatsuki' ? ['underworld', 'akatsuki'] : [owner];
  const epithets = { ...renown.epithets };
  let changed = false;

  for (const audience of audiences) {
    const current = epithets[audience];

    if (current?.known) continue;

    epithets[audience] = current ? { ...current, known: true } : { name: NICKNAMES[audience].name, since: db.state.inStoryDate, theme: 'fixed', known: true };
    changed = true;
  }

  return changed ? withRenown(db, { ...renown, epithets }) : db;
}

/** Kan saw a village's poster or bingo book: he now knows what it calls him. */
export function markEpithetsSeen(db: AppDatabase, villages: TurnDiff['bountySeen']): AppDatabase {
  if (!villages?.length) return db;

  const renown = renownOf(db);
  const epithets = { ...renown.epithets };
  let changed = false;

  for (const village of villages) {
    const epithet = epithets[village];

    if (epithet && !epithet.known) {
      epithets[village] = { ...epithet, known: true };
      changed = true;
    }
  }

  return changed ? withRenown(db, { ...renown, epithets }) : db;
}

/** Whose shinobi (or bounty trade) know of him where he stands. */
export function localAudience(db: AppDatabase): Audience {
  const village = territoryHere(db);

  if (village) return village;

  const region = regionOf(`${db.state.location} ${db.state.scene ?? ''}`) ?? currentRegion(db);

  if (region === 'rain') return 'rain';
  if (region === 'grass' || region === 'waterfall') return 'grass';
  return 'underworld';
}

const COUNTRYSIDE = /\b(farm\w*|fields?|paddy|paddies|orchards?|temples?|shrines?|monaster\w*|hamlets?|small village|villagers?|barns?|mill)\b/i;

/** Whose name ordinary people use where he stands. */
export function civilianAudience(db: AppDatabase): Audience {
  const place = `${fullPlace(db.state)} ${db.state.scene ?? ''}`;
  const region = regionOf(place) ?? currentRegion(db);

  if (region === 'rain') return 'rain';
  if (region === 'grass' || region === 'waterfall') return 'grass';
  if (COUNTRYSIDE.test(place) && !/\bhidden \w+ village\b/i.test(place)) return 'countryside';
  return 'towns';
}

/** The name strangers here would use, if one has stuck. */
export function localEpithet(db: AppDatabase): { audience: Audience; epithet: Epithet } | null {
  const epithets = renownOf(db).epithets;

  for (const audience of [civilianAudience(db), localAudience(db), 'underworld' as const]) {
    const epithet = epithets[audience];

    if (epithet) return { audience, epithet };
  }

  return null;
}

/** Names Kan has heard himself called, for the Journal. */
export function knownEpithets(db: AppDatabase): { audience: Audience; epithet: Epithet }[] {
  const epithets = renownOf(db).epithets;

  return AUDIENCES.flatMap((audience) => {
    const epithet = epithets[audience];

    return epithet?.known ? [{ audience, epithet }] : [];
  });
}

// ---------------------------------------------------------------------------
// The narrator

function sceneHasAkatsuki(db: AppDatabase) {
  return castWithCompanions(db, db.state.sceneCast ?? []).some((name) => resolveEntity(db, name)?.tags.includes('akatsuki'));
}

function sceneHasLeaf(db: AppDatabase) {
  return castWithCompanions(db, db.state.sceneCast ?? []).some((name) => resolveEntity(db, name)?.tags.includes('leaf'));
}

const STAGE_TEXT: Record<RenownStage, string> = {
  0: 'nothing has reached them',
  1: 'only whispers, no name yet',
  2: 'a name has stuck',
  3: 'the name is in their books and on their lips',
  4: 'a name people fear: travellers change roads, mothers use it to scare children',
};

function nickLabel(audience: Audience) {
  const nick = NICKNAMES[audience];

  return `"${nick.name}"${nick.japanese ? ` (${nick.japanese})` : ''}${nick.also ? `; ${nick.also.who} say "${nick.also.name}"` : ''}`;
}

/** One line on what an audience believes, as the narrator needs it. */
function audienceLine(db: AppDatabase, audience: Audience, who: string): string {
  const stage = renownStage(db, audience);

  if (stage === 0) return '';

  const epithet = renownOf(db).epithets[audience];
  const beliefs = beliefsOf(db, audience);
  const linked = linkedSince(db, audience);
  const name = stage >= 2 ? ` They call you ${nickLabel(audience)}${epithet?.known ? '' : '; you have never heard it'}.` : '';

  return `${who} (${STAGE_TEXT[stage]}).${name}${beliefs.length ? ` What they believe: ${beliefs.join('; ')}.` : ''} ${
    linked ? 'They know it is you, Kan.' : 'Nobody here links any of it to you or to the name Kan.'
  }`;
}

/**
 * Lines for YOUR NAME OUT THERE: what the people where Kan stands believe
 * and call him, what the Leaf thinks, and the Akatsuki's name for him.
 */
export function epithetLines(db: AppDatabase): string[] {
  const lines: string[] = [];
  const risk = encounterRisk(locationKindOf(db), timeOfDayOf(db.state.inStoryDate));

  if (risk !== 'none') {
    const shinobi = localAudience(db);
    const civilians = civilianAudience(db);
    const shinobiWho = isVillage(shinobi) ? `${VILLAGE_NAME[shinobi]}'s shinobi` : shinobi === 'underworld' ? 'Bounty hunters and mercenaries here' : `The people of ${AUDIENCE_NAME[shinobi].replace(/^the people of /, '')}`;
    const local = audienceLine(db, shinobi, shinobiWho);

    if (local) lines.push(local);

    if (civilians !== shinobi) {
      const people = audienceLine(db, civilians, civilians === 'countryside' ? 'Farmers, monks and villagers here' : 'Ordinary people in the towns and on the roads here');

      if (people) lines.push(people);
    }
  }

  if (firstNight(db)) {
    lines.push(
      'Tonight the Leaf still counts you as one of its own: an ANBU out on an order. Nobody there knows what has happened in the Uchiha district yet. By dawn it is found, and you are listed missing, presumed dead.'
    );
  } else if (leafThinksDead(db) && (territoryHere(db) === 'leaf' || sceneHasLeaf(db))) {
    lines.push(
      `The Leaf believes you dead: its file reads "${LEAF_FILE}" (only Hiruzen knows better). Anyone from the Leaf who knew you, or an Inuzuka by your scent, would be shocked to find you alive; to anyone else you are a stranger.`
    );
  }


  const akatsuki = renownOf(db).epithets.akatsuki;

  if (akatsuki && sceneHasAkatsuki(db)) {
    lines.push(`Kakuzu, who knows the bounty trade, calls you "${akatsuki.name}" when he wants to needle you.`);
  }

  if (lines.length > 0) {
    lines.push(
      'Use only these names for you; never invent another. Your real name is yours to give: never have you blurt it, but when someone asks who you are, you may choose to say it (then they know).'
    );
  }

  if (!firstNight(db) && leafThinksDead(db) && !db.state.canonProgress?.completed.includes('kan-joins-akatsuki')) {
    // Session 3: Itachi called them both "missing-nin" on the second day.
    lines.push(
      `Nobody has declared you a missing-nin: the Leaf's file reads "${LEAF_FILE}" (your body was never found; there were no remains to mistake for yours), not a deserter's entry. Itachi is the missing-nin; nobody (Itachi included) calls you one, or says "we" are, until the Leaf learns you are alive.`
    );
  }

  return lines;
}

function checkpoint(db: AppDatabase) {
  return /\b(checkpoint|border|gate|toll|barrier station|outpost)\b/i.test(`${fullPlace(db.state)} ${db.state.scene ?? ''}`);
}

/** Where people gather and talk: towns, and checkpoints on the road. */
function placeThatTalks(db: AppDatabase) {
  const kind = locationKindOf(db);

  return kind === 'settlement' || (kind === 'road' && checkpoint(db));
}

const SKETCH: Record<string, string> = { B: 'poor', A: 'fair', S: 'good' };

/** The wanted poster that hangs here, if any. */
export function posterLine(db: AppDatabase): string {
  if (!placeThatTalks(db)) return '';

  const village = territoryHere(db);
  const listing = bingoListings(db).find((item) => item.village === village && item.rank !== 'C');

  if (!listing || !village) return '';

  const subject = listingSubject(db, village);
  const what = subject.linked
    ? `your face, ${listing.rank}-rank, ${formatRyo(listing.bounty)}, as Kan, also known as "${NICKNAMES[village].name}", with a ${SKETCH[listing.rank]} sketch`
    : `${subject.label}, ${listing.rank}-rank, ${formatRyo(listing.bounty)}, with no face: only a description of what was seen (${beliefsOf(db, village).slice(0, 2).join('; ') || 'his deeds'})`;

  return `WANTED POSTERS: ${VILLAGE_NAME[village]}'s poster hangs here (inns, the notice board, the checkpoint): ${what}. Only if Kan looks at one does he learn what it says.`;
}

export type RumourOffer = { deed: Deed; level: 0 | 1 | 2; daysAgo: number; from: Region | null; audience: Audience };

/** The deed people might be talking about here this turn, or null. Deterministic per turn. */
export function rumourOffer(db: AppDatabase): RumourOffer | null {
  if (isCombatPace(db.state.scenePace) || !placeThatTalks(db)) return null;
  if (encounterRisk(locationKindOf(db), timeOfDayOf(db.state.inStoryDate)) === 'none') return null;

  const turn = playerTurnCount(db);

  if (turn < RUMOUR_MIN_TURN || hashText(`${db.meta.slotId}:rumour:${turn}`) % RUMOUR_WINDOW_TURNS !== 0) return null;

  const audience = civilianAudience(db);
  const here = currentRegion(db);
  const heard = arrivedDeeds(db, audience)
    .filter((item) => item.daysAgo <= 1100)
    .sort((a, b) => b.weight / (1 + b.daysAgo / 180) - a.weight / (1 + a.daysAgo / 180));

  if (heard.length === 0) return null;

  const pick = heard[hashText(`${db.meta.slotId}:rumour-pick:${turn}`) % Math.min(3, heard.length)];
  const from = (pick.deed.region as Region | undefined) ?? null;
  const distance = from ? travelDaysBetween(here, from) : 3;
  const level: 0 | 1 | 2 = distance <= 1 && pick.daysAgo < 60 ? 0 : distance <= 3 && pick.daysAgo < 400 ? 1 : 2;

  return { deed: pick.deed, level, daysAgo: pick.daysAgo, from, audience };
}

const DISTORTION = [
  'Close to the truth: a detail or two wrong.',
  'It has grown in the telling: wrong numbers, the wrong place, a worse version of you.',
  'Barely recognisable by now, a monster story ("they say he drinks a man dry and leaves him for the birds").',
];

function ago(days: number) {
  if (days >= 330) return `${Math.max(1, Math.round(days / 365))} year(s) ago`;
  if (days >= 50) return `${Math.round(days / 30)} months ago`;
  return `${Math.max(1, Math.round(days / 7))} week(s) ago`;
}

/** TALK OF YOU: the optional rumour and the poster that hangs here. */
export function formatRenownBlock(db: AppDatabase, userMessage = ''): string {
  const lines: string[] = [];
  const rumour = rumourOffer(db);

  if (rumour) {
    const stage = renownStage(db, rumour.audience);
    const named = stage >= 2 ? ` They call you "${NICKNAMES[rumour.audience].name}".` : ' Nobody has a name for you yet: "someone", "a thing on the roads".';
    const linked = linkedSince(db, rumour.audience);

    lines.push(
      `TALK OF YOU (optional; only if people here would gossip): someone at an inn, teahouse, market or checkpoint talks about a thing you did ${ago(rumour.daysAgo)}${rumour.from ? ` in ${regionName(rumour.from, db)}` : ''}: ${rumour.deed.text}. ${DISTORTION[rumour.level]}${named} ${
        linked ? 'They know the name Kan goes with it, but not your face unless they have seen it.' : 'They do not know it was you, or that anyone called Kan exists.'
      }`
    );
  }

  const poster = posterLine(db);

  if (poster) lines.push(poster);

  const book = bookBeingRead(db, userMessage);

  if (book) lines.push(book);

  return lines.join('\n');
}

export function renownTrackingLine(db: AppDatabase): string {
  const local = localEpithet(db);

  return [
    `epithet: {audience, name} only when someone in the prose calls you by one of your names (the Vulture, Death's Bird, the Blood Vulture, the Corpse-Eater, Bone-Picker, Black Fire, the Red-Eyed Ghost, Kyūketsuki, the Hungry Ghost, the Red Flock) or a title of their own for you; audience = whose people said it: leaf, sand, mist, cloud, stone, akatsuki, rain, grass (the Grass and the Waterfall), underworld (bounty hunters, mercenaries), towns (townsfolk, trade roads), countryside (farmers, temples, small villages); otherwise null.${local ? ` Here they call you "${local.epithet.name}".` : ''}`,
    'name_out: [{who, how}] only when THIS turn someone who will live to tell it learns that you, Kan, are the one behind your nickname or deeds: you told them your name or showed them who you are (how = told), or someone who knew you before recognised you, by face or, for an Inuzuka, by scent (how = recognised). who = whose people they are (the same ids as epithet). Otherwise [].',
  ].join('\n- ');
}

// ---------------------------------------------------------------------------
// Bingo books Kan carries

const BOOK_ITEM = /\bbingo[- ]?books?\b/i;

const BOOK_OWNER: Array<[RegExp, Audience]> = [
  [/\b(leaf|konoha)\b/i, 'leaf'],
  [/\b(sand|suna)\b/i, 'sand'],
  [/\b(mist|kiri)\b/i, 'mist'],
  [/\b(cloud|kumo)\b/i, 'cloud'],
  [/\b(stone|iwa)\b/i, 'stone'],
];

/** Whose book an inventory item is: a village's, or a bounty hunter's copy. */
export function bookOwner(item: string): Audience {
  return BOOK_OWNER.find(([test]) => test.test(item))?.[1] ?? 'underworld';
}

const ORDERS: Record<string, string> = {
  C: 'Capture or kill if encountered. Report sightings.',
  B: 'Engage only with a full team. Report sightings to the nearest outpost.',
  A: 'Jōnin squads only. Do not engage alone; report and withdraw.',
  S: 'Do not engage. Flee on sight and report.',
};

/** The entry an audience's book carries on him (the village's own, or the top price for the trade's copy). */
function bookListing(db: AppDatabase, audience: Audience): BingoListing | null {
  const listings = bingoListings(db);

  if (isVillage(audience)) return listings.find((item) => item.village === audience) ?? null;
  return listings[0] ?? null;
}

/**
 * The page on Kan in an audience's bingo book today, exactly as printed:
 * their name for him, what they believe (wrong where they are wrong), the
 * price, and orders. Null when the book has nothing on him.
 */
export function bingoPage(db: AppDatabase, audience: Audience): string | null {
  const listing = bookListing(db, audience);

  if (!listing) return null;

  const owner = isVillage(audience) ? audience : listing.village;
  const linked = linkedSince(db, owner) ?? (isVillage(audience) ? null : linkedSince(db, 'underworld'));
  const nick = NICKNAMES[isVillage(audience) ? audience : 'underworld'];
  const beliefs = beliefsOf(db, isVillage(audience) ? audience : 'underworld');
  const now = db.state.inStoryDate;
  const last = [...arrivedDeeds(db, isVillage(audience) ? audience : 'underworld')].sort((a, b) => a.daysAgo - b.daysAgo)[0];
  const header = isVillage(audience)
    ? `${VILLAGE_NAME[audience].toUpperCase()} · BINGO BOOK`
    : `BINGO BOOK · a bounty hunter's copy (prices from ${listing.name})`;
  const identity = linked
    ? 'Identity: Kan, formerly of the Hidden Leaf’s ANBU. Uchiha clan. Missing since the night of the Uchiha massacre.'
    : owner === 'leaf'
      ? 'Identity: unknown. Possibly Itachi Uchiha, or an Uchiha who survived the massacre.'
      : 'Identity: unknown.';

  return [
    `${header} · printed ${monthName(now.month)}, Year ${now.year}`,
    `${linked ? `Kan, also known as “${capitalise(nick.name)}”` : `“${capitalise(nick.name)}”`}${nick.japanese ? ` (${nick.japanese})` : ''} · ${listing.rank}-rank · ${formatRyo(listing.bounty)}`,
    identity,
    beliefs.length > 0 ? `Reported: ${beliefs.map((item) => capitalise(item)).join('. ')}.` : 'Reported: little is known.',
    last?.deed.region ? `Last reported: ${regionName(last.deed.region as Region, db)}, ${monthName(last.deed.date.month)} of Year ${last.deed.date.year}.` : '',
    linked && listing.rank !== 'C' ? `Sketch: ${SKETCH[listing.rank]}.` : 'No likeness on file.',
    `Orders: ${ORDERS[listing.rank]}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Bingo books that came into Kan's hands: the page is kept as printed that
 * day, and he now knows what that book calls him. Books that left the
 * inventory are dropped.
 */
export function syncCarriedBooks(db: AppDatabase): AppDatabase {
  const renown = renownOf(db);
  const items = db.state.inventory.filter((item) => BOOK_ITEM.test(item));
  const kept = (renown.books ?? []).filter((book) => items.includes(book.item));
  const added: CarriedBingoBook[] = items
    .filter((item) => !kept.some((book) => book.item === item))
    .map((item) => {
      const audience = bookOwner(item);

      return { id: makeId('book'), item, audience, edition: db.state.inStoryDate, page: bingoPage(db, audience) };
    });

  if (added.length === 0 && kept.length === (renown.books ?? []).length) return db;

  const epithets = { ...renown.epithets };
  let reputation = reputationOf(db);

  for (const book of added) {
    if (!book.page) continue;

    const named = isVillage(book.audience) ? book.audience : 'underworld';
    const current = epithets[named];
    epithets[named] = current ? { ...current, known: true } : { name: NICKNAMES[named].name, since: db.state.inStoryDate, theme: 'fixed', known: true };

    const village = isVillage(book.audience) ? book.audience : bookListing(db, book.audience)?.village;
    const entry = village ? reputation.villages[village] : undefined;

    if (village && entry && !entry.known) {
      reputation = { ...reputation, villages: { ...reputation.villages, [village]: { ...entry, known: true } } };
    }
  }

  return {
    ...db,
    state: {
      ...db.state,
      reputation,
      renown: { ...renown, epithets, books: [...kept, ...added].slice(-MAX_BOOKS) },
    },
  };
}

/** The books Kan carries, for the Journal. */
export function carriedBooks(db: AppDatabase): CarriedBingoBook[] {
  return renownOf(db).books ?? [];
}

const READING = /\b(bingo|read(s|ing)?|open(s|ing)?|page|leaf(s|ing)? through|look(s|ing)? (at|through)|flip(s|ping)?|entry|book)\b/i;

/** When Kan carries a book and the turn is about it, the page he would read, word for word. */
function bookBeingRead(db: AppDatabase, userMessage: string): string {
  const books = carriedBooks(db);

  if (books.length === 0 || !READING.test(userMessage) || !/\b(book|bingo|page|entry)\b/i.test(userMessage)) return '';

  return [
    'THE BINGO BOOK YOU CARRY (if you read your own page, quote it exactly as written here, mistakes included; never correct it):',
    ...books.map((book) => `- ${book.item}: ${book.page ? book.page.split('\n').join(' / ') : 'it has no page on you.'}`),
  ].join('\n');
}
