// The yearly calendar: birthdays, anniversaries, New Year and festivals.
//
// Rules (living-world Stage 2):
// - At most one yearly offer per turn, never in a fight, each one once a year.
// - Kan only knows the birthdays he plausibly would: the people he grew up
//   with and is close to (or was), and those he learned in the story.
// - Birthdays come up mostly when the person is in the scene; sometimes Kan
//   thinks of a close person who is far away (rarer). The dead get
//   remembrance days.
// - Kan's own hard days come first: the massacre (Oct 1), the Nine-Tails
//   night that took his parents (Oct 10), Itachi's death, joining the cloak.
// - Festivals only when Kan is in or near their village.
// - Offered, never forced: the narrator gets one line.

import { daysFromCivil, entityAge, isLeapYear } from './calendar';
import { displayName, narratorName } from './names';
import { isCombatPace } from './canon';
import { castWithCompanions } from './companions';
import { isDeceased, kanKnowsDeath } from './deaths';
import { resolveEntity } from './entities';
import { BIRTHDAY_HABITS, FESTIVALS, type BirthdayHabit, type YearlyFestival } from './yearlyData';
import type { AppDatabase, BondRecord, CalendarDate, EntityRecord, TurnDiff, YearlyState } from './types';

export { BIRTHDAY_HABITS, FESTIVALS } from './yearlyData';

/** The night of the massacre (the story opens on it). */
const MASSACRE = { month: 10, day: 1 };
/** The Nine-Tails attack, Naruto's birthday, the night Kan's parents died. */
const NINE_TAILS_NIGHT = { month: 10, day: 10 };

/** People Kan grew up with: he has always known their birthdays. */
const ALWAYS_KNOWN = new Set(['Itachi Uchiha', 'Izumi Uchiha', 'Shisui Uchiha', 'Hana Inuzuka', 'Suzume']);

const CLOSE_STAGES = new Set(['close', 'old friend', 'family', 'romantic interest', 'lover']);
/** Affinity at which a bond is close enough to know (or be told) a birthday. */
const CLOSE_AFFINITY = 6;

export type YearlyOffer = {
  /** Unique per kind and person; offered at most once a year. */
  key: string;
  kind: 'anniversary' | 'kan-birthday' | 'birthday' | 'birthday-unknown' | 'birthday-absent' | 'remembrance' | 'festival' | 'new-year';
  /** The one line the narrator gets. */
  line: string;
  /** Who it is about, for the state tracker. */
  entity?: EntityRecord;
};

export function yearlyOf(db: AppDatabase): YearlyState {
  const yearly = db.state.yearly;

  return {
    knownBirthdays: Array.isArray(yearly?.knownBirthdays) ? yearly.knownBirthdays.filter(Boolean) : [],
    offered: yearly?.offered && typeof yearly.offered === 'object' ? yearly.offered : {},
  };
}

export function normalizeYearly(raw: unknown): YearlyState | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<YearlyState>;

  return {
    knownBirthdays: Array.isArray(value.knownBirthdays) ? value.knownBirthdays.filter((id) => typeof id === 'string') : [],
    offered:
      value.offered && typeof value.offered === 'object'
        ? Object.fromEntries(Object.entries(value.offered).filter(([, year]) => typeof year === 'number'))
        : {},
  };
}

export function birthdayHabit(entity: Pick<EntityRecord, 'name'>): BirthdayHabit {
  return BIRTHDAY_HABITS[entity.name] ?? { kind: 'quiet', note: 'lets the day pass unless someone remembers' };
}

/** The day someone's birthday falls on this year: a leap-day birthday is kept on Feb 28 otherwise. */
export function birthdayThisYear(birthday: { month: number; day: number }, year: number) {
  return birthday.month === 2 && birthday.day === 29 && !isLeapYear(year) ? { month: 2, day: 28 } : birthday;
}

function isToday(date: CalendarDate, day: { month: number; day: number }) {
  const shown = birthdayThisYear(day, date.year);
  return date.month === shown.month && date.day === shown.day;
}

