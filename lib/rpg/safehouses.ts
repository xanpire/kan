// Safehouses (living-world section 20).
//
// Any place Kan stays can become a safehouse by itself: he sleeps there, or
// the story says he settles in, and the state tracker names it and says what
// kind it is. It stays until it stops working: a rented room's time runs
// out, it's destroyed, the wrong people find it, the host takes it back, or
// Kan gives it up. A camp is gone when he leaves, unless he comes back to it
// or sets it up properly; then it becomes his own. Ended places move to the
// former places with what happened to them.
//
// A safehouse holds who knows of it (what makes it safe or not), a stash,
// upgrades the story builds over the years, and people living there. Resting
// somewhere safe heals more; in a compromised place Kan may not sleep at
// all. Someone with a reason to come after Kan who learns of a place becomes
// a delayed consequence ("found"): it comes back when he is there, or they
// search it while he is away and the stash goes.
//
// The narrator only hears about it when Kan is at one or heading to one, in
// one line. Otherwise CURRENT STATE names the places he can go back to.

import { dateSortValue, daysBetween, formatDayMonth, shiftDate } from './calendar';
import { isCombatPace } from './canon';
import { characterRefs } from './characterRefs';
import { castWithCompanions } from './companions';
import { plantSeed, seedsOf } from './consequences';
import { isDeceased, kanKnowsDeath } from './deaths';
import { grudgeKnown } from './disclosure';
import { resolveEntity } from './entities';
import { REGION_NAME, isRegion, regionOf, type Region } from './geography';
import { localizePlaceNames } from './glossary';
import { makeId } from './id';
import { placeIdOf } from './mapData';
import { isAkatsukiMember, territoryOf } from './reputation';
import { uniqueList } from './util';
import type {
  AppDatabase,
  CalendarDate,
  EntityRecord,
  ReputationFaction,
  Safehouse,
  SafehouseDiff,
  SafehouseEnd,
  SafehouseKind,
  SafehouseState,
  VillageFaction,
} from './types';
import { addItems } from './inventory';
import { displayName } from './names';

export const SAFEHOUSE_KINDS: SafehouseKind[] = ['own', 'rented', 'borrowed', 'base', 'camp'];
export const SAFEHOUSE_ENDS: Exclude<SafehouseEnd, 'left'>[] = ['expired', 'destroyed', 'compromised', 'withdrawn', 'given-up'];

/** Active places kept at once; the least visited go first. */
const MAX_ACTIVE = 16;
/** Former places kept. */
const MAX_ENDED = 24;
/** Not visited in this long: overgrown. */
export const OVERGROWN_DAYS = 730;
/** A camp Kan comes back to within this long becomes his own. */
const CAMP_RETURN_DAYS = 60;
/** Searched this long after its time came, while Kan is away. */
const RAID_AFTER_DAYS = 7;
/** Extra days of healing per night slept somewhere safe. */
const SAFE_REST_HEAL_DAYS = 2;
/** A rented room is vacated at this hour after its last paid night. */
const CHECKOUT_HOUR = 10;

export function safehouseState(db: Pick<AppDatabase, 'state'>): SafehouseState {
  const state = db.state.safehouses;

  return state && Array.isArray(state.places) ? state : { places: [] };
}

export function safehousesOf(db: Pick<AppDatabase, 'state'>): Safehouse[] {
  return safehouseState(db).places;
}

export function activeSafehouses(db: Pick<AppDatabase, 'state'>): Safehouse[] {
  return safehousesOf(db).filter((house) => house.status === 'active');
}

export function formerSafehouses(db: Pick<AppDatabase, 'state'>): Safehouse[] {
  return safehousesOf(db)
    .filter((house) => house.status === 'ended')
    .sort((a, b) => dateSortValue(b.ended?.on ?? b.lastVisit) - dateSortValue(a.ended?.on ?? a.lastVisit));
}

function withState(db: AppDatabase, state: SafehouseState): AppDatabase {
  const active = state.places.filter((house) => house.status === 'active');
  const ended = state.places.filter((house) => house.status === 'ended');
  // Too many active places: the least visited fall away (kept as former).
  let keptActive = active;
  const dropped: Safehouse[] = [];

  if (active.length > MAX_ACTIVE) {
    const byUse = [...active].sort((a, b) => dateSortValue(a.lastVisit) - dateSortValue(b.lastVisit));
    const drop = new Set(byUse.slice(0, active.length - MAX_ACTIVE).map((house) => house.id));
    keptActive = active.filter((house) => !drop.has(house.id) || house.id === state.current);
    for (const house of active) {
      if (drop.has(house.id) && house.id !== state.current) {
        dropped.push({ ...house, status: 'ended', ended: { on: db.state.inStoryDate, reason: 'given-up', note: 'you stopped going back' } });
      }
    }
  }

  const places = [...[...ended, ...dropped].slice(-MAX_ENDED), ...keptActive];
  const current = state.current && keptActive.some((house) => house.id === state.current) ? state.current : undefined;

  return { ...db, state: { ...db.state, safehouses: { places, ...(current ? { current } : {}) } } };
}

export function normalizeSafehouses(raw: unknown): SafehouseState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  const value = raw as SafehouseState;
  const places = Array.isArray(value.places)
    ? value.places
        .filter(
          (house): house is Safehouse =>
            Boolean(house) &&
            typeof house.id === 'string' &&
            typeof house.name === 'string' &&
            SAFEHOUSE_KINDS.includes(house.kind) &&
            Boolean(house.since) &&
            (house.status === 'active' || house.status === 'ended')
        )
        .map((house) => ({
          ...house,
          lastVisit: house.lastVisit ?? house.since,
          nights: typeof house.nights === 'number' ? house.nights : 0,
          knownBy: Array.isArray(house.knownBy) ? house.knownBy.filter((id) => typeof id === 'string') : [],
          knownGroups: Array.isArray(house.knownGroups) ? house.knownGroups.filter((id) => typeof id === 'string') : [],
          stash: Array.isArray(house.stash) ? house.stash.filter((item) => typeof item === 'string') : [],
          upgrades: Array.isArray(house.upgrades) ? house.upgrades.filter((item) => item && typeof item.name === 'string') : [],
          residents: Array.isArray(house.residents) ? house.residents.filter((id) => typeof id === 'string') : [],
        }))
    : [];

  if (places.length === 0) return undefined;

  const current = typeof value.current === 'string' && places.some((house) => house.id === value.current && house.status === 'active') ? value.current : undefined;

  return { places, ...(current ? { current } : {}) };
}

