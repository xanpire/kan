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
import { seedDatabase } from '../lib/rpg/seed';
import {
  buildRetouchPrompt,
  buildSceneImagePrompt,
  directorContext,
  parseImageAction,
  personReferenceSlots,
  sceneCharacterReferences,
  usePreviousForStyle,
} from '../lib/rpg/image';
import {
  canonArtDirection,
  colourAccent,
  impactFrameAllowed,
  jutsuOnScreen,
  lightLine,
  recentShots,
  shotTypeOf,
} from '../lib/rpg/imageDirection';
import { packPeopleReferences } from '../lib/rpg/castSheet';
import { parseImageCheck, sharperActorRule } from '../lib/rpg/imageCheck';
import { planReferences } from '../lib/rpg/referencePlan';
import { currentRegion } from '../lib/rpg/geography';
import type { AppDatabase, JutsuRecord, RawLogEntry } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_director', 'Director'));

function reply(db: AppDatabase, content: string, extra: Partial<RawLogEntry> = {}): AppDatabase {
  const entry: RawLogEntry = {
    id: `log_${db.rawLog.length + 1}`,
    turn: db.rawLog.length + 1,
    kind: 'story',
    role: 'assistant',
    content,
    model: 'm',
    promptTokens: 0,
    completionTokens: 0,
    chapter: 1,
    scene: db.state.scene,
    inStoryDate: db.state.inStoryDate,
    createdAt: Date.now(),
    ...extra,
  };
  return { ...db, rawLog: [...db.rawLog, entry] };
}

const at = (db: AppDatabase, hour: number, condition: 'clear' | 'snow' | 'storm' = 'clear'): AppDatabase => {
  const date = { ...db.state.inStoryDate, hour, minute: 0 };
  return {
    ...db,
    state: {
      ...db.state,
      inStoryDate: date,
      weather: { region: currentRegion(db), condition, since: date, source: 'story', sceneSeq: db.state.sceneSeq },
    },
  };
};

describe('the director', () => {
  test('reads ACTION, SHOT and CAPTION, in any order, and survives a missing SHOT', () => {
    const full = parseImageAction(
      'ACTION: Kan drives a Chidori into the Stone ninja.\nSHOT: low angle, wide-angle distortion, Kan lower third, focus: Kan\nCAPTION: You drive lightning through him.'
    );
    expect(full.action).toBe('Kan drives a Chidori into the Stone ninja.');
    expect(full.shot).toContain('low angle');
    expect(full.caption).toBe('You drive lightning through him.');

    const old = parseImageAction('ACTION: Kan waits.\nCAPTION: You wait.');
    expect(old.shot).toBeUndefined();
    expect(old.action).toBe('Kan waits.');

    expect(parseImageAction('Kan waits in the rain.').action).toBe('Kan waits in the rain.');
  });

  test('shot types come from the opening words', () => {
    expect(shotTypeOf('extreme close-up, worm’s-eye')).toBe('extreme close-up');
    expect(shotTypeOf('close-up on his face, a wide sky behind')).toBe('close-up');
    expect(shotTypeOf("aerial, bird's-eye over the crater")).toBe('aerial');
    expect(shotTypeOf('ensemble, line-up in a staggered V')).toBe('ensemble');
    expect(shotTypeOf('impact frame, inverted')).toBe('impact frame');
    expect(shotTypeOf('dutch tilt')).toBeNull();
  });

  test('the director reads mood, weather, jutsu, recent shots and a key moment', () => {
    let db = at(seed(), 18, 'storm');
    db = { ...db, state: { ...db.state, mood: 'furious' } };
    const jutsu: JutsuRecord = {
      id: 'j1',
      name: 'Fire Style: Great Fireball Technique',
      user: 'Kan',
      chakraNature: 'fire',
      effect: 'a huge fireball',
      visual: 'a roaring orange sphere of flame bigger than a house',
      firstSeen: db.state.inStoryDate,
      lastSeen: db.state.inStoryDate,
      timesUsed: 3,
      description: '',
      tags: [],
    };
    db = { ...db, jutsuRecords: [jutsu] };
    db = reply(db, 'Earlier.', { image: 'img:a', imageMeta: { prompt: '', action: '', shot: 'close-up, eye level', shotType: 'close-up', references: [], model: 'x', createdAt: 0 } });
    db = reply(db, 'You exhale a Great Fireball into the trees.', { imageWorthy: true });

    const context = directorContext(db)!;
    expect(context).toContain("Kan's mood: furious");
    expect(context).toContain('thunder');
    expect(context).toContain('roaring orange sphere');
    expect(context).toContain('This is a key moment: go big.');
    expect(context).toContain('"close-up, eye level"');

    const chip = directorContext(db, { chip: 'epic' })!;
    expect(chip).toContain('The player asked for this shot: extreme wide');
    expect(chip).not.toContain('go big');
  });

  test('impact frames stay rare and recent shots are tracked', () => {
    let db = seed();
    expect(impactFrameAllowed(db)).toBe(true);
    db = reply(db, 'Bang.', { image: 'img:a', imageMeta: { prompt: '', action: '', shot: 'impact frame', references: [], model: 'x', createdAt: 0 } });
    expect(impactFrameAllowed(db)).toBe(false);
    expect(recentShots(db)).toEqual(['impact frame']);
    for (let i = 0; i < 5; i += 1) {
      db = reply(db, 'Calm.', { image: 'img:b', imageMeta: { prompt: '', action: '', shot: 'wide', references: [], model: 'x', createdAt: 0 } });
    }
    expect(impactFrameAllowed(db)).toBe(true);
  });
});

