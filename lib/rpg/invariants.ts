// The invariant checker (audit 11d): after every state step, check the save
// and return what is wrong with it. Pure. Violations go to the Debug panel
// with the turn they appeared on; in tests they fail the test.
//
// Two entry points:
// - checkSave(db): what must hold for any save at any moment (the save
//   doctor runs this over a whole save, and on import).
// - checkTurn(before, after, turn): checkSave plus what must hold across one
//   state step (the clock, the dead, the weather, the fight chip).

import { canonStoryOver, knownCanonPoint } from './canon';
import { CANON_MILESTONES } from './canonData';
import { dateSortValue, paceCapSeconds, secondsBetween, SECONDS_PER_DAY } from './calendar';
import { isDeceased, isReanimated } from './deaths';
import { resolveEntity } from './entities';
import { STORY_HOOKS } from './hooks';
import { threadKey } from './facts';
import { unknownJutsuInOption } from './jutsu';
import { displayName, happened, kanKnowsOf, nameLeaks } from './names';
import { resolveTurnMode, sceneModeOf } from './sceneMode';
import { requestedSkip } from './timeSkip';
import { KAN_CAN_DIE } from './kanFate';
import { weatherFromNarration } from './weather';
import type { AppDatabase, ScenePace } from './types';

export type Violation = {
  /** A short stable code, for tests and for grouping in Debug. */
  code: string;
  text: string;
  /** Errors break a rule of the app; warnings are likely wrong but can happen. */
  severity: 'error' | 'warning';
};

export type TurnCheck = {
  turnLogId: string;
  userMessage: string;
  narration: string;
  pace: ScenePace | undefined;
  sceneEnded: boolean;
  /** A time skip the engine allowed this turn, in seconds. */
  skipSeconds?: number | null;
};

