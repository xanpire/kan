// Section 13 of claude/before-variety-ideas.md (Xan, 14 Nov 2026): the rest of
// Banri's Uzushio library lies under the floor of Hazuki's house in the sealed
// Uchiha district. The story can reach it: a SCROLL CACHE line tells the
// narrator what is there while Kan is in the district (or heading for it), the
// tracker names the bundle when he takes it, and Root's search of the district
// decides who is waiting.
//
// Root (Claude's call, recorded in the ideas doc): Root combs the sealed
// district after the massacre and finds the chest on ROOT_FINDS_IT. Nobody but
// Banri's blood can open its seal, so Danzō leaves it where it is under a Root
// sensing seal and has the house watched while he lives. Breaking the blood
// seal under Root's seal tells Root someone of Banri's blood came back; a
// hiding place found already empty tells them the same.

import { dateSortValue } from './calendar';
import { isDeceased } from './deaths';
import { placeIdOf } from './mapData';
import { happened } from './names';
import type { AppDatabase, CalendarDate } from './types';

export type ScrollCacheState = {
  /** hidden: under the floor; taken: Kan has it. */
  status: 'hidden' | 'taken';
  takenOn?: CalendarDate;
  /** Root found the chest (or the empty hiding place). */
  rootFound?: CalendarDate;
  /** Root knows someone of Banri's blood (Kan) is alive. */
  rootKnows?: CalendarDate;
};

/** The day Root finds the chest under Hazuki's floor. */
export const ROOT_FINDS_IT: CalendarDate = { year: 14, month: 1, day: 20, hour: 12, minute: 0, second: 0 };

/** The name the tracker gives the bundle; pinned in the inventory. */
export const SCROLLS_ITEM = 'Banri’s sealing scrolls';

