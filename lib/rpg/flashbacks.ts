/**
 * Playable flashbacks (living-world section 19): short scenes from Kan's life
 * before the story, offered at fitting moments and never on request.
 *
 * - Offer: at most one a month, only in downtime or a quiet conversation,
 *   when something in the present fits one (a person, a place, a date, a
 *   word, a beat just reached). The narrator gets one optional line and lets
 *   a small trigger touch Kan; the reply that showed it gets a "Remember"
 *   chip, and Kan can follow it by the chip or in his own words.
 * - Playing: the memory has its own clock, place and weather. Its turns never
 *   move the present clock, place, inventory, jutsu, injuries or canon; the
 *   narrator gets a FLASHBACK block (Kan's age and what he could do then,
 *   who is there at their age, what is fixed and what must stay hidden)
 *   instead of the present state.
 * - Ending: after about 3-10 turns the narrator closes it and carries Kan
 *   back to the second he left. It becomes a memory dated in the past,
 *   tagged `flashback`, shared by everyone in it, and it can nudge a bond by
 *   one point at most. Each flashback plays once.
 */
import { KAN_EYES, KAN_HAIR, KAN_HAIR_AND_EYES } from './kanLook';
import { advanceSeconds, calculateAge, daysBetween, daysFromCivil, entityAge, formatDate, timeOfDayOf } from './calendar';
import { FLASHBACKS, FLASHBACK_BY_ID, KAN_PARENTS, type FlashbackRecord } from './flashbackData';
import { milestoneStage } from './canon';
import { CANON_MILESTONES } from './canonData';
import { resolveEntity } from './entities';
import { mentionsEntity } from './characterRefs';
import { placeIdOf } from './mapData';
import { localizePlaceNames } from './glossary';
import { conditionFromText } from './weather';
import { regionOf } from './geography';
import { inferScenePace, resolveTurnClock, validateScenePace } from './pacing';
import { detectNarrationTime } from './timeparse';
import { CONVERSATION_MODE_MINIMUM_SECONDS, applySceneBeat, cleanFightOptions } from './sceneMode';
import { buildIndices } from './db';
import { makeId } from './id';
import { firstSentences } from './util';
import type {
  ActiveFlashback,
  AppDatabase,
  CalendarDate,
  EntityRecord,
  EventRecord,
  FlashbackState,
  RawLogEntry,
  SceneModeName,
  TurnDiff,
} from './types';

export { FLASHBACKS, FLASHBACK_BY_ID } from './flashbackData';
export type { FlashbackRecord } from './flashbackData';

/** One offer per in-story month at most. */
export const FLASHBACK_OFFER_GAP_DAYS = 30;
/** A flashback tied to a day is offered only this close to it. */
export const FLASHBACK_DATE_WINDOW = 2;
/** A beat counts as "just reached" for this many days. */
export const FLASHBACK_BEAT_DAYS = 7;
/** No offers in the opening of the story. */
export const FLASHBACK_MIN_TURN = 12;
/** An offer the reply showed can still be followed for this many turns. */
export const FLASHBACK_PENDING_TURNS = 2;
/** The narrator is asked to close the memory from this turn. */
export const FLASHBACK_WRAP_TURN = 6;
/** ...and must close it on this one. */
export const FLASHBACK_LAST_TURN = 9;
/** If it still hasn't, the app lets the memory go after this many turns. */
export const FLASHBACK_HARD_CAP = 12;
/** A memory moves a bond by this much at most. */
export const FLASHBACK_BOND_NUDGE = 1;
/** Score a trigger needs to make an offer. */
const OFFER_SCORE = 2;

const EMPTY: FlashbackState = { played: [], offered: {} };

export function flashbackStateOf(db: Pick<AppDatabase, 'state'>): FlashbackState {
  return db.state.flashbacks ?? EMPTY;
}

function withFlashbacks(db: AppDatabase, patch: Partial<FlashbackState>): AppDatabase {
  return { ...db, state: { ...db.state, flashbacks: { ...flashbackStateOf(db), ...patch } } };
}

