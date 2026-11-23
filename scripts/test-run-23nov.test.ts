/**
 * Fixes from Xan's test run of 23 Nov 2026 (claude/test-run-fixes.md, save
 * 201b4a9b), each played through the same pipeline as a real turn where it
 * can be: prompt → reply → state step.
 */
import { describe, expect, mock, test } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

import { normalizeDatabase } from '../lib/rpg/db';
import { resolveCharacterRefs } from '../lib/rpg/entities';
import { applyFactDiff } from '../lib/rpg/facts';
import { buildSceneImagePrompt, isGrapple, KAN_THINGS_ARE_HIS, protectorInHand } from '../lib/rpg/image';
import { lookTags } from '../lib/rpg/imageDirection';
import { endConditionsLeftBehind, healingDays, visibleInjuries } from '../lib/rpg/facts';
import { KAN_AKATSUKI_OUTFIT, KAN_BLACK_OUTFIT, migrateKanEyes } from '../lib/rpg/kanLook';
import { formatSince, NARRATION_SYSTEM } from '../lib/rpg/prompt';
import { IZUMI_LOOK, ITACHI_YOUNG_LOOK } from '../lib/rpg/seed';
import { dateSortValue, shiftSeconds } from '../lib/rpg/calendar';
import { eyesFromInput, kanEyes, setKanEyes } from '../lib/rpg/kanEyes';
import { kanEntity, kanRightNow } from '../lib/rpg/kanLook';
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import type { AppDatabase, FactRecord } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_testrun', 'Test run'));
const promptText = (db: AppDatabase, input: string) =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

/** One turn the way game.tsx plays it: prompt → reply saved with its mode → state step. */
function play(db: AppDatabase, input: string, narration: string, block: Record<string, unknown> | null) {
  const prompt = buildNarrationPrompt(appendStoryMessage(db, 'user', input, null, 0, 0), input);
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  next.rawLog[next.rawLog.length - 1] = { ...next.rawLog[next.rawLog.length - 1], sceneMode: prompt.sceneMode.mode };
  const diff = block ? resolveCharacterRefs(next, convertStateBlock(block).diff ?? {}) : null;
  const result = applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set());
  return { db: result.db, prompt };
}

function kanFact(db: AppDatabase, text: string, type: FactRecord['type'] = 'condition'): FactRecord {
  return {
    id: `fact_${Math.random().toString(36).slice(2, 8)}`,
    subjectEntityId: kanEntity(db)!.id,
    type,
    text,
    whoKnows: [],
    validFrom: db.state.inStoryDate,
    validTo: null,
    confidence: 'confirmed',
    sourceEventId: null,
  };
}