describe('the scene prompt', () => {
  test('vision first: style opener, SHOT, ACTION before the references and rules', () => {
    const db = reply(at(seed(), 12), 'You wait.');
    const prompt = buildSceneImagePrompt(db, [{ kind: 'face', uri: 'data:f' }], 'Kan waits on a cliff.', {
      shot: 'extreme wide, tiny in frame',
    });
    const lines = prompt.split('\n');
    expect(lines[0]).toContain('painted anime background art');
    expect(prompt.indexOf('SHOT:')).toBeLessThan(prompt.indexOf('ACTION'));
    expect(prompt.indexOf('ACTION')).toBeLessThan(prompt.indexOf('Reference image 1'));
    expect(prompt.indexOf('Reference image 1')).toBeLessThan(prompt.indexOf('ACTOR RULE'));
    expect(prompt).not.toContain('Timeline:');
    expect(prompt).not.toContain('Cinematic dark anime illustration');
    expect(prompt).not.toContain('guarded expression');
    // A scale shot allows tiny faceless figures.
    expect(prompt).toContain('tiny, distant, faceless figures');
  });

  test('light comes from the real weather and clock, never hard-coded rain', () => {
    const noon = buildSceneImagePrompt(reply(at(seed(), 12), 'x'), [], 'Kan waits.');
    expect(noon).toContain('harsh noon sun');
    expect(noon).not.toMatch(/\brain\b/);

    expect(lightLine(at(seed(), 6, 'snow'), 'Kan waits.')).toContain('dawn');
    expect(lightLine(at(seed(), 6, 'snow'), 'Kan waits.')).toContain('snow');
    expect(lightLine(at(seed(), 18), 'Kan waits.')).toContain('golden hour');
    expect(colourAccent('Kan lights the black flames of Amaterasu')).toContain('violet');
    expect(colourAccent('A Chidori screams in his hand')).toContain('white-blue');
  });

  test('impact frames swap the style opener', () => {
    const db = reply(at(seed(), 12), 'x');
    const prompt = buildSceneImagePrompt(db, [], 'Kan punches Kisame.', { shot: 'impact frame, radial lines' });
    expect(prompt.split('\n')[0]).toContain('An anime impact frame');
    expect(prompt).not.toContain('Light and atmosphere');
  });

  test('jutsu visuals reach the prompt as the centrepiece', () => {
    let db = reply(at(seed(), 12), 'Kan breathes out a Great Fireball.');
    db = {
      ...db,
      jutsuRecords: [
        {
          id: 'j1', name: 'Fire Style: Great Fireball Technique', user: 'Kan', chakraNature: 'fire', effect: '',
          visual: 'a roaring orange sphere of flame', firstSeen: db.state.inStoryDate, lastSeen: db.state.inStoryDate,
          timesUsed: 1, description: '', tags: [],
        },
      ],
    };
    expect(jutsuOnScreen(db, 'Kan breathes out a Great Fireball.').length).toBe(1);
    const prompt = buildSceneImagePrompt(db, [], 'Kan breathes out a Great Fireball.');
    expect(prompt).toContain('Jutsu on screen: Fire Style: Great Fireball Technique — a roaring orange sphere of flame');
  });

  test('references are identity-only and the previous image is style-only', () => {
    const db = reply(seed(), 'x');
    const prompt = buildSceneImagePrompt(
      db,
      [
        { kind: 'face', uri: 'data:f' },
        { kind: 'cast', uri: 'data:c', names: ['Kisame Hoshigaki', 'Deidara'] },
        { kind: 'previous', uri: 'data:p' },
      ],
      'Kan stands between Kisame and Deidara.',
      { shot: 'ensemble, line-up' }
    );
    expect(prompt).toContain('Identity only');
    expect(prompt).toContain('Reference image 2 is a cast sheet: left to right Kisame Hoshigaki, Deidara.');
    expect(prompt).toContain('rendering style and line quality only, not composition');
    expect(prompt).toContain('Ensemble:');
  });

  test('the previous image only guides style when the shot type matches', () => {
    let db = seed();
    expect(usePreviousForStyle(db, 'close-up')).toBe(true);
    db = reply(db, 'x', { image: 'img:a', imageMeta: { prompt: '', action: '', shotType: 'aerial', references: [], model: 'x', createdAt: 0 } });
    expect(usePreviousForStyle(db, 'close-up')).toBe(false);
    expect(usePreviousForStyle(db, 'aerial')).toBe(true);
  });

  test('canon characters get look tags from their appearance', () => {
    const db = reply(seed(), 'x');
    const kisame = db.entities.find((entity) => entity.name.startsWith('Kisame'));
    if (!kisame?.appearance) return;
    const prompt = buildSceneImagePrompt(db, [], `Kan faces ${kisame.name} across the river.`);
    expect(prompt).toContain('How the others look:');
    expect(prompt).toContain(kisame.name);
  });

  test('the retouch prompt edits the same image and keeps Kan’s face', () => {
    const plan = planReferences([{ kind: 'face', uri: 'data:f' }, { kind: 'edit', uri: 'data:e' }], 4);
    expect(plan.references.map((ref) => ref.kind)).toEqual(['edit', 'face']);
    const prompt = buildRetouchPrompt('make him angrier', plan.references);
    expect(prompt).toContain('Edit this image: make him angrier.');
    expect(prompt).toContain('Keep everything else the same');
    expect(prompt).toContain('Reference image 2: Kan');
  });
});

