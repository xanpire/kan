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
import { appendStoryMessage } from '../lib/rpg/log';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import { NARRATION_SYSTEM, buildExtractionPrompt, buildNarrationPrompt } from '../lib/rpg/prompt';
import {
  CONVERSATION_MODE_MINIMUM_SECONDS,
  fightOptionInput,
  readKanInput,
  resolveTurnMode,
  setSceneModeOverride,
} from '../lib/rpg/sceneMode';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { TURN_STATE_SCHEMA } from '../lib/rpg/stateSchema';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_modes', 'Modes'));

type Reply = {
  beat?: string | null;
  with?: string[];
  pace?: string | null;
  options?: string[];
  ended?: boolean;
  present?: string[];
};

/** One turn the way game.tsx plays it: prompt → reply saved with its mode → state step. */
function play(db: AppDatabase, input: string, narration: string, reply: Reply | null) {
  const prompt = buildNarrationPrompt(appendStoryMessage(db, 'user', input, null, 0, 0), input);
  let next = appendStoryMessage(db, 'user', input, null, 0, 0);
  next = appendStoryMessage(next, 'assistant', narration, null, 0, 0);
  const turnLogId = next.rawLog[next.rawLog.length - 1].id;
  next.rawLog[next.rawLog.length - 1] = { ...next.rawLog[next.rawLog.length - 1], sceneMode: prompt.sceneMode.mode };
  const block = reply
    ? {
        beat: reply.beat ?? null,
        beat_with: reply.with ?? [],
        fight_options: reply.options ?? [],
        scene_pace: reply.pace ?? null,
        scene_ended: reply.ended ?? false,
        characters_present: reply.present ?? ['itachi-uchiha'],
      }
    : null;
  const converted = block ? convertStateBlock(block).diff : null;
  const diff = converted ? resolveCharacterRefs(next, converted) : null;
  const result = applyStateStep(next, diff, { turnLogId, userMessage: input, narration }, new Set()).db;

  return { db: result, prompt, reply: result.rawLog.find((entry) => entry.id === turnLogId)! };
}

const promptText = (db: AppDatabase, input: string) =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

/** Two exchanges with Itachi, so the next spoken line is a conversation. */
function talking() {
  let db = seed();
  db = play(db, '"Is it done?"', '"It is done," Itachi says. He does not look at you.', {
    beat: 'exchange',
    with: ['itachi-uchiha'],
    pace: 'conversation',
  }).db;
  db = play(db, '"Why?"', '"Because it had to be," he says. "Ask me again when we are far from here."', {
    beat: 'exchange',
    with: ['itachi-uchiha'],
    pace: 'conversation',
  }).db;
  return db;
}

describe('reading Kan\'s input', () => {
  test('speech, attacks, scene changes and small moves in place', () => {
    expect(readKanInput('"Where are we going?"').speaks).toBe(true);
    expect(readKanInput('*I look deep in Itachi\'s eyes* "This is not like you."')).toMatchObject({
      speaks: true,
      attacks: false,
      changesScene: false,
    });
    expect(readKanInput('*I follow him.*').changesScene).toBe(true);
    expect(readKanInput('*I throw a kunai at his throat.*').attacks).toBe(true);
    expect(readKanInput('*I lunge at Kakuzu.*').attacks).toBe(true);
    // Words he says and attacks he refuses are not attacks.
    expect(readKanInput('"I will kill him one day."').attacks).toBe(false);
    expect(readKanInput('*I don\'t attack him.*').attacks).toBe(false);
    expect(readKanInput('*I say nothing and look away.*')).toMatchObject({ attacks: false, changesScene: false });
    expect(readKanInput('*I stand up and leave.*').changesScene).toBe(true);
  });
});