describe('§1 Kan\'s eyes are one flag', () => {
  test("Kan's own words switch them", () => {
    const now = seed().state.inStoryDate;
    const db = { ...seed(), state: { ...seed().state, player: { ...seed().state.player, abilities: [{ name: 'Sharingan', stage: '1 tomoe', acquiredOn: now, stageOn: now }] } } };
    // Before the Sharingan wakes, his words can't light it.
    expect(eyesFromInput(seed(), 'I activate my Sharingan.')).toBeNull();
    expect(eyesFromInput(db, 'I let my Sharingan fade and look at him.')).toBe('off');
    expect(eyesFromInput(db, 'I deactivate the Sharingan.')).toBe('off');
    expect(eyesFromInput(db, 'I activate my Sharingan and watch his hands.')).toBe('sharingan');
    expect(eyesFromInput(db, 'I activate my Sharingan, then let it fade.')).toBe('off');
    expect(eyesFromInput(db, '"Don\'t make me activate my Sharingan," I warn.')).toBeNull();
    expect(eyesFromInput(db, 'I walk on.')).toBeNull();
  });

  test('"your Sharingan is active" sets the flag and is never stored as a fact', () => {
    const db = seed();
    const before = db.facts.length;
    const next = applyFactDiff(db, { action: 'add', type: 'condition', text: 'Your Sharingan is active, three tomoe spinning.', subject: 'kan' });
    expect(next.facts.length).toBe(before);
    expect(kanEyes(next)).toBe('sharingan');
  });

  test('an awakening or a new tomoe goes to the abilities, not the facts', () => {
    const db = seed();
    const next = applyFactDiff(db, { action: 'add', type: 'condition', text: 'Your Sharingan has awakened its second tomoe.', subject: 'kan' });
    expect(next.facts.length).toBe(db.facts.length);
    expect(next.state.player.abilities?.find((a) => a.name === 'Sharingan')?.stage).toBe('2 tomoe');
  });

  test('turning them off ends old conditions that say they are on', () => {
    let db = seed();
    db = { ...db, facts: [...db.facts, kanFact(db, 'Your Sharingan is active and blazing.')], state: { ...db.state, player: { ...db.state.player, eyes: 'sharingan' } } };
    const next = setKanEyes(db, 'off');
    expect(next.facts.find((fact) => /blazing/.test(fact.text))!.validTo).not.toBeNull();
    expect(kanEyes(next)).toBe('off');
  });

  test('turn 29 replayed: Kan turns it off, the tracker says nothing, later prompts and images say brown eyes', () => {
    let db = seed();
    db = { ...db, state: { ...db.state, player: { ...db.state.player, eyes: 'sharingan' } } };
    db = play(db, 'I let the Sharingan fade from my eyes.', 'The red drains out of your vision and the world goes dull and grey again.', {}).db;
    expect(kanEyes(db)).toBe('off');
    expect(kanRightNow(db)).toContain('no Sharingan');
    expect(promptText(db, 'I wait.')).toContain('Eyes: brown eyes, no Sharingan');
    expect(buildSceneImagePrompt(db, [], 'Kan waits by the gate.')).toContain('brown eyes, no Sharingan');
  });

  test('the tracker\'s kan_eyes wins over the input, and a night\'s sleep closes them', () => {
    let db = seed();
    db = play(db, 'I look at him.', 'Your Sharingan flares to life.', { kan_eyes: 'sharingan' }).db;
    expect(kanEyes(db)).toBe('sharingan');
    expect(kanRightNow(db)).toContain('Sharingan is active');
    db = play(db, 'I sleep.', 'You sleep through the night and wake after eight hours at dawn.', { time: { elapsed: 8, unit: 'hours', clock_time: null }, scene_pace: 'downtime' }).db;
    expect(kanEyes(db)).toBe('off');
  });

  test('old saves: eyes conditions end and the milestones become abilities', () => {
    let db = seed();
    db = {
      ...db,
      facts: [
        ...db.facts,
        kanFact(db, 'Your Sharingan is active, the tomoe spinning.'),
        kanFact(db, 'Your Sharingan has reached its third tomoe.'),
      ],
    };
    const next = normalizeDatabase(db);
    expect(next.facts.filter((fact) => fact.validTo === null && /sharingan/i.test(fact.text))).toHaveLength(0);
    expect(next.state.player.abilities?.find((a) => a.name === 'Sharingan')?.stage).toBe('3 tomoe');
    expect(kanEyes(next)).toBe('off');
  });
});

const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
function withCast(db: AppDatabase, cast: string[]): AppDatabase {
  return { ...db, state: { ...db.state, sceneCast: cast } };
}
function lookOf(db: AppDatabase, name: string, currentLook: string): AppDatabase {
  return { ...db, entities: db.entities.map((e) => (e.name === name ? { ...e, currentLook } : e)) };
}

