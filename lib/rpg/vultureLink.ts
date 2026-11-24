// Kan's vultures as a link, and their flight (Xan, 23 Nov 2026, third test).
//
// The vultures are made of Kan's chakra, so what they see, hear and feel
// reaches him, like a Bluetooth connection: live up close, later and patchier
// the further they are, nothing past half a day of travel. What they take in
// out of range comes to him all at once when they are back in range (like a
// shadow clone's memories). They fly about ten times as fast as a shinobi
// runs, straight over everything: a five-hour run is half an hour's flight.
//
// The third test had the narrator deny the link ("no images pass back"), the
// tracker file that as a confirmed rule, and no flight time anywhere, so
// Hōmuri took "a long time" to cover a few hours and then arrived in four
// minutes because Kan said so.

import { advanceSeconds, formatClock, secondsBetween } from './calendar';
import { makeId } from './id';
import type { AppDatabase, CalendarDate, LoreRecord, TurnDiff } from './types';

/** Flight is this many times faster than a shinobi's run. */
export const VULTURE_SPEED = 10;
/** Link ranges, in hours of a shinobi's run from Kan. */
export const LINK_LIVE_HOURS = 1;
export const LINK_CLEAR_HOURS = 3;
/** Half a day of shinobi travel: past this nothing comes through. */
export const LINK_LIMIT_HOURS = 6;
/** The opening forest is this far from the Leaf, at a shinobi's run. */
export const OPENING_RUN_HOURS = 5;

export const VULTURE_NAMES = ['Okuri', 'Hōmuri', 'Tomurai'] as const;

export const VULTURES_EFFECT_OLD =
  'Okuri the courier, Hōmuri the scout and Tomurai the watcher (all three female), with a nameless flock beside them: spawned from your chakra anywhere, any time, never truly dead.';

export const VULTURES_EFFECT =
  'Okuri the courier, Hōmuri the scout and Tomurai the watcher (all three female), with a nameless flock beside them: spawned from your chakra anywhere, any time, never truly dead. They are your chakra, so what they see, hear and feel reaches you: live within about an hour’s run, a little late and patchier further out, nothing past half a day’s travel until they come back in range, then all of it at once. They fly about ten times as fast as you run, straight over everything: a five-hour run is half an hour’s flight.';

export const VULTURE_LINK_LORE =
  'YOUR VULTURES’ LINK: Okuri, Hōmuri and Tomurai are made of your chakra, and what each of them sees, hears and feels reaches you through it, as if you were there, while you keep your own eyes. How fast it reaches you depends on how far she is, counted in a shinobi’s run: within about an hour’s run it is live and clear; up to about three hours, a few seconds late and still clear; up to half a day (about six hours’ run), a minute or two late, in pieces, sound and blurred sight more than detail; past that nothing comes through at all, but she keeps everything she takes in, and the moment she is back within range it all reaches you at once, a rush, like a shadow clone’s memories. They fly about ten times as fast as you run and straight over everything (a five-hour run is about half an hour of flight); rain and dark don’t slow them. YOUR VULTURES OUT, when it is given, says where each one is and how good the link is now: follow it. Never deny the link or invent a limit it doesn’t have; if an older reply in this story said nothing came through, that was wrong and is not repeated.';

