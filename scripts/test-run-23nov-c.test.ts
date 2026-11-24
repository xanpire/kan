/**
 * Xan's third test of 23 Nov 2026 (save slot_mwtou3p280b2wd, 16 entries):
 * the stock "She didn't run." line, Itachi's parents filed as Kan's, the
 * narrator denying the vultures' link and the tracker filing it as a rule,
 * Hōmuri's flight with no time on it, and the Sharingan in images.
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

import { advanceSeconds } from '../lib/rpg/calendar';
import { normalizeDatabase } from '../lib/rpg/db';
import { buildSceneImagePrompt, calmSharingan, parseImageAction } from '../lib/rpg/image';
import { sharinganImageLine } from '../lib/rpg/kanEyes';
import { speakerKin } from '../lib/rpg/kinGuard';
import { formatOpeningBlock } from '../lib/rpg/opening';
import { changesClothes } from '../lib/rpg/referencePlan';
import { buildNarrationPrompt } from '../lib/rpg/prompt';
import { seedDatabase } from '../lib/rpg/seed';
import { applyTurnDiff } from '../lib/rpg/services';
import { convertStateBlock } from '../lib/rpg/stateBlock';
import type { AppDatabase } from '../lib/rpg/types';
import {
  deniesVultureLink,
  ensureVultureLink,
  flightSeconds,
  formatVultureBlock,
  linkAt,
  VULTURE_LINK_LORE,
  VULTURES_EFFECT,
  VULTURES_EFFECT_OLD,
} from '../lib/rpg/vultureLink';

const seed = () => normalizeDatabase(seedDatabase('slot_testrun_c', 'Test run c'));
const person = (db: AppDatabase, name: string) => db.entities.find((entity) => entity.name === name)!;
const promptText = (db: AppDatabase, input: string) =>
  buildNarrationPrompt(db, input).messages.map((message) => message.content).join('\n');

describe('"She didn’t run." is no stock line', () => {
  test('a new story never hands the narrator the line', () => {
    const db = seed();
    expect(promptText(db, 'I run on through the rain toward the Leaf.')).not.toContain('didn’t run');
    expect(formatOpeningBlock(db)).toContain('First he stops you');
  });

  test('an old save loses it from the opening note and the lore', () => {
    const db = seed();
    const old = {
      ...db,
      events: db.events.map((event, index) =>
        index === 0 ? { ...event, narratorNote: 'Izumi and Hazuki with them (he may give you one honest detail of Hazuki, such as "She didn’t run."). If you attack' } : event
      ),
      loreEntries: [
        ...db.loreEntries,
        { id: 'lore_old', keywords: ['itachi'], priority: 5, enabled: true, text: 'Izumi and Hazuki with it. He may give you one honest detail of Hazuki’s death ("She didn’t run."). He never excuses himself.' },
      ],
    } as AppDatabase;
    const next = normalizeDatabase(old);
    expect(JSON.stringify(next.events)).not.toContain('didn’t run');
    expect(JSON.stringify(next.loreEntries)).not.toContain('didn’t run');
    expect(next.loreEntries.find((lore) => lore.id === 'lore_old')?.text).toContain('if you ask about Hazuki');
  });
});

describe('their "Father and Mother" are theirs', () => {
  const ITACHI_SAYS = 'Itachi says Izumi fell by the doorway, Hazuki inside the house, and your parents in the main hall of your home.';

  test('a claim by Itachi becomes his parents and his home', () => {
    const db = seed();
    expect(speakerKin(db, ITACHI_SAYS, person(db, 'Itachi Uchiha').id)).toBe(
      'Itachi says Izumi fell by the doorway, Hazuki inside the house, and his parents in the main hall of his home.'
    );
  });

  test('Kan’s own parents, and his father’s scrolls, are left alone', () => {
    const db = seed();
    const itachi = person(db, 'Itachi Uchiha').id;
    expect(speakerKin(db, 'Your parents died in the Nine-Tails attack.', itachi)).toBe('Your parents died in the Nine-Tails attack.');
    expect(speakerKin(db, 'Your father’s scrolls are under the floor.', itachi)).toBe('Your father’s scrolls are under the floor.');
  });

  test('the state step rewrites the claim, and refuses it with no speaker', () => {
    const db = seed();
    const itachi = person(db, 'Itachi Uchiha').id;
    const next = applyTurnDiff(db, {
      facts: [
        { action: 'add', type: 'event', text: ITACHI_SAYS, claimedBy: itachi },
        { action: 'add', type: 'event', text: 'Your parents lie dead in the main hall.' },
      ],
    });
    expect(next.facts.some((fact) => fact.text.includes('his parents in the main hall of his home'))).toBe(true);
    expect(next.facts.some((fact) => /your parents (?:in|lie)/i.test(fact.text))).toBe(false);
  });

  test('an old save is repaired on load', () => {
    const db = seed();
    const itachi = person(db, 'Itachi Uchiha').id;
    const kan = person(db, 'Kan').id;
    const old = {
      ...db,
      facts: [
        ...db.facts,
        { id: 'fact_old', subjectEntityId: itachi, type: 'event', text: ITACHI_SAYS, whoKnows: [kan, itachi], validFrom: db.state.inStoryDate, validTo: null, confidence: 'claimed', claimedBy: itachi },
      ],
    } as AppDatabase;
    expect(normalizeDatabase(old).facts.find((fact) => fact.id === 'fact_old')?.text).toContain('his parents');
  });
});

describe('the vultures’ link', () => {
  const DENIAL = "You cannot see through your vultures' eyes across distance: no images pass back through the bond, only the pull of your own chakra.";

  test('the invented rule is recognised; sending one is not', () => {
    expect(deniesVultureLink(DENIAL)).toBe(true);
    expect(deniesVultureLink('You sent Hōmuri flying south to the village, but no images have come back through the link yet.')).toBe(true);
    expect(deniesVultureLink('You sent Hōmuri flying south to the village to see it through her eyes.')).toBe(false);
    expect(deniesVultureLink('Your three vultures, Okuri, Hōmuri and Tomurai, are all female.')).toBe(false);
  });

  test('the state step never files it, nor lists it as explained', () => {
    const db = seed();
    const next = applyTurnDiff(db, {
      facts: [{ action: 'add', type: 'knowledge', text: DENIAL, subject: 'kan' }],
      explained: ['why you cannot see through your vultures at a distance'],
    });
    expect(next.facts.some((fact) => fact.text === DENIAL)).toBe(false);
    expect((next.state.alreadySaid ?? []).some((said) => /vultures/.test(said.text))).toBe(false);
  });

  test('a new story has the link on the jutsu card and in the fixed lore', () => {
    const db = seed();
    expect(db.jutsuRecords.find((record) => record.name === 'Your vultures')?.effect).toBe(VULTURES_EFFECT);
    expect(promptText(db, 'I look at the sky.')).toContain('YOUR VULTURES’ LINK');
  });

  test('ranges: live within an hour, clear to three, patchy to six, then nothing', () => {
    expect(linkAt(0.5)).toBe('live');
    expect(linkAt(2)).toBe('clear');
    expect(linkAt(5)).toBe('patchy');
    expect(linkAt(7)).toBe('out');
    // A five-hour run is half an hour's flight.
    expect(flightSeconds(5)).toBe(1800);
  });
});

describe('a vulture in the air', () => {
  test('vultures_sent puts her in the air with an arrival time the narrator sees', () => {
    const db = seed();
    const { diff } = convertStateBlock({ vultures_sent: [{ name: 'Hōmuri', toward: 'the Leaf', run_hours: 5 }], vultures_back: [] });
    const sent = applyTurnDiff(db, diff);
    const out = sent.state.vulturesOut ?? [];
    expect(out).toHaveLength(1);
    expect(out[0].arriveAt).toEqual(advanceSeconds(sent.state.inStoryDate, 1800));

    const block = formatVultureBlock(sent);
    expect(block).toContain('Hōmuri');
    expect(block).toContain('30 minutes of flight');
    expect(block).toContain('the story waits for her');

    // Five minutes out she is under an hour's run away: live.
    const soon = { ...sent, state: { ...sent.state, inStoryDate: advanceSeconds(sent.state.inStoryDate, 300) } };
    expect(formatVultureBlock(soon)).toContain('the link is live');
    // Ten minutes out, a third of the way: a few seconds late.
    const later = { ...sent, state: { ...sent.state, inStoryDate: advanceSeconds(sent.state.inStoryDate, 600) } };
    expect(formatVultureBlock(later)).toContain('a few seconds late');
    // There: five hours' run away, patchy.
    const there = { ...sent, state: { ...sent.state, inStoryDate: advanceSeconds(sent.state.inStoryDate, 2400) } };
    expect(formatVultureBlock(there)).toContain('at the Leaf since');
    expect(formatVultureBlock(there)).toContain('in pieces');
    expect(promptText(there, 'I wait.')).toContain('YOUR VULTURES OUT');
  });

  test('vultures_back brings her home', () => {
    const db = seed();
    const sent = applyTurnDiff(db, convertStateBlock({ vultures_sent: [{ name: 'Hōmuri', toward: 'the Leaf', run_hours: 5 }], vultures_back: [] }).diff);
    const back = applyTurnDiff(sent, convertStateBlock({ vultures_sent: [], vultures_back: ['Homuri'] }).diff);
    expect(back.state.vulturesOut ?? []).toHaveLength(0);
    expect(formatVultureBlock(back)).toBe('');
  });

  test('the third test’s save: the card learns, the rule goes, Hōmuri is put in the air', () => {
    const db = seed();
    const kan = person(db, 'Kan').id;
    const sentAt = { year: 13, month: 10, day: 1, hour: 22, minute: 10, second: 0 };
    const old = {
      ...db,
      jutsuRecords: db.jutsuRecords.map((record) => (record.name === 'Your vultures' ? { ...record, effect: VULTURES_EFFECT_OLD } : record)),
      loreEntries: db.loreEntries.filter((lore) => lore.text !== VULTURE_LINK_LORE),
      facts: [
        ...db.facts,
        { id: 'fact_send', subjectEntityId: kan, type: 'event', text: 'You sent Hōmuri flying south to the village to see it through her eyes, but no images have come back through the link yet.', whoKnows: [kan], validFrom: sentAt, validTo: null, confidence: 'confirmed' },
        { id: 'fact_rule', subjectEntityId: kan, type: 'knowledge', text: "You cannot see through your vultures' eyes across distance: no images pass back through the bond.", whoKnows: [kan], validFrom: sentAt, validTo: null, confidence: 'confirmed' },
      ],
      state: {
        ...db.state,
        vultureLinkRepaired: undefined,
        alreadySaid: [{ text: 'why you cannot see through your vultures at a distance', date: sentAt }],
      },
    } as AppDatabase;
    const next = ensureVultureLink(old);
    expect(next.jutsuRecords.find((record) => record.name === 'Your vultures')?.effect).toBe(VULTURES_EFFECT);
    expect(next.loreEntries.some((lore) => lore.text === VULTURE_LINK_LORE)).toBe(true);
    expect(next.facts.some((fact) => fact.id === 'fact_rule')).toBe(false);
    expect(next.facts.find((fact) => fact.id === 'fact_send')?.text).toBe('You sent Hōmuri flying south to the village to see it through her eyes.');
    expect(next.state.alreadySaid).toEqual([]);
    expect(next.state.vulturesOut?.[0]).toMatchObject({ name: 'Hōmuri', runHours: 5, arriveAt: { hour: 22, minute: 40 } });
    // Once only.
    expect(ensureVultureLink(next).state.vulturesOut).toHaveLength(1);
  });
});

describe('the Sharingan in images', () => {
  const withSharingan = () => {
    const db = seed();
    const now = db.state.inStoryDate;
    return {
      ...db,
      state: {
        ...db.state,
        player: { ...db.state.player, eyes: 'sharingan', abilities: [{ name: 'Sharingan', stage: '1 tomoe', acquiredOn: now, stageOn: now }] },
      },
    } as AppDatabase;
  };

  test('the director’s glow, spin and light from the eyes are left out', () => {
    const shot = calmSharingan(
      "close-up, low angle, focus on Kan, trembling pupil with a single black tomoe spinning in crimson disbelief, pitch-black night lit only by the faint red glow of Kan's Sharingan through heavy rain"
    );
    expect(shot).toBe('close-up, low angle, focus on Kan');
    expect(parseImageAction('ACTION: Kan stares.\nSHOT: close-up, Sharingan glowing red, rain').shot).toBe('close-up, rain');
    expect(calmSharingan('wide shot, rain')).toBe('wide shot, rain');
  });

  test('the prompt draws the eyes exactly and drops the sheet’s brown eyes', () => {
    const db = withSharingan();
    expect(sharinganImageLine(db)).toContain('one small black comma-shaped tomoe');
    expect(sharinganImageLine(db)).toContain('do not glow');
    const prompt = buildSceneImagePrompt(db, [{ kind: 'face', uri: 'data:image/png;base64,x' }], 'Kan stares at Itachi.');
    expect(prompt).toContain("his eyes are not the sheet's brown right now");
    expect(prompt).not.toContain('red glow of the Sharingan');
    expect(sharinganImageLine(seed())).toBeNull();
  });

  test('the other outfit’s sheet only goes when clothes change', () => {
    expect(changesClothes('Kan stares at Itachi in the rain.')).toBe(false);
    expect(changesClothes('Kan pulls on the Akatsuki cloak.')).toBe(true);
  });
});
