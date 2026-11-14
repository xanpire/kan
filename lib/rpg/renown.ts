// Rumours, posters and Kan's name (living-world Stage 3, section 10).
//
// - Deeds: every time the people of a village (or the Akatsuki) see Kan do
//   something and live to tell it (the state tracker's `reputation`), the
//   deed is kept with where and when it happened.
// - Kan's name grows by itself: each audience (a village's bingo book, the
//   Akatsuki, the people of the Rain, the underworld of bounty hunters and
//   mercenaries) calls him by an epithet that grows from what they saw, never
//   one the player picks. It can change over the years as new deeds outweigh
//   old ones. A name the story itself gives him (someone in the prose calls
//   him by it: the tracker's `epithet`) is kept for that audience.
// - Rumours: in inns, teahouses, markets and at checkpoints, people talk
//   about his deeds. News travels only as far and as fast as people carry
//   it, and it is distorted by distance and time: close to the truth nearby,
//   grown in the telling further off, a monster story far away.
// - Wanted posters: where a village that lists him at B-rank or above holds
//   the land, its poster hangs in towns and at checkpoints with his rank,
//   bounty and name; the sketch is poor at B, fair at A, good at S.
//
// The narrator gets one line of what they call him here (inside YOUR NAME
// OUT THERE) and, now and then, an optional TALK OF YOU line.

import { dateSortValue, daysBetween, timeOfDayOf } from './calendar';
import { isCombatPace } from './canon';
import { castWithCompanions } from './companions';
import { encounterRisk, locationKindOf } from './encounters';
import { resolveEntity } from './entities';
import { REGION_NAME, regionName, regionOf, travelDaysBetween, type Region } from './geography';
import { makeId } from './id';
import { LEAF_START_REASON, VILLAGE_NAME, bingoListings, formatRyo, territoryHere, territoryOf } from './reputation';
import { hashText, playerTurnCount } from './util';
import type { AppDatabase, Audience, Deed, Epithet, RenownState, TurnDiff, VillageFaction } from './types';

const MAX_DEEDS = 40;
/** A theme needs this much weight before an audience names Kan after it. */
const NAME_AT = 12;
/** A new theme replaces the old name only when it leads by this much... */
const RENAME_LEAD = 1.25;
/** ...and the old name has stood this long. */
const RENAME_AFTER_DAYS = 120;
/** One rumour turn in this many (in places where people talk). */
const RUMOUR_WINDOW_TURNS = 5;
const RUMOUR_MIN_TURN = 4;

export const AUDIENCES: Audience[] = ['leaf', 'sand', 'mist', 'cloud', 'stone', 'akatsuki', 'rain', 'underworld'];

export const AUDIENCE_NAME: Record<Audience, string> = {
  leaf: "the Hidden Leaf's bingo book",
  sand: "the Hidden Sand's bingo book",
  mist: "the Hidden Mist's bingo book",
  cloud: "the Hidden Cloud's bingo book",
  stone: "the Hidden Stone's bingo book",
  akatsuki: 'the Akatsuki',
  rain: 'the people of the Rain',
  underworld: 'bounty hunters and the underworld',
};

type Tone = 'formal' | 'street' | 'akatsuki';

type Theme = {
  id: string;
  test: RegExp;
  names: { formal: string; street: [string, string]; akatsuki: string };
  /** Old news counts for less. */
  fades?: boolean;
};