describe('§2 Kan\'s look stays his own', () => {
  test("Itachi's card shows what he wears now first and his own protector, never cut off", () => {
    let db = withCast(seed(), ['Itachi Uchiha']);
    db = lookOf(db, 'Itachi Uchiha', 'wearing the Akatsuki cloak, rain dripping from the hem');
    const text = promptText(db, 'I look at Itachi.');
    const line = text.split('\n').find((l) => l.startsWith('- Itachi') && l.includes('personality'))!;
    expect(line).toContain('right now: wearing the Akatsuki cloak');
    expect(line).toContain('forehead protector worn on his forehead');
    expect(line).toContain('no belt plate');
    expect(line.indexOf('right now')).toBeLessThan(line.indexOf('appearance'));
  });

  test("image look tags keep his cloak and protector, and others never get Kan's things", () => {
    let db = withCast(seed(), ['Itachi Uchiha']);
    db = lookOf(db, 'Itachi Uchiha', 'wearing the Akatsuki cloak over his dark shirt');
    const tag = lookTags(db, 'Itachi turns to Kan.').join(' ');
    expect(tag).toContain('right now: wearing the Akatsuki cloak');
    expect(tag).toContain('no belt plate');
    expect(buildSceneImagePrompt(db, [], 'Itachi turns to Kan.')).toContain(KAN_THINGS_ARE_HIS);
  });

  test('old saves get the new Itachi and Izumi looks', () => {
    let db = seed();
    db = {
      ...db,
      entities: db.entities.map((e) =>
        e.name === 'Itachi Uchiha'
          ? { ...e, appearance: 'Slim thirteen-year-old with long black hair tied low at the nape, sharp dark eyes and faint tear-trough lines; dark high-collared shirt, ANBU-issue arm guards, dark trousers, and a scratched Hidden Leaf forehead protector.' }
          : e.name === 'Izumi Uchiha'
            ? { ...e, appearance: 'Young Uchiha girl with soft dark hair, gentle eyes, and the quiet posture of someone who always waited for others.' }
            : e
      ),
    };
    const next = normalizeDatabase(db);
    expect(person(next, 'Itachi Uchiha').appearance).toBe(ITACHI_YOUNG_LOOK);
    expect(person(next, 'Izumi Uchiha').appearance).toBe(IZUMI_LOOK);
    expect(IZUMI_LOOK).toContain('dark brown eyes');
  });
});

describe('§4 §5 the cloak and the wraps', () => {
  test('long sleeves, black wraps (never white)', () => {
    expect(KAN_AKATSUKI_OUTFIT).toContain('long, wide sleeves reaching his wrists');
    expect(KAN_AKATSUKI_OUTFIT).toContain('never white');
    expect(KAN_BLACK_OUTFIT).toContain('black cloth wraps');
    expect(KAN_BLACK_OUTFIT).not.toContain('bandage');
    expect(migrateKanEyes('Lean shinobi with bandage-wrapped forearms.')).toContain('black cloth wraps on his forearms (never white)');
  });
});

describe('§6 the protector in his hand', () => {
  test('held, it is not also at his waist', () => {
    expect(protectorInHand('Kan holds his scratched forehead protector up to the light.')).toBe(true);
    expect(protectorInHand('Kan stands with the scratched plate at his hip.')).toBe(false);
    const db = { ...seed(), state: { ...seed().state, inventory: [...seed().state.inventory, 'Hidden Leaf headband, scratched through'] } };
    const prompt = buildSceneImagePrompt(db, [], 'Kan holds his forehead protector in his hand, looking at the scratch.');
    expect(prompt).toContain('in his hand, not on his belt');
    expect(prompt).toContain('scratch cut straight through the Leaf symbol');
  });
});

describe('§7 broken bones take weeks', () => {
  test("a broken nose lasts about a month whatever the tracker guessed, and shows while it heals", () => {
    let db = withCast(seed(), ['Itachi Uchiha']);
    db = applyFactDiff(db, { action: 'add', type: 'injury', text: "Itachi's nose is broken and bleeding.", subject: 'Itachi Uchiha', lasts: 'days', days: 2 });
    const fact = db.facts.find((f) => /nose is broken/.test(f.text))!;
    expect(dateSortValue(fact.expiresAt!)).toBeGreaterThanOrEqual(dateSortValue(shiftSeconds(db.state.inStoryDate, 29 * 86400)));
    expect(healingDays('a bruise on her cheek')).toBe(10);
    expect(visibleInjuries(db, person(db, 'Itachi Uchiha').id)[0]).toContain('(fresh)');
    // A scene change clears his look of the moment, not the injury.
    expect(lookTags(db, 'Itachi watches.').join(' ')).toContain('nose is broken');
    expect(promptText(db, 'I wait.')).toContain('injuries that show');
  });
});

