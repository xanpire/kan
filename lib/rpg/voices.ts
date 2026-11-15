// Section 8 of claude/before-variety-ideas.md (Xan, 14 Nov 2026): living NPCs.
// The narrator rule, each person's voice line (only for the people in the
// scene), what sensors, dōjutsu users and noses perceive of Kan, Samehada,
// and temperaments for the nameless. Narrator only: nothing here reaches the UI.

import { dateSortValue } from './calendar';
import { isDeceased } from './deaths';
import { kanAgeNow } from './kanLook';
import { happened } from './names';
import type { AppDatabase, EntityRecord } from './types';
import { CAST_VOICES, TEMPERAMENTS } from './voiceData';

export const REACTION_RULES = `REACTIONS (people are alive)
- Everyone present reacts to what is new to them, at once, in their own VOICE: an unknown jutsu ("What was that?", a guess, a wrong name), the Sharingan (fear, shock that the clan isn't all dead, grief, greed, a child's stare), a joke, bad news, a kindness, an insult. Feelings last into the next turns. Surprised once, then they remember. No stock reactions: no shared "eyes widen" or gasps, never the same reaction twice in a room.
- People know only what they have been shown, the Akatsuki included; witnesses may tell or keep quiet, and what is told spreads as rumour.
- Sensors feel a huge, strange, hard-to-place chakra (never "many people in one body") that shocks them more as it grows; each drain changes it, so someone who felt it long ago may not know it. Inuzuka and ninken know him by scent. Dōjutsu users see the drain and that the vultures are chakra. Veterans count what they see (a third nature, no fatigue); ordinary people see only the result and get it wrong.
- It fits the person: Orochimaru covets, Kakuzu appraises, Hidan mocks, Itachi worries silently, Pain calculates, Danzō wants him.`;

/** A person's voice line: the cast's own, or a temperament for anyone else. */
export function voiceOf(entity: Pick<EntityRecord, 'id' | 'name'>): string | null {
  if (entity.name.toLowerCase() === 'kan') return null;

  return CAST_VOICES[entity.name] ?? `temperament: ${temperamentFor(entity.id)}`;
}

function hash(text: string) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function temperamentFor(id: string): string {
  return TEMPERAMENTS[hash(id) % TEMPERAMENTS.length];
}

/** The short form for a crowded room: the first part of the line. */
export function shortVoiceOf(entity: Pick<EntityRecord, 'id' | 'name'>): string | null {
  const voice = voiceOf(entity);
  return voice ? voice.split('|')[0].trim() : null;
}

// ---------------------------------------------------------------------------
// What some people perceive of Kan

type Sense = { kind: 'sensor' | 'dojutsu' | 'nose'; line: string; from?: string; until?: string };

export const SENSES: Record<string, Sense[]> = {
  'Karin': [{ kind: 'sensor', line: 'a sensor: feels your chakra’s size and strangeness; near you long enough, she knows it anywhere' }],
  'Kisame Hoshigaki': [{ kind: 'sensor', line: 'senses chakra like a shark smells blood' }],
  'Fū Yamanaka': [{ kind: 'sensor', line: 'a Root sensor: feels the size, reports it' }],
  'C': [{ kind: 'sensor', line: 'a Cloud sensor: feels the size, names it wrong' }],
  'Zetsu': [{ kind: 'sensor', line: 'senses chakra through the earth and plants' }],
  'Pain': [{ kind: 'sensor', line: 'senses chakra through his receivers' }],
  'Kabuto Yakushi': [{ kind: 'sensor', line: 'a trained medic-spy: reads chakra closely and takes notes' }],
  'Minato Namikaze': [{ kind: 'sensor', line: 'a sensor' }],
  'Tobirama Senju': [{ kind: 'sensor', line: 'a master sensor' }],
  'Kushina Uzumaki': [{ kind: 'sensor', line: 'an Uzumaki sensor' }],
  'Naruto Uzumaki': [
    { kind: 'sensor', line: 'in Sage Mode he feels nature’s chakra and yours', from: 'naruto-sage-training' },
    { kind: 'sensor', line: 'with Kurama he feels the emotions in chakra, hostility first', from: 'kurama-mastered' },
  ],
  'Fukasaku': [{ kind: 'sensor', line: 'a sage: feels nature’s chakra and yours' }],
  'Shima': [{ kind: 'sensor', line: 'a sage: feels nature’s chakra and yours' }],
  'Itachi Uchiha': [{ kind: 'dojutsu', line: 'Sharingan: sees the drain and the vultures’ chakra; already knows both' }],
  'Kakashi Hatake': [{ kind: 'dojutsu', line: 'Sharingan: sees the drain and that the vultures are chakra' }],
  'Sasuke Uchiha': [{ kind: 'dojutsu', line: 'Sharingan: sees the drain and that the vultures are chakra', from: 'land-of-waves' }],
  'Danzo Shimura': [{ kind: 'dojutsu', line: 'a hidden Sharingan: sees more than he lets on' }],
  'Tobi': [{ kind: 'dojutsu', line: 'Sharingan behind the mask: sees the drain and studies it' }],
  'Madara Uchiha': [{ kind: 'dojutsu', line: 'Rinnegan and Sharingan: sees everything about the drain' }],
  'Neji Hyuga': [{ kind: 'dojutsu', line: 'Byakugan: sees chakra flow out of the target and into you' }],
  'Hinata Hyuga': [{ kind: 'dojutsu', line: 'Byakugan: sees chakra flow out of the target and into you' }],
  'Hiashi Hyuga': [{ kind: 'dojutsu', line: 'Byakugan: sees chakra flow out of the target and into you' }],
  'Hanabi Hyuga': [{ kind: 'dojutsu', line: 'Byakugan: sees chakra flow out of the target and into you' }],
  'Ao': [{ kind: 'dojutsu', line: 'a stolen Byakugan: sees the drain, and is a sensor too' }],
  'Kaguya Ōtsutsuki': [{ kind: 'dojutsu', line: 'Byakugan and Rinne Sharingan: knows all chakra as her own' }],
  'Kiba Inuzuka': [{ kind: 'nose', line: 'knows you by scent, whatever your chakra or disguise' }],
  'Hana Inuzuka': [{ kind: 'nose', line: 'knows you by scent, whatever your chakra or disguise' }],
  'Tsume Inuzuka': [{ kind: 'nose', line: 'knows you by scent, whatever your chakra or disguise' }],
  'Akamaru': [{ kind: 'nose', line: 'knows you by scent' }],
  'Pakkun': [{ kind: 'nose', line: 'knows you by scent' }],
};