/** JSON or a code fence in a reply (the narrator writes prose only). */
const JSON_IN_PROSE = /```|\{\s*"[A-Za-z_]+"\s*:/;

const PERSONAL_BEATS = new Set(CANON_MILESTONES.filter((milestone) => milestone.playerDriven).map((milestone) => milestone.id));

const error = (code: string, text: string): Violation => ({ code, text, severity: 'error' });
const warning = (code: string, text: string): Violation => ({ code, text, severity: 'warning' });

function lastAssistant(db: AppDatabase) {
  for (let index = db.rawLog.length - 1; index >= 0; index -= 1) {
    const entry = db.rawLog[index];
    if (entry.kind === 'story' && entry.role === 'assistant') return entry;
  }
  return undefined;
}

/** Words a person on screen would read, checked for names Kan doesn't know. */
function uiLeaks(db: AppDatabase, where: string, text: string): Violation[] {
  if (!text.trim()) return [];
  return nameLeaks(db, text).map((leak) => error('ui-name-leak', `${where} shows ${leak}.`));
}

/** What must hold for any save. `imageKeys` (stored image keys) turns on the image check. */
export function checkSave(db: AppDatabase, options: { imageKeys?: ReadonlySet<string> } = {}): Violation[] {
  const out: Violation[] = [];
  const entityIds = new Set(db.entities.map((entity) => entity.id));
  const eventIds = new Set(db.events.map((event) => event.id));
  const logIds = new Set(db.rawLog.map((entry) => entry.id));

  // The dead: not in the scene, not companions (unless walking again through
  // Edo Tensei, and never a reanimated companion).
  for (const name of db.state.sceneCast ?? []) {
    const entity = resolveEntity(db, name);

    if (!entity) {
      out.push(warning('cast-unknown', `The scene cast names "${name}", who is nobody on record.`));
    } else if (isDeceased(entity) && !isReanimated(entity)) {
      out.push(error('dead-in-scene', `${entity.name} is dead but in the scene cast.`));
    }
  }

  // Raw companion marks: companionsOf already hides the dead, so look past it.
  for (const companion of db.entities.filter((entity) => entity.type === 'character' && entity.companion)) {
    if (isReanimated(companion)) {
      out.push(error('reanimated-companion', `${companion.name} is reanimated and travelling with Kan.`));
    } else if (isDeceased(companion)) {
      out.push(error('dead-companion', `${companion.name} is dead and travelling with Kan.`));
    }
  }

  // Names: two people never share a name or alias.
  const owners = new Map<string, string>();
  for (const entity of db.entities) {
    if (entity.type !== 'character') continue;
    for (const name of new Set([entity.name, ...entity.aliases].map((value) => value.trim().toLowerCase()).filter(Boolean))) {
      const owner = owners.get(name);
      if (owner && owner !== entity.id) {
        const other = db.entities.find((item) => item.id === owner);
        out.push(error('shared-name', `"${name}" belongs to both ${other?.name ?? owner} and ${entity.name}.`));
      } else {
        owners.set(name, entity.id);
      }
    }
  }

  // Every id referenced exists.
  for (const bond of db.bonds) {
    if (!entityIds.has(bond.entityId)) out.push(error('orphan-bond', `A bond points at a missing person (${bond.characterName}).`));
  }
  for (const fact of db.facts) {
    if (fact.subjectEntityId && !entityIds.has(fact.subjectEntityId)) {
      out.push(error('orphan-fact', `A fact's subject is missing: "${fact.text.slice(0, 60)}".`));
    }
    const missing = fact.whoKnows.filter((id) => !entityIds.has(id));
    if (missing.length > 0) out.push(error('orphan-knower', `A fact is known by missing people: "${fact.text.slice(0, 60)}".`));
  }
  for (const link of db.eventEntities) {
    if (!eventIds.has(link.eventId) || !entityIds.has(link.entityId)) {
      out.push(error('orphan-link', `A memory link points at a missing ${eventIds.has(link.eventId) ? 'person' : 'memory'}.`));
    }
  }
  for (const thread of db.threads) {
    const missing = (thread.participantIds ?? []).filter((id) => !entityIds.has(id));
    if (missing.length > 0) out.push(error('orphan-thread', `The thread "${thread.title}" names missing people.`));
  }
  for (const letter of db.state.post?.letters ?? []) {
    if (letter.entityId && !entityIds.has(letter.entityId)) {
      out.push(error('orphan-letter', `A letter ${letter.direction === 'to-kan' ? 'from' : 'to'} ${letter.name} points at a missing person.`));
    }
  }

  // Money.
  if ((db.state.purse?.ryo ?? 0) < 0) out.push(error('purse-negative', `The purse is below zero (${db.state.purse?.ryo} ryō).`));

  // No JSON on screen.
  for (const entry of db.rawLog) {
    if (entry.kind === 'story' && entry.role === 'assistant' && JSON_IN_PROSE.test(entry.content ?? '')) {
      out.push(error('json-in-reply', 'A reply holds JSON or a code fence.'));
      break;
    }
  }

  // Canon: a personal beat is never both open and done. (A world event that
  // has fired keeps its encounter window open in `active` on purpose.)
  const progress = db.state.canonProgress;
  if (progress) {
    const done = new Set(progress.completed);
    for (const id of progress.active) {
      if (done.has(id) && PERSONAL_BEATS.has(id)) out.push(error('canon-active-and-done', `The beat ${id} is both active and completed.`));
    }
  }

  // Images.
  if (options.imageKeys) {
    const keys = options.imageKeys;
    const refs = new Set<string>();
    for (const entry of db.rawLog) if (entry.image?.startsWith('img:')) refs.add(entry.image.slice(4));
    for (const ref of refs) {
      if (!keys.has(ref)) out.push(error('missing-image', `The image ${ref} is referenced but not stored.`));
    }
  }

  // Memory jobs belong to a turn that exists.
  for (const job of db.memoryJobs ?? []) {
    if (!logIds.has(job.turnLogId)) {
      out.push(error('orphan-job', `A ${job.kind} job belongs to a turn that is gone.`));
    } else if ((job.logIds ?? []).some((id) => !logIds.has(id))) {
      out.push(warning('job-missing-messages', `A ${job.kind} job covers messages that are gone.`));
    }
  }

  // Undo snapshots line up with the log.
  for (const snapshot of db.snapshots) {
    const fits =
      snapshot.rawLogLength <= db.rawLog.length &&
      snapshot.rawLogTail.every((entry, index) => {
        const position = snapshot.rawLogLength - snapshot.rawLogTail.length + index;
        return db.rawLog[position]?.id === entry.id;
      });
    if (!fits) out.push(error('snapshot-misaligned', `An undo snapshot (turn ${snapshot.turn}) no longer lines up with the story log.`));
  }

  // Kan is never killed while he cannot die.
  if (!KAN_CAN_DIE) {
    const kan = db.entities.find((entity) => entity.name.trim().toLowerCase() === 'kan');
    if (kan && isDeceased(kan)) out.push(error('kan-dead', 'Kan is marked dead.'));
  }

  // What the UI shows passes "Kan only knows what Kan could know".
  out.push(...uiLeaks(db, 'The mode line', resolveTurnMode(db, '').with.join(', ')));
  if (!canonStoryOver(db)) out.push(...uiLeaks(db, 'The Timeline row', knownCanonPoint(db)));
  // One pass over every open thread (nameLeaks walks the whole cast each call).
  const openThreads = db.threads.filter((thread) => thread.status === 'open');
  out.push(...uiLeaks(db, 'An open mission, goal or thread', openThreads.map((thread) => `${thread.title}. ${thread.description}`).join('\n')));

  // No open goal rests on something Kan hasn't learned.
  for (const hook of STORY_HOOKS) {
    const thread = db.threads.find((item) => item.status === 'open' && threadKey(item.title) === threadKey(hook.title));
    if (!thread) continue;
    const unknown = hook.knows.filter((id) => !(happened(db, id) && kanKnowsOf(db, id)));
    if (unknown.length > 0) out.push(error('goal-too-early', `The goal "${thread.title}" is open before Kan knows ${unknown.join(', ')}.`));
  }

  // Quick actions only use what Kan can do.
  const last = lastAssistant(db);
  for (const option of last?.fightOptions ?? []) {
    out.push(...uiLeaks(db, 'A quick action', option));
    const unknown = unknownJutsuInOption(db, option);
    if (unknown) out.push(error('option-unknown-jutsu', `A quick action uses ${unknown}, which Kan doesn't know.`));
  }

  return out;
}