describe('§8 continuity', () => {
  test('SINCE gives exact elapsed times for recent milestones', () => {
    let db = seed();
    const then = shiftSeconds(db.state.inStoryDate, -(7 * 3600 + 50 * 60));
    db = { ...db, state: { ...db.state, player: { ...db.state.player, abilities: [{ name: 'Sharingan', stage: '3 tomoe', acquiredOn: then, stageOn: then, history: [{ stage: '3 tomoe', date: then }] }] } } };
    expect(formatSince(db)).toContain('your Sharingan reached 3 tomoe: 7h 50m ago');
    expect(promptText(db, 'I ask Itachi when it woke.')).toContain('SINCE');
  });

  test('rules for fixed dates, contradictions and clothes; Kan\'s outfit in the state; Itachi\'s Mangekyō', () => {
    expect(NARRATION_SYSTEM).toContain('repeat it exactly or not at all');
    expect(NARRATION_SYSTEM).toContain('stays where it was last said to be');
    const db = withCast(seed(), ['Itachi Uchiha']);
    const text = promptText(db, 'I wait.');
    expect(text).toContain('Kan wears: his plain black high-collared top');
    expect(text).toContain('loose black trousers to the ankle');
    expect(text).toContain("Mangekyō (a three-bladed pinwheel) since Shisui's death");
  });
});

describe('§9 images', () => {
  test('a hold or choke is never a close-up', () => {
    expect(isGrapple('Kan locks Itachi in a triangle choke, legs wrapped around his neck.')).toBe(true);
    expect(isGrapple('Kan stares at the rain.')).toBe(false);
  });

  test('conditions tied to a place Kan left end with it', () => {
    let db = seed();
    db = { ...db, facts: [...db.facts, kanFact(db, 'You are stiff with cold on the rock shelf.')] };
    const next = endConditionsLeftBehind(db, 'Fire border · rock shelf', 'Hidden Rain · inner ward');
    expect(next.facts.find((f) => /rock shelf/.test(f.text))!.validTo).not.toBeNull();
    const stays = endConditionsLeftBehind(db, 'Fire border · rock shelf', 'Fire border · rock shelf, lower ledge');
    expect(stays.facts.find((f) => /rock shelf/.test(f.text))!.validTo).toBeNull();
  });
});

describe('§12.7 no blank scene names', () => {
  test('a turn after a chapter opened without a scene keeps the last scene name', () => {
    let db = appendStoryMessage(seed(), 'user', 'I walk.', null, 0, 0);
    const named = db.rawLog[db.rawLog.length - 1].scene;
    db = { ...db, state: { ...db.state, scene: '' } };
    db = appendStoryMessage(db, 'assistant', 'You walk.', null, 0, 0);
    expect(db.rawLog[db.rawLog.length - 1].scene).toBe(named);
  });
});