/** Load-time repair: unknown ids dropped, a broken active flashback let go. */
export function normalizeFlashbacks(raw: unknown): FlashbackState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<FlashbackState>;
  const played = Array.isArray(value.played) ? value.played.filter((id) => typeof id === 'string' && FLASHBACK_BY_ID[id]) : [];
  const offered: Record<string, CalendarDate> = {};

  for (const [id, date] of Object.entries(value.offered ?? {})) {
    if (FLASHBACK_BY_ID[id] && date && typeof date === 'object') offered[id] = date as CalendarDate;
  }

  const active =
    value.active && FLASHBACK_BY_ID[value.active.id] && value.active.date && !played.includes(value.active.id)
      ? { ...value.active, castIds: value.active.castIds ?? [], nudges: value.active.nudges ?? {}, turns: value.active.turns ?? 0 }
      : undefined;
  const pending = value.pending && FLASHBACK_BY_ID[value.pending.id] && !played.includes(value.pending.id) ? value.pending : undefined;

  return {
    played: [...new Set(played)],
    offered,
    ...(value.lastOfferOn ? { lastOfferOn: value.lastOfferOn } : {}),
    ...(pending && !active ? { pending } : {}),
    ...(active ? { active } : {}),
    ...(value.returned && FLASHBACK_BY_ID[value.returned.id] ? { returned: value.returned } : {}),
  };
}

/** The flashback playing now, with its record. */
export function activeFlashback(db: Pick<AppDatabase, 'state'>): { record: FlashbackRecord; active: ActiveFlashback } | null {
  const active = flashbackStateOf(db).active;
  const record = active ? FLASHBACK_BY_ID[active.id] : undefined;
  return active && record ? { record, active } : null;
}

export function isFlashbackEntry(entry: Pick<RawLogEntry, 'flashback'>): boolean {
  return Boolean(entry.flashback);
}

/**
 * The save as the memory sees it: its date, place and weather instead of the
 * present's. Used for the WEATHER line, the ambience and the Story header, so
 * the present's held weather and Kan's road are never touched.
 */
export function flashbackView(db: AppDatabase): AppDatabase | null {
  const playing = activeFlashback(db);

  if (!playing) return null;

  const { active } = playing;
  const region = regionOf(active.place) ?? 'fire';

  return {
    ...db,
    state: {
      ...db.state,
      inStoryDate: active.date,
      location: active.place,
      locationKind: active.locationKind,
      travelLog: [{ place: active.place, region, date: active.date }],
      weather: active.weather
        ? { region, condition: active.weather.condition, text: active.weather.text, since: active.date, sceneSeq: -1, source: 'story' }
        : undefined,
      sceneSeq: -1,
    },
  };
}

// ---------------------------------------------------------------------------
// Kan as he was

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen'];

export function ageWord(age: number): string {
  return NUMBER_WORDS[age] ?? String(age);
}

export function kanAgeAt(db: Pick<AppDatabase, 'state'>, date: CalendarDate): number {
  const player = db.state.player;
  return calculateAge(date, player.birthday, player.birthYear);
}

/** What Kan could do at an age, for the narrator. */
export function kanThen(age: number): string {
  if (age <= 5) {
    return `a small child of ${ageWord(age)}: no jutsu and no chakra training; he can run, climb, hide and cry like any child his age, and his size and strength are a child’s`;
  }

  if (age <= 8) {
    return `an Academy student of ${ageWord(age)}: shuriken and kunai practice, basic taijutsu and the first, shaky tries at the Clone, Transformation and Substitution jutsu; a child’s size and stamina`;
  }

  if (age <= 11) {
    return `a genin of ${ageWord(age)} on Team 3: the Academy jutsu, shuriken and kunai, taijutsu and tree-climbing chakra control; he picks up jutsu fast by watching, but uses only what a genin his age could; a boy’s size`;
  }

  return `an ANBU operative of ${ageWord(age)}: everything a sharp chunin-level shinobi knows, quick and quiet; he picks up jutsu fast by watching; a boy’s size, not yet grown`;
}

/** How Kan looks at an age, for images (his reference sheets show him at 13 and older). */
export function kanLookAt(age: number): string {
  if (age <= 5) {
    return `Kan as a small child of ${age}: round face, short ${KAN_HAIR}, the same ${KAN_EYES}, small and slight, in plain child’s clothes`;
  }

  if (age <= 8) {
    return `Kan at ${age}: a skinny Academy boy with ${KAN_HAIR_AND_EYES}, in a plain dark shirt and shorts`;
  }

  if (age <= 11) {
    return `Kan at ${age}: a young genin with ${KAN_HAIR_AND_EYES}, a Leaf forehead protector, dark shinobi clothes cut small`;
  }

  return `Kan at ${age}: a boy in ANBU gear, ${KAN_HAIR_AND_EYES}, grey armour and arm guards, an animal mask pushed up on his head or worn over his face`;
}

// ---------------------------------------------------------------------------
// Offers