/** checkSave, plus what must hold across one state step. */
export function checkTurn(before: AppDatabase, after: AppDatabase, turn: TurnCheck): Violation[] {
  const out = checkSave(after);
  const moved = secondsBetween(before.state.inStoryDate, after.state.inStoryDate);

  // The clock never goes backward, and a turn's jump stays inside its pace cap
  // (a stated hour or a night's sleep can land up to a day further).
  if (dateSortValue(after.state.inStoryDate) < dateSortValue(before.state.inStoryDate)) {
    out.push(error('clock-backward', 'The clock went backward.'));
  } else if (!turn.skipSeconds) {
    const cap = paceCapSeconds(turn.pace, turn.sceneEnded) + SECONDS_PER_DAY;
    if (moved > cap) out.push(error('clock-over-cap', `The clock moved ${Math.round(moved / 3600)} h on a ${turn.pace ?? 'conversation'} turn.`));
  }

  // A "Time passes" line whose clock moved less than it names.
  const asked = /^\s*\*?\s*time passes\b/i.test(turn.userMessage) ? requestedSkip(turn.userMessage, before.state.inStoryDate) : null;
  if (asked && moved < asked * 0.75) {
    out.push(warning('skip-not-taken', `The player let time pass (${Math.round(asked / 86400)} d) but the clock moved ${Math.round(moved / 3600)} h.`));
  }

  // Nobody dead gains a bond (the reanimated may).
  for (const bond of after.bonds) {
    const entity = after.entities.find((item) => item.id === bond.entityId);
    if (!entity || !isDeceased(entity) || isReanimated(entity)) continue;
    const old = before.bonds.find((item) => item.entityId === bond.entityId);
    if (!old || bond.affinity > old.affinity) {
      out.push(error('dead-bond', `${displayName(after, entity)} is dead but ${old ? 'their bond rose' : 'gained a bond'}.`));
    }
  }

  // The narration (as saved, after names were scrubbed) has no name Kan
  // doesn't know. Only a reply that is in the log was scrubbed and saved.
  const entry = after.rawLog.find((item) => item.id === turn.turnLogId);
  const saved = entry?.content ?? turn.narration;
  if (entry) for (const leak of nameLeaks(after, saved)) out.push(error('narration-name-leak', `The reply names ${leak}.`));

  // The weather and the reply agree.
  const unseen = weatherFromNarration(after, saved);
  if (unseen) out.push(warning('weather-mismatch', `The reply reads as "${unseen}" but the sky is ${after.state.weather?.condition ?? 'unset'}.`));

  // A fight is not left on after a reply that ends it.
  const lastBeat = sceneModeOf(after).lastBeat;
  if ((turn.sceneEnded || (after.state.scenePace !== 'combat' && lastBeat !== 'combat')) && resolveTurnMode(after, '').mode === 'fight') {
    out.push(error('fight-sticks', 'The mode chip forecasts a fight after a reply that ended it.'));
  }

  return out;
}

/** One line per violation, for the Debug panel. */
export function describeViolations(violations: Violation[]): string[] {
  return violations.map((item) => `${item.severity === 'error' ? 'Broken' : 'Odd'}: ${item.text} [${item.code}]`);
}

/** True under `bun run test`: a broken rule after a state step throws. Never in the app. */
export function strictInvariants() {
  return typeof process !== 'undefined' && process.env?.KAN_STRICT_INVARIANTS === '1';
}