function isKan(entity: EntityRecord) {
  return entity.name.trim().toLowerCase() === 'kan' || entity.tags.includes('player');
}

function bondOf(db: AppDatabase, entityId: string): BondRecord | null {
  return db.bonds.find((bond) => bond.entityId === entityId) ?? null;
}

/** Close to Kan now, or before they died: a strong bond or a close relationship. */
export function isClose(db: AppDatabase, entity: EntityRecord) {
  if (ALWAYS_KNOWN.has(entity.name)) return true;
  const bond = bondOf(db, entity.id);
  return Boolean(bond && (bond.affinity >= CLOSE_AFFINITY || CLOSE_STAGES.has(bond.relationship ?? '')));
}

/** Kan knows this birthday: someone he is (or was) close to, or one he learned in the story. */
export function knowsBirthday(db: AppDatabase, entity: EntityRecord) {
  if (!entity.birthday || entity.met === false || isKan(entity)) return false;
  return isClose(db, entity) || yearlyOf(db).knownBirthdays.includes(entity.id);
}

function sceneIds(db: AppDatabase): Set<string> {
  const ids = new Set<string>();

  for (const name of castWithCompanions(db, db.state.sceneCast ?? [])) {
    const entity = resolveEntity(db, name);
    if (entity) ids.add(entity.id);
  }

  return ids;
}

function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function hasHappened(db: AppDatabase, milestoneId: string) {
  return db.events.some((event) => event.id === `event_canon_${milestoneId}`);
}

function yearsSince(year: number, now: CalendarDate) {
  const years = now.year - year;
  return years === 1 ? 'one year' : `${years} years`;
}

function ageOn(db: AppDatabase, entity: EntityRecord) {
  return entity.birthYear !== undefined ? entityAge(db.state.inStoryDate, entity) : undefined;
}

function turns(age: number | undefined) {
  return age !== undefined ? ` (${age} today)` : '';
}

/** Kan is in or near a place: its words appear in the location. */
function nearPlace(db: AppDatabase, words: string[]) {
  const location = db.state.location.toLowerCase();
  return words.some((word) => location.includes(word));
}

function festivalToday(festival: YearlyFestival, now: CalendarDate) {
  const start = daysFromCivil(now.year, festival.month, festival.day);
  const today = daysFromCivil(now.year, now.month, now.day);
  return today >= start && today < start + (festival.days ?? 1);
}

// ---------------------------------------------------------------------------
// What could come up today, most important first.