function lastPresentReply(db: AppDatabase): RawLogEntry | undefined {
  return [...db.rawLog].reverse().find((entry) => entry.kind === 'story' && entry.role === 'assistant' && !entry.flashback);
}

function storyTurnCount(db: AppDatabase) {
  return db.rawLog.filter((entry) => entry.kind === 'story' && entry.role === 'assistant').length;
}

function nearDay(now: CalendarDate, day: { month: number; day: number }) {
  for (const year of [now.year - 1, now.year, now.year + 1]) {
    const gap = Math.abs(daysFromCivil(now.year, now.month, now.day) - daysFromCivil(year, day.month, day.day));
    if (gap <= FLASHBACK_DATE_WINDOW) return true;
  }

  return false;
}

function beatJustReached(db: AppDatabase, id: string) {
  const eventId = `event_canon_${id}`;
  const event = db.events.find((entry) => entry.id === eventId);
  const milestone = CANON_MILESTONES.find((item) => item.id === id);

  if (!event || !milestone) return false;

  // A world event counts from the day word of it reached Kan, never before.
  const since = milestone.playerDriven
    ? milestoneStage(db, id) === 'completed' || milestoneStage(db, id) === 'accepted'
      ? event.inStoryDate
      : null
    : db.state.canonProgress?.heard?.[eventId]?.date ?? null;

  if (!since) return false;

  const days = daysBetween(since, db.state.inStoryDate);
  return days >= 0 && days <= FLASHBACK_BEAT_DAYS;
}

/** Was there a fight in the last few replies? */
function justFought(db: AppDatabase) {
  return db.rawLog
    .filter((entry) => entry.kind === 'story' && entry.role === 'assistant' && !entry.flashback)
    .slice(-3)
    .some((entry) => entry.sceneMode === 'fight');
}

function sceneNames(db: AppDatabase): Set<string> {
  const ids = new Set(
    (db.state.sceneCast ?? []).map((name) => resolveEntity(db, name)?.id).filter((id): id is string => Boolean(id))
  );
  return new Set(db.entities.filter((entity) => ids.has(entity.id)).map((entity) => entity.name));
}

/** How well a flashback fits the present moment (0 = not at all). */
export function flashbackScore(db: AppDatabase, record: FlashbackRecord, text: string): number {
  const triggers = record.triggers;
  const fought = justFought(db);
  // A record that needs a fight only counts its people and words right after one.
  const gated = triggers.afterFight === true && !fought;
  const now = db.state.inStoryDate;
  const cast = sceneNames(db);
  const location = localizePlaceNames(db.state.location ?? '');
  const placeId = placeIdOf(db.state.location);
  let score = 0;

  if (triggers.dates?.some((day) => nearDay(now, day))) score += 3;
  if (triggers.beats?.some((id) => beatJustReached(db, id))) score += 3;
  if (triggers.places && ((placeId && triggers.places.ids?.includes(placeId)) || triggers.places.words?.test(location))) score += 2;

  if (!gated) {
    if (triggers.people?.some((name) => cast.has(name))) score += 2;
    if (triggers.words?.test(text)) score += triggers.afterFight ? 1 : 2;
    if (triggers.afterFight && fought) score += 1;
  }

  return score;
}

/**
 * The flashback the narrator may offer this turn, if any: never while one
 * plays or waits, never in a fight, a chase or on the road, at most once a
 * month, and only when the present really fits one.
 */
export function flashbackOffer(db: AppDatabase, input: string, mode: SceneModeName): FlashbackRecord | null {
  const state = flashbackStateOf(db);

  if (state.active || state.pending) return null;
  if (mode === 'fight') return null;
  if (db.state.scenePace && !['downtime', 'conversation'].includes(db.state.scenePace)) return null;
  if (storyTurnCount(db) < FLASHBACK_MIN_TURN) return null;
  if (state.lastOfferOn && daysBetween(state.lastOfferOn, db.state.inStoryDate) < FLASHBACK_OFFER_GAP_DAYS) return null;
  // Not before the story's own opening has settled: the forest, the first night.
  if (daysBetween({ year: 13, month: 10, day: 1, hour: 0, minute: 0 }, db.state.inStoryDate) < 3) return null;

  const text = `${(lastPresentReply(db)?.content ?? '').slice(-1500)}\n${input}`;
  let best: { record: FlashbackRecord; score: number } | null = null;

  for (const record of FLASHBACKS) {
    if (state.played.includes(record.id)) continue;
    if (record.requires?.some((id) => milestoneStage(db, id) !== 'completed')) continue;

    const score = flashbackScore(db, record, text);

    if (score >= OFFER_SCORE && (!best || score > best.score)) {
      best = { record, score };
    }
  }

  return best?.record ?? null;
}