describe('conversation mode', () => {
  test('a single instruction never flips it', () => {
    let db = seed();
    db = play(db, '*I wait.*', '"Follow me," Itachi says, already turning away.', {
      beat: 'instruction',
      with: ['itachi-uchiha'],
    }).db;

    expect(db.state.sceneMode?.exchangeStreak).toBe(0);
    expect(resolveTurnMode(db, '*I follow him.*').mode).toBe('normal');
    expect(resolveTurnMode(db, '*I follow him.*').lean).toBe(false);
  });

  test('slow to start: one exchange leans, Kan answering out loud settles it', () => {
    let db = seed();
    const first = play(db, '"Is it done?"', '"It is done," Itachi says.', {
      beat: 'exchange',
      with: ['itachi-uchiha'],
      pace: 'conversation',
    });
    db = first.db;
    expect(first.reply.sceneMode).toBe('normal');
    expect(db.state.sceneMode?.exchangeStreak).toBe(1);
    expect(db.state.sceneMode?.partners).toHaveLength(1);

    // Doing something in place keeps it leaning, not full conversation.
    expect(resolveTurnMode(db, '*I stare at him.*')).toMatchObject({ mode: 'normal', lean: true });
    expect(promptText(db, '*I stare at him.*')).toContain('SCENE MODE: talk is building with Itachi Uchiha');
    // Answering in speech makes it a conversation by the second reply.
    expect(resolveTurnMode(db, '"Why?"')).toMatchObject({ mode: 'conversation', with: ['Itachi Uchiha'] });
  });

  test('after two exchanges small actions stay in it, and the prompt says so', () => {
    const db = talking();
    expect(db.state.sceneMode?.exchangeStreak).toBe(2);
    expect(db.state.sceneMode?.current).toBe('conversation');

    const look = '*I look deep in Itachi\'s eyes* "This is not like you."';
    expect(resolveTurnMode(db, look).mode).toBe('conversation');
    expect(resolveTurnMode(db, '*I say nothing and look away.*').mode).toBe('conversation');
    expect(promptText(db, look)).toContain('SCENE MODE: conversation with Itachi Uchiha');
  });

  test('a remark mid-conversation keeps it going; leaving ends it with a transition', () => {
    let db = talking();
    db = play(db, '"Fine."', '*Itachi nods.* "Good."', { beat: 'remark', with: ['itachi-uchiha'], pace: 'conversation' }).db;
    expect(resolveTurnMode(db, '"And then?"').mode).toBe('conversation');

    const leave = resolveTurnMode(db, '*I stand up and leave.*');
    expect(leave).toMatchObject({ mode: 'normal', ending: 'conversation' });
    expect(promptText(db, '*I stand up and leave.*')).toContain('ends the conversation');

    db = play(db, '*I stand up and leave.*', 'You step out into the rain. Behind you, the fire crackles.', {
      beat: 'action',
      pace: 'travel',
    }).db;
    expect(db.state.sceneMode?.exchangeStreak).toBe(0);
    expect(resolveTurnMode(db, '*I keep going.*').mode).toBe('normal');
  });

  test('someone joining turns it into a group conversation', () => {
    let db = talking();
    db = play(db, '"Who is that?"', '"Kisame," Itachi says. The big man grins. "Nice to meet you, kid."', {
      beat: 'exchange',
      with: ['itachi-uchiha', 'kisame-hoshigaki'],
      pace: 'conversation',
      present: ['itachi-uchiha', 'kisame-hoshigaki'],
    }).db;
    expect(db.state.sceneMode?.exchangeStreak).toBe(3);
    expect(db.state.sceneMode?.partners).toHaveLength(2);
  });

  test('a conversation-mode turn takes seconds, not minutes', () => {
    const db = talking();
    const before = db.state.inStoryDate;
    const turn = play(db, '"Then tell me."', '"Not yet."', { beat: 'exchange', with: ['itachi-uchiha'], pace: 'conversation' });
    expect(turn.reply.sceneMode).toBe('conversation');
    expect(turn.reply.elapsedSeconds).toBe(CONVERSATION_MODE_MINIMUM_SECONDS);
    expect(turn.db.state.inStoryDate).not.toEqual(before);
  });
});

describe('fight mode', () => {
  test('an attack starts it, options come with the reply, and it ends with the fight', () => {
    let db = talking();
    expect(resolveTurnMode(db, '*I throw a kunai at his throat.*').mode).toBe('fight');

    const strike = play(
      db,
      '*I throw a kunai at his throat.*',
      'Itachi turns his head; the kunai hisses past. He is behind you before you see him move, his elbow already driving at your ribs.',
      {
        beat: 'combat',
        pace: 'combat',
        options: ['Twist away and slash back', 'Take the hit and grab his arm', 'Water Style: Water Dragon'],
      }
    );
    db = strike.db;
    expect(strike.reply.sceneMode).toBe('fight');
    // Kan has no Water Dragon, so that move is never offered (Session 1).
    expect(strike.reply.fightOptions).toEqual(['Twist away and slash back', 'Take the hit and grab his arm']);
    expect(db.state.sceneMode?.exchangeStreak).toBe(0);
    // While it goes on, everything is fight mode, even a line of speech.
    expect(resolveTurnMode(db, '"Stop!"').mode).toBe('fight');
    expect(promptText(db, '*I block.*')).toContain('SCENE MODE: fight');
    expect(fightOptionInput('Twist away and slash back')).toBe('*Twist away and slash back.*');

    const end = play(db, '*I yield.*', 'Itachi steps back. The fight is over. You breathe in the cold air.', {
      beat: 'action',
      pace: 'downtime',
      options: ['should be ignored'],
    });
    expect(end.reply.fightOptions).toBeUndefined();
    expect(resolveTurnMode(end.db, '*I rest.*').mode).toBe('normal');
  });

  test('an ambush in the narration switches the next turn to fight mode', () => {
    const db = play(seed(), '*I walk the road.*', 'Three masked men drop from the trees, blades out, and the first one swings at your neck.', {
      beat: 'combat',
      pace: 'combat',
      present: [],
    }).db;
    expect(resolveTurnMode(db, '*I duck.*').mode).toBe('fight');
  });
});