describe('§3 §10 profiles fill in as Kan learns', () => {
  const metHere = (db: AppDatabase, name: string): AppDatabase => ({
    ...db,
    entities: db.entities.map((e) => (e.name === name ? { ...e, met: true, lastSeen: db.state.inStoryDate } : e)),
  });

  test('a stranger shows nothing of the canon seed: Konan is not "devoted to Pain"', async () => {
    const { kanProfile } = await import('../lib/rpg/kanView');
    const db = metHere(seed(), 'Konan');
    const profile = kanProfile(db, person(db, 'Konan'));
    expect(profile.basis).toBe('stranger');
    expect(profile.role).toBeUndefined();
    expect(profile.personality).toBeUndefined();
    expect(JSON.stringify(profile)).not.toContain('Pain');
    expect(profile.appearance).toBeTruthy();
  });

  test('people Kan knew start full; famous people show their public role only', async () => {
    const { kanProfile } = await import('../lib/rpg/kanView');
    const db = seed();
    const itachi = kanProfile(db, person(db, 'Itachi Uchiha'));
    expect(itachi.basis).toBe('known');
    expect(itachi.personality).toBeTruthy();
    expect(itachi.role).toBe('Hidden Leaf ANBU captain');
    const jiraiya = kanProfile(db, person(db, 'Jiraiya'));
    expect(jiraiya.basis).toBe('public');
    expect(jiraiya.role).toBeTruthy();
    expect(jiraiya.personality).toBeUndefined();
  });

  test('learned_about fills the profile: two lines per person per turn, stamped, never repeated', async () => {
    const { kanProfile, viewRef } = await import('../lib/rpg/kanView');
    let db = withCast(metHere(seed(), 'Konan'), ['Konan', 'Itachi Uchiha']);
    const konan = person(db, 'Konan');
    const itachi = person(db, 'Itachi Uchiha');
    db = play(db, 'I watch the paper woman.', 'She watches your hands the whole time and never raises her voice. Itachi says she is the leader\'s voice.', {
      learned_about: [
        { character_id: 'Konan', field: 'noticed', text: 'Watched your hands the whole time.', source: 'seen', told_by: null, settles: null, verdict: null },
        { character_id: 'Konan', field: 'heard', text: "Speaks for the leader.", source: 'told', told_by: 'Itachi Uchiha', settles: null, verdict: null },
        { character_id: 'Konan', field: 'noticed', text: 'Never raised her voice.', source: 'seen', told_by: null, settles: null, verdict: null },
      ],
    }).db;
    let profile = kanProfile(db, person(db, 'Konan'));
    expect(profile.noticed.map((l) => l.text)).toEqual(['Watched your hands the whole time.']);
    expect(profile.heard[0].toldBy).toBe(itachi.id);
    expect(profile.heard[0].place).toBeTruthy();
    // A repeat adds nothing; a guess proven wrong is crossed out.
    db = play(db, 'I watch her.', 'She watches your hands.', {
      learned_about: [
        { character_id: 'Konan', field: 'noticed', text: 'She watched your hands the whole time.', source: 'seen', told_by: null, settles: null, verdict: null },
        { character_id: 'Konan', field: 'suspect', text: 'You suspect she knows more about the masked man than she lets on.', source: 'guess', told_by: null, settles: null, verdict: null },
      ],
    }).db;
    profile = kanProfile(db, person(db, 'Konan'));
    expect(profile.noticed).toHaveLength(1);
    const guess = profile.suspect[0];
    db = play(db, 'I ask.', 'She has never met him.', {
      learned_about: [{ character_id: 'Konan', field: 'noticed', text: 'Has never met the masked man.', source: 'seen', told_by: null, settles: viewRef(guess), verdict: 'wrong' }],
    }).db;
    profile = kanProfile(db, person(db, 'Konan'));
    expect(profile.suspect[0].crossed).toBe(true);
    // The tracker sees what Kan knows, with refs.
    const tracker = (await import('../lib/rpg/prompt')).buildExtractionPrompt(db, 'I wait.', 'She waits.');
    expect(JSON.stringify(tracker)).toContain('you know: [v-');
  });

  test('too many noticed lines are folded behind condensed ones', async () => {
    const { applyCondensed, kanProfile, linesToCondense, needsCondensing } = await import('../lib/rpg/kanView');
    let db = metHere(seed(), 'Konan');
    const konan = person(db, 'Konan');
    const lines = Array.from({ length: 9 }, (_, i) => ({ id: `view_${i}abcde`, field: 'noticed' as const, text: `Thing ${i} about her.`, source: 'seen' as const, date: db.state.inStoryDate }));
    db = { ...db, entities: db.entities.map((e) => (e.id === konan.id ? { ...e, kanView: lines } : e)) };
    expect(needsCondensing(person(db, 'Konan'))).toBe(true);
    const folded = linesToCondense(person(db, 'Konan')).map((l) => l.id);
    expect(folded).toHaveLength(7);
    db = applyCondensed(db, konan.id, folded, ['Quiet and watchful; gives nothing away.']);
    const profile = kanProfile(db, person(db, 'Konan'));
    expect(profile.noticed).toHaveLength(3);
    expect(profile.noticed[0].condensedFrom).toHaveLength(7);
  });

  test('old saves: people met in the story get a view from facts Kan knows; a bond status follows the relationship', async () => {
    let db = metHere(seed(), 'Konan');
    const konan = person(db, 'Konan');
    const kanId = kanEntity(db)!.id;
    db = { ...db, facts: [...db.facts, { ...kanFact(db, 'She gave you the Akatsuki cloak at the conduit.', 'event'), subjectEntityId: konan.id, whoKnows: [kanId] }] };
    const next = normalizeDatabase(db);
    expect(person(next, 'Konan').kanView?.[0].text).toContain('gave you the Akatsuki cloak');

    const { applyBondDiff } = await import('../lib/rpg/bonds');
    const bonded = applyBondDiff(next, { character: 'Konan', entityId: konan.id, relationship: 'stranger' });
    expect(bonded.bonds.find((b) => b.entityId === konan.id)!.status).toBe('Stranger');
  });
});