const THEMES: Theme[] = [
  {
    id: 'uchiha',
    test: /\b(itachi|uchiha|massacre|accomplice)\b/i,
    names: { formal: "Itachi's Shadow", street: ['the Other Uchiha', 'the Uchiha Stray'], akatsuki: "Itachi's Pup" },
    fades: true,
  },
  {
    id: 'eyes',
    test: /\b(sharingan|mangeky[oō]|genjutsu|red eyes?|his eyes)\b/i,
    names: { formal: 'the Red-Eyed Ghost', street: ['Red Eyes', 'the Crow-Eyed Man'], akatsuki: 'the Starer' },
  },
  {
    id: 'fire',
    test: /\b(fire style|fire release|flames?|burn(ed|ing|t)?|blaze|ash|inferno|scorch(ed)?|fireball)\b/i,
    names: { formal: 'the Ash Wraith', street: ['the Burning Ghost', 'the Grey Fire'], akatsuki: 'the Matchstick' },
  },
  {
    id: 'thief',
    test: /\b(thousand souls|drain(ed|ing)? (their|his|her)? ?chakra|stole (their|his|her)? ?chakra|husks?|siphon(ed)?)\b/i,
    names: { formal: 'the Soul Thief', street: ['the Hollower', 'the Chakra Drinker'], akatsuki: 'the Leech' },
  },
  {
    id: 'ghost',
    test: /\b(vanish(ed)?|unseen|without a trace|slipped (away|past|through)|disappear(ed)?|escaped|evaded|no one saw)\b/i,
    names: { formal: 'the Uncatchable', street: ['the Ghost', 'Smoke'], akatsuki: 'the Draft' },
  },
  {
    id: 'butcher',
    test: /\b(killed|slaughter(ed)?|cut down|butcher(ed)?|bodies|wiped out|murdered)\b/i,
    names: { formal: 'the Quiet Butcher', street: ['the Red Hand', 'the Butcher of the Roads'], akatsuki: 'the Tidy One' },
  },
  {
    id: 'mercy',
    test: /\b(spared|saved|protected|helped|sheltered|healed|rescued|let (them|him|her) (live|go))\b/i,
    names: { formal: 'the Merciful Missing-nin', street: ['the Kind Devil', 'the Wolf Who Spares'], akatsuki: 'the Soft One' },
  },
  {
    id: 'seal',
    test: /\b(seal(ed|ing)?|chakra chains?|chains|uzumaki|barrier)\b/i,
    names: { formal: 'the Red Chain', street: ['the Chainmaker', 'Red Chains'], akatsuki: 'the Locksmith' },
  },
  {
    id: 'lightning',
    test: /\b(lightning style|lightning release|chidori|thunder|storm)\b/i,
    names: { formal: 'the Stormcrow', street: ['Thunderhand', 'the Storm Walker'], akatsuki: 'Sparks' },
  },
  {
    id: 'water',
    test: /\b(water style|water release|drown(ed)?|flood(ed)?)\b/i,
    names: { formal: 'the Drowner', street: ['the Tide Ghost', 'the Wet Death'], akatsuki: 'the Puddle' },
  },
  {
    id: 'wind',
    test: /\b(wind style|wind release|gale|wind blades?)\b/i,
    names: { formal: 'the Gale Blade', street: ['the Cutting Wind', 'Whisper Blade'], akatsuki: 'the Breeze' },
  },
  {
    id: 'earth',
    test: /\b(earth style|earth release|quake|landslide|buried)\b/i,
    names: { formal: 'the Mountain Breaker', street: ['the Quake', 'Stonefist'], akatsuki: 'the Mole' },
  },
  {
    id: 'susanoo',
    test: /\b(susanoo|spectral (giant|warrior|ribcage)|giant of (bone|chakra))\b/i,
    names: { formal: "the Giant's Shadow", street: ['the Demon of Bones', 'the Red Giant'], akatsuki: 'the Big One' },
  },
  {
    id: 'cloak',
    test: /\b(akatsuki|red clouds?|black cloak)\b/i,
    names: { formal: 'the Red-Cloud Uchiha', street: ['Red Clouds', 'the Cloak'], akatsuki: 'the New Cloak' },
  },
];

const THEME_BY_ID = new Map(THEMES.map((theme) => [theme.id, theme]));

export function renownOf(db: AppDatabase): RenownState {
  const renown = db.state.renown;

  return {
    deeds: Array.isArray(renown?.deeds) ? renown.deeds : [],
    epithets: renown?.epithets && typeof renown.epithets === 'object' ? renown.epithets : {},
  };
}

function withRenown(db: AppDatabase, renown: RenownState): AppDatabase {
  return { ...db, state: { ...db.state, renown } };
}