// ---------------------------------------------------------------------------
// Where Kan is

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'of', 'in', 'at', 'on', 'to', 'by', 'near', 'outside', 'inside', 'above', 'below', 'under', 'over',
  'land', 'your', 'you', 'kan', 'kans', 'his', 'her', 'their', 'with', 'from', 'into', 'and', 'old', 'small', 'little',
  'room', 'back', 'front', 'upstairs', 'downstairs', 'edge', 'side', 'north', 'south', 'east', 'west', 'hidden', 'village',
]);

function norm(text: string | undefined | null) {
  return localizePlaceNames(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’‘`']s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(text: string) {
  return new Set(norm(text).split(' ').filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
}

/** Does this location describe the safehouse? Exact place, its name in the words, or enough shared words. */
export function matchesSafehouse(house: Safehouse, location: string | undefined | null): boolean {
  const loc = norm(location);

  if (!loc) return false;

  const locRegion = regionOf(location);

  if (locRegion && house.region && isRegion(house.region) && locRegion !== house.region) return false;

  const place = norm(house.place);
  const name = norm(house.name);

  if (loc === place) return true;
  if (name.length >= 6 && loc.includes(name)) return true;
  if (place.length >= 10 && loc.includes(place)) return true;

  const a = words(location ?? '');
  const b = new Set([...words(house.place), ...words(house.name)]);
  const shared = [...a].filter((word) => b.has(word)).length;

  return shared >= 2 && shared / Math.max(1, Math.min(a.size, words(house.place).size || 1)) >= 0.6;
}

/** The safehouse Kan is at, if any. */
export function currentSafehouse(db: Pick<AppDatabase, 'state'>): Safehouse | null {
  if (db.state.flashbacks?.active) return null;

  const state = safehouseState(db);

  return state.places.find((house) => house.id === state.current && house.status === 'active') ?? null;
}

function findHere(db: AppDatabase): Safehouse | null {
  const active = activeSafehouses(db);
  const exact = active.find((house) => norm(house.place) === norm(db.state.location));

  return exact ?? active.find((house) => matchesSafehouse(house, db.state.location)) ?? null;
}

export function isOvergrown(db: Pick<AppDatabase, 'state'>, house: Safehouse): boolean {
  return house.status === 'active' && house.kind !== 'rented' && house.kind !== 'camp' && daysBetween(house.lastVisit, db.state.inStoryDate) >= OVERGROWN_DAYS;
}

// ---------------------------------------------------------------------------
// Making one

const INN_WORDS = /\b(inn|teahouse|tea house|tavern|lodging|lodge|ryokan|guesthouse|guest house|hostel|boarding house|rented room|bathhouse)\b/i;
const HIDEOUT_WORDS = /\b(akatsuki|hideout|lair|base)\b/i;
const WILD_WORDS = /\b(clearing|forest|woods|riverbank|ravine|cliff|hollow|thicket|field|hill|ridge|roadside|under the trees|bedroll|cave|cavern|grotto|ruin|ruins|ruined|rubble|overhang|ledge)\b/i;
/** An organisation's camp: an army, the Alliance, the Akatsuki. A base, not a night in the wild. */
const ORG_CAMP =
  /\b(akatsuki|army|military|war|field|battle|forward|command|allied|alliance|division|troops?|soldiers?|shinobi|ninja|hunter[- ]nin|anbu|root|samurai|sound|leaf|sand|mist|cloud|stone|rain)['’]?s? (field |war |base |forward |command )?(camp|encampment|bivouac)s?\b|\b(camp|encampment)s? of the\b|\bencampment\b/i;
/** People's camps: refugees, travellers, merchants. A night among strangers, gone when he leaves. */
const PEOPLE_CAMP = /\b(refugee|refugees'?|travell?ers'?|merchants?'?|caravan|nomad|nomads'?|bandit|bandits'?|hunting|fishing|logging|miners'?) camps?\b/i;
const CAMP_WORD = /\b(camp|campsite|camped)\b/i;

const CAVE_COVER = /\b(cave|cavern|grotto|tunnel|catacomb|underground|mine shaft)\b/i;
const RUIN_COVER =
  /\b(ruin|ruins|ruined|rubble|collapsed|crumbling|broken walls?|burn(ed|t)[- ]out|roofless|half[- ]fallen|abandoned (temple|shrine|house|hut|fort|watchtower|village|farmhouse|mill|outpost)|overhang|rock shelter|under a ledge)\b/i;
const WALL_COVER = /\b(hut|shack|cabin|barn|shed|shrine|temple|house|farmhouse|mill|outpost|watchtower|storehouse|hall|room|tent)\b/i;

export type CampCover = 'cave' | 'ruin' | 'walls' | 'open';

/** What a camp is in, from the words: a cave, ruins (half a shelter), walls of some kind, or the open sky. */
export function campCover(text: string): CampCover {
  const place = localizePlaceNames(text ?? '');

  if (CAVE_COVER.test(place)) return 'cave';
  if (RUIN_COVER.test(place)) return 'ruin';
  if (WALL_COVER.test(place)) return 'walls';
  return 'open';
}

const CAMP_SHELTER: Record<CampCover, string> = {
  cave: 'Rock overhead: rain and snow stay outside, but the cold and the damp do not, and a fire’s smoke needs somewhere to go.',
  ruin: 'Half a shelter: the broken walls take the edge off the wind, but rain and snow get in through the gaps and the missing roof.',
  walls: 'Walls of a sort: the weather mostly stays outside, but it finds the gaps.',
  open: 'No roof: whatever the WEATHER line says reaches you.',
};

function guessKind(db: AppDatabase): SafehouseKind | null {
  const location = db.state.location ?? '';
  const kind = db.state.locationKind;

  if (INN_WORDS.test(location)) return 'rented';
  if (HIDEOUT_WORDS.test(location) && /\bakatsuki\b/i.test(`${location} ${db.state.scene}`)) return 'base';
  // An army's or the Akatsuki's camp is theirs, and his place in it lasts while he belongs.
  if (ORG_CAMP.test(location) && !PEOPLE_CAMP.test(location)) return 'base';
  if (PEOPLE_CAMP.test(location)) return 'camp';
  if (kind === 'wilderness' || kind === 'road' || WILD_WORDS.test(location) || RUIN_COVER.test(location)) return 'camp';
  // "Camp" alone in a village or a building is not a night in the wild.
  if (CAMP_WORD.test(location) && kind !== 'settlement' && kind !== 'structure') return 'camp';

  return null;
}

const OWNER_WORDS: Array<[RegExp, string]> = [
  [/\bakatsuki\b/i, 'the Akatsuki'],
  [/\b(allied|alliance|division)\b/i, 'the Allied Shinobi Forces'],
  [/\broot\b/i, 'Root'],
  [/\bsamurai\b/i, 'the samurai'],
  [/\bsound\b/i, 'the Hidden Sound'],
  [/\bleaf\b/i, 'the Hidden Leaf'],
  [/\bsand\b/i, 'the Hidden Sand'],
  [/\bmist\b/i, 'the Hidden Mist'],
  [/\bcloud\b/i, 'the Hidden Cloud'],
  [/\bstone\b/i, 'the Hidden Stone'],
  [/\brain\b/i, 'the Hidden Rain'],
];

/** Whose base it is: the place's words first, then the scene's, then the Akatsuki if he is one of them. */
function baseOwner(db: AppDatabase): string {
  const location = localizePlaceNames(db.state.location ?? '');
  const scene = localizePlaceNames(db.state.scene ?? '');

  for (const text of [location, scene]) {
    for (const [pattern, owner] of OWNER_WORDS) {
      if (pattern.test(text)) return owner;
    }
  }

  return isAkatsukiMember(db) ? 'the Akatsuki' : 'the people who run it';
}

/** How each owner shows up in a membership fact. */
const OWNER_KEYS: Record<string, RegExp> = {
  'the Akatsuki': /\bakatsuki\b/i,
  'the Allied Shinobi Forces': /\b(allied|alliance)\b/i,
  Root: /\broot\b/i,
  'the samurai': /\b(samurai|land of iron)\b/i,
  'the Hidden Sound': /\b(hidden sound|sound village|orochimaru)\b/i,
  'the Hidden Leaf': /\b(hidden leaf|leaf village|konoha)\b/i,
  'the Hidden Sand': /\b(hidden sand|sand village|suna)\b/i,
  'the Hidden Mist': /\b(hidden mist|mist village|kiri)\b/i,
  'the Hidden Cloud': /\b(hidden cloud|cloud village|kumo)\b/i,
  'the Hidden Stone': /\b(hidden stone|stone village|iwa)\b/i,
  'the Hidden Rain': /\b(hidden rain|rain village|ame)\b/i,
};
const LEFT_WORDS = /\b(left|leave|leaves|leaving|defect(ed|s)?|quit|expelled|cast out|thrown out|abandon(ed|s)?|betray(ed|s)?|desert(ed|s)?|no longer|missing[- ]nin|rogue|traitor|broke with|walked away)\b/i;

function isKanFact(db: AppDatabase, subjectId: string | null, text: string) {
  const subject = subjectId ? db.entities.find((entity) => entity.id === subjectId) : null;
  return subject ? isKanEntity(subject) : /^you\b/i.test(text.trim());
}

/** What Kan's newest membership fact about this owner says: in, out, or nothing. */
function membershipSays(db: AppDatabase, owner: string): 'in' | 'out' | null {
  const key = OWNER_KEYS[owner];

  if (!key) return null;

  const facts = db.facts
    .filter((fact) => fact.type === 'membership' && fact.validTo === null && key.test(fact.text) && isKanFact(db, fact.subjectEntityId, fact.text))
    .sort((a, b) => dateSortValue(b.validFrom) - dateSortValue(a.validFrom));

  if (facts.length === 0) return null;

  return LEFT_WORDS.test(facts[0].text) ? 'out' : 'in';
}

/**
 * Does Kan belong to the people who run this base? Membership facts first;
 * for the Akatsuki also the joining beat, or travelling with a member (Itachi
 * before Kan joins). An owner the words don't name gets the benefit of the doubt.
 */
export function belongsTo(db: AppDatabase, owner: string): boolean {
  if (!OWNER_KEYS[owner]) return true;

  const said = membershipSays(db, owner);

  if (said) return said === 'in';

  if (owner === 'the Akatsuki') {
    return isAkatsukiMember(db) || db.entities.some((entity) => entity.companion && entity.tags.includes('akatsuki') && !isDeceased(entity));
  }

  return false;
}

function cleanName(text: string) {
  const value = localizePlaceNames(text).replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  return value.slice(0, 70);
}

function personRef(db: AppDatabase, raw: string): EntityRecord | null {
  const value = raw.trim();

  if (!value || value.toLowerCase() === 'kan') return null;

  const found =
    db.entities.find((entity) => entity.id === value) ??
    characterRefs(db).get(value.toLowerCase()) ??
    resolveEntity(db, value) ??
    (value.includes('-') ? resolveEntity(db, value.replace(/-/g, ' ')) : null);

  return found && found.type === 'character' ? found : null;
}

function isKanEntity(entity: EntityRecord) {
  return entity.name.trim().toLowerCase() === 'kan' || entity.tags.includes('player');
}

function sceneIds(db: AppDatabase): string[] {
  return uniqueList(
    castWithCompanions(db, db.state.sceneCast ?? [])
      .map((name) => resolveEntity(db, name))
      .filter((entity): entity is EntityRecord => Boolean(entity) && !isKanEntity(entity!))
      .map((entity) => entity.id)
  );
}

/** Check-out the morning after the last paid night (a room taken after midnight counts that night). */
export function rentedUntil(from: CalendarDate, nights: number): CalendarDate {
  const count = Math.max(1, Math.round(nights)) - (from.hour < 5 ? 1 : 0);
  return { ...shiftDate(from, count), hour: CHECKOUT_HOUR, minute: 0, second: 0 };
}

function newSafehouse(
  db: AppDatabase,
  kind: SafehouseKind,
  name: string | undefined,
  diff: SafehouseDiff | undefined,
  /** When Kan got there: the start of a night's rest, not the morning after. */
  now: CalendarDate = db.state.inStoryDate,
  /** A base he doesn't belong to: whose guest he is. */
  guestOf?: string
): Safehouse {
  const location = db.state.location ?? '';
  const region = regionOf(location) ?? lastRegion(db);
  const placeId = placeIdOf(location);
  const host = kind === 'borrowed' && diff?.host ? personRef(db, diff.host) : null;
  const groups: string[] = guestOf ? [guestOf] : [];

  if (kind === 'base') groups.push(baseOwner(db));
  if (kind === 'rented') groups.push('the innkeeper');

  return {
    id: makeId('sh'),
    name: cleanName(name || location || 'a place to sleep'),
    kind,
    place: location.slice(0, 140),
    ...(region ? { region } : {}),
    ...(placeId ? { placeId } : {}),
    since: now,
    lastVisit: now,
    nights: 0,
    ...(kind === 'rented' ? { until: rentedUntil(now, diff?.paidNights ?? 1) } : {}),
    ...(host
      ? { hostId: host.id, hostName: host.name }
      : diff?.host && kind === 'borrowed'
        ? { hostName: diff.host.slice(0, 60) }
        : guestOf && kind === 'borrowed'
          ? { hostName: guestOf }
          : {}),
    knownBy: uniqueList([...sceneIds(db), ...(host ? [host.id] : [])]),
    knownGroups: groups,
    stash: [],
    upgrades: [],
    residents: [],
    status: 'active',
  };
}

function lastRegion(db: AppDatabase): Region | undefined {
  const log = db.state.travelLog ?? [];
  const region = log[log.length - 1]?.region;
  return isRegion(region) ? region : undefined;
}

// ---------------------------------------------------------------------------
// Who knows, and being found

const GROUP_FACTIONS: Array<[RegExp, ReputationFaction | 'territory']> = [
  [/\broot\b|\bdanz/i, 'leaf'],
  [/\bakatsuki\b|\bzetsu\b/i, 'akatsuki'],
  [/\bleaf\b|\bkonoha\b/i, 'leaf'],
  [/\bsand\b|\bsuna\b/i, 'sand'],
  [/\bmist\b|\bkiri\b/i, 'mist'],
  [/\bcloud\b|\bkumo\b/i, 'cloud'],
  [/\bstone\b|\biwa\b/i, 'stone'],
  [/\bhunter|\btracker|\banbu\b|\bbounty\b|\bpursuer/i, 'territory'],
];

type Threat = { entityId?: string; who: string; want: string; faction?: ReputationFaction };

/** Would this person come after Kan here, and why? */
function personThreat(db: AppDatabase, house: Safehouse, entity: EntityRecord): Threat | null {
  if (isDeceased(entity) || isKanEntity(entity)) return null;

  const bond = db.bonds.find((item) => item.entityId === entity.id);

  if (bond?.grudge) return { entityId: entity.id, who: entity.name, want: 'to settle the grudge where you sleep' };
  if (bond && (bond.relationship === 'enemy' || bond.affinity <= -10)) {
    return { entityId: entity.id, who: entity.name, want: 'to catch you where you rest' };
  }
  if (entity.tags.includes('root') && (bond?.affinity ?? 0) < 10) {
    return { entityId: entity.id, who: entity.name, want: 'to tell Danzō where you hide', faction: 'leaf' };
  }
  // The Akatsuki learns Kan has a private place.
  // (Not their own hideout he is a guest in.)
  const theirs = house.knownGroups.some((group) => /akatsuki/i.test(group));
  if (entity.tags.includes('akatsuki') && !theirs && (house.kind === 'own' || house.kind === 'borrowed') && (bond?.affinity ?? 0) < 10) {
    return { entityId: entity.id, who: entity.name, want: 'to know what you keep from the Akatsuki', faction: 'akatsuki' };
  }

  return null;
}

function groupThreat(db: AppDatabase, house: Safehouse, group: string): Threat | null {
  for (const [pattern, faction] of GROUP_FACTIONS) {
    if (!pattern.test(group)) continue;

    if (faction === 'akatsuki') {
      if (house.kind !== 'own' && house.kind !== 'borrowed') return null;
      if (house.knownGroups.some((item) => /akatsuki/i.test(item))) return null;
      return { who: group, want: 'to know what you keep from the Akatsuki', faction };
    }

    const village: VillageFaction | null = faction === 'territory' ? territoryOf(house.place) : faction;
    // A village's own people only hunt Kan once he's in their book.
    const listed = village ? Boolean(db.state.reputation?.villages?.[village]?.listedOn) : false;

    if (faction === 'territory' || /\broot\b/i.test(group) || listed) {
      return { who: group, want: 'to take you where you sleep', ...(village ? { faction: village } : {}) };
    }
  }

  return null;
}

function plantFound(db: AppDatabase, house: Safehouse, threat: Threat): AppDatabase {
  const already = seedsOf(db).some(
    (seed) =>
      seed.kind === 'found' &&
      seed.safehouseId === house.id &&
      (threat.entityId ? seed.entityId === threat.entityId : seed.who.toLowerCase() === threat.who.toLowerCase())
  );

  if (already) return db;

  return plantSeed(db, {
    kind: 'found',
    ...(threat.entityId ? { entityId: threat.entityId } : {}),
    who: threat.who,
    what: `they learned of ${house.name}, where you stay`,
    want: threat.want,
    witnesses: [],
    ...(threat.faction ? { faction: threat.faction } : {}),
    region: house.region,
    safehouseId: house.id,
    when: 'weeks',
  });
}

/** Adds people and groups to who knows; anyone with a reason to come after Kan may come back for it. */
function learnOf(db: AppDatabase, houseId: string, refs: string[]): AppDatabase {
  let next = db;

  for (const raw of refs) {
    const house = activeSafehouses(next).find((item) => item.id === houseId);

    if (!house || !raw.trim()) continue;

    const entity = personRef(next, raw);

    if (entity) {
      if (isKanEntity(entity) || house.knownBy.includes(entity.id)) continue;
      next = updateHouse(next, house.id, (item) => ({ ...item, knownBy: [...item.knownBy, entity.id] }));
      const threat = house.kind === 'base' ? null : personThreat(next, house, entity);
      if (threat) next = plantFound(next, house, threat);
      continue;
    }

    const group = raw.trim().replace(/-/g, ' ').slice(0, 50);

    if (house.knownGroups.some((item) => item.toLowerCase() === group.toLowerCase())) continue;

    next = updateHouse(next, house.id, (item) => ({ ...item, knownGroups: [...item.knownGroups, group] }));
    const threat = house.kind === 'base' ? null : groupThreat(next, house, group);
    if (threat) next = plantFound(next, house, threat);
  }

  return next;
}

function updateHouse(db: AppDatabase, id: string, change: (house: Safehouse) => Safehouse): AppDatabase {
  const state = safehouseState(db);

  return withState(db, { ...state, places: state.places.map((house) => (house.id === id ? change(house) : house)) });
}

function endHouse(db: AppDatabase, id: string, reason: SafehouseEnd, note?: string): AppDatabase {
  const state = safehouseState(db);
  const now = db.state.inStoryDate;
  const places = state.places.map((house) =>
    house.id === id && house.status === 'active'
      ? { ...house, status: 'ended' as const, ended: { on: now, reason, ...(note ? { note } : {}) } }
      : house
  );
  const ended = places.find((house) => house.id === id);
  let next = withState(db, { ...state, places, ...(state.current === id ? { current: undefined } : {}) });

  // The people who lived there have nowhere there to be any more.
  if (ended) {
    next = {
      ...next,
      entities: next.entities.map((entity) =>
        ended.residents.includes(entity.id) && entity.whereabouts?.startsWith(ended.name)
          ? { ...entity, whereabouts: undefined }
          : entity
      ),
    };
  }

  return next;
}

// ---------------------------------------------------------------------------
// The stash

function sameItem(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);

  if (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y))) return true;

  // The same thing in other words: "the sealing scroll" is the "Scroll of sealing notes".
  const left = words(a);
  const right = words(b);
  const shared = [...left].filter((word) => right.has(word)).length;

  return shared >= 2 && shared >= Math.min(left.size, right.size) * 0.66;
}

function storeItems(db: AppDatabase, houseId: string, items: string[]): AppDatabase {
  const clean = items.map((item) => item.trim().slice(0, 80)).filter(Boolean);

  if (clean.length === 0) return db;

  const inventory = db.state.inventory.filter((item) => !clean.some((stored) => sameItem(item, stored)));
  // Keep the inventory's own name for what moved.
  const moved = clean.map((stored) => db.state.inventory.find((item) => sameItem(item, stored)) ?? stored);
  const next = { ...db, state: { ...db.state, inventory } };

  return updateHouse(next, houseId, (house) => ({ ...house, stash: uniqueList([...house.stash, ...moved]).slice(-30) }));
}

function takeItems(db: AppDatabase, houseId: string, items: string[]): AppDatabase {
  const house = activeSafehouses(db).find((item) => item.id === houseId);

  if (!house) return db;

  const taken = items
    .map((wanted) => house.stash.find((item) => sameItem(item, wanted)))
    .filter((item): item is string => Boolean(item));

  if (taken.length === 0) return db;

  const next = { ...db, state: { ...db.state, inventory: addItems(db.state.inventory, taken, db.state.pinnedItems ?? []) } };

  return updateHouse(next, houseId, (item) => ({ ...item, stash: item.stash.filter((thing) => !taken.includes(thing)) }));
}

// ---------------------------------------------------------------------------
// One turn

export type SafehouseTurn = {
  /** The turn covered a night's sleep or a long rest. */
  rested: boolean;
  /** In-story seconds the turn covered. */
  elapsedSeconds: number;
};

/**
 * After a present turn's state step: the tracker's safehouse report, where
 * Kan is now, leaving and coming back, rest, and every place's own course
 * (rooms running out, hosts, residents, found places searched).
 */
export function applySafehouses(before: AppDatabase, db: AppDatabase, diff: SafehouseDiff | undefined, turn: SafehouseTurn): AppDatabase {
  let next = db;
  const now = next.state.inStoryDate;
  const fighting = isCombatPace(next.state.scenePace);
  const previous = currentSafehouse(before);
  const target = diff?.id ? activeSafehouses(next).find((house) => house.id === diff.id) ?? null : null;
  let here: Safehouse | null = target ?? findHere(next);

  // Kan sleeps somewhere, or the story says he settles in.
  const wantsNew = Boolean(diff && (diff.name || diff.kind) && !target);
  let created: string | null = null;
  let kind = diff?.kind ?? (turn.rested && !here ? guessKind(next) : null);
  let guestOf: string | undefined;

  // A base is only his if he belongs to whoever runs it. Otherwise the story's
  // word makes him a guest there (borrowed, while they let him stay); a guess
  // from the words alone makes nothing (he may be a prisoner, or sneaking in).
  if (kind === 'base' && !here) {
    const owner = baseOwner(next);

    if (!belongsTo(next, owner)) {
      kind = diff?.kind ? 'borrowed' : null;
      guestOf = owner;
    }
  }

  if (!fighting && kind && (wantsNew || (turn.rested && !here))) {
    if (here && here.kind !== kind) {
      // The same place, set up properly: a camp becomes his own, a room he buys, a host who lends it.
      const id = here.id;
      next = updateHouse(next, id, (house) => ({
        ...house,
        kind,
        ...(diff?.name ? { name: cleanName(diff.name) } : {}),
        ...(kind === 'rented' ? { until: rentedUntil(turn.rested ? before.state.inStoryDate : now, diff?.paidNights ?? 1) } : { until: undefined }),
      }));
      created = id;
      here = activeSafehouses(next).find((house) => house.id === id) ?? null;
    } else if (!here) {
      const revived = turn.rested ? returningCamp(next) : null;

      if (revived) {
        next = withState(next, {
          ...safehouseState(next),
          places: safehouseState(next).places.map((house) =>
            house.id === revived.id ? { ...house, kind: 'own', status: 'active', ended: undefined, lastVisit: now } : house
          ),
        });
        here = activeSafehouses(next).find((house) => house.id === revived.id) ?? null;
      } else {
        const house = newSafehouse(next, kind, diff?.name, diff, turn.rested ? before.state.inStoryDate : now, guestOf);
        created = house.id;
        next = withState(next, { ...safehouseState(next), places: [...safehouseState(next).places, house] });
        here = house;
      }
    }
  }

  // Leaving and arriving.
  const state = safehouseState(next);
  next = withState(next, { ...state, current: here?.id });

  if (previous && previous.id !== here?.id) {
    const left = activeSafehouses(next).find((house) => house.id === previous.id);

    if (left) {
      next = updateHouse(next, left.id, (house) => ({ ...house, lastVisit: now }));
      // A camp is gone when he leaves, unless he set it up properly.
      if (left.kind === 'camp' && left.upgrades.length === 0) next = endHouse(next, left.id, 'left');
    }
  }

  if (here) {
    const id = here.id;
    next = updateHouse(next, id, (house) => ({
      ...house,
      lastVisit: now,
      ...(turn.rested ? { nights: house.nights + 1 } : {}),
      // Back after a raid: now he sees it.
      ...(house.raided && !house.raided.seen ? { raided: { ...house.raided, seen: true } } : {}),
    }));

    // A second stay at a camp: he keeps coming back to it, so it is his.
    const house = activeSafehouses(next).find((item) => item.id === id)!;
    if (house.kind === 'camp' && turn.rested && house.nights >= 2 && previous?.id !== id) {
      next = updateHouse(next, id, (item) => ({ ...item, kind: 'own' }));
    }

    // Everyone in the scene now knows where he stays.
    next = learnOf(next, id, sceneIds(next));
  }

  // What the page changed at the place this turn is about.
  const about = diff ? (target ?? here) : null;

  if (diff && about && activeSafehouses(next).some((house) => house.id === about.id)) {
    const id = about.id;

    // A room just taken was paid for by its own nights; later payments add on.
    if (typeof diff.paidNights === 'number' && diff.paidNights > 0 && created !== id) {
      next = updateHouse(next, id, (house) => {
        const from = house.until && dateSortValue(house.until) > dateSortValue(now) ? house.until : now;
        return { ...house, kind: house.kind === 'camp' ? 'rented' : house.kind, until: rentedUntil(from, diff.paidNights!) };
      });
    }

    if (diff.host && about.kind === 'borrowed' && !about.hostId) {
      const host = personRef(next, diff.host);
      if (host) next = updateHouse(next, id, (house) => ({ ...house, hostId: host.id, hostName: host.name }));
    }

    if (diff.stored?.length) next = storeItems(next, id, diff.stored);
    if (diff.taken?.length) next = takeItems(next, id, diff.taken);

    if (diff.upgrade?.trim()) {
      const name = diff.upgrade.trim().replace(/[.]+$/, '').slice(0, 80);
      next = updateHouse(next, id, (house) =>
        house.upgrades.some((item) => item.name.toLowerCase() === name.toLowerCase())
          ? house
          : { ...house, kind: house.kind === 'camp' ? 'own' : house.kind, upgrades: [...house.upgrades, { name, since: now }].slice(-12) }
      );
    }

    if (diff.shownTo?.length) next = learnOf(next, id, diff.shownTo);

    if (diff.residentsJoined?.length) {
      const people = diff.residentsJoined
        .map((ref) => personRef(next, ref))
        .filter((entity): entity is EntityRecord => Boolean(entity) && !isDeceased(entity!));
      next = updateHouse(next, id, (house) => ({ ...house, residents: uniqueList([...house.residents, ...people.map((entity) => entity.id)]).slice(0, 8) }));
      next = learnOf(next, id, people.map((entity) => entity.id));
    }

    if (diff.residentsLeft?.length) {
      const gone = new Set(diff.residentsLeft.map((ref) => personRef(next, ref)?.id).filter(Boolean));
      const house = activeSafehouses(next).find((item) => item.id === id);
      next = updateHouse(next, id, (item) => ({ ...item, residents: item.residents.filter((resident) => !gone.has(resident)) }));
      next = {
        ...next,
        entities: next.entities.map((entity) =>
          gone.has(entity.id) && house && entity.whereabouts?.startsWith(house.name) ? { ...entity, whereabouts: undefined } : entity
        ),
      };
    }

    if (diff.ended) {
      const notes: Record<string, string> = {
        expired: 'the paid time ran out',
        destroyed: 'it was destroyed',
        compromised: 'the wrong people found it',
        withdrawn: 'the host took it back',
        'given-up': 'you gave it up',
      };
      next = endHouse(next, id, diff.ended, notes[diff.ended]);
    }
  }

  // Rest somewhere safe heals more.
  if (turn.rested) next = restAt(next, currentSafehouse(next), turn.elapsedSeconds);

  return advanceSafehouses(next);
}

/** An ended camp at this spot, left not long ago: coming back makes it his. */
function returningCamp(db: AppDatabase): Safehouse | null {
  return (
    safehousesOf(db).find(
      (house) =>
        house.status === 'ended' &&
        house.kind === 'camp' &&
        house.ended?.reason === 'left' &&
        daysBetween(house.ended.on, db.state.inStoryDate) <= CAMP_RETURN_DAYS &&
        matchesSafehouse(house, db.state.location)
    ) ?? null
  );
}

export type RestQuality = 'safe' | 'rough' | 'unsafe';

/** How well Kan sleeps here: safe (his own, a host's, a base), rough (a camp, an inn, nowhere), unsafe (compromised). */
export function restQuality(house: Safehouse | null): RestQuality {
  if (!house) return 'rough';
  if (house.compromised) return 'unsafe';
  return house.kind === 'camp' || house.kind === 'rented' ? 'rough' : 'safe';
}

/** Kan rests in a compromised place: he may not sleep at all, so the "until rest" conditions stay. */
export function restBlocked(db: AppDatabase): boolean {
  return restQuality(currentSafehouse(db)) === 'unsafe';
}

/** A night somewhere safe: wounds heal faster (two extra days per night). */
function restAt(db: AppDatabase, house: Safehouse | null, elapsedSeconds: number): AppDatabase {
  if (restQuality(house) !== 'safe') return db;

  const nights = Math.max(1, Math.round(elapsedSeconds / 86400));
  const now = db.state.inStoryDate;
  const nowValue = dateSortValue(now);
  let changed = false;
  const facts = db.facts.map((fact) => {
    if (fact.validTo !== null || fact.type !== 'injury' || !fact.expiresAt) return fact;

    const subject = fact.subjectEntityId ? db.entities.find((entity) => entity.id === fact.subjectEntityId) : null;

    if (subject && !isKanEntity(subject)) return fact;

    changed = true;
    const expiresAt = shiftDate(fact.expiresAt, -SAFE_REST_HEAL_DAYS * nights);

    return dateSortValue(expiresAt) <= nowValue ? { ...fact, expiresAt, validTo: now } : { ...fact, expiresAt };
  });

  return changed ? { ...db, facts } : db;
}

/** Every place's own course, every turn. */
export function advanceSafehouses(db: AppDatabase): AppDatabase {
  let next = db;
  const now = db.state.inStoryDate;
  const nowValue = dateSortValue(now);
  const here = currentSafehouse(db)?.id;
  const present = new Set(sceneIds(db));

  for (const house of activeSafehouses(db)) {
    // A rented room's time runs out; staying on means paying again.
    if (house.kind === 'rented' && house.until && dateSortValue(house.until) <= nowValue && house.id !== here) {
      next = endHouse(next, house.id, 'expired', 'the paid time ran out');
      continue;
    }

    // A base he no longer belongs to: his room there is gone once he's left it.
    if (house.kind === 'base' && house.id !== here) {
      const owner = house.knownGroups.find((group) => OWNER_KEYS[group]);

      if (owner && !belongsTo(next, owner)) {
        next = endHouse(next, house.id, 'withdrawn', `you no longer belong to ${owner}`);
        continue;
      }
    }

    if (house.kind === 'borrowed' && house.hostId) {
      const host = next.entities.find((entity) => entity.id === house.hostId);
      const bond = host ? next.bonds.find((item) => item.entityId === host.id) : null;

      if (host && isDeceased(host) && kanKnowsDeath(next, host)) {
        next = endHouse(next, house.id, 'withdrawn', `${displayName(next, host)} died`);
        continue;
      }
      if (bond && ((bond.grudge && grudgeKnown(bond.grudge)) || bond.relationship === 'enemy')) {
        next = endHouse(next, house.id, 'withdrawn', `${host ? displayName(next, host) : 'the host'} turned on you`);
        continue;
      }
    }

    // The dead no longer live there.
    const living = house.residents.filter((id) => {
      const entity = next.entities.find((item) => item.id === id);
      return entity && !isDeceased(entity);
    });

    if (living.length !== house.residents.length) {
      next = updateHouse(next, house.id, (item) => ({ ...item, residents: living }));
    }

    // People living there are there while Kan is away.
    if (living.length > 0) {
      const at = `${house.name} (${localizePlaceNames(house.place)})`.slice(0, 120);
      next = {
        ...next,
        entities: next.entities.map((entity) =>
          living.includes(entity.id) && !present.has(entity.id) && !entity.companion && !entity.whereabouts
            ? { ...entity, whereabouts: at }
            : entity
        ),
      };
    }
  }

  // Someone who found a place searches it while Kan is away.
  for (const seed of seedsOf(next)) {
    if (seed.kind !== 'found' || seed.status !== 'waiting' || !seed.safehouseId) continue;

    const house = activeSafehouses(next).find((item) => item.id === seed.safehouseId);

    if (!house) continue;

    const due = shiftDate(seed.after, RAID_AFTER_DAYS);

    if (house.id === here || dateSortValue(due) > nowValue || daysBetween(house.lastVisit, now) < RAID_AFTER_DAYS) continue;

    const lost = house.stash;
    next = updateHouse(next, house.id, (item) => ({
      ...item,
      stash: [],
      compromised: { on: now, by: seed.who },
      raided: { on: now, lost, seen: false },
    }));
    next = markSeed(next, seed.id);
  }

  // A found place that came back on the page: it is compromised.
  for (const seed of seedsOf(next)) {
    if (seed.kind !== 'found' || seed.status !== 'returned' || !seed.safehouseId) continue;

    const house = activeSafehouses(next).find((item) => item.id === seed.safehouseId);

    if (house && !house.compromised) {
      next = updateHouse(next, house.id, (item) => ({ ...item, compromised: { on: seed.resolvedOn ?? now, by: seed.who } }));
    }
  }

  return next;
}

function markSeed(db: AppDatabase, seedId: string): AppDatabase {
  const seeds = seedsOf(db).map((seed) =>
    seed.id === seedId ? { ...seed, status: 'returned' as const, resolvedOn: db.state.inStoryDate } : seed
  );

  return { ...db, state: { ...db.state, consequences: seeds } };
}

// ---------------------------------------------------------------------------
// Words

const KIND_LABEL: Record<SafehouseKind, string> = {
  own: 'your own place',
  rented: 'a rented room',
  borrowed: 'a borrowed place',
  base: 'a base',
  camp: 'a camp',
};

export function kindLabel(house: Safehouse): string {
  if (house.kind === 'borrowed' && house.hostName) {
    return !house.hostId && OWNER_KEYS[house.hostName] ? `a guest of ${house.hostName}` : `${house.hostName}’s, lent to you`;
  }
  if (house.kind === 'base') {
    if (house.knownGroups.some((group) => /akatsuki/i.test(group))) return 'an Akatsuki base';
    const owner = house.knownGroups.find((group) => group !== 'the people who run it' && group !== 'the innkeeper');
    return owner ? `a base of ${owner}` : 'a base';
  }
  return KIND_LABEL[house.kind];
}

export const END_LABEL: Record<SafehouseEnd, string> = {
  expired: 'The paid time ran out',
  destroyed: 'Destroyed',
  compromised: 'Found by the wrong people',
  withdrawn: 'Taken back',
  'given-up': 'Given up',
  left: 'Left behind',
};

/** Who knows of it, in words: people (living) and groups. */
export function whoKnows(db: AppDatabase, house: Safehouse): string[] {
  const people = house.knownBy
    .map((id) => db.entities.find((entity) => entity.id === id))
    .filter((entity): entity is EntityRecord => Boolean(entity) && !(isDeceased(entity!) && kanKnowsDeath(db, entity!)))
    // The names Kan knows them by, never the record's own (audit 6b.2).
    .map((entity) => displayName(db, entity));

  return [...people, ...house.knownGroups];
}

export function residentNames(db: AppDatabase, house: Safehouse): string[] {
  return house.residents
    .map((id) => db.entities.find((entity) => entity.id === id))
    .filter((entity): entity is EntityRecord => Boolean(entity))
    .map((entity) => displayName(db, entity));
}

function shortDate(date: CalendarDate) {
  return `${formatDayMonth(date)}, year ${date.year}`;
}

function regionWords(house: Safehouse) {
  return isRegion(house.region) ? REGION_NAME[house.region] : null;
}

function ago(days: number) {
  if (days >= 700) return `${Math.round(days / 365)} years`;
  if (days >= 330) return 'about a year';
  if (days >= 50) return `${Math.round(days / 30)} months`;
  if (days >= 14) return `${Math.round(days / 7)} weeks`;
  return `${Math.max(1, days)} days`;
}

/** Kan says he is going back to one of his places. */
export function headingTo(db: AppDatabase, userMessage: string): Safehouse | null {
  const text = norm(userMessage);

  if (!text || !/\b(go|going|head|heading|return|returning|back|make for|set off|set out|travel|run|walk|hurry|fly|go home)\b/.test(text)) return null;

  const here = currentSafehouse(db)?.id;
  const active = activeSafehouses(db).filter((house) => house.id !== here);
  const named = active.find((house) => {
    const name = norm(house.name);
    return name.length >= 6 && text.includes(name);
  });

  if (named) return named;

  if (/\b(safehouse|safe house|my place|our place|hideout|home|the cabin|my room)\b/.test(text)) {
    const own = active.filter((house) => house.kind !== 'camp' && house.kind !== 'rented');
    if (own.length === 1) return own[0];
    const byWord = own.find((house) => [...words(house.name)].some((word) => word.length >= 4 && text.includes(word)));
    return byWord ?? null;
  }

  return null;
}

function houseFacts(db: AppDatabase, house: Safehouse, at: boolean): string[] {
  const now = db.state.inStoryDate;
  const known = whoKnows(db, house);
  const residents = residentNames(db, house);
  const parts: string[] = [];

  parts.push(
    known.length > 0 ? `Who knows of it: ${known.slice(0, 6).join(', ')}${known.length > 6 ? ', and others' : ''}.` : 'No one else knows of it.'
  );
  if (house.kind === 'rented' && house.until) {
    parts.push(
      dateSortValue(house.until) <= dateSortValue(now)
        ? 'The paid time has run out: the innkeeper will want more if you stay on.'
        : `Paid until ${shortDate(house.until)}.`
    );
  }
  if (house.stash.length > 0) parts.push(`Stashed here: ${house.stash.slice(0, 8).join(', ')}.`);
  if (house.upgrades.length > 0) parts.push(`Built up over time: ${house.upgrades.map((item) => item.name).join(', ')}.`);
  if (residents.length > 0) parts.push(`Living here: ${residents.join(', ')}${at ? ' (here unless the story has them out)' : ''}.`);
  if (house.raided && at) {
    parts.push(
      house.raided.lost.length > 0
        ? `While you were away someone searched it: ${house.raided.lost.join(', ')} gone. You do not know who.`
        : 'While you were away someone searched it. You do not know who.'
    );
  }
  if (house.compromised && !house.raided) parts.push('It is no longer secret: the wrong people know of it.');
  if (isOvergrown(db, house)) {
    parts.push(`You have not been here in ${ago(daysBetween(house.lastVisit, now))}: overgrown, dust and damp, the way time leaves a place.`);
  }

  return parts;
}

/**
 * For the narrator, only when Kan is at a safehouse or heading to one: one
 * line with its name, kind, who knows, the stash, upgrades, shelter and rest.
 */
export function formatSafehouseLine(db: AppDatabase, userMessage: string): string {
  const house = currentSafehouse(db);

  if (house) {
    const quality = restQuality(house);
    const shelter =
      house.kind === 'camp'
        ? CAMP_SHELTER[campCover(`${house.place}, ${house.name}`)]
        : 'A roof and walls: the weather stays outside.';
    const rest =
      quality === 'safe'
        ? 'Sleeping here is safe: a full night heals you more than the road does and restores your chakra fully.'
        : quality === 'unsafe'
          ? 'Sleeping here is a risk now: you may not sleep at all, and you wake at every sound.'
          : house.kind === 'camp'
            ? 'Sleep here is light and half-watchful; it heals less.'
            : 'Sleep here is decent but not safe: thin walls, strangers, it heals less.';

    return [
      `SAFEHOUSE (where you are): ${house.name}, ${kindLabel(house)}${house.kind === 'base' ? ' (your room, not your secret)' : ''}, yours since ${shortDate(house.since)}.`,
      ...houseFacts(db, house, true),
      shelter,
      rest,
    ].join(' ');
  }

  const heading = headingTo(db, userMessage);

  if (heading) {
    const where = [localizePlaceNames(heading.place), regionWords(heading)].filter(Boolean).join(', ');
    return [
      `SAFEHOUSE (where you are heading): ${heading.name} (${where}), ${kindLabel(heading)}, last there ${shortDate(heading.lastVisit)}.`,
      ...houseFacts(db, heading, false).filter((part) => !part.startsWith('You have not been here')),
      'Travel takes the time the GEOGRAPHY says; say how long it took.',
    ].join(' ');
  }

  return '';
}

/** For CURRENT STATE: the places Kan can go back to, names only. */
export function placesLine(db: AppDatabase): string {
  const here = currentSafehouse(db)?.id;
  const places = activeSafehouses(db)
    .filter((house) => house.id !== here && house.kind !== 'camp')
    .sort((a, b) => dateSortValue(b.lastVisit) - dateSortValue(a.lastVisit))
    .slice(0, 4)
    .map((house) => {
      const region = regionWords(house);
      return `${house.name}${region && !norm(house.name).includes(norm(region)) ? ` (${region})` : ''}`;
    });

  return places.length > 0 ? `Places you can go back to: ${places.join('; ')}` : '';
}

/** For the state tracker: the list with ids, and the rule. */
export function formatSafehouseTracking(db: AppDatabase): string {
  const here = currentSafehouse(db)?.id;
  const listed = activeSafehouses(db)
    .sort((a, b) => (a.id === here ? -1 : b.id === here ? 1 : dateSortValue(b.lastVisit) - dateSortValue(a.lastVisit)))
    .slice(0, 8)
    .map(
      (house) =>
        `- ${house.id}: ${house.name} (${house.kind}; ${truncate(localizePlaceNames(house.place), 60)})${house.id === here ? ' [Kan is here]' : ''}${house.stash.length ? `; stash: ${house.stash.slice(0, 6).join(', ')}` : ''}`
    );

  return [
    'SAFEHOUSES',
    ...(listed.length > 0 ? listed : ['- none yet']),
    'safehouse: null on most turns. Fill it when Kan sleeps somewhere or the page says he settles in (name: a short name for the place, like "the cave above the falls"; kind: own = a place he takes or builds himself, rented = an inn or teahouse room, borrowed = someone\'s home lent to him (host = their id), base = an organisation\'s place Kan belongs to, like an Akatsuki hideout or an army\'s field camp (where he is only a guest it is borrowed, host = who lets him stay; a prisoner or an intruder gets null), camp = a night in the wild or among strangers, like a refugee camp), or when something changes at a listed one: then id = its id (also when he comes back to it under other words). paid_nights: nights paid for, when the page says. stored / taken: items he leaves there or picks up (inventory names). upgrade: something finished there on the page (sealing, traps, a barrier, a garden, a library, a shrine). shown_to: ids, or group names ("Root", "hunter-nin"), of whoever he brings there or who sees him come or go. residents_joined / residents_left: ids of people who come to live there or move out. ended: expired, destroyed, compromised (found by someone he hides from), withdrawn (the host takes it back), given-up. Otherwise null and [].',
  ].join('\n');
}

function truncate(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** A writer who knows where Kan stays: the letter can wait for him there. */
export function letterAddress(db: AppDatabase, entityId: string): Safehouse | null {
  const house = currentSafehouse(db);

  if (!house || house.compromised || house.kind === 'camp') return null;

  return house.knownBy.includes(entityId) || house.residents.includes(entityId) ? house : null;
}

/** Where on the board Kan's places go. */
export function safehouseStop(house: Safehouse) {
  return { place: house.place, region: house.region, placeId: house.placeId };
}
