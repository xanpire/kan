// Conversation mode and fight mode: how a scene plays (living-world Stage 1).
//
// The narrator writes normal prose, a real conversation (mostly speech, short
// *action* lines), or a fight in short exchanges. The mode is decided before
// each narrator call from two signals:
//
// 1. Kan's own input. Speaking, acting in place, attacking or leaving is the
//    most reliable signal there is, because the player knows what they meant.
// 2. The beat the state tracker tagged on earlier turns (exchange,
//    instruction, remark, action, travel, combat). Conversation mode is slow
//    to start (two exchange beats in a row with the same people, or one plus
//    Kan answering in speech) and quick to stop (a scene-changing move).
//    A fight starts on an attack and ends when the tracker says it is over.
//
// Before full conversation mode, an exchange already leans the narrator
// toward shorter, more spoken replies, so a wrong call costs one chattier
// turn, not a jarring change. The player can force or switch off a mode from
// the chip on the Story screen (`override`).

import { resolveEntity } from './entities';
import { displayName } from './names';
import { characterRefs } from './characterRefs';
import { isDeceased } from './deaths';
import type {
  AppDatabase,
  SceneBeat,
  SceneModeName,
  SceneModeState,
  ScenePace,
} from './types';
import { companionsOf } from './companions';

/** Exchange beats in a row before conversation mode starts by itself. */
export const CONVERSATION_STREAK = 2;
/** The least time a conversation-mode turn takes (a line or two of talk). */
export const CONVERSATION_MODE_MINIMUM_SECONDS = 20;
export const MAX_FIGHT_OPTIONS = 4;

export const DEFAULT_SCENE_MODE: SceneModeState = {
  current: 'normal',
  exchangeStreak: 0,
  partners: [],
};

export function sceneModeOf(db: AppDatabase): SceneModeState {
  return db.state.sceneMode ?? DEFAULT_SCENE_MODE;
}

// ---------------------------------------------------------------------------
// Reading Kan's input

const QUOTED = /["“”„«»]([^"“”„«»]*[\p{L}\p{N}][^"“”„«»]*)["“”„«»]/u;
const ATTACK =
  /\b(attack|attacks|attacking|strike|strikes|striking|punch|punches|kick|kicks|stab|stabs|slash|slashes|cut (?:him|her|them|it|at|down|through)|lunge|lunges|charge (?:at|him|her|them)|tackle|tackles|throw (?:a |my |the |two |three )?(?:kunai|shuriken|senbon|needles?|blades?)|hurl|fling|fire (?:at|a|my)|swing (?:at|my)|draw (?:my|a) (?:sword|blade|kunai)|go for (?:his|her|their) (?:throat|neck|eyes|heart)|kill (?:him|her|them)|choke|strangle|headbutt|ambush)\b/gi;
// Fighting back only counts once a fight is on ("I block his path" is not a fight).
const DEFEND = /\b(counter(?:attack)?s?|block|blocks|parry|parries|dodge|dodges|duck under|sidestep|roll (?:away|aside|under)|jump back|leap back|guard)\b/gi;
const NEGATED = /\b(not|never|won't|wouldn't|don't|do not|can't|cannot|refuse to|without)\s+(?:\w+\s+){0,2}$/i;

function hasMove(text: string, pattern: RegExp) {
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 30), match.index ?? 0);
    if (!NEGATED.test(before)) {
      return true;
    }
  }
  return false;
}
const LEAVES =
  /\b(leave|leaves|leaving|walk (?:away|off|out|on|back|to|toward|towards|into|through|down|up|north|south|east|west)|walk away|head (?:out|off|back|north|south|east|west|to|toward|towards|for|into|down|up)|go (?:to|back|out|inside|outside|home|north|south|east|west|into|up|down)|set (?:off|out)|travel|journey|run (?:off|away|to|toward|towards|after)|flee|race (?:off|to|after)|follow (?:him|her|them|the|it)|i follow|you follow|climb|enter|step (?:out|outside|inside|into|through)|jump (?:down|off|into|across|from)|leap (?:down|off|into|across|from|away)|sleep|go to bed|lie down to sleep|turn in for the night|rest (?:for|until) |wait (?:until|till|for (?:the|an?|hours?|nightfall|dawn|morning))|train (?:for|until)|keep (?:walking|moving|going|running))\b/gi;