export function normalizeRenown(raw: unknown): RenownState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const value = raw as Partial<RenownState>;
  const deeds = Array.isArray(value.deeds)
    ? value.deeds.filter((deed): deed is Deed => Boolean(deed) && typeof deed.text === 'string' && Boolean(deed.date))
    : [];
  const epithets: RenownState['epithets'] = {};

  for (const audience of AUDIENCES) {
    const epithet = value.epithets?.[audience];

    if (epithet && typeof epithet.name === 'string' && epithet.since) epithets[audience] = epithet;
  }

  return { deeds: deeds.slice(-MAX_DEEDS), epithets };
}

function audienceTone(audience: Audience): Tone {
  if (audience === 'akatsuki') return 'akatsuki';
  if (audience === 'rain' || audience === 'underworld') return 'street';
  return 'formal';
}

function nameFor(theme: Theme, audience: Audience): string {
  const tone = audienceTone(audience);

  if (tone === 'street') return theme.names.street[audience === 'rain' ? 1 : 0];
  return theme.names[tone];
}

/** How much each deed counts for an audience. */
function deedWeightFor(db: AppDatabase, deed: Deed, audience: Audience): number {
  const age = daysBetween(deed.date, db.state.inStoryDate);
  const fresh = age > 730 ? 0.5 : 1;
  const base = Math.abs(deed.weight) * fresh;

  switch (audience) {
    case 'akatsuki':
      return deed.faction === 'akatsuki' ? base : 0;
    case 'rain':
      return deed.region === 'rain' ? base : deed.faction === 'akatsuki' ? base * 0.5 : 0;
    case 'underworld':
      return deed.faction && deed.faction !== 'akatsuki' ? base * 0.6 : 0;
    default:
      return deed.faction === audience ? base : 0;
  }
}

/** Theme scores for one audience, highest first. */
export function themeScores(db: AppDatabase, audience: Audience): { theme: Theme; score: number }[] {
  const scores = new Map<string, number>();
  const age = (deed: Deed) => daysBetween(deed.date, db.state.inStoryDate);

  for (const deed of renownOf(db).deeds) {
    const weight = deedWeightFor(db, deed, audience);

    if (weight <= 0) continue;

    for (const theme of THEMES) {
      if (!theme.test.test(deed.text)) continue;

      // The massacre is the Leaf's first word on Kan; later deeds outgrow it.
      const fade = theme.fades && age(deed) > 365 ? 0.35 : 1;
      scores.set(theme.id, (scores.get(theme.id) ?? 0) + weight * fade);
    }
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ theme: THEME_BY_ID.get(id)!, score }))
    // Ties go to the theme listed first (the massacre before "vanished").
    .sort((a, b) => b.score - a.score || THEMES.indexOf(a.theme) - THEMES.indexOf(b.theme));
}

/** Re-names Kan where the deeds call for it. Story-given names stand while they are young. */
function settleEpithets(db: AppDatabase): AppDatabase {
  const now = db.state.inStoryDate;
  const renown = renownOf(db);
  const epithets = { ...renown.epithets };
  let changed = false;

  for (const audience of AUDIENCES) {
    const [top] = themeScores(db, audience);

    if (!top || top.score < NAME_AT) continue;

    const current = epithets[audience];
    const name = nameFor(top.theme, audience);

    if (current?.theme === top.theme.id || current?.name === name) continue;

    if (current) {
      const standing = daysBetween(current.since, now);
      const currentScore = themeScores(db, audience).find((item) => item.theme.id === current.theme)?.score ?? 0;
      const story = current.theme === 'story';

      if (standing < (story ? RENAME_AFTER_DAYS * 6 : RENAME_AFTER_DAYS)) continue;
      if (top.score < Math.max(currentScore, story ? NAME_AT * 2 : 0) * RENAME_LEAD) continue;
    }

    epithets[audience] = {
      name,
      since: now,
      theme: top.theme.id,
      known: false,
      history: current ? [...(current.history ?? []), { name: current.name, since: current.since }].slice(-6) : undefined,
    };
    changed = true;
  }

  return changed ? withRenown(db, { ...renownOf(db), epithets }) : db;
}

/**
 * Keeps this turn's deeds (from the tracker's reputation changes) and lets
 * the names follow. The Leaf's first entry on Kan counts as its first deed.
 */