function kanAnniversaries(db: AppDatabase): YearlyOffer[] {
  const now = db.state.inStoryDate;
  const offers: YearlyOffer[] = [];

  if (now.year > 13 && isToday(now, MASSACRE)) {
    const izumi = db.entities.find((entity) => entity.name === 'Izumi Uchiha');
    const izumiLine = izumi && kanKnowsDeath(db, izumi) ? ', and Izumi with it' : '';
    offers.push({
      key: 'anniversary:massacre',
      kind: 'anniversary',
      line: `Today is the anniversary of the Uchiha massacre: ${yearsSince(13, now)} since the night the clan died${izumiLine}. It is the hardest day of your year. Let it weigh on you and on anyone who knows what today is; never announce the date.`,
    });
  }

  if (isToday(now, NINE_TAILS_NIGHT)) {
    offers.push({
      key: 'anniversary:nine-tails',
      kind: 'anniversary',
      line: `Today is the anniversary of the Nine-Tails attack (${yearsSince(5, now)}): a mourning day in the Leaf, and the night your parents, Erisa and Banri, died. It is also Naruto's birthday, which almost no one celebrates.`,
    });
  }

  const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha');
  const itachiDeath = itachi?.deceased?.date;

  if (itachi && itachiDeath && kanKnowsDeath(db, itachi) && now.year > itachiDeath.year && isToday(now, itachiDeath)) {
    offers.push({
      key: 'anniversary:itachi-death',
      kind: 'anniversary',
      line: `Today is ${yearsSince(itachiDeath.year, now)} since Itachi died. A quiet, heavy day; a grave visit fits if you are near.`,
    });
  }

  const joined = db.events.find((event) => event.id === 'event_canon_kan-joins-akatsuki')?.inStoryDate;

  if (joined && now.year > joined.year && isToday(now, joined)) {
    offers.push({
      key: 'anniversary:akatsuki',
      kind: 'anniversary',
      line: `Today is ${yearsSince(joined.year, now)} since you put on the Akatsuki cloak. Nobody marks it but you.`,
    });
  }

  if (isToday(now, db.state.player.birthday)) {
    const here = sceneIds(db);
    const rememberers = db.entities
      .filter(
        (entity) =>
          entity.type === 'character' &&
          !isKan(entity) &&
          entity.met !== false &&
          !isDeceased(entity) &&
          isClose(db, entity)
      )
      .sort((a, b) => Number(here.has(b.id)) - Number(here.has(a.id)) || (bondOf(db, b.id)?.affinity ?? 0) - (bondOf(db, a.id)?.affinity ?? 0))
      .slice(0, 3);
    const present = rememberers.filter((entity) => here.has(entity.id)).map((entity) => narratorName(db, entity));
    const far = rememberers.filter((entity) => !here.has(entity.id)).map((entity) => narratorName(db, entity));
    const who = [
      present.length ? `${present.join(' and ')} (here) might remember` : '',
      far.length ? `${far.join(' and ')} might send word from far away` : '',
    ]
      .filter(Boolean)
      .join('; ');
    const age = db.state.player.birthYear !== undefined ? now.year - db.state.player.birthYear : undefined;
    // Who is around changes with the era: the cloak, the road, home again.
    const views = db.entities
      .filter((entity) => here.has(entity.id) && !rememberers.includes(entity) && BIRTHDAY_HABITS[entity.name])
      .slice(0, 2)
      .map((entity) => `${narratorName(db, entity)} ${birthdayHabit(entity).note}`);

    offers.push({
      key: 'kan-birthday',
      kind: 'kan-birthday',
      line: `Today is your birthday${age !== undefined ? `: you are ${age}` : ''}. ${who ? `${who}.` : 'Nobody close enough to remember is near.'}${views.length ? ` If it came out: ${views.join('; ')}.` : ''} Most people do not know the date; you never announce it.`,
    });
  }

  return offers;
}

function birthdays(db: AppDatabase): YearlyOffer[] {
  const now = db.state.inStoryDate;
  const here = sceneIds(db);
  const present: YearlyOffer[] = [];
  const remembrance: YearlyOffer[] = [];
  const absent: YearlyOffer[] = [];

  for (const entity of db.entities) {
    if (entity.type !== 'character' || isKan(entity) || !entity.birthday || entity.met === false) continue;
    if (!isToday(now, entity.birthday)) continue;

    const habit = birthdayHabit(entity);
    const knows = knowsBirthday(db, entity);

    if (isDeceased(entity)) {
      // Only the dead Kan was close to, and knows are dead.
      if (knows && kanKnowsDeath(db, entity)) {
        remembrance.push({
          key: `remembrance:${entity.id}`,
          kind: 'remembrance',
          entity,
          line: `It would have been ${narratorName(db, entity)}'s birthday today. A remembrance day: a quiet moment of your own, or a visit to the grave if you are near it.${sharedMemoryLine(db, entity)}`,
        });
      }
      continue;
    }

    const age = ageOn(db, entity);

    if (here.has(entity.id)) {
      if (knows) {
        present.push({
          key: `birthday:${entity.id}`,
          kind: 'birthday',
          entity,
          line: `It is ${narratorName(db, entity)}'s birthday today${turns(age)}, and you know it. ${pronounOf(entity)} ${habit.note}. If it fits, the day can come up; never force it.`,
        });
      } else if (habit.kind === 'announces' || habit.kind === 'ritual') {
        present.push({
          key: `birthday:${entity.id}`,
          kind: 'birthday-unknown',
          entity,
          line: `It is ${narratorName(db, entity)}'s birthday today${turns(age)}, which you do not know. ${pronounOf(entity)} ${habit.note}, so ${pronounOf(entity).toLowerCase()} may let it slip.`,
        });
      }
      continue;
    }

    // Far away: only people Kan is close to, and only some years.
    if (knows && isClose(db, entity) && hash(`${db.meta.slotId}:${entity.id}:${now.year}`) % 2 === 0) {
      absent.push({
        key: `birthday:${entity.id}`,
        kind: 'birthday-absent',
        entity,
        line: `It is ${narratorName(db, entity)}'s birthday today${turns(age)}, far from you. A passing thought of them would fit a quiet moment; a letter sent now would still reach them late.`,
      });
    }
  }

  return [...present, ...remembrance, ...absent];
}