const CACHE_PLACES = new Set(['uchiha-district', 'hazuki-house']);
/** Named as his father's: counts wherever he is. */
const OWN_SCROLLS = /\b(banri|father|dad)[’']?s?\b.*\bscrolls?\b|\bscrolls?\b.*\b(banri|father|dad)\b/i;
/** Uzumaki or sealing scrolls: count only when he takes them in the district. */
const CACHE_SCROLLS = /\b(uzumaki|uzushio|sealing|seal)\b.*\bscrolls?\b|\bscrolls?\b.*\b(uzumaki|uzushio|sealing)\b/i;
/** The player's words reach for the cache from elsewhere. */
const REACHING =
  /\b(banri|father|dad)[’']?s?\b.*\b(scrolls?|library|notes)\b|\b(scrolls?|library)\b.*\b(under|beneath)\b.*\b(floor|house)\b|\b(hazuki|aunt)[’']?s?\b.*\b(house|home|floor)\b|\bscroll cache\b/i;
const READING = /\b(read|reads|reading|study|studies|studying|unroll|unrolls|open|opens|scrolls?|seals?|sealing)\b/i;

export function scrollCacheOf(db: AppDatabase): ScrollCacheState {
  return db.state.scrollCache ?? { status: 'hidden' };
}

function withCache(db: AppDatabase, cache: ScrollCacheState): AppDatabase {
  return { ...db, state: { ...db.state, scrollCache: cache } };
}

const reached = (date: CalendarDate, from: CalendarDate) => dateSortValue(date) >= dateSortValue(from);

/** Danzō is alive and Root still answers to him. */
export function danzoWatching(db: AppDatabase): boolean {
  if (happened(db, 'sasuke-rampage')) return false;
  const danzo = db.entities.find((entity) => entity.name === 'Danzo Shimura');
  return !danzo || !isDeceased(danzo);
}

/** Kan stands in the district or in Hazuki's house. */
export function atCache(db: AppDatabase): boolean {
  const id = placeIdOf(db.state.location);
  return id !== null && CACHE_PLACES.has(id);
}

/** Root knows Kan is alive because of the cache. */
export function rootKnowsFromCache(db: AppDatabase): boolean {
  return Boolean(scrollCacheOf(db).rootKnows);
}

/**
 * After the state step: Root's search reaches the chest on its day, and Kan
 * taking the scrolls (the bundle in his inventory) marks the cache taken.
 */
export function applyScrollCache(db: AppDatabase): AppDatabase {
  let cache = scrollCacheOf(db);
  const start = cache;
  const now = db.state.inStoryDate;

  if (cache.status === 'hidden') {
    const here = atCache(db);
    const taken = db.state.inventory.some((item) => OWN_SCROLLS.test(item) || (here && CACHE_SCROLLS.test(item)));

    if (taken) {
      cache = { ...cache, status: 'taken', takenOn: now };
      // Under Root's sensing seal, while Danzō has the house watched.
      if (cache.rootFound && danzoWatching(db)) cache = { ...cache, rootKnows: now };
    }
  }

  if (!cache.rootFound && reached(now, ROOT_FINDS_IT) && danzoWatching(db)) {
    cache = { ...cache, rootFound: ROOT_FINDS_IT };
    // The hiding place was already empty: someone of Banri's blood came back.
    if (cache.status === 'taken' && !cache.rootKnows) cache = { ...cache, rootKnows: ROOT_FINDS_IT };
  }

  return cache === start ? db : withCache(db, cache);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (date: CalendarDate) => `${MONTHS[date.month - 1]} of Year ${date.year}`;

const WHAT_IS_IN_IT =
  'Inside: the rest of your father Banri’s Uzushio library: everyday sealing, storage and locking seals, barriers, his notes in the margins. No S-rank seals, no tailed-beast sealing; the core (the chain passage, the chakra-drawing seal, your Thousand Souls notes) is already in your forearm seal.';

function rootLine(db: AppDatabase, cache: ScrollCacheState): string {
  if (!cache.rootFound) {
    return 'Root is still combing the sealed district for anything the clan left behind, so the empty streets may not be empty tonight; nobody has found the chest yet.';
  }

  if (danzoWatching(db)) {
    return `Root found the chest in ${monthYear(cache.rootFound)} and could not open it. Danzō left it in place under a Root sensing seal laid over the floor, and Root watches the house by turns. Breaking the blood seal sets the sensing seal off: Root will know someone of Banri’s blood opened it, and Danzō will guess who. An Uzumaki sealer who looks carefully can read Root’s seal and may find a way around it; decide fairly from what Kan does.`;
  }

  return 'Root found the chest years ago and left a sensing seal on the floor, but with Danzō dead nobody is listening to it any more.';
}

/**
 * The narrator's SCROLL CACHE line: while Kan is in the district or Hazuki's
 * house, or his words reach for the scrolls; and once he carries them, when he
 * reads or studies. Never inside a flashback (the present builds it).
 */
export function formatScrollCacheLine(db: AppDatabase, userMessage: string): string {
  const cache = scrollCacheOf(db);

  if (cache.status === 'taken') {
    const carried = db.state.inventory.find((item) => OWN_SCROLLS.test(item) || CACHE_SCROLLS.test(item));
    if (!carried || !READING.test(userMessage)) return '';

    return `BANRI’S SCROLLS (you carry them, as “${carried}”): ${WHAT_IS_IN_IT.replace('Inside: ', '')} Learning a seal from them takes days of study each, one at a time, and practice before it works in a fight.`;
  }

  const here = atCache(db);
  if (!here && !REACHING.test(userMessage)) return '';

  const where = here
    ? 'SCROLL CACHE (here)'
    : 'SCROLL CACHE (where your words reach)';

  return [
    `${where}: under the kitchen floorboards of Hazuki’s house in the Uchiha district, a lacquered chest under a blood-locked Uzumaki seal that opens only to Banri’s blood, which now means you.`,
    WHAT_IS_IN_IT,
    'Only you know exactly what is there; Itachi may know Banri left scrolls.',
    rootLine(db, cache),
    here ? 'If Kan takes the scrolls, they are one bundle; he carries it away or stashes it.' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/** The tracker's line while Kan is at the cache: the bundle's exact name. */
export function formatScrollCacheTracking(db: AppDatabase): string {
  if (scrollCacheOf(db).status !== 'hidden' || !atCache(db)) return '';

  return `SCROLL CACHE: only if Kan takes his father's scrolls from the chest under Hazuki's floor on the page, put exactly "${SCROLLS_ITEM}" in inventory_added. Otherwise nothing.`;
}

/** Danzō's KNEW YOU addition: what Root's search of the district told him. */
export function danzoCacheLine(db: AppDatabase): string {
  const cache = scrollCacheOf(db);
  if (!cache.rootFound) return '';

  if (cache.rootKnows) {
    return 'Root’s seal under your aunt’s floor told him someone of Banri’s blood came back for the scrolls, and he is sure it was you.';
  }

  return 'Root found a sealed Uzumaki chest under your aunt’s floor that nobody could open; he keeps it watched in case someone of Banri’s blood comes for it.';
}