function whenLine(db: AppDatabase, record: FlashbackRecord, date: CalendarDate = record.date) {
  const age = kanAgeAt(db, date);
  return `Year ${date.year}, when you were ${ageWord(age)}`;
}

/** The one optional line the narrator gets when a flashback fits. */
export function formatFlashbackOffer(db: AppDatabase, record: FlashbackRecord | null): string {
  if (!record) return '';

  return `A MEMORY (optional): a flashback fits here: ${record.title} (${whenLine(db, record)}: ${record.memoryLine.replace(/\.$/, '')}). If it fits the moment, let one small trigger touch Kan this turn, drawn from what is really here (${record.hint}), and leave it there: do not start the memory, do not narrate it, do not say what he feels. He can follow it or let it pass. If nothing here fits, leave it out.`;
}

/** The date line shown above a flashback in the chat ("Year 5, Oct 10. You are five."). */
export function flashbackDateLine(db: Pick<AppDatabase, 'state'>, date: CalendarDate): string {
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.month - 1];
  const age = kanAgeAt(db, date);
  return `Year ${date.year}, ${month} ${date.day}. You are ${ageWord(age)}.`;
}

// ---------------------------------------------------------------------------
// Starting

/** Kan's parents enter the save the first time a memory needs them. */
export function ensureFlashbackPeople(db: AppDatabase, record: FlashbackRecord): AppDatabase {
  const missing = KAN_PARENTS.filter(
    (parent) => record.cast.includes(parent.name) && !db.entities.some((entity) => entity.name === parent.name)
  );

  if (missing.length === 0) return db;

  const died: CalendarDate = { year: 5, month: 10, day: 10, hour: 23, minute: 0, second: 0 };
  const added: EntityRecord[] = missing.map((parent) => ({
    id: makeId('entity'),
    name: parent.name,
    type: 'character',
    aliases: parent.aliases,
    role: parent.role,
    personality: parent.personality,
    speechStyle: parent.speechStyle,
    appearance: parent.appearance,
    status: 'Deceased',
    notes: 'One of your parents. Died in the Nine-Tails attack when you were five.',
    deceased: { date: died, cause: 'the Nine-Tails attack', known: true },
    gender: parent.gender,
    romanceAccessibility: 'not-applicable',
    met: true,
    lastSeen: died,
    lastSeenAt: 'Hidden Leaf',
    tags: ['original', 'family', 'kan-parent', parent.name.includes('Uzumaki') ? 'uzumaki' : 'uchiha'],
  }));

  const next = { ...db, entities: [...db.entities, ...added] };
  return { ...next, indices: buildIndices(next) };
}

/**
 * Kan steps into a flashback: it plays from the next narrated turn. Nothing
 * in the present changes except that its pace and mode are kept to put back.
 */
export function beginFlashback(db: AppDatabase, id: string): AppDatabase {
  const record = FLASHBACK_BY_ID[id];
  const state = flashbackStateOf(db);

  if (!record || state.active || state.played.includes(id)) return db;

  const withPeople = ensureFlashbackPeople(db, record);
  const active: ActiveFlashback = {
    id,
    date: record.date,
    place: record.place,
    locationKind: record.locationKind,
    startedOn: db.state.inStoryDate,
    turns: 0,
    castIds: [],
    nudges: {},
    ...(db.state.scenePace ? { presentPace: db.state.scenePace } : {}),
    ...(db.state.sceneMode ? { presentSceneMode: db.state.sceneMode } : {}),
  };

  return {
    ...withPeople,
    state: {
      ...withPeople.state,
      // The memory starts in plain narration; the present's talk is paused.
      sceneMode: { current: 'normal', exchangeStreak: 0, partners: [] },
      scenePace: 'conversation',
      flashbacks: { ...state, pending: undefined, returned: undefined, active, offered: { ...state.offered, [id]: db.state.inStoryDate } },
    },
  };
}

/** The flashback the "Remember" chip under this reply would start. */
export function rememberChip(db: AppDatabase, logId: string | undefined): FlashbackRecord | null {
  const pending = flashbackStateOf(db).pending;

  if (!pending || !logId || pending.logId !== logId || flashbackStateOf(db).active) return null;

  return FLASHBACK_BY_ID[pending.id] ?? null;
}

/** What the player sends when they tap the chip. */
export const REMEMBER_INPUT = '*You let the memory come.*';

// ---------------------------------------------------------------------------
// The narrator while a flashback plays