function festivals(db: AppDatabase): YearlyOffer[] {
  const now = db.state.inStoryDate;
  const offers: YearlyOffer[] = [];

  for (const festival of FESTIVALS) {
    if (!festivalToday(festival, now) || !nearPlace(db, festival.where)) continue;
    if (festival.from && !hasHappened(db, festival.from)) continue;

    const quiet = festival.quietUntil && !hasHappened(db, festival.quietUntil);

    offers.push({
      key: `festival:${festival.id}`,
      kind: 'festival',
      line: quiet
        ? `It is the time of ${festival.name} here (${festival.note}), but in these years it is kept quietly, behind closed doors, if at all.`
        : `${festival.name.charAt(0).toUpperCase()}${festival.name.slice(1)} is on here (${festival.note}). It can colour the scene: crowds, food, lights, people off duty.`,
    });
  }

  if (now.month === 1 && now.day === 1) {
    offers.push({
      key: 'new-year',
      kind: 'new-year',
      line:
        db.state.locationKind === 'settlement'
          ? "It is New Year's Day: shrine bells, people in their best clothes, the first visit of the year to the shrine."
          : "It is New Year's Day, even out here.",
    });
  }

  return offers;
}

/** Everything the calendar holds for today, most important first (offered or not). */
/** A flashback Kan lived through with someone who is gone, for their remembrance day. */
function sharedMemoryLine(db: AppDatabase, entity: EntityRecord): string {
  const linked = new Set(db.eventEntities.filter((link) => link.entityId === entity.id).map((link) => link.eventId));
  const memory = db.events
    .filter((event) => linked.has(event.id) && event.tags.includes('flashback'))
    .sort((a, b) => b.importance - a.importance)[0];

  return memory ? ` A memory you lived again with them may come back today: ${memory.title ?? memory.scene} (${memory.summary.replace(/\.$/, '')}).` : '';
}

export function yearlyCandidates(db: AppDatabase): YearlyOffer[] {
  const birthdayOffers = birthdays(db);
  const festivalOffers = festivals(db);

  return [
    ...kanAnniversaries(db),
    ...birthdayOffers.filter((offer) => offer.kind === 'birthday' || offer.kind === 'birthday-unknown'),
    ...birthdayOffers.filter((offer) => offer.kind === 'remembrance'),
    ...festivalOffers,
    ...birthdayOffers.filter((offer) => offer.kind === 'birthday-absent'),
  ];
}

/** The one yearly line for this turn, if any: never in a fight, each once a year. */
export function yearlyOffer(db: AppDatabase): YearlyOffer | null {
  if (isCombatPace(db.state.scenePace)) return null;

  const { offered } = yearlyOf(db);
  const year = db.state.inStoryDate.year;

  return yearlyCandidates(db).find((offer) => offered[offer.key] !== year) ?? null;
}

export function formatYearlyBlock(offer: YearlyOffer | null): string {
  return offer ? `THE DAY\n- ${offer.line}` : '';
}

/** What the state tracker needs to know about today's offer. */
export function yearlyTrackingLines(offer: YearlyOffer | null, idOf: (entity: EntityRecord) => string): string[] {
  if (!offer?.entity) return [];

  const id = idOf(offer.entity);

  if (offer.kind === 'birthday') {
    return [
      `It is ${id}'s birthday and you (Kan) know it. If you mark it on the page (a word, a gift), give ${id} a bonds entry: affinity_change +1, or +2 for a real gift. If you let the day pass beside them without a word, -1.`,
    ];
  }

  if (offer.kind === 'birthday-unknown') {
    return [`It is ${id}'s birthday. If they or anyone tells you (Kan) on the page, list ${id} in birthdays_learned; if you then mark it, affinity_change +1.`];
  }

  return [];
}