export type KanInput = {
  /** Kan says something out loud. */
  speaks: boolean;
  /** Kan attacks someone. */
  attacks: boolean;
  /** Kan dodges, blocks or counters (fighting back). */
  defends: boolean;
  /** Kan does something that changes the scene: leaves, moves on, sleeps, waits it out. */
  changesScene: boolean;
};

/** What Kan's input is: talk, an attack, a scene change, or a small move in place. */
export function readKanInput(input: string): KanInput {
  const text = input ?? '';
  const speaks = QUOTED.test(text);
  // Only what Kan does counts as action, never the words he says.
  const doing = text.replace(new RegExp(QUOTED.source, 'gu'), ' ');
  const plainSpeech = !speaks && !/\*/.test(text) && /\?\s*$/.test(text.trim());

  return {
    speaks: speaks || plainSpeech,
    attacks: hasMove(doing, ATTACK),
    defends: hasMove(doing, DEFEND),
    changesScene: hasMove(doing, LEAVES),
  };
}

// ---------------------------------------------------------------------------
// The mode for the next turn

export type TurnMode = {
  /** The mode this turn is narrated in. */
  mode: SceneModeName;
  /** Not yet a conversation, but talk is building: shorter, more spoken. */
  lean: boolean;
  /** The mode Kan's move ends this turn, for a short normal-prose transition. */
  ending?: 'conversation';
  /** True when the player chose the mode from the chip. */
  manual: boolean;
  /** Who Kan is talking with or fighting (names, for the prompt and the chip). */
  with: string[];
};

function fightGoingOn(db: AppDatabase) {
  const state = sceneModeOf(db);
  return !db.state.sceneClosed && (db.state.scenePace === 'combat' || state.lastBeat === 'combat');
}

/**
 * Why Let time pass is closed right now, in second person, or null when it is
 * open. Time cannot jump in the middle of a fight (audit 4.9): the engine
 * refuses the skip there, so the button must not offer it.
 */
export function timeSkipBlocked(db: AppDatabase): string | null {
  if (fightGoingOn(db) || sceneModeOf(db).override === 'fight') {
    return 'Not in the middle of a fight. Get clear of it first.';
  }

  return null;
}

function partnerNames(db: AppDatabase, partners: string[]) {
  return partners
    .map((partner) => {
      const entity = db.entities.find((item) => item.id === partner);
      return entity ? (entity.name.toLowerCase() === 'kan' ? entity.name : displayName(db, entity)) : partner;
    })
    .filter((name) => name && name.toLowerCase() !== 'kan')
    .slice(0, 4);
}

function castNames(db: AppDatabase) {
  return (db.state.sceneCast ?? []).filter((name) => {
    const entity = resolveEntity(db, name);
    return name.toLowerCase() !== 'kan' && !(entity && isDeceased(entity));
  });
}

/**
 * The mode a turn will be narrated in, from the scene so far and what Kan
 * writes now. Pure and deterministic, so a regenerated turn gets the same.
 */
export function resolveTurnMode(db: AppDatabase, input: string): TurnMode {
  const state = sceneModeOf(db);
  const kan = readKanInput(input);
  const fightOn = fightGoingOn(db);
  const talking = state.exchangeStreak > 0 && !db.state.sceneClosed;
  const talkers = partnerNames(db, state.partners);
  const people = talkers.length > 0 ? talkers : castNames(db).slice(0, 4);
  const wasConversation = state.current === 'conversation';

  // An attack starts a fight, but only against someone (audit 6b.2): alone,
  // "I kick a pebble" or "I strike a match" is just a move.
  const someoneHere = castNames(db).length > 0 || companionsOf(db).length > 0;
  const harmless = /\b(strike|strikes|striking) (?:a |the )?(?:match|flint|light)|\bkick(?:s|ing)? (?:a |the )?(?:pebble|stone|rock|can|door|dirt|dust|leaves|snow|fire)/i.test(input);
  const startsFight = kan.attacks && someoneHere && !harmless;

  if (state.override === 'fight') {
    return { mode: 'fight', lean: false, manual: true, with: castNames(db).slice(0, 4) };
  }

  if (state.override === 'normal') {
    return { mode: 'normal', lean: false, manual: true, with: [] };
  }

  if (fightOn || startsFight) {
    return { mode: 'fight', lean: false, manual: false, with: castNames(db).slice(0, 4) };
  }

  if (state.override === 'conversation') {
    return { mode: 'conversation', lean: false, manual: true, with: people };
  }

  // Quick to stop: a move that changes the scene ends the talk now.
  if (kan.changesScene) {
    return {
      mode: 'normal',
      lean: false,
      ending: wasConversation || state.exchangeStreak >= CONVERSATION_STREAK ? 'conversation' : undefined,
      manual: false,
      with: [],
    };
  }

  // Slow to start: two exchanges in a row, or one and Kan answering out loud.
  const settled =
    talking &&
    (state.exchangeStreak >= CONVERSATION_STREAK ||
      (state.exchangeStreak >= CONVERSATION_STREAK - 1 && kan.speaks));

  if (settled) {
    return { mode: 'conversation', lean: false, manual: false, with: people };
  }

  // The dial: talk is building, so the reply leans spoken.
  const lean = talking || (kan.speaks && castNames(db).length > 0);
  return { mode: 'normal', lean, manual: false, with: lean ? people : [] };
}