describe('ensembles', () => {
  test('person slots follow the model, not a fixed three', () => {
    expect(personReferenceSlots(8)).toBe(6);
    expect(personReferenceSlots(8, false)).toBe(7);
    expect(personReferenceSlots(1)).toBe(0);
  });

  test('more people than slots go onto cast sheets of up to six', async () => {
    const people = Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, uri: `data:${i}` }));
    const drawn: string[][] = [];
    const draw = async (group: { name: string }[]) => {
      drawn.push(group.map((person) => person.name));
      return 'data:sheet';
    };

    const two = await packPeopleReferences(people, 2, draw);
    expect(two.map((ref) => ref.kind)).toEqual(['cast', 'cast']);
    expect(drawn).toEqual([['P0', 'P1', 'P2', 'P3'], ['P4', 'P5', 'P6', 'P7']]);

    const fits = await packPeopleReferences(people.slice(0, 2), 3, draw);
    expect(fits.map((ref) => ref.kind)).toEqual(['character', 'character']);

    // No canvas: one per slot, the first ones first.
    const none = await packPeopleReferences(people, 2, async () => null);
    expect(none.map((ref) => ref.name)).toEqual(['P0', 'P1']);

    expect(await packPeopleReferences(people, 0, draw)).toEqual([]);
  });

  test('original characters get reference slots before the canon cast', async () => {
    const db = seed();
    const canon = db.entities.find((entity) => entity.name.startsWith('Itachi'))!;
    const original = { ...canon, id: 'oc1', name: 'Renji Kaito', aliases: [] };
    let next: AppDatabase = { ...db, entities: [...db.entities, original] };
    const mod = await import('../lib/rpg/characterPortrait');
    next = mod.setCharacterFaceInDb(next, canon.id, 'img:itachi');
    next = mod.setCharacterFaceInDb(next, original.id, 'img:renji');
    const action = 'Itachi watches as Renji Kaito circles Kan.';
    expect(sceneCharacterReferences(next, action, 1, true).map((ref) => ref.name)).toEqual(['Renji Kaito']);
    expect(sceneCharacterReferences(next, action, 1).map((ref) => ref.name)).toEqual([canon.name]);
  });
});

describe('the swapped-roles check', () => {
  test('reads its JSON and sharpens the actor rule', () => {
    expect(parseImageCheck('```json\n{"roles_ok": false, "extra_people": true, "note": "Kan is the one choked."}\n```')).toEqual({
      rolesOk: false,
      extraPeople: true,
      note: 'Kan is the one choked.',
    });
    expect(parseImageCheck('no idea')).toBeNull();
    const rule = sharperActorRule('Kan chokes a Stone ninja.', { rolesOk: false, extraPeople: true, note: 'Kan is the one choked.' });
    expect(rule).toContain('Kan is the one DOING the action');
    expect(rule).toContain('only the people the ACTION names');
  });
});

describe('canon art direction', () => {
  test('a big canon beat Kan took on gives its art direction', () => {
    const db = seed();
    const progress = db.state.canonProgress ?? { completed: [], active: [], engaged: [] };
    const engaged: AppDatabase = {
      ...db,
      state: { ...db.state, canonProgress: { ...progress, engaged: [...progress.engaged, 'pain-assault'] } },
    };
    expect(canonArtDirection(engaged)).toContain('Pain floating high above');
    expect(canonArtDirection({ ...db, state: { ...db.state, location: 'a cave', canonProgress: progress } })).toBeNull();
  });
});