function castLines(db: AppDatabase, record: FlashbackRecord, date: CalendarDate): string[] {
  const names = new Set(record.cast);
  const active = flashbackStateOf(db).active;

  for (const id of active?.castIds ?? []) {
    const entity = db.entities.find((item) => item.id === id);
    if (entity) names.add(entity.name);
  }

  return [...names].map((name) => {
    const entity = db.entities.find((item) => item.name === name) ?? resolveEntity(db, name);
    const age = entity ? entityAge(date, entity) : undefined;
    const ageText = age === undefined ? '' : age === 0 ? ', a newborn' : `, ${age}`;
    const dead = entity && (entity.deceased || entity.status === 'Deceased') ? ' (dead in the present; alive here)' : '';
    const role = entity?.role ? ` — ${entity.role.split('·')[0].trim()}` : '';
    const personality = entity?.personality ? `: ${entity.personality}` : '';
    return `- ${entity?.name ?? name}${ageText}${role}${personality}${dead}`;
  });
}

function hiddenLines(db: AppDatabase, record: FlashbackRecord): string[] {
  const lines = [...(record.hidden ?? [])];

  if (milestoneStage(db, 'shisui-truth') !== 'completed') {
    lines.push('how Shisui really died');
  }

  return [...new Set(lines)];
}

function pacingLine(turns: number): string {
  if (turns === 0) {
    return 'THIS TURN THE MEMORY BEGINS: a line or two of the present slipping away (the trigger, the sound or smell fading), then open the memory itself at its date and place. Second person as always, in the present tense of the memory.';
  }

  if (turns >= FLASHBACK_LAST_TURN) {
    return `Turn ${turns + 1}: END THE MEMORY THIS REPLY. Close it in a short paragraph and bring Kan back to the present, to the very second he left (THE PRESENT below): the river, the smoke or the voice fades and the present is there again.`;
  }

  if (turns >= FLASHBACK_WRAP_TURN) {
    return `Turn ${turns + 1} of about 3-10: look for the scene's natural end. When it comes, close the memory in a short paragraph and bring Kan back to the present, to the very second he left (THE PRESENT below).`;
  }

  return `Turn ${turns + 1} of about 3-10: play the scene; one scene only, no time skips beyond it.`;
}

/**
 * Replaces the present state for the narrator while a flashback plays: the
 * memory's date and place, Kan as he was, who is there at their age, what is
 * fixed and what must stay hidden, and where the present stands still.
 */