const VULTURE_WORD = /\b(vultures?|okuri|h[oō]muri|tomurai|the bird|her eyes|the (?:chakra )?(?:link|bond|thread))\b/i;
const DENIAL =
  /\b(cannot|can['’]?t|can not|unable to|never)\b[^.]{0,40}\b(see|hear|feel|sense|look)\b[^.]{0,30}\b(through|with|from)\b|\bno (?:images?|sight|vision|light or shape)\b[^.]{0,40}\b(pass|passes|come|comes|came|return|returns|bleed|bleeds)\b|\bher eyes are not yours\b/i;

/** A line that says Kan's vultures can't share what they see (the third test's invented rule). */
export function deniesVultureLink(text: string): boolean {
  return VULTURE_WORD.test(text) && DENIAL.test(text);
}

export type VultureOut = {
  name: string;
  toward: string;
  sentAt: CalendarDate;
  /** How far the destination is from Kan, in hours of a shinobi's run. */
  runHours: number;
  arriveAt: CalendarDate;
};

export function flightSeconds(runHours: number) {
  return Math.round((Math.max(0, runHours) * 3600) / VULTURE_SPEED);
}

export type LinkQuality = 'live' | 'clear' | 'patchy' | 'out';

export function linkAt(runHours: number): LinkQuality {
  if (runHours <= LINK_LIVE_HOURS) return 'live';
  if (runHours <= LINK_CLEAR_HOURS) return 'clear';
  if (runHours <= LINK_LIMIT_HOURS) return 'patchy';
  return 'out';
}

const LINK_WORDS: Record<LinkQuality, string> = {
  live: 'the link is live; you see, hear and feel what she does as it happens',
  clear: 'what she sees and hears reaches you a few seconds late, still clear',
  patchy: 'what she sees and hears reaches you a minute or two late, in pieces',
  out: 'she is out of range: nothing comes through; she keeps it all, and it reaches you at once when she is back within half a day',
};

/** One of the three by name, or "a vulture" from the flock. */
export function vultureName(raw: string): string {
  const text = raw.trim();
  if (/okuri/i.test(text)) return 'Okuri';
  if (/h[oō]muri/i.test(text)) return 'Hōmuri';
  if (/tomurai/i.test(text)) return 'Tomurai';
  return 'a vulture';
}

function runPhrase(hours: number) {
  if (hours < 1) return `about a ${Math.max(5, Math.round((hours * 60) / 5) * 5)}-minute run`;
  const rounded = Math.round(hours * 2) / 2;
  return `about ${rounded === 1 ? 'an hour’s' : `a ${rounded}-hour`} run`;
}

function minutesPhrase(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return `${hours} hours`;
}

function vulturesOut(db: AppDatabase): VultureOut[] {
  return Array.isArray(db.state?.vulturesOut) ? db.state.vulturesOut : [];
}

/** The tracker's vultures_sent and vultures_back for this turn. */
export function applyVultureChanges(db: AppDatabase, diff: TurnDiff, sentAt: CalendarDate = db.state.inStoryDate): AppDatabase {
  const sent = diff.vulturesSent ?? [];
  const back = (diff.vulturesBack ?? []).map(vultureName);
  if (sent.length === 0 && back.length === 0) return dropStale(db);

  let out = vulturesOut(db).filter((item) => !back.includes(item.name));
  for (const item of sent) {
    const name = vultureName(item.name);
    const runHours = Math.min(24 * 7, Math.max(0, item.runHours));
    const entry: VultureOut = {
      name,
      toward: item.toward.trim().slice(0, 60) || 'somewhere',
      sentAt,
      runHours,
      arriveAt: advanceSeconds(sentAt, flightSeconds(runHours)),
    };
    out = [...out.filter((other) => name === 'a vulture' || other.name !== name), entry].slice(-6);
  }
  return dropStale({ ...db, state: { ...db.state, vulturesOut: out } });
}

/** A vulture that arrived more than three days ago and was never called back is forgotten. */
function dropStale(db: AppDatabase): AppDatabase {
  const out = vulturesOut(db);
  if (out.length === 0) return db;
  const now = db.state.inStoryDate;
  const kept = out.filter((item) => secondsBetween(item.arriveAt, now) < 3 * 86400);
  return kept.length === out.length ? db : { ...db, state: { ...db.state, vulturesOut: kept } };
}

/** The narrator's YOUR VULTURES OUT block, or '' when none is away. */
export function formatVultureBlock(db: AppDatabase): string {
  const out = vulturesOut(db);
  if (out.length === 0) return '';
  const now = db.state.inStoryDate;
  const lines = out.map((item) => {
    const flight = flightSeconds(item.runHours);
    const flown = Math.max(0, secondsBetween(item.sentAt, now));
    if (flown < flight) {
      const fromYou = (item.runHours * flown) / Math.max(1, flight);
      return `- ${item.name}: sent at ${formatClock(item.sentAt)} toward ${item.toward} (${runPhrase(item.runHours)} away); about ${minutesPhrase(flight)} of flight, so she arrives about ${formatClock(item.arriveAt)}, ${minutesPhrase(flight - flown)} from now. She is now ${runPhrase(fromYou)} from you, so ${LINK_WORDS[linkAt(fromYou)]}. If your words put her there sooner, the story waits for her: time passes to her arrival.`;
    }
    return `- ${item.name}: at ${item.toward} since about ${formatClock(item.arriveAt)}, ${runPhrase(item.runHours)} from where you sent her (judge from where you are now if you have moved), so ${LINK_WORDS[linkAt(item.runHours)]}.`;
  });
  return `YOUR VULTURES OUT (now ${formatClock(now)}; they fly about ten times as fast as you run):\n${lines.join('\n')}`;
}

/**
 * Old saves: the jutsu card and the lore learn the link, the invented "you
 * cannot see through her" facts and explained lines go, the opening forest
 * gets its distance, and a vulture the third test sent toward the village is
 * put in the air with a real arrival time.
 */
export function ensureVultureLink(db: AppDatabase): AppDatabase {
  if (!db.state || !Array.isArray(db.facts)) return db;
  let next = db;

  // The jutsu card.
  if (Array.isArray(next.jutsuRecords) && next.jutsuRecords.some((record) => record.name === 'Your vultures' && record.effect === VULTURES_EFFECT_OLD)) {
    next = {
      ...next,
      jutsuRecords: next.jutsuRecords.map((record) =>
        record.name === 'Your vultures' && record.effect === VULTURES_EFFECT_OLD
          ? { ...record, effect: VULTURES_EFFECT, description: record.description === VULTURES_EFFECT_OLD ? VULTURES_EFFECT : record.description }
          : record
      ),
    };
  }

  // The lore.
  if (Array.isArray(next.loreEntries) && !next.loreEntries.some((lore) => lore.text === VULTURE_LINK_LORE)) {
    const lore: LoreRecord = {
      id: makeId('lore'),
      keywords: ['vulture', 'vultures', 'okuri', 'hōmuri', 'homuri', 'tomurai', 'bird', 'link', 'see through', 'her eyes'],
      priority: 5,
      // Every turn, with the fixed world reference: it is short and the link must never be denied.
      always: true,
      text: VULTURE_LINK_LORE,
      enabled: true,
      hidden: true,
    } as LoreRecord;
    next = { ...next, loreEntries: [...next.loreEntries.filter((item) => !item.text?.startsWith('YOUR VULTURES’ LINK:')), lore] };
  }

  // A vulture sent toward the village from the opening forest (third test).
  if (!next.state.vultureLinkRepaired) {
    const kan = next.entities?.find((entity) => entity.name.toLowerCase() === 'kan');
    const send = next.facts.find(
      (fact) =>
        fact.validTo === null &&
        (!fact.subjectEntityId || fact.subjectEntityId === kan?.id) &&
        /\byou sent (okuri|h[oō]muri|tomurai)\b[^.]*\b(village|leaf|compound)\b/i.test(fact.text)
    );
    const inForest = /forest outside hidden leaf|leaf outskirts/i.test(next.state.location ?? '');
    if (send && inForest && !vulturesOut(next).some((item) => item.name === vultureName(send.text))) {
      next = applyVultureChanges(next, {
        vulturesSent: [{ name: vultureName(send.text.match(/okuri|h[oō]muri|tomurai/i)?.[0] ?? ''), toward: 'the Uchiha district in the Leaf', runHours: OPENING_RUN_HOURS }],
      } as TurnDiff, send.validFrom ?? next.state.inStoryDate);
      // Keep the send as a plain fact, without the denial.
      next = {
        ...next,
        facts: next.facts.map((fact) =>
          fact.id === send.id ? { ...fact, text: fact.text.replace(/,?\s*but no images have come back through the link yet\.?$/i, '.') } : fact
        ),
      };
    }
    next = { ...next, state: { ...next.state, vultureLinkRepaired: true } };
  }

  // The invented rule, wherever it was filed.
  const facts = next.facts.filter((fact) => !deniesVultureLink(fact.text));
  const said = next.state.alreadySaid ?? [];
  const keptSaid = said.filter((item) => !(VULTURE_WORD.test(item.text) && /\b(cannot|can['’]?t|not)\b/i.test(item.text)));
  if (facts.length !== next.facts.length || keptSaid.length !== said.length) {
    next = { ...next, facts, state: { ...next.state, alreadySaid: keptSaid } };
  }

  // The opening forest's distance.
  next = {
    ...next,
    events: (next.events ?? []).map((event) =>
      typeof event.summary === 'string' && event.summary.includes('a few hours from the village')
        ? { ...event, summary: event.summary.replace('a few hours from the village', OPENING_DISTANCE) }
        : event
    ),
    entities: (next.entities ?? []).map((entity) =>
      entity.name === 'Forest outside Hidden Leaf' && typeof entity.notes === 'string' && !entity.notes.includes('five hours')
        ? { ...entity, notes: `${entity.notes} ${FOREST_DISTANCE_NOTE}` }
        : entity
    ),
  };

  return next;
}

export const OPENING_DISTANCE = 'about five hours’ run north of the village';
export const FOREST_DISTANCE_NOTE = 'It lies about five hours’ run north of the village.';