export function recordDeeds(db: AppDatabase, changes: TurnDiff['reputation']): AppDatabase {
  let renown = renownOf(db);
  const now = db.state.inStoryDate;
  const region = regionOf(db.state.location) ?? regionOf(db.state.scene) ?? undefined;
  const deeds = [...renown.deeds];
  const leaf = db.state.reputation?.villages.leaf;

  if (leaf?.listedOn && !deeds.some((deed) => deed.faction === 'leaf')) {
    deeds.push({ id: makeId('deed'), date: leaf.listedOn, text: leaf.lastReason ?? LEAF_START_REASON, faction: 'leaf', region: 'fire', weight: 20 });
  }

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

  if (deeds.length === renown.deeds.length) return settleEpithets(db);

  renown = { ...renown, deeds: deeds.slice(-MAX_DEEDS) };
  return settleEpithets(withRenown(db, renown));
}

/** The tracker's epithet: someone called Kan by a name on the page. */
export function applyEpithet(db: AppDatabase, heard: TurnDiff['epithet']): AppDatabase {
  if (!heard?.name?.trim() || !AUDIENCES.includes(heard.audience)) return db;

  const renown = renownOf(db);
  const name = heard.name.trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, 60);
  const current = renown.epithets[heard.audience];

  if (current && current.name.toLowerCase() === name.toLowerCase()) {
    return current.known ? db : withRenown(db, { ...renown, epithets: { ...renown.epithets, [heard.audience]: { ...current, known: true } } });
  }

  // Heard under another audience's name: Kan learns that one.
  for (const audience of AUDIENCES) {
    const other = renown.epithets[audience];

    if (other && other.name.toLowerCase() === name.toLowerCase()) {
      return withRenown(db, { ...renown, epithets: { ...renown.epithets, [audience]: { ...other, known: true } } });
    }
  }

  return withRenown(db, {
    ...renown,
    epithets: {
      ...renown.epithets,
      [heard.audience]: {
        name,
        since: db.state.inStoryDate,
        theme: 'story',
        known: true,
        history: current ? [...(current.history ?? []), { name: current.name, since: current.since }].slice(-6) : undefined,
      },
    },
  });
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

/** Whose name for Kan strangers use where he stands. */
export function localAudience(db: AppDatabase): Audience {
  const place = `${db.state.location} ${db.state.scene ?? ''}`;
  const village = territoryOf(place);

  if (village) return village;
  if (regionOf(place) === 'rain') return 'rain';
  return 'underworld';
}

/** The name strangers here would use, if there is one yet. */
export function localEpithet(db: AppDatabase): { audience: Audience; epithet: Epithet } | null {
  const epithets = renownOf(db).epithets;
  const audience = localAudience(db);
  const order: Audience[] = [audience, 'underworld'];

  for (const item of order) {
    const epithet = epithets[item];

    if (epithet) return { audience: item, epithet };
  }

  return null;
}

/** Names Kan has heard himself called, for the Kan tab. */
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

/** One line for YOUR NAME OUT THERE: what they call him here (and inside the Akatsuki). */
export function epithetLines(db: AppDatabase): string[] {
  const lines: string[] = [];
  const local = localEpithet(db);
  const risk = encounterRisk(locationKindOf(db), timeOfDayOf(db.state.inStoryDate));

  if (local && risk !== 'none') {
    lines.push(
      `What strangers here call you: "${local.epithet.name}" (${AUDIENCE_NAME[local.audience]}); people who talk about you use it${local.epithet.known ? '' : ', and you have never heard it'}.`
    );
  }

  const akatsuki = renownOf(db).epithets.akatsuki;

  if (akatsuki && sceneHasAkatsuki(db)) {
    lines.push(`Inside the Akatsuki they call you "${akatsuki.name}" behind your back.`);
  }

  return lines;
}

function checkpoint(db: AppDatabase) {
  return /\b(checkpoint|border|gate|toll|barrier station|outpost)\b/i.test(`${db.state.location} ${db.state.scene ?? ''}`);
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

  const name = renownOf(db).epithets[village as VillageFaction]?.name;

  return `WANTED POSTERS: ${VILLAGE_NAME[village]}'s poster for you hangs here (inns, the notice board, the checkpoint): ${listing.rank}-rank, ${formatRyo(listing.bounty)}${name ? `, as "${name}"` : ''}, with a ${SKETCH[listing.rank]} sketch. Only if Kan looks at one does he learn what it says.`;
}

