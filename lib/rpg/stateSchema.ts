/**
 * JSON schema for the per-turn state call (call 2 of a turn).
 *
 * The narrator writes prose only. A cheap model then reads that prose and
 * returns this object through OpenRouter's structured output
 * (`response_format: { type: "json_schema", strict: true }`).
 *
 * Strict mode requires every property to be listed in `required` and
 * `additionalProperties: false` everywhere, so "unchanged" is expressed as
 * `null` for single values and `[]` for lists. `convertStateBlock` in
 * services.ts ignores nulls and empty lists, and turns the rest into a
 * `TurnDiff`.
 */

const nullableString = { type: ['string', 'null'] } as const;
const nullableNumber = { type: ['number', 'null'] } as const;
const stringList = { type: 'array', items: { type: 'string' } } as const;

function nullableEnum(values: readonly string[]) {
  return { type: ['string', 'null'], enum: [...values, null] };
}

function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

function list(properties: Record<string, unknown>) {
  return { type: 'array', items: object(properties) };
}

export const TIME_UNITS = ['seconds', 'minutes', 'hours', 'days'] as const;
export const SCENE_PACES = ['combat', 'chase', 'conversation', 'travel', 'downtime'] as const;
export const SCENE_BEATS = ['exchange', 'instruction', 'remark', 'action', 'travel', 'combat'] as const;
export const LOCATION_KINDS = ['settlement', 'road', 'wilderness', 'structure'] as const;
export const RELATIONSHIPS = [
  'stranger',
  'acquaintance',
  'friendly',
  'close',
  'old friend',
  'family',
  'teammate',
  'partner',
  'mentor',
  'student',
  'rival',
  'enemy',
  'romantic interest',
  'lover',
  'rejected',
  'ex',
] as const;
export const THREAD_TYPES = ['quest', 'goal', 'promise', 'debt', 'mystery', 'grudge', 'other'] as const;
export const FLASHBACK_MARKS = ['offered', 'started', 'ended'] as const;
export const ATTRACTIONS = ['none', 'warm', 'strong'] as const;
export const GENDERS = ['male', 'female', 'unknown'] as const;
export const ATTRACTED_TO = ['men', 'women', 'both', 'none', 'unknown'] as const;
export const FACT_TYPES = [
  'death',
  'injury',
  'condition',
  'secret',
  'knowledge',
  'membership',
  'possession',
  'relationship',
  'plan',
  'figure',
  'event',
  'other',
] as const;
export const FACT_LASTS = ['lasting', 'until_rest', 'days'] as const;
export const REPUTATION_FACTIONS = ['leaf', 'sand', 'mist', 'cloud', 'stone', 'akatsuki'] as const;
export const VILLAGE_FACTIONS = ['leaf', 'sand', 'mist', 'cloud', 'stone'] as const;
export const GRUDGE_EVENTS = ['wronged', 'struck', 'settled', 'forgiven'] as const;
export const THREAD_STATUSES = ['open', 'update', 'resolved'] as const;
export const LETTER_CARRIERS = ['bird', 'ninken', 'summon', 'courier', 'dead-drop', 'hand'] as const;
export const EPITHET_AUDIENCES = ['leaf', 'sand', 'mist', 'cloud', 'stone', 'akatsuki', 'rain', 'underworld'] as const;
export const SAFEHOUSE_KINDS = ['own', 'rented', 'borrowed', 'base', 'camp'] as const;
export const SAFEHOUSE_ENDINGS = ['expired', 'destroyed', 'compromised', 'withdrawn', 'given-up'] as const;
export const CONSEQUENCE_KINDS = ['spared', 'lie', 'helped', 'witness', 'betrayal', 'humiliated', 'promise', 'debt'] as const;