// ---------------------------------------------------------------------------
// After the turn

function resolvePartners(db: AppDatabase, raw: string[]): string[] {
  const refs = characterRefs(db);
  const ids = raw
    .map((value) => {
      const trimmed = value.trim();
      const entity = refs.get(trimmed.toLowerCase()) ?? resolveEntity(db, trimmed) ?? resolveEntity(db, trimmed.replace(/-/g, ' '));
      return entity ? entity.id : trimmed.toLowerCase();
    })
    .filter((value) => value && value !== 'kan');

  return [...new Set(ids)].slice(0, 6);
}

/** When the tracker gave no beat: read it from the pace and Kan's input. */
export function fallbackBeat(pace: ScenePace | undefined, input: string, narration: string): SceneBeat {
  const kan = readKanInput(input);

  if (pace === 'combat') return 'combat';
  if (pace === 'travel' || pace === 'chase') return 'travel';
  if (kan.changesScene) return 'action';
  if (kan.speaks && QUOTED.test(narration)) return 'exchange';
  return QUOTED.test(narration) ? 'remark' : 'action';
}

/**
 * Records how the turn played: the exchange streak and who it is with, the
 * mode it was narrated in, and clears a chip choice that no longer applies.
 */
export function applySceneBeat(
  db: AppDatabase,
  options: {
    beat?: { kind: SceneBeat; with: string[] };
    modeUsed?: SceneModeName;
    input: string;
    narration: string;
    pace: ScenePace | undefined;
    sceneEnded: boolean;
  }
): AppDatabase {
  const before = sceneModeOf(db);
  const kind = options.beat?.kind ?? fallbackBeat(options.pace, options.input, options.narration);
  const kan = readKanInput(options.input);
  let partners = resolvePartners(db, options.beat?.with ?? []);

  if (partners.length === 0 && kind === 'exchange') {
    partners = resolvePartners(db, castNames(db));
  }

  let streak = before.exchangeStreak;
  let kept = before.partners;

  if (options.sceneEnded || kind === 'action' || kind === 'travel' || kind === 'combat') {
    streak = 0;
    kept = [];
  } else if (kind === 'exchange') {
    const overlaps =
      before.partners.length === 0 || partners.length === 0 || partners.some((id) => before.partners.includes(id));

    if (streak > 0 && overlaps) {
      // Someone joining in turns it into a group conversation.
      streak += 1;
      kept = [...new Set([...before.partners, ...partners])].slice(0, 6);
    } else {
      streak = 1;
      kept = partners;
    }
  } else if (streak < CONVERSATION_STREAK && options.modeUsed !== 'conversation') {
    // A passing line or an order never starts a conversation, and breaks a
    // talk that hadn't settled yet. A settled one carries on through it.
    streak = 0;
    kept = [];
  }

  // Kan's own scene-changing move ends the talk, whatever the tag said.
  if (kan.changesScene && kind !== 'exchange') {
    streak = 0;
    kept = [];
  }

  const fightOver = kind !== 'combat' && options.pace !== 'combat';
  let override = before.override;

  if (override === 'conversation' && kind === 'combat') {
    override = undefined;
  } else if (override === 'fight' && (fightOver || options.sceneEnded)) {
    override = undefined;
  } else if (override === 'normal' && streak === 0 && fightOver) {
    // Switched off until this conversation or fight was over; now it is.
    override = undefined;
  }

  const next: SceneModeState = {
    current: options.modeUsed ?? before.current,
    exchangeStreak: Math.min(streak, 99),
    partners: kept,
    lastBeat: kind,
    ...(override ? { override } : {}),
  };

  return { ...db, state: { ...db.state, sceneMode: next } };
}