export function formatFlashbackBlock(db: AppDatabase, weatherLine: string): string {
  const playing = activeFlashback(db);

  if (!playing) return '';

  const { record, active } = playing;
  const age = kanAgeAt(db, active.date);
  const present = lastPresentReply(db);
  const presentTail = present ? present.content.trim().slice(-320).replace(/\s+/g, ' ') : '';
  const hidden = hiddenLines(db, record);

  return [
    'FLASHBACK — A MEMORY KAN IS LIVING THROUGH (the present stands still while it plays)',
    `${record.title}: ${record.scene}`,
    `WHEN: ${formatDate(active.date)}. You are ${ageWord(age)}. It is ${timeOfDayOf(active.date)}.`,
    `WHERE: ${active.place}.`,
    weatherLine,
    `KAN THEN: ${kanThen(age)}. No Sharingan: it awakens only in Year 13, when Itachi tells him the truth. His real strength stays hidden; never show its limit. The jutsu, abilities, inventory and wounds listed above belong to the present and do not exist here; Thousand Souls is never used or seen.`,
    'WHO IS THERE THEN (everyone at their age on this date, with the personality they had then; the dead are alive in this memory, so THE DEAD list does not apply inside it):',
    ...castLines(db, record, active.date),
    ...(record.castNotes ?? []).map((note) => `- ${note}`),
    `FIXED (the memory cannot change these): ${record.fixed.join(' ')}`,
    'FREE: inside that, Kan’s choices are his and become real: what he says, does and feels, and the small things that happen.',
    `NEVER REVEALED: ${hidden.length > 0 ? `${hidden.join('; ')}. ` : ''}Nobody in the memory tells Kan anything he does not already know in the present, and nothing from after this date is mentioned.`,
    `PACING: ${pacingLine(active.turns)} If Kan pulls himself out of the memory, end it this reply the same way.`,
    `THE PRESENT (frozen at ${formatDate(active.startedOn)}, ${localizePlaceNames(db.state.location)})${presentTail ? `: the last moment there was "…${presentTail}"` : ''}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** The first present turn after a flashback: pick up the same second. */
export function formatFlashbackReturn(db: AppDatabase): string {
  const returned = flashbackStateOf(db).returned;
  const record = returned ? FLASHBACK_BY_ID[returned.id] : undefined;

  if (!returned || !record) return '';

  return `BACK FROM A MEMORY: Kan has just come back from remembering ${record.title} (${whenLine(db, record)}). No time passed in the present: continue from the last narrated beat in RECENT SCENE, the same second he left. ${
    returned.forced ? 'The memory let go of him before it was finished. ' : ''
  }How the memory ended: "…${returned.ending}". Let it linger in him if it fits; never retell it.`;
}

/** For the state tracker: what to report about flashbacks this turn. */
export function flashbackTrackingLines(db: AppDatabase, offeredId: string | undefined): string[] {
  const state = flashbackStateOf(db);
  const playing = activeFlashback(db);

  if (playing) {
    const age = kanAgeAt(db, playing.active.date);
    return [
      `THIS TURN IS A MEMORY (flashback "${playing.record.title}", ${formatDate(playing.active.date)}, you are ${ageWord(age)}). Report time and location as they pass inside the memory. characters_present: who is in the memory scene (the dead are alive in it: list them). bonds: only how someone in the memory feels about you because of it, affinity_change -1..1. Leave inventory, jutsu, facts, threads, canon, news, letters, reputation, consequences, deaths, revived, companions, natures and abilities empty: the memory is recorded separately. flashback: "ended" when the reply closes the memory and brings you back to the present; otherwise null.`,
    ];
  }

  const lines: string[] = [];
  const offered = offeredId ? FLASHBACK_BY_ID[offeredId] : undefined;
  const waiting = state.pending ? FLASHBACK_BY_ID[state.pending.id] : undefined;

  if (offered) {
    lines.push(
      `FLASHBACK OFFERED: "${offered.title}". flashback: "offered" if the reply shows a small trigger that could pull you into that memory; "started" only if your own input already lets that memory take you; otherwise null.`
    );
  } else if (waiting) {
    lines.push(
      `A MEMORY IS WAITING: "${waiting.title}" (its trigger was shown). flashback: "started" only if your input lets that memory take you (you dwell on it, close your eyes and remember, ask about that day, follow the trigger); otherwise null.`
    );
  }

  return lines;
}

// ---------------------------------------------------------------------------
// The state step

/**
 * The present turn's flashback marks: an offer the reply showed waits for
 * Kan (the chip), Kan following one starts it from the next turn, and a
 * waiting offer runs out. The month gap counts from the offer, shown or not.
 */
export function applyFlashbackMarks(
  next: AppDatabase,
  options: { offeredId?: string; mark?: TurnDiff['flashback']; turnLogId: string }
): AppDatabase {
  let state = flashbackStateOf(next);

  // The return note has done its job on this turn.
  if (state.returned) {
    state = { ...state, returned: undefined };
  }

  if (options.offeredId && FLASHBACK_BY_ID[options.offeredId] && !state.played.includes(options.offeredId)) {
    state = {
      ...state,
      lastOfferOn: next.state.inStoryDate,
      offered: { ...state.offered, [options.offeredId]: next.state.inStoryDate },
      ...(options.mark === 'offered' || options.mark === 'started'
        ? { pending: { id: options.offeredId, logId: options.turnLogId, turnsLeft: FLASHBACK_PENDING_TURNS } }
        : {}),
    };
  } else if (state.pending && options.mark !== 'started') {
    const turnsLeft = state.pending.turnsLeft - 1;
    state = { ...state, pending: turnsLeft > 0 ? { ...state.pending, turnsLeft } : undefined };
  }

  const db = { ...next, state: { ...next.state, flashbacks: state } };

  if (options.mark === 'started' && state.pending) {
    return beginFlashback(db, state.pending.id);
  }

  return db;
}

export type FlashbackTurnResult = {
  db: AppDatabase;
  /** The memory ended this turn: its story entries, to write it up. */
  ended?: { flashbackId: string; logIds: string[]; eventId: string };
};

/**
 * Applies one turn played inside a flashback. Only the memory's own clock,
 * place, weather, cast and scene mode move; the present is left as it was.
 */
export function applyFlashbackTurn(
  latest: AppDatabase,
  extraction: TurnDiff | null,
  turn: { turnLogId: string; userMessage: string; narration: string }
): FlashbackTurnResult {
  const playing = activeFlashback(latest);

  if (!playing) return { db: latest };

  const { record, active } = playing;
  const parsedTime = detectNarrationTime(turn.narration, active.date);
  const pace = validateScenePace(extraction?.state?.scenePace, turn.narration) ?? inferScenePace(turn.narration);
  const sceneEnded = extraction?.scene?.ended ?? false;
  const entry = latest.rawLog.find((item) => item.id === turn.turnLogId);
  const modeUsed = entry?.sceneMode;
  const clock = resolveTurnClock({
    reportedSeconds: extraction?.state?.elapsedSeconds ?? 0,
    reportedClock: extraction?.state?.clockTime,
    detected: parsedTime,
    pace,
    sceneEnded,
    current: active.date,
    minimumSeconds: modeUsed === 'conversation' && pace === 'conversation' ? CONVERSATION_MODE_MINIMUM_SECONDS : undefined,
  });

  const castIds = (extraction?.state?.sceneCast ?? [])
    .map((name) => resolveEntity(latest, name))
    .filter((entity): entity is EntityRecord => Boolean(entity) && entity!.name.toLowerCase() !== 'kan')
    .map((entity) => entity.id);
  const nudges = { ...active.nudges };

  for (const bond of extraction?.bonds ?? []) {
    const entity = bond.entityId ? latest.entities.find((item) => item.id === bond.entityId) : resolveEntity(latest, bond.character);
    if (!entity || !bond.affinityDelta) continue;
    nudges[entity.id] = (nudges[entity.id] ?? 0) + bond.affinityDelta;
  }

  const condition = conditionFromText(extraction?.weather);
  const location = extraction?.state?.location?.trim();
  const updated: ActiveFlashback = {
    ...active,
    date: advanceSeconds(active.date, clock.elapsedSeconds),
    ...(location ? { place: location } : {}),
    ...(extraction?.state?.locationKind ? { locationKind: extraction.state.locationKind } : {}),
    ...(condition ? { weather: { condition, text: extraction?.weather } } : {}),
    turns: active.turns + 1,
    castIds: [...new Set([...active.castIds, ...castIds])],
    nudges,
  };

  const fightGoesOn = !sceneEnded && (pace === 'combat' || extraction?.beat?.kind === 'combat');
  const fightOptions = fightGoesOn ? cleanFightOptions(extraction?.fightOptions, latest) : undefined;
  const stampIndex = latest.rawLog.findIndex((item) => item.id === turn.turnLogId);

  let db: AppDatabase = {
    ...latest,
    rawLog: latest.rawLog.map((item, index) =>
      (index === stampIndex || (index === stampIndex - 1 && item.role === 'user')) && item.flashback
        ? { ...item, sceneCastIds: updated.castIds, ...(index === stampIndex ? { fightOptions, ...(extraction?.imageWorthy ? { imageWorthy: true } : {}) } : {}) }
        : item
    ),
    state: {
      ...latest.state,
      scenePace: pace,
      flashbacks: { ...flashbackStateOf(latest), active: updated },
    },
  };

  db = applySceneBeat(db, {
    beat: extraction?.beat,
    modeUsed,
    input: turn.userMessage,
    narration: turn.narration,
    pace,
    sceneEnded: false,
  });

  const ended = extraction?.flashback === 'ended' || updated.turns >= FLASHBACK_HARD_CAP;

  if (!ended) return { db };

  return endFlashback(db, turn.turnLogId, { forced: extraction?.flashback !== 'ended', narration: turn.narration });
}

/**
 * The memory is over: it becomes a memory dated in the past, shared by
 * everyone in it, each bond it moved moves a little, and the present picks
 * up the same second Kan left.
 */
export function endFlashback(
  db: AppDatabase,
  turnLogId: string,
  options: { forced?: boolean; narration?: string } = {}
): FlashbackTurnResult {
  const playing = activeFlashback(db);

  if (!playing) return { db };

  const { record, active } = playing;
  const state = flashbackStateOf(db);
  const castIds = active.castIds.length > 0
    ? active.castIds
    : record.cast.map((name) => db.entities.find((entity) => entity.name === name)?.id).filter((id): id is string => Boolean(id));
  const eventId = makeId('event');
  const people = db.entities.filter((entity) => castIds.includes(entity.id));
  const event: EventRecord = {
    id: eventId,
    chapter: db.state.chapter,
    scene: record.title,
    inStoryDate: record.date,
    title: record.title,
    summary: record.memoryLine,
    importance: record.importance,
    tags: ['flashback', record.id, ...people.map((entity) => entity.name.split(/\s+/)[0].toLowerCase())].slice(0, 10),
    pinned: false,
    sourceLogId: turnLogId,
    createdAt: Date.now(),
  };

  // A memory nudges a bond a little, never a lot, and only for the living.
  const bonds = db.bonds.map((bond) => {
    const sum = active.nudges[bond.entityId];
    const entity = db.entities.find((item) => item.id === bond.entityId);
    if (!sum || !entity || entity.deceased || entity.status === 'Deceased') return bond;
    const step = Math.max(-FLASHBACK_BOND_NUDGE, Math.min(FLASHBACK_BOND_NUDGE, sum));
    const affinity = Math.max(-10, Math.min(10, bond.affinity + step));
    return {
      ...bond,
      affinity,
      ...(bond.theirFeelings ? { theirFeelings: { ...bond.theirFeelings, affinity } } : {}),
    };
  });

  const logIds = db.rawLog.filter((entry) => entry.flashback?.id === record.id).map((entry) => entry.id);
  const ending = (options.narration ?? '').trim().slice(-360).replace(/\s+/g, ' ');

  const next: AppDatabase = {
    ...db,
    events: [...db.events, event],
    eventEntities: [
      ...db.eventEntities,
      ...castIds.map((entityId) => ({ eventId, entityId, role: 'present' as const })),
    ],
    bonds,
    state: {
      ...db.state,
      scenePace: active.presentPace,
      sceneMode: active.presentSceneMode,
      flashbacks: {
        ...state,
        played: [...new Set([...state.played, record.id])],
        active: undefined,
        pending: undefined,
        returned: { id: record.id, ending, ...(options.forced ? { forced: true } : {}) },
      },
    },
  };

  return {
    db: { ...next, indices: buildIndices(next) },
    ended: { flashbackId: record.id, logIds, eventId },
  };
}

/** Puts the write-up of a finished flashback on its memory. */
export function applyFlashbackWriteUp(
  db: AppDatabase,
  flashbackId: string,
  output: { text: string; memory?: string; povs?: { entityId: string; text: string }[] }
): AppDatabase | null {
  const event = [...db.events].reverse().find((item) => item.tags.includes('flashback') && item.tags.includes(flashbackId));

  if (!event) return null;

  const present = new Set(db.eventEntities.filter((link) => link.eventId === event.id).map((link) => link.entityId));
  const povs = output.povs?.filter((item) => present.has(item.entityId));
  const summary = output.memory?.trim() || firstSentences(output.text, 2, 320);

  return {
    ...db,
    events: db.events.map((item) =>
      item.id === event.id ? { ...item, summary, ...(povs?.length ? { povs } : {}) } : item
    ),
  };
}

/** Flashbacks Kan has lived through with someone (for remembrance days). */
export function flashbacksWith(db: AppDatabase, entityId: string): string[] {
  const ids = new Set(db.eventEntities.filter((link) => link.entityId === entityId).map((link) => link.eventId));
  return db.events.filter((event) => ids.has(event.id) && event.tags.includes('flashback')).map((event) => event.title ?? event.scene);
}

/**
 * For the image of a flashback reply: Kan and everyone else at their age
 * then, in the memory's place.
 */
export function flashbackImageNote(db: AppDatabase, entry: Pick<RawLogEntry, 'flashback' | 'content'> | undefined): string | null {
  if (!entry?.flashback) return null;

  const record = FLASHBACK_BY_ID[entry.flashback.id];
  const date = entry.flashback.date;
  const age = kanAgeAt(db, date);
  const people = db.entities
    .filter((entity) => entity.type === 'character' && entity.name !== 'Kan' && mentionsEntity(entry.content, entity))
    .slice(0, 5)
    .map((entity) => {
      const then = entityAge(date, entity);
      return then === undefined ? entity.name : `${entity.name} (${then === 0 ? 'a newborn' : `age ${then}`})`;
    });

  return [
    `THIS IS A MEMORY from Year ${date.year}${record ? ` (${record.title})` : ''}, before the story: draw everyone at their age then.`,
    `${kanLookAt(age)}. Keep his face recognisable from the face sheet, but make him truly ${age} years old: a child's proportions and size, not a teenager.`,
    people.length > 0 ? `Others at their age then: ${people.join(', ')}.` : '',
    record ? `Place: ${localizePlaceNames(record.place)}.` : '',
    'A warm, faded, nostalgic tint over the whole image, like an old memory.',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Whether the latest story reply was narrated inside a flashback. */
export function latestReplyIsFlashback(db: AppDatabase): RawLogEntry | undefined {
  const reply = [...db.rawLog].reverse().find((entry) => entry.kind === 'story' && entry.role === 'assistant');
  return reply?.flashback ? reply : undefined;
}