describe('manual override', () => {
  test('forced conversation lasts through travel and ends when a fight starts', () => {
    let db = setSceneModeOverride(seed(), 'conversation');
    expect(resolveTurnMode(db, '*We walk north together.*')).toMatchObject({ mode: 'conversation', manual: true });

    db = play(db, '*We walk north together.* "Tell me about the Akatsuki."', '"They are dangerous," Itachi says as the road climbs.', {
      beat: 'travel',
      pace: 'travel',
    }).db;
    expect(db.state.sceneMode?.override).toBe('conversation');
    expect(resolveTurnMode(db, '"How dangerous?"').mode).toBe('conversation');

    db = play(db, '"How dangerous?"', 'A blade flashes out of the brush, straight at Itachi.', { beat: 'combat', pace: 'combat' }).db;
    expect(db.state.sceneMode?.override).toBeUndefined();
    expect(resolveTurnMode(db, '*I draw a kunai.*').mode).toBe('fight');
  });

  test('switching it off holds until the conversation is over, then automatic resumes', () => {
    let db = setSceneModeOverride(talking(), 'normal');
    expect(resolveTurnMode(db, '"Why?"')).toMatchObject({ mode: 'normal', manual: true });
    expect(promptText(db, '"Why?"')).toContain('normal narration (Kan chose this)');

    db = play(db, '*I walk away.*', 'You walk into the trees alone.', { beat: 'action', pace: 'travel', present: [] }).db;
    expect(db.state.sceneMode?.override).toBeUndefined();
    expect(setSceneModeOverride(db, null).state.sceneMode?.override).toBeUndefined();
  });

  test('the choice and the streak survive a reload', () => {
    const db = setSceneModeOverride(talking(), 'fight');
    const reloaded = normalizeDatabase(JSON.parse(JSON.stringify(db)));
    expect(reloaded.state.sceneMode).toMatchObject({ override: 'fight', exchangeStreak: 2, current: 'conversation' });
  });
});

describe('prompts and schema', () => {
  test('the narrator rules describe the modes without any state field names', () => {
    expect(NARRATION_SYSTEM).toContain('SCENE MODES');
    expect(NARRATION_SYSTEM).toContain('stop there, before it lands');
    expect(NARRATION_SYSTEM).not.toContain('beat_with');
    expect(NARRATION_SYSTEM).not.toContain('fight_options');
  });

  test('normal turns add no mode line', () => {
    expect(promptText(seed(), '*I wait.*')).not.toContain('SCENE MODE:');
  });

  test('the state tracker tags the beat and sees the mode the reply used', () => {
    expect(TURN_STATE_SCHEMA.required).toContain('beat');
    expect(TURN_STATE_SCHEMA.required).toContain('beat_with');
    expect(TURN_STATE_SCHEMA.required).toContain('fight_options');

    let db = appendStoryMessage(seed(), 'user', '"Hi"', null, 0, 0);
    db = appendStoryMessage(db, 'assistant', '"Hello."', null, 0, 0);
    db.rawLog[db.rawLog.length - 1] = { ...db.rawLog[db.rawLog.length - 1], sceneMode: 'conversation' };
    const text = buildExtractionPrompt(db, '"Hi"', '"Hello."').messages.map((message) => message.content).join('\n');
    expect(text).toContain('SCENE MODE THIS TURN: conversation');
    expect(text).toContain('BEAT: beat tags how this turn played');
  });

  test('a turn with no state reply still keeps the streak sensible', () => {
    let db = seed();
    db = play(db, '"Is it done?"', '"It is done," Itachi says.', null).db;
    expect(db.state.sceneMode?.lastBeat).toBe('exchange');
  });
});

describe('the mode label follows a fight that ends (Session 1, decided by Xan: keep the forecast)', () => {
  test('the tracker is told a fight that stops in the reply is no longer combat', async () => {
    const { buildExtractionPrompt, trackerPromptText } = await import('../lib/rpg/prompt');
    const text = trackerPromptText(buildExtractionPrompt(seed(), '*You block.*', 'He backs off and lowers his hand.'));
    expect(text).toContain('When the fight stops in this reply');
    expect(text).toContain('fight_options is []');
  });
});