/** The player's choice from the mode chip: a mode, or null for automatic. */
export function setSceneModeOverride(db: AppDatabase, mode: SceneModeName | null): AppDatabase {
  const before = sceneModeOf(db);
  const { override: _drop, ...rest } = before;
  const next: SceneModeState = mode ? { ...rest, override: mode } : rest;
  return { ...db, state: { ...db.state, sceneMode: next } };
}

/** Fight moves to offer under the latest reply, if the fight goes on. */
export function cleanFightOptions(options: string[] | undefined): string[] | undefined {
  const cleaned = [...new Set((options ?? []).map((option) => option.trim()).filter(Boolean))].slice(0, MAX_FIGHT_OPTIONS);
  return cleaned.length > 0 ? cleaned : undefined;
}

/** A quick fight move as Kan's input. */
export function fightOptionInput(option: string) {
  const text = option.trim().replace(/^\*+|\*+$/g, '').replace(/[.!]*$/, '');
  return `*${text}.*`;
}

export function normalizeSceneMode(value: unknown): SceneModeState | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const raw = value as Partial<SceneModeState>;
  const modes: SceneModeName[] = ['normal', 'conversation', 'fight'];
  const beats: SceneBeat[] = ['exchange', 'instruction', 'remark', 'action', 'travel', 'combat'];

  return {
    current: modes.includes(raw.current as SceneModeName) ? (raw.current as SceneModeName) : 'normal',
    exchangeStreak:
      typeof raw.exchangeStreak === 'number' && Number.isFinite(raw.exchangeStreak)
        ? Math.max(0, Math.min(99, Math.floor(raw.exchangeStreak)))
        : 0,
    partners: Array.isArray(raw.partners) ? raw.partners.filter((item) => typeof item === 'string').slice(0, 6) : [],
    ...(beats.includes(raw.lastBeat as SceneBeat) ? { lastBeat: raw.lastBeat } : {}),
    ...(modes.includes(raw.override as SceneModeName) ? { override: raw.override } : {}),
  };
}

// ---------------------------------------------------------------------------
// Prompt lines

function kanCondition(db: AppDatabase) {
  return db.facts
    .filter(
      (fact) =>
        fact.validTo === null &&
        (fact.type === 'injury' || fact.type === 'condition') &&
        (fact.subjectEntityId === undefined || fact.subjectEntityId === null || db.entities.find((e) => e.id === fact.subjectEntityId)?.name.toLowerCase() === 'kan')
    )
    .slice(-3)
    .map((fact) => (fact.text.length > 80 ? `${fact.text.slice(0, 79)}…` : fact.text));
}

/** One or two lines for the narrator: which mode this turn is, and with whom. */
export function formatSceneModeLine(db: AppDatabase, turn: TurnMode): string {
  const who = turn.with.length > 0 ? ` with ${turn.with.join(', ')}` : '';
  const chosen = turn.manual ? ' (Kan chose this mode: keep it even if the scene moves on)' : '';

  if (turn.mode === 'fight') {
    const condition = kanCondition(db);
    return [
      `SCENE MODE: fight${turn.with.length > 0 ? ` against or beside ${turn.with.join(', ')}` : ''}${chosen}. Short exchange: show what Kan's move does, then the opponent's next specific move, and stop before it lands.`,
      condition.length > 0 ? `Kan right now: ${condition.join('; ')}.` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (turn.mode === 'conversation') {
    return `SCENE MODE: conversation${who}${chosen}. Mostly speech, short *action* lines, length follows the talk.`;
  }

  if (turn.ending === 'conversation') {
    return 'SCENE MODE: Kan\'s move ends the conversation. A short transition in normal prose, then carry on normally.';
  }

  if (turn.lean) {
    return `SCENE MODE: talk is building${who}. Keep this reply shorter and more spoken than usual.`;
  }

  if (turn.manual) {
    return 'SCENE MODE: normal narration (Kan chose this).';
  }

  return '';
}

/** The same, for the state tracker. */
export function formatSceneModeTracking(turn: TurnMode | null, modeUsed: SceneModeName | undefined): string {
  const mode = modeUsed ?? turn?.mode ?? 'normal';
  return `SCENE MODE THIS TURN: ${mode === 'normal' ? 'normal narration' : mode}`;
}