export type RumourOffer = { deed: Deed; level: 0 | 1 | 2; daysAgo: number; from: Region | null };

/** The deed people might be talking about here this turn, or null. Deterministic per turn. */
export function rumourOffer(db: AppDatabase): RumourOffer | null {
  if (isCombatPace(db.state.scenePace) || !placeThatTalks(db)) return null;
  if (encounterRisk(locationKindOf(db), timeOfDayOf(db.state.inStoryDate)) === 'none') return null;

  const turn = playerTurnCount(db);

  if (turn < RUMOUR_MIN_TURN || hashText(`${db.meta.slotId}:rumour:${turn}`) % RUMOUR_WINDOW_TURNS !== 0) return null;

  const here = regionOf(db.state.location) ?? regionOf(db.state.scene);
  const now = db.state.inStoryDate;
  const heard = renownOf(db)
    .deeds.map((deed) => {
      const daysAgo = Math.max(0, daysBetween(deed.date, now));
      const distance = here && deed.region ? travelDaysBetween(here, deed.region as Region) : 3;

      return { deed, daysAgo, distance };
    })
    // Talk walks: it needs time to get here, about four days per day of road.
    .filter((item) => item.daysAgo >= item.distance * 4 && item.daysAgo <= 1100)
    .sort((a, b) => b.deed.weight / (1 + b.daysAgo / 180) - a.deed.weight / (1 + a.daysAgo / 180));

  if (heard.length === 0) return null;

  const pick = heard[hashText(`${db.meta.slotId}:rumour-pick:${turn}`) % Math.min(3, heard.length)];
  const level: 0 | 1 | 2 = pick.distance <= 1 && pick.daysAgo < 60 ? 0 : pick.distance <= 3 && pick.daysAgo < 400 ? 1 : 2;

  return { deed: pick.deed, level, daysAgo: pick.daysAgo, from: (pick.deed.region as Region) ?? null };
}

const DISTORTION = [
  'Close to the truth: a detail or two wrong.',
  'It has grown in the telling: wrong numbers, the wrong place, a worse version of you.',
  'Barely recognisable by now, a monster story ("they say the Uchiha ate a man\'s heart").',
];

function ago(days: number) {
  if (days >= 330) return `${Math.max(1, Math.round(days / 365))} year(s) ago`;
  if (days >= 50) return `${Math.round(days / 30)} months ago`;
  return `${Math.max(1, Math.round(days / 7))} week(s) ago`;
}

/** TALK OF YOU: the optional rumour and the poster that hangs here. */
export function formatRenownBlock(db: AppDatabase): string {
  const lines: string[] = [];
  const rumour = rumourOffer(db);

  if (rumour) {
    const name = localEpithet(db)?.epithet.name;

    lines.push(
      `TALK OF YOU (optional; only if people here would gossip): someone at an inn, teahouse, market or checkpoint talks about a thing you did ${ago(rumour.daysAgo)}${rumour.from ? ` in ${regionName(rumour.from, db)}` : ''}: ${rumour.deed.text}. ${DISTORTION[rumour.level]}${name ? ` They call you "${name}".` : ''} They do not know they are talking to you unless they recognize you.`
    );
  }

  const poster = posterLine(db);

  if (poster) lines.push(poster);

  return lines.join('\n');
}

export function renownTrackingLine(db: AppDatabase): string {
  const local = localEpithet(db);

  return `epithet: {audience, name} only when someone in the prose calls you by a name or title of their own for you (a nickname, a bingo-book title, "the Ghost of the Rain"); audience = whose name it is: leaf, sand, mist, cloud, stone (their bingo book or people), akatsuki, rain (the people of the Land of Rain), underworld (bounty hunters, mercenaries, other countries); otherwise null.${local ? ` Here they call you "${local.epithet.name}" (${local.audience}).` : ''}`;
}