describe('§11 short place names', () => {
  test('a long place becomes "Region · spot" plus a detail', async () => {
    const { splitPlace, headerPlace, fullPlace } = await import('../lib/rpg/placeName');
    const db = seed();
    const split = splitPlace(db, 'The inner ward of the Rain village, past the iron gate beneath the steel spires');
    expect(split.location).toBe('Hidden Rain · inner ward');
    expect(split.detail).toBe('past the iron gate beneath the steel spires');
    expect(split.location.length).toBeLessThanOrEqual(28);
    expect(splitPlace(db, 'Hidden Rain · inner ward', 'by the gate')).toEqual({ location: 'Hidden Rain · inner ward', detail: 'by the gate' });
    expect(headerPlace('Land of Rice Fields · an extremely long abandoned spot')).not.toContain('Land of');
    expect(fullPlace({ location: 'Hidden Rain · inner ward', locationDetail: 'past the gate' })).toBe('Hidden Rain · inner ward, past the gate');
  });

  test('the tracker\'s place is stored short; the narrator and images get it joined; the travel log compares short names', () => {
    let db = seed();
    db = play(db, 'I walk through the gate.', 'You pass the iron gate into the inner ward of the Rain village.', {
      location: 'The inner ward of the Rain village, past the iron gate beneath the steel spires',
      location_kind: 'settlement',
    }).db;
    expect(db.state.location).toBe('Hidden Rain · inner ward');
    expect(db.state.locationDetail).toContain('iron gate');
    expect(promptText(db, 'I look around.')).toContain('Location: Hidden Rain · inner ward, past the iron gate');
    expect(buildSceneImagePrompt(db, [], 'Kan looks up at the spires.')).toContain('Location: Hidden Rain · inner ward, past');
    const stops = db.state.travelLog!.length;
    db = play(db, 'I wait.', 'You wait by the gate.', { location: 'Hidden Rain · inner ward', location_detail: 'by the iron gate', location_kind: 'settlement' }).db;
    expect(db.state.travelLog!.length).toBe(stops);
    expect(db.state.locationDetail).toBe('by the iron gate');
  });

  test('old saves: an over-long place is shortened once on load', () => {
    const db = seed();
    const next = normalizeDatabase({ ...db, state: { ...db.state, location: 'The inner ward of the Rain village, past the iron gate beneath the steel spires' } });
    expect(next.state.location).toBe('Hidden Rain · inner ward');
    expect(next.state.locationDetail).toContain('iron gate');
    expect(next.state.travelLog!.every((stop) => stop.short)).toBe(true);
  });
});