/** After a turn: the offer is spent for the year, and birthdays Kan learned are kept. */
export function applyYearly(
  db: AppDatabase,
  offer: YearlyOffer | null,
  learned: TurnDiff['birthdaysLearned']
): AppDatabase {
  const yearly = yearlyOf(db);
  let changed = false;
  const offered = { ...yearly.offered };
  const knownBirthdays = [...yearly.knownBirthdays];

  if (offer) {
    offered[offer.key] = db.state.inStoryDate.year;
    changed = true;
  }

  for (const item of learned ?? []) {
    const entity =
      (item.entityId ? db.entities.find((candidate) => candidate.id === item.entityId) : null) ?? resolveEntity(db, item.name);

    if (entity && !knownBirthdays.includes(entity.id) && entity.birthday) {
      knownBirthdays.push(entity.id);
      changed = true;
    }
  }

  return changed ? { ...db, state: { ...db.state, yearly: { knownBirthdays, offered } } } : db;
}

// ---------------------------------------------------------------------------
// For the screens

export type UpcomingBirthday = {
  entity: EntityRecord;
  /** Days from today (0 = today). */
  inDays: number;
  month: number;
  day: number;
  /** The age they turn, when known. */
  turning?: number;
  dead: boolean;
};

/** Birthdays Kan knows in the next `days` days: the living, and the dead he knows are gone. */
export function upcomingBirthdays(db: AppDatabase, days = 30): UpcomingBirthday[] {
  const now = db.state.inStoryDate;
  const today = daysFromCivil(now.year, now.month, now.day);
  const out: UpcomingBirthday[] = [];

  for (const entity of db.entities) {
    if (entity.type !== 'character' || !entity.birthday || !knowsBirthday(db, entity)) continue;

    const dead = isDeceased(entity);
    if (dead && !kanKnowsDeath(db, entity)) continue;

    for (const year of [now.year, now.year + 1]) {
      const shown = birthdayThisYear(entity.birthday, year);
      const inDays = daysFromCivil(year, shown.month, shown.day) - today;

      if (inDays >= 0 && inDays <= days) {
        out.push({
          entity,
          inDays,
          month: shown.month,
          day: shown.day,
          turning: !dead && entity.birthYear !== undefined ? year - entity.birthYear : undefined,
          dead,
        });
        break;
      }
    }
  }

  return out.sort((a, b) => a.inDays - b.inDays || a.entity.name.localeCompare(b.entity.name));
}

/** Short notes for the journal: what today is, as far as Kan knows. */
export function todayNotes(db: AppDatabase): string[] {
  const now = db.state.inStoryDate;
  const notes: string[] = [];

  if (now.year > 13 && isToday(now, MASSACRE)) notes.push('The anniversary of the massacre');
  if (isToday(now, NINE_TAILS_NIGHT)) notes.push('The Nine-Tails anniversary');
  if (isToday(now, db.state.player.birthday)) notes.push('Your birthday');
  if (now.month === 1 && now.day === 1) notes.push("New Year's Day");

  for (const birthday of upcomingBirthdays(db, 0)) {
    notes.push(birthday.dead ? `${displayName(db, birthday.entity)}'s birthday (remembered)` : `${displayName(db, birthday.entity)}'s birthday`);
  }

  for (const festival of FESTIVALS) {
    if (festivalToday(festival, now) && nearPlace(db, festival.where) && (!festival.from || hasHappened(db, festival.from))) {
      notes.push(festival.name.charAt(0).toUpperCase() + festival.name.slice(1));
    }
  }

  return notes;
}

/** The notes are written for one person ("expects her friends…"): never "They expects" (Session 5). */
function pronounOf(entity: { gender?: string }) {
  return entity.gender === 'female' ? 'She' : entity.gender === 'male' ? 'He' : 'This person';
}
