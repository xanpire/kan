/**
 * Section 11 of claude/before-variety-ideas.md (14 Nov 2026): the built-in
 * canon lore library. Entries for the narrator only, nothing before it is
 * true, who knows it and what others believe, Kan learning only what the
 * tracker was offered, and the Journal's "What you know" holding only what he
 * learned (a belief until he learns the truth).
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

import { CANON_CAST } from '../lib/rpg/canonCast';
import { CANON_MILESTONES } from '../lib/rpg/canonData';
import { normalizeDatabase } from '../lib/rpg/db';
import { CANON_LORE, LORE_GROUPS } from '../lib/rpg/loreData';
import {
  applyLoreLearned,
  formatCanonLoreEntry,
  kanVersion,
  knowersOf,
  loreTrackingCandidates,
  loreTrue,
  normalizeLoreKnown,
  selectCanonLore,
  whatYouKnow,
} from '../lib/rpg/loreList';
import { buildExtractionPrompt, buildNarrationPrompt, worldAreasForTurn } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import { WORLD_AREA_FIELDS } from '../lib/rpg/stateSchema';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_lore_library', 'Lore library'));
const byId = (id: string) => CANON_LORE.find((entry) => entry.id === id)!;
const promptText = (db: AppDatabase, input = 'I look around.') =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

const completed = (db: AppDatabase, ids: string[]): AppDatabase => ({
  ...db,
  state: { ...db.state, canonProgress: { ...db.state.canonProgress!, completed: [...(db.state.canonProgress?.completed ?? []), ...ids] } },
});

describe('the data', () => {
  const names = new Set([...CANON_CAST.map((entry) => entry.name), 'Itachi Uchiha', 'Hana Inuzuka', 'Izumi Uchiha', 'Suzume', 'Kan']);
  const milestones = new Set(CANON_MILESTONES.map((milestone) => milestone.id));

  test('about 200 entries, ids unique', () => {
    expect(CANON_LORE.length).toBeGreaterThanOrEqual(200);
    expect(new Set(CANON_LORE.map((entry) => entry.id)).size).toBe(CANON_LORE.length);
  });

  test('every knower is a group or a cast name, every person a cast name, every milestone real', () => {
    const who = (list: string[] = []) => list.filter((item) => !LORE_GROUPS[item] && !names.has(item));
    const bad = CANON_LORE.flatMap((entry) =>
      [
        ...who(entry.known),
        ...who(entry.belief?.heldBy),
        ...(entry.widens ?? []).flatMap((step) => [...who(step.known), ...who(step.held)]),
        ...(entry.people ?? []).filter((name) => !names.has(name)),
      ].map((item) => `${entry.id}: ${item}`)
    );
    const badMilestones = CANON_LORE.flatMap((entry) => [entry.from, entry.until, ...(entry.widens ?? []).map((step) => step.at)]).filter(
      (id): id is string => Boolean(id) && !milestones.has(id!)
    );

    expect(bad).toEqual([]);
    expect(badMilestones).toEqual([]);
  });

  test('every entry has a title, keywords and a text; a belief Kan starts on has a belief to hold', () => {
    for (const entry of CANON_LORE) {
      expect(entry.title && entry.text && entry.keywords.length > 0).toBeTruthy();
      if (entry.belief) expect(entry.belief.text.length).toBeGreaterThan(10);
    }
  });

  test('nothing from the Boruto era', () => {
    const text = CANON_LORE.map((entry) => `${entry.text} ${entry.belief?.text ?? ''}`).join(' ');
    expect(text).not.toMatch(/\b(Boruto|Kawaki|Momoshiki|Kara\b|Isshiki)/);
  });
});

describe('what Kan knows at the start', () => {
  test('a Leaf ANBU of thirteen: the Nine-Tails host and the law, Root; not Naruto’s father, not the masked man', () => {
    const db = seed();
    expect(kanVersion(db, byId('third-law'))).toBe('truth');
    expect(kanVersion(db, byId('root'))).toBe('truth');
    expect(kanVersion(db, byId('uchiha-coup'))).toBe('truth');
    expect(kanVersion(db, byId('naruto-parents'))).toBeNull();
    expect(kanVersion(db, byId('akatsuki-plan'))).toBeNull();
    // What most believe: the masked man is the first Kan hears of, the Nine-Tails attack a disaster.
    expect(kanVersion(db, byId('nine-tails-attack'))).toBe('belief');
  });
});

describe('sent to the narrator', () => {
  test('called up by the recent text, with who knows it and what Kan knows', () => {
    const db = seed();
    const text = promptText(db, 'I ask Itachi what he knows about the Nine-Tails attack and the Fourth Hokage.');

    expect(text).toContain('CANON LORE');
    expect(text).toContain('[nine-tails-attack]');
    expect(text).toContain('WHAT OTHERS BELIEVE');
    expect(text).toContain('Kan believes what most believe');
  });

  test('nothing before it is true', () => {
    const db = seed();
    const input = 'Tell me about Pain’s attack on the village, and the Fifth Hokage.';

    expect(loreTrue(db, byId('pain-assault'))).toBe(false);
    expect(selectCanonLore(db, { recentText: input, presentNames: [] }).map((entry) => entry.id)).not.toContain('pain-assault');
    expect(selectCanonLore(db, { recentText: input, presentNames: [] }).map((entry) => entry.id)).not.toContain('hokage-fifth');

    const later = completed(db, ['pain-assault', 'tsunade-hokage']);
    const ids = selectCanonLore(later, { recentText: input, presentNames: [] }).map((entry) => entry.id);
    expect(ids).toContain('pain-assault');
    expect(ids).toContain('hokage-fifth');
    expect(ids).not.toContain('hokage-line');
  });

  test('at most five, and one about a person in the scene', () => {
    const db = seed();
    const many = selectCanonLore(db, {
      recentText: 'The Sharingan, the Hyūga, the Byakugan, the Nara, the Akimichi, the Aburame, the Inuzuka, the Uzumaki, the Senju, the Whirlpool.',
      presentNames: [],
    });
    expect(many.length).toBe(5);

    const quiet = selectCanonLore(db, { recentText: 'You walk on.', presentNames: ['Kakuzu'] });
    expect(quiet.map((entry) => entry.id)).toEqual(['kakuzu-past']);
  });

  test('more people know it as the story goes on; the dead are left out', () => {
    const db = seed();
    const entry = byId('masked-madara');
    expect(knowersOf(db, entry).held).not.toContain('shinobi');
    expect(knowersOf(completed(db, ['war-begins']), entry).held).toContain('shinobi');

    const withDead: AppDatabase = {
      ...db,
      entities: db.entities.map((entity) => (entity.name === 'Hiruzen Sarutobi' ? { ...entity, deceased: true } : entity)),
    };
    expect(formatCanonLoreEntry(db, byId('kan-presumed-dead'))).toContain('Hiruzen Sarutobi');
    expect(formatCanonLoreEntry(withDead, byId('kan-presumed-dead'))).not.toMatch(/known to [^)]*Hiruzen Sarutobi/);
  });

  test('the reply is stamped with the entries Kan could still learn', () => {
    const db = seed();
    const built = buildNarrationPrompt(db, 'What happened to Obito Uchiha at Kannabi Bridge?');
    expect(built.loreSent).toContain('obito-at-kannabi');
    // Something Kan already knows for certain is not offered to the tracker.
    expect(buildNarrationPrompt(db, 'I think about Root.').loreSent).not.toContain('root');
  });
});

describe('the tracker', () => {
  const reply = 'Kakashi looks at the memorial stone. “Obito didn’t die under that rock,” he says. “He lived. I just didn’t know.”';

  test('asks for lore only when there is something to learn, with the ids it may use', () => {
    const db = seed();
    expect(worldAreasForTurn(db, 'I wait.', reply)).toContain('lore');
    expect(worldAreasForTurn(db, 'I wait.', 'You walk on through the trees.')).not.toContain('lore');

    const world = buildExtractionPrompt(db, 'I wait.', reply).world!;
    const text = world.messages.map((message) => message.content).join('\n');
    expect(text).toContain('LORE YOU (KAN) COULD LEARN');
    expect(text).toContain('- obito-at-kannabi:');
    expect(WORLD_AREA_FIELDS.lore).toEqual(['lore_learned']);
  });

  test('lore_learned is read from the reply', () => {
    const { diff } = convertStateBlock({ lore_learned: [{ id: 'obito-at-kannabi', version: 'truth', from: 'kakashi-hatake', how: 'told' }] } as never);
    expect(diff.loreLearned).toEqual([{ id: 'obito-at-kannabi', version: 'truth', from: 'kakashi-hatake', how: 'told' }]);
  });

  test('only what was offered counts; a belief, then the truth; never back', () => {
    const db = seed();
    const offered = loreTrackingCandidates(db, undefined, 'the masked man, and the Uchiha massacre, and Pain');
    expect(offered.map((entry) => entry.id)).toContain('masked-madara');
    // Section 17: Kan learns why the clan died only later, from Itachi, so the massacre's truth is still to learn.
    expect(offered.map((entry) => entry.id)).toContain('uchiha-massacre');
    expect(loreTrackingCandidates(db, undefined, 'the coup').map((entry) => entry.id)).not.toContain('uchiha-coup'); // Kan knows the truth already
    expect(offered.map((entry) => entry.id)).not.toContain('pain-god'); // not true yet

    const notOffered = applyLoreLearned(db, [{ id: 'akatsuki-plan', version: 'truth', how: 'told' }], offered);
    expect(notOffered.state.loreKnown?.['akatsuki-plan']).toBeUndefined();

    const believed = applyLoreLearned(db, [{ id: 'masked-madara', version: 'belief', from: 'itachi-uchiha', how: 'told' }], offered);
    expect(kanVersion(believed, byId('masked-madara'))).toBe('belief');
    expect(whatYouKnow(believed)[0].body).toBe(byId('masked-madara').belief!.text);

    const truth = applyLoreLearned(believed, [{ id: 'masked-madara', version: 'truth', how: 'seen' }], offered);
    expect(kanVersion(truth, byId('masked-madara'))).toBe('truth');
    expect(whatYouKnow(truth)[0].body).toBe(byId('masked-madara').text);
    expect(whatYouKnow(truth)[0].meta).toMatch(/^Seen with your own eyes · /);

    const back = applyLoreLearned(truth, [{ id: 'masked-madara', version: 'belief', how: 'told' }], offered);
    expect(kanVersion(back, byId('masked-madara'))).toBe('truth');
  });

  test('the teller is named as Kan knew them', () => {
    const db = seed();
    const offered = loreTrackingCandidates(db, undefined, 'Naruto’s father');
    const itachi = db.entities.find((entity) => entity.name === 'Itachi Uchiha')!;
    const told = applyLoreLearned(db, [{ id: 'naruto-parents', version: 'truth', from: itachi.id, how: 'told' }], offered);
    expect(whatYouKnow(told)[0].meta).toMatch(/^Itachi( Uchiha)? told you · /);
  });
});

describe('the Journal', () => {
  test('nothing unlearned reaches it; what Kan knew before the story is not listed', () => {
    const db = seed();
    expect(whatYouKnow(db)).toEqual([]);
    // Even a save that claims an entry the library no longer has.
    expect(normalizeLoreKnown({ 'no-such-entry': { version: 'truth', how: 'told', date: db.state.inStoryDate } })).toEqual({});
  });

  test('loreKnown survives a save and a load', () => {
    const db = seed();
    const learned = applyLoreLearned(db, [{ id: 'naruto-parents', version: 'truth', how: 'read' }], [byId('naruto-parents')]);
    const loaded = normalizeDatabase(JSON.parse(JSON.stringify(learned)));
    expect(loaded.state.loreKnown?.['naruto-parents']?.how).toBe('read');
    expect(whatYouKnow(loaded).map((row) => row.id)).toEqual(['naruto-parents']);
  });
});