describe('§12 background work', () => {
  test('the prose duration wins over the tracker\'s', async () => {
    const { resolveElapsedSeconds } = await import('../lib/rpg/pacing');
    expect(resolveElapsedSeconds({ reportedSeconds: 7 * 3600, detectedSeconds: 5 * 3600, pace: 'travel', sceneEnded: false })).toBe(5 * 3600);
  });

  test('facts: same meaning is one fact, cut at a word, at most four new a turn', async () => {
    const { clipFactText, sameMeaning } = await import('../lib/rpg/facts');
    const { applyTurnDiff } = await import('../lib/rpg/services');
    const kan = { subjectEntityId: 'k', type: 'plan' as const };
    expect(sameMeaning({ ...kan, text: 'The Uchiha coup was planned for the end of this month.' }, { ...kan, text: 'The Uchiha clan planned their coup for the end of the month.' })).toBe(true);
    expect(clipFactText('word '.repeat(60)).endsWith('…')).toBe(true);
    expect(clipFactText('word '.repeat(60))).not.toMatch(/wor…$/);
    let db = seed();
    const before = db.facts.length;
    db = applyTurnDiff(db, {
      facts: [
        'Itachi burned the letter by the river.',
        'A crow followed you over the ridge.',
        'The gate guard asked for papers twice.',
        'Your boot lace snapped near the shrine.',
        'Rain flooded the lower cave overnight.',
        'Someone left fresh tracks across the bridge.',
        'The tower bell rang thirteen times at dusk.',
      ].map((text) => ({ action: 'add' as const, type: 'event' as const, text, subject: 'Kan' })),
    });
    expect(db.facts.length - before).toBe(4);
  });

  test('facts made this turn carry the time the turn ended on', async () => {
    const { applyTurnDiff } = await import('../lib/rpg/services');
    let db = seed();
    const start = db.state.inStoryDate;
    db = applyTurnDiff(db, { state: { elapsedSeconds: 3600 }, facts: [{ action: 'add', type: 'event', text: 'You reached the ridge at last.', subject: 'Kan' }] });
    const fact = db.facts.find((f) => /ridge/.test(f.text))!;
    expect(dateSortValue(fact.validFrom)).toBe(dateSortValue(shiftSeconds(start, 3600)));
  });

  test('already explained topics and used weather images reach the narrator', async () => {
    let db = seed();
    db = play(db, 'Why?', 'Itachi explains the coup. A gust shakes the pines, driving spray between you.', { explained: ['why Itachi killed the clan'] }).db;
    const text = promptText(db, 'I wait.');
    expect(text).toContain('ALREADY EXPLAINED');
    expect(text).toContain('why Itachi killed the clan');
    expect(text).toContain('IMAGES ALREADY USED');
    expect(text).toContain('A gust shakes the pines');
  });

  test('Sasuke\'s vow is not lore on the massacre night, and lore rests a few turns within a scene', async () => {
    const { loreTrue, recentlyShownLore } = await import('../lib/rpg/loreList');
    const { CANON_LORE } = await import('../lib/rpg/loreData');
    const db = seed();
    const vow = CANON_LORE.find((entry) => entry.id === 'sasuke-avenger')!;
    expect(loreTrue(db, vow)).toBe(false);
    expect(loreTrue({ ...db, state: { ...db.state, inStoryDate: { year: 14, month: 5, day: 1, hour: 9, minute: 0 } } }, vow)).toBe(true);
    const withShown: AppDatabase = {
      ...db,
      state: { ...db.state, sceneSeq: 4 },
      rawLog: [...db.rawLog, { ...db.rawLog[0], id: 'log_l', kind: 'story', role: 'assistant', sceneSeq: 4, loreShown: ['nine-tails-attack'] } as AppDatabase['rawLog'][number]],
    };
    expect(recentlyShownLore(withShown).has('nine-tails-attack')).toBe(true);
    expect(recentlyShownLore({ ...withShown, state: { ...withShown.state, sceneSeq: 5 } }).size).toBe(0);
  });

  test('summaries by amount of story: no summary for a striking image, a short scene waits', () => {
    let db = seed();
    db = play(db, 'I strike.', 'Fire roars across the clearing.', { image_worthy: true }).db;
    expect((db.memoryJobs ?? []).filter((job) => job.kind === 'scene')).toHaveLength(0);
    db = play(db, 'I leave.', 'You leave the clearing.', { scene_ended: true }).db;
    expect((db.memoryJobs ?? []).filter((job) => job.kind === 'scene')).toHaveLength(0);
  });
});
