/**
 * Kan's trial in the Akatsuki (audit 8, decided by Xan, 13 Nov 2026).
 *
 * Taking the cloak (`kan-joins-akatsuki`) is not membership. Kan has to prove
 * himself first: two or three missions, more or fewer depending on how
 * important each was and how well he carried it out, and a couple of months
 * at most. Until then he is under Itachi's word, has no ring, and goes out
 * at Itachi's side. Being accepted (`kan-accepted-akatsuki`) brings the ring
 * and his own partner, Kakuzu.
 *
 * - The trial runs from the day the cloak beat completed until acceptance.
 * - The World tracker reports each trial mission that ends (`trial_mission`:
 *   title, importance 1-5, outcome well / mixed / badly).
 * - The acceptance beat opens once a mission went well (`trialOpen`); it is
 *   expected once the missions add up (`trialReady`: TRIAL_TARGET points, or
 *   one major mission done well) and due no later than TRIAL_MAX_DAYS after
 *   the cloak whatever happened (`trialDue`).
 * - A time skip stops before the acceptance (`trialSkipLimit`).
 */
import { daysBetween, secondsBetween, SECONDS_PER_DAY, advanceSeconds } from './calendar';
import type { AppDatabase, CalendarDate, TrialMission } from './types';

export const TRIAL_MAX_DAYS = 60;
/** Points that make the trial enough: a mission done well is worth its importance. */
export const TRIAL_TARGET = 6;
export const CLOAK_BEAT = 'kan-joins-akatsuki';
export const ACCEPTANCE_BEAT = 'kan-accepted-akatsuki';

function completed(db: Pick<AppDatabase, 'state'>, id: string) {
  return (db.state.canonProgress?.completed ?? []).includes(id);
}

/** The day Kan took the cloak, or null while he hasn't. */
export function trialStart(db: Pick<AppDatabase, 'state' | 'events'>): CalendarDate | null {
  if (!completed(db, CLOAK_BEAT)) return null;
  return db.events.find((event) => event.id === `event_canon_${CLOAK_BEAT}`)?.inStoryDate ?? db.state.akatsukiTrial?.since ?? null;
}

/** The trial is on: the cloak taken, the ring not yet. */
export function trialActive(db: Pick<AppDatabase, 'state' | 'events'>) {
  return trialStart(db) !== null && !completed(db, ACCEPTANCE_BEAT);
}

export function trialMissions(db: Pick<AppDatabase, 'state'>): TrialMission[] {
  return db.state.akatsukiTrial?.missions ?? [];
}

const OUTCOME_WEIGHT: Record<TrialMission['outcome'], number> = { well: 1, mixed: 0.5, badly: -0.5 };

export function trialScore(db: Pick<AppDatabase, 'state'>) {
  return trialMissions(db).reduce((sum, mission) => sum + mission.importance * OUTCOME_WEIGHT[mission.outcome], 0);
}

export function trialDays(db: Pick<AppDatabase, 'state' | 'events'>) {
  const start = trialStart(db);
  return start ? daysBetween(start, db.state.inStoryDate) : 0;
}

/** A mission went well: the acceptance may come whenever the story fits it. */
export function trialOpen(db: Pick<AppDatabase, 'state' | 'events'>) {
  return trialActive(db) && (trialMissions(db).some((mission) => mission.outcome === 'well') || trialDue(db));
}

/** The missions add up (or one major mission went well): acceptance is expected now. */
export function trialReady(db: Pick<AppDatabase, 'state' | 'events'>) {
  if (!trialActive(db)) return false;
  const majorWell = trialMissions(db).some((mission) => mission.importance >= 4 && mission.outcome === 'well');
  return majorWell || trialScore(db) >= TRIAL_TARGET || trialDue(db);
}

/** Two months since the cloak: acceptance happens now, whatever the missions were. */
export function trialDue(db: Pick<AppDatabase, 'state' | 'events'>) {
  return trialActive(db) && trialDays(db) >= TRIAL_MAX_DAYS;
}

/** Adds a mission the tracker reported (once per title). */
export function recordTrialMission(db: AppDatabase, mission: TrialMission | undefined): AppDatabase {
  if (!mission || !trialActive(db)) return db;

  const missions = trialMissions(db);
  const key = mission.title.trim().toLowerCase();
  const kept = missions.filter((item) => item.title.trim().toLowerCase() !== key);
  const since = db.state.akatsukiTrial?.since ?? trialStart(db) ?? db.state.inStoryDate;

  return {
    ...db,
    state: {
      ...db.state,
      akatsukiTrial: { since, missions: [...kept, { ...mission, on: db.state.inStoryDate }].slice(-12) },
    },
  };
}

/**
 * The longest a skip may run during the trial: never past the acceptance.
 * Null when the trial puts no limit on it.
 */
export function trialSkipLimit(db: AppDatabase): number | null {
  if (!trialActive(db)) return null;
  if (trialReady(db)) return SECONDS_PER_DAY;

  const start = trialStart(db)!;
  const due = advanceSeconds(start, TRIAL_MAX_DAYS * SECONDS_PER_DAY);
  return Math.max(SECONDS_PER_DAY, secondsBetween(db.state.inStoryDate, due) - SECONDS_PER_DAY);
}

function missionLine(mission: TrialMission) {
  const how = mission.outcome === 'well' ? 'done well' : mission.outcome === 'mixed' ? 'done, not cleanly' : 'botched';
  return `${mission.title} (importance ${mission.importance}, ${how})`;
}

/** The narrator's line while the trial runs. */
export function formatTrialLine(db: AppDatabase): string {
  if (!trialActive(db)) return '';

  const missions = trialMissions(db);
  const days = trialDays(db);
  const lines = [
    `AKATSUKI TRIAL: Kan wears the cloak but is not a member yet. He has no ring; the leader does not count him as one of them, and he is here on Itachi's word, as Itachi's responsibility. He goes out with Itachi (whose own partner is Jūzō Biwa, later Kisame, as canon has it) and is judged on the missions he is given. ${days} day${days === 1 ? '' : 's'} so far; it lasts a couple of months at most.`,
    missions.length > 0 ? `Missions so far: ${missions.map(missionLine).join('; ')}.` : 'No mission finished yet: the next fitting scene can bring him his first.',
  ];

  if (trialDue(db)) {
    lines.push('The trial is over: in the next fitting scene the leader (Pain, or Konan for him) accepts Kan as a full member, gives him his ring and names his partner, Kakuzu. Play it on the page; it is offered, not forced on a fight.');
  } else if (trialReady(db)) {
    lines.push('He has proven himself: the leader is ready to accept him. Bring it about at a fitting moment soon (his ring, and Kakuzu named as his partner).');
  } else {
    lines.push('Nobody hands him a ring or a partner of his own yet. A mission done badly counts against him.');
  }

  return lines.join(' ');
}

/** The tracker's rule for the trial, given with the canon area while it runs. */
export function formatTrialTracking(db: AppDatabase): string {
  if (!trialActive(db)) return '';

  return 'AKATSUKI TRIAL: you are on trial in the Akatsuki. trial_mission: when a mission or task you were given during the trial ends on the page this turn, {title (a few words), importance (1 an errand, 3 a real mission, 5 a mission the whole organization depends on), outcome ("well", "mixed" or "badly", by how it was carried out)}; otherwise null.';
}