export const TURN_STATE_SCHEMA = object({
  time: object({
    elapsed: nullableNumber,
    unit: nullableEnum(TIME_UNITS),
    clock_time: nullableString,
  }),
  scene_pace: nullableEnum(SCENE_PACES),
  // How this turn played (Kan's input and the reply together), who Kan was
  // talking with, and, while a fight goes on, a few moves he could make next.
  beat: nullableEnum(SCENE_BEATS),
  beat_with: stringList,
  fight_options: stringList,
  location: nullableString,
  location_kind: nullableEnum(LOCATION_KINDS),
  mood: nullableString,
  world_description: nullableString,
  canon_point: nullableString,
  inventory_added: stringList,
  inventory_removed: stringList,
  // Every change to Kan's own money this turn, in ryō (negative when he pays),
  // and his total only when the prose states it.
  money: list({
    amount: { type: 'number' },
    reason: { type: 'string' },
  }),
  money_counted: nullableNumber,
  jutsu_used: list({
    name: { type: 'string' },
    // A character ID ("kan", "kisame-hoshigaki"), or a description for an unnamed user.
    user: { type: 'string' },
    chakra_nature: nullableString,
    effect: nullableString,
    visual: nullableString,
  }),
  // People are referred to by their ID from KNOWN CHARACTERS (or, for someone
  // added this turn under new_characters, by that exact name).
  // Two sides: affinity_change / note are how THEY feel about Kan (only from
  // what they could see or hear); your_change / your_note are how Kan feels
  // about them (his inner thoughts move only this side).
  bonds: list({
    character_id: { type: 'string' },
    affinity_change: nullableNumber,
    status: nullableString,
    note: nullableString,
    your_change: nullableNumber,
    your_note: nullableString,
    relationship: nullableEnum(RELATIONSHIPS),
    attraction: nullableEnum(ATTRACTIONS),
    romance_note: nullableString,
  }),
  // entity: who the fact is about (an id; "kan" when it is about Kan).
  // supersedes: refs of active facts this one replaces. claimed_by: the
  // speaker, when this is only what someone said. lasts/days: how long a
  // temporary condition, injury or plan holds.
  facts: list({
    entity: { type: 'string' },
    fact: { type: 'string' },
    type: nullableEnum(FACT_TYPES),
    who_knows: stringList,
    supersedes: stringList,
    claimed_by: nullableString,
    lasts: nullableEnum(FACT_LASTS),
    days: nullableNumber,
  }),
  // Refs of active facts that stopped being true this turn.
  facts_ended: stringList,
  // participants: ids of the people the thread is about (besides Kan).
  threads: list({
    title: { type: 'string' },
    description: nullableString,
    status: { type: 'string', enum: [...THREAD_STATUSES] },
    type: nullableEnum(THREAD_TYPES),
    importance: nullableNumber,
    participants: stringList,
  }),
  // Only people absent from KNOWN CHARACTERS, each with is_new: true. Entries
  // with is_new: false are dropped, so a known person can never be re-added.
  new_characters: list({
    is_new: { type: 'boolean' },
    name: { type: 'string' },
    age: nullableNumber,
    role: nullableString,
    personality: nullableString,
    speech_style: nullableString,
    appearance: nullableString,
    gender: nullableEnum(GENDERS),
    attracted_to: nullableEnum(ATTRACTED_TO),
    // A one-scene character: a target, a guard, a shopkeeper.
    minor: { type: 'boolean' },
    // false for a stranger whose name Kan has not learned: name is then a
    // short description of how they look to him ("the scarred ferryman").
    name_known: { type: 'boolean' },
  }),
  // appearance: how they look right now (clothes, wet, bloodied, Sharingan
  // active). lasting_appearance: only a real lasting change to their base look.
  character_updates: list({
    character_id: { type: 'string' },
    mood: nullableString,
    appearance: nullableString,
    lasting_appearance: nullableString,
    whereabouts: nullableString,
    // Rare, original characters only: who they are has truly changed.
    personality_change: nullableString,
    speech_style_change: nullableString,
  }),
  // A death the prose makes certain this turn — on screen, a body Kan sees,
  // or someone telling Kan — by character id. revived is only a true return
  // to life (Chiyo's jutsu, say), never an Edo Tensei reanimation.
  deaths: list({
    character_id: { type: 'string' },
    cause: nullableString,
  }),
  revived: stringList,
  // Edo Tensei: the dead brought back to act (still dead), and those whose
  // reanimation ends (released, sealed).
  reanimated: stringList,
  released: stringList,
  characters_present: stringList,
  // Someone who clearly sets out with Kan this turn, or a companion who truly
  // parts ways (not a short step away), by character id.
  companions_joined: list({
    character_id: { type: 'string' },
    reason: nullableString,
  }),
  companions_left: list({
    character_id: { type: 'string' },
    reason: nullableString,
  }),
  // Kan's own chakra natures and abilities, when this turn changes them.
  natures_gained: list({
    nature: { type: 'string' },
    source: { type: 'string', enum: ['innate', 'thousand-souls'] },
    from: nullableString,
  }),
  abilities_changed: list({
    name: { type: 'string' },
    stage: nullableString,
  }),
  image_worthy: { type: 'boolean' },
  scene_ended: { type: 'boolean' },
  // A short name for the scene, only when a new scene starts this turn.
  scene_title: nullableString,
  // The weather, only when the page changes it from WEATHER NOW.
  weather: nullableString,
  // A place Kan sleeps at or settles in, or what changed at one (see SAFEHOUSES).
  safehouse: {
    type: ['object', 'null'],
    properties: {
      id: nullableString,
      name: nullableString,
      kind: nullableEnum(SAFEHOUSE_KINDS),
      paid_nights: nullableNumber,
      host: nullableString,
      stored: stringList,
      taken: stringList,
      upgrade: nullableString,
      shown_to: stringList,
      residents_joined: stringList,
      residents_left: stringList,
      ended: nullableEnum(SAFEHOUSE_ENDINGS),
    },
    required: [
      'id', 'name', 'kind', 'paid_nights', 'host', 'stored', 'taken', 'upgrade',
      'shown_to', 'residents_joined', 'residents_left', 'ended',
    ],
    additionalProperties: false,
  },
  // A title for a new chapter, only when this turn opens one (a major story
  // turn, a big change of place, or a time skip).
  chapter_title: nullableString,
  // Flashbacks (see FLASHBACK in the state prompt): an offered memory's
  // trigger was shown, Kan let a memory take him, or the memory ended.
  flashback: nullableEnum(FLASHBACK_MARKS),
  canon_engaged: stringList,
  canon_completed: stringList,
  canon_passed: stringList,
  news_relayed: list({
    id: { type: 'string' },
    from: nullableString,
  }),
  // A letter or message Kan writes and sends to someone not in the scene (or
  // to the dead: kept, never sent). text: Kan's words with only spelling and
  // punctuation fixed.
  letters_sent: list({
    to: { type: 'string' },
    gist: nullableString,
    text: nullableString,
    carrier: nullableEnum(LETTER_CARRIERS),
    coded: { type: ['boolean', 'null'] },
  }),
  // Letters that actually reached Kan on the page this turn, with their words.
  letters_received: list({
    from: { type: 'string' },
    text: nullableString,
  }),
  // Something in a person's own life away from Kan that this turn revealed.
  life_events: list({
    character_id: { type: 'string' },
    event: { type: 'string' },
  }),
  // People whose birthday Kan learned on the page this turn.
  birthdays_learned: stringList,
  // Names Kan heard, read or recognised this turn, within his hearing or reading.
  names_learned: list({
    character_id: { type: 'string' },
    name: { type: 'string' },
    part: { type: 'string', enum: ['given', 'family', 'full', 'identity'] },
    how: { type: 'string', enum: ['introduced', 'told', 'written', 'overheard', 'recognised'] },
  }),
  // Someone present learned another name a person goes by (Kan told Deidara who Tobi is).
  names_told: list({
    character_id: { type: 'string' },
    name: { type: 'string' },
    told_to: stringList,
  }),
  // What a village (or the Akatsuki) now has on Kan, from deeds its people
  // saw or survived this turn; and villages whose entry on him he learned of.
  reputation: list({
    faction: { type: 'string', enum: [...REPUTATION_FACTIONS] },
    change: { type: 'number' },
    reason: nullableString,
  }),
  bounty_seen: { type: 'array', items: { type: 'string', enum: [...VILLAGE_FACTIONS] } },
  // A name the prose calls Kan by, and whose name it is.
  epithet: {
    type: ['object', 'null'],
    properties: {
      audience: { type: 'string', enum: [...EPITHET_AUDIENCES] },
      name: { type: 'string' },
    },
    required: ['audience', 'name'],
    additionalProperties: false,
  },
  // Choices that could come back later, and offered ones that came back.
  consequences: list({
    kind: { type: 'string', enum: [...CONSEQUENCE_KINDS] },
    character_id: nullableString,
    who: { type: 'string' },
    what: { type: 'string' },
    want: nullableString,
    witnesses: stringList,
    faction: nullableEnum(VILLAGE_FACTIONS),
    when: nullableEnum(['weeks', 'months', 'years']),
  }),
  consequences_returned: stringList,
  // Grudges against Kan: started, acted on, settled, or forgiven.
  grudges: list({
    character_id: { type: 'string' },
    event: { type: 'string', enum: [...GRUDGE_EVENTS] },
    reason: nullableString,
  }),
});

export const TURN_STATE_SCHEMA_NAME = 'kan_turn_state';