function sensesNow(db: AppDatabase, entity: EntityRecord): Sense[] {
  return (SENSES[entity.name] ?? []).filter(
    (sense) => (!sense.from || happened(db, sense.from)) && (!sense.until || !happened(db, sense.until))
  );
}

/** How Kan's natures read to someone who sees them (the baseline in section 8). */
export function naturesReadLine(db: AppDatabase): string {
  const natures = db.state.player.natures ?? [];
  const age = kanAgeNow(db);
  const names = natures.map((item) => item.nature);
  const count = names.length;
  const reading =
    count <= 1
      ? 'nothing unusual'
      : count === 2
        ? `jōnin level at ${age}`
        : 'almost unheard of: anyone experienced who sees a third nature knows something is wrong';

  return `Your natures (${count}: ${names.join(', ') || 'none known'}) read as ${reading}, to anyone who sees them used. A huge reserve is put down to Uzumaki blood${natures.some((item) => item.source === 'thousand-souls') ? '; the extra natures are not' : ''}.`;
}

/** The last time Kan's chakra changed by feeding: the newest nature taken with Thousand Souls. */
export function lastChakraChange(db: AppDatabase) {
  const taken = (db.state.player.natures ?? []).filter((item) => item.source === 'thousand-souls');
  return taken.sort((a, b) => dateSortValue(b.acquiredOn) - dateSortValue(a.acquiredOn))[0]?.acquiredOn;
}

/**
 * Samehada: drawn to Kan's chakra while Kisame carries it; with Bee after
 * Kisame's end. Canon guard: the sword's path and Kisame's end don't change.
 */
export function samehadaLine(db: AppDatabase, ids: ReadonlySet<string>): string {
  const here = (name: string) =>
    db.entities.find((entity) => entity.name === name && ids.has(entity.id) && !isDeceased(entity));
  const holder = happened(db, 'kisame-dies') ? here('Killer Bee') : here('Kisame Hoshigaki');

  if (!holder) return '';

  return `SAMEHADA (${holder.name === 'Kisame Hoshigaki' ? 'Kisame' : 'Bee'} carries it): the sword is drawn to your chakra; it stirs, bristles or leans toward you, and ${holder.name === 'Kisame Hoshigaki' ? 'Kisame notices, amused or wary; a spar is chakra-eater against chakra-eater' : 'Bee notices and jokes about it'}. Canon holds: Samehada still ends up with Bee, and Kisame's end does not change.`;
}

/** Nameless people this turn: three temperaments, different each in-story minute. */
export function backgroundTemperaments(db: AppDatabase): string[] {
  const date = db.state.inStoryDate;
  const start = hash(`${date.year}-${date.month}-${date.day}-${date.hour}-${date.minute}-${db.rawLog.length}`);
  const picks: string[] = [];

  for (let i = 0; picks.length < 3 && i < TEMPERAMENTS.length * 2; i += 1) {
    const pick = TEMPERAMENTS[(start + i * 7) % TEMPERAMENTS.length];
    if (!picks.includes(pick)) picks.push(pick);
  }

  return picks;
}

/**
 * The per-turn block: how Kan reads to the people here (natures, sensors,
 * dōjutsu, noses, who last felt him before his chakra changed), Samehada, and
 * temperaments for the nameless.
 */
export function formatReactionsBlock(db: AppDatabase, ids: ReadonlySet<string>): string {
  const people = db.entities.filter(
    (entity) => entity.type === 'character' && ids.has(entity.id) && entity.name.toLowerCase() !== 'kan' && !isDeceased(entity)
  );
  const changed = lastChakraChange(db);
  const senseLines = people.flatMap((entity) => {
    const senses = sensesNow(db, entity);
    if (senses.length === 0) return [];

    const stale =
      changed &&
      senses.some((sense) => sense.kind === 'sensor') &&
      !entity.companion &&
      entity.lastSeen &&
      dateSortValue(entity.lastSeen) < dateSortValue(changed)
        ? '; last felt your chakra before it changed, so may not recognise it'
        : '';

    return [`- ${entity.name}: ${senses.map((sense) => sense.line).join('; ')}${stale}`];
  });

  return [
    'HOW YOU READ TO OTHERS (narrator only)',
    people.length > 0 ? naturesReadLine(db) : '',
    ...(senseLines.length > 0 ? ['Who can perceive more:', ...senseLines] : []),
    samehadaLine(db, ids),
    `BACKGROUND PEOPLE (nameless people who take part, one each): ${backgroundTemperaments(db).map((item) => item.split(':')[0]).join(' / ')}.`,
  ]
    .filter(Boolean)
    .join('\n');
}
