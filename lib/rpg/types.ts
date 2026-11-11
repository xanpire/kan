import type { ImageModelCaps } from '../openrouter';
export type ScenePace = 'combat' | 'chase' | 'conversation' | 'travel' | 'downtime';

/** How a turn played, tagged by the state tracker (see sceneMode.ts). */
export type SceneBeat = 'exchange' | 'instruction' | 'remark' | 'action' | 'travel' | 'combat';

/** How the narrator writes a turn: normal prose, conversation, or fight exchanges. */
export type SceneModeName = 'normal' | 'conversation' | 'fight';

export type SceneModeState = {
  /** The mode the last turn was narrated in. */
  current: SceneModeName;
  /** Exchange beats in a row with the same person or group. */
  exchangeStreak: number;
  /** Who Kan is talking with: entity ids (or lowercased names for people not on record). */
  partners: string[];
  lastBeat?: SceneBeat;
  /** The player's choice from the mode chip; cleared once it no longer applies. */
  override?: SceneModeName;
};

export type CalendarDate = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
};

export type EntityType = 'character' | 'place' | 'faction' | 'object';

export type EventEntityRole = 'present' | 'mentioned' | 'participant';

/**
 * The fixed set of fact types (see FACT_TYPE_RULES in prompt.ts for what each
 * one is for): a tied headband is not an injury, and "the clan is dead" is an
 * event, not a death fact about whoever did it.
 */
export type FactType =
  | 'death'
  | 'injury'
  | 'condition'
  | 'secret'
  | 'knowledge'
  | 'membership'
  | 'possession'
  | 'relationship'
  | 'plan'
  | 'figure'
  | 'event'
  | 'other';

export type ThreadType =
  | 'promise'
  | 'debt'
  | 'grudge'
  | 'mystery'
  | 'quest'
  | 'goal'
  | 'other';

/** `year` is no longer made (the saga replaced it); old saves may still hold some. */
export type SummaryLevel = 'chapter' | 'arc' | 'year' | 'saga';

export type LogKind = 'story' | 'summary' | 'extraction' | 'diff' | 'error';

export type PlayerSheet = {
  name: string;
  lineage: string[];
  birthday: { month: number; day: number };
  birthYear: number;
  rank: string;
  role: string;
  team: string[];
  sensei: string;
  personality: string[];
  secretNotes: string[];
  /** Kan's chakra natures: innate ones, and those taken with Thousand Souls. */
  natures?: NatureRecord[];
  /** Dōjutsu and other abilities, each at its current stage. */
  abilities?: AbilityRecord[];
};

export type NatureRecord = {
  /** Fire, Water, Wind, Earth, Lightning, Wood, Ice, Lava… */
  nature: string;
  source: 'innate' | 'thousand-souls';
  /** Whose chakra it came from (Thousand Souls). */
  from?: string;
  acquiredOn: CalendarDate;
};

export type AbilityRecord = {
  /** "Sharingan", "Mangekyō Sharingan", "Susanoo"… */
  name: string;
  /** "1 tomoe", "2 tomoe", "3 tomoe", "awakened", "ribcage", "full body"… */
  stage: string;
  acquiredOn: CalendarDate;
  /** When it reached its current stage. */
  stageOn: CalendarDate;
  /** Every stage it has had, oldest first. */
  history?: { stage: string; date: CalendarDate }[];
};

export type LocationKind = 'settlement' | 'road' | 'wilderness' | 'structure';

export type GameState = {
  player: PlayerSheet;
  mood: string;
  worldDescription: string;
  jutsu: string[];
  inventory: string[];
  location: string;
  locationKind?: LocationKind;
  inStoryDate: CalendarDate;
  turnsWithoutTimeChange?: number;
  canonPoint: string;
  canonProgress?: CanonProgress;
  /** The current chapter: a narrative unit, moved on only by real breaks (see applyChapterBreak). */
  chapter: number;
  /** The current chapter's title, from its break. */
  chapterTitle?: string;
  /** Where the current chapter began: its first turn (story turn number) and in-story date. */
  chapterStart?: { turn: number; date: CalendarDate };
  /** Finished chapters, oldest first. */
  chapters?: { chapter: number; title: string; from: CalendarDate; to: CalendarDate }[];
  scene: string;
  scenePace?: ScenePace;
  sceneCast?: string[];
  /** Conversation and fight mode (see sceneMode.ts). */
  sceneMode?: SceneModeState;
  /**
   * Counts scenes, so each story turn can be tied to one (RawLogEntry.sceneSeq)
   * and a memory never spans two. Moves on when a scene ends, the place
   * changes or a new scene title starts.
   */
  sceneSeq?: number;
  /** The last applied turn ended its scene: the next turn opens a new one. */
  sceneClosed?: boolean;
  /** Personal letters to and from Kan (see letters.ts). */
  post?: PostState;
  /** Bingo books and Akatsuki standing (see reputation.ts). */
  reputation?: ReputationState;
  /** Birthdays, anniversaries and festivals (see yearly.ts). */
  yearly?: YearlyState;
  /** Deeds people talk about, and what they call Kan (see renown.ts). */
  renown?: RenownState;
  /** Choices that could come back later (see consequences.ts). */
  consequences?: ConsequenceSeed[];
  /** The weather held for the current scene (see weather.ts). */
  weather?: WeatherLock;
  /** Every place Kan has been, oldest first (see mapData.ts). */
  travelLog?: TravelStop[];
  /** Playable flashbacks: offers, the one playing now, and those already lived (see flashbacks.ts). */
  flashbacks?: FlashbackState;
  /** Places Kan stays: safehouses, rooms, hideouts, camps (see safehouses.ts). */
  safehouses?: SafehouseState;
  /** The money Kan carries, and what moved it (see money.ts). */
  purse?: PurseState;
  /** Set once the save tracks which names Kan knows (names.ts); older saves get it on load. */
  namesVersion?: number;
};

/** One change to Kan's money (see money.ts). */
export type PurseEntry = {
  date: CalendarDate;
  /** Ryō, negative when Kan paid, lost or gave it away. */
  change: number;
  reason: string;
  /** The story stated his total and the count was set to it. */
  counted?: boolean;
};

export type PurseState = {
  /** Ryō Kan carries now. */
  ryo: number;
  /** The last 40 changes, oldest first. */
  history: PurseEntry[];
  /** An older save: the amount is the starting guess until the story states his total. */
  estimatedStart?: boolean;
};

export type SafehouseKind = 'own' | 'rented' | 'borrowed' | 'base' | 'camp';
export type SafehouseEnd = 'expired' | 'destroyed' | 'compromised' | 'withdrawn' | 'given-up' | 'left';

/** A place Kan stays (see safehouses.ts). */
export type Safehouse = {
  id: string;
  /** A short name: "the cave above the falls", "a room at the Tanzaku inn". */
  name: string;
  kind: SafehouseKind;
  /** state.location when it became his. */
  place: string;
  region?: string;
  placeId?: string;
  since: CalendarDate;
  /** The last time Kan was there. */
  lastVisit: CalendarDate;
  /** Nights (long rests) spent there. */
  nights: number;
  /** A rented room: paid until then. */
  until?: CalendarDate;
  /** A borrowed place: whose it is. */
  hostId?: string;
  hostName?: string;
  /** People (entity ids) and groups ("akatsuki", "the innkeeper") who know of it. */
  knownBy: string[];
  knownGroups: string[];
  stash: string[];
  upgrades: { name: string; since: CalendarDate }[];
  /** People living there (entity ids). */
  residents: string[];
  /** Found by someone Kan is hiding from. */
  compromised?: { on: CalendarDate; by: string };
  /** Searched while Kan was away; seen once he is back. */
  raided?: { on: CalendarDate; lost: string[]; seen: boolean };
  status: 'active' | 'ended';
  ended?: { on: CalendarDate; reason: SafehouseEnd; note?: string };
};

export type SafehouseState = {
  places: Safehouse[];
  /** The one Kan is at now. */
  current?: string;
};

/**
 * Kan's playable memories of his life before the story (see flashbacks.ts).
 * A flashback has its own clock and place; the present stands still while
 * it plays.
 */
export type FlashbackState = {
  /** Flashback ids already lived through; each plays once. */
  played: string[];
  /** When each flashback was last offered (present date). */
  offered: Record<string, CalendarDate>;
  /** The last offer of any flashback: at most one per in-story month. */
  lastOfferOn?: CalendarDate;
  /** An offer the reply showed, which Kan can still follow. */
  pending?: { id: string; logId: string; turnsLeft: number };
  /** The flashback playing now. */
  active?: ActiveFlashback;
  /** The flashback that just ended: the next present turn picks up from it. */
  returned?: { id: string; ending: string; forced?: boolean };
};

export type ActiveFlashback = {
  id: string;
  /** The memory's own clock. */
  date: CalendarDate;
  place: string;
  locationKind: LocationKind;
  /** The present moment Kan left. */
  startedOn: CalendarDate;
  /** Flashback turns narrated and applied so far. */
  turns: number;
  /** Everyone who was in the memory's scene (entity ids). */
  castIds: string[];
  /** How the memory moved people's feelings, summed; applied, capped, when it ends. */
  nudges: Record<string, number>;
  /** Weather the memory's own prose set. */
  weather?: { condition: WeatherCondition; text?: string };
  /** The present scene's pace and mode, put back when it ends. */
  presentPace?: ScenePace;
  presentSceneMode?: SceneModeState;
};

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'drizzle'
  | 'rain'
  | 'downpour'
  | 'storm'
  | 'fog'
  | 'snow'
  | 'blizzard'
  | 'sleet'
  | 'wind'
  | 'sandstorm'
  | 'heat'
  | 'humid';

/**
 * The weather a scene is played in, held so it stays the same through the
 * scene: the world's own weather for the region, or what the story changed
 * it to (a storm rolling in, a jutsu clearing the fog).
 */
export type WeatherLock = {
  /** A geography region id, or 'unknown'. */
  region: string;
  condition: WeatherCondition;
  /** The story's own words for it, when the story set it. */
  text?: string;
  since: CalendarDate;
  sceneSeq?: number;
  source: 'world' | 'story';
};

/** One stop on Kan's road (see mapData.ts). */
export type TravelStop = {
  /** state.location as the story gave it. */
  place: string;
  /** A geography region id, when the place names one or Kan has not left the last one. */
  region?: string;
  /** The map place it matches (a village, a shrine, a ruin). */
  placeId?: string;
  date: CalendarDate;
};

/** What the yearly calendar remembers (see yearly.ts). */
export type YearlyState = {
  /** Entity ids whose birthday you learned in the story (beyond the people you are close to). */
  knownBirthdays: string[];
  /** Yearly offers already made: key → the in-story year it was last offered. */
  offered: Record<string, number>;
};

export type VillageFaction = 'leaf' | 'sand' | 'mist' | 'cloud' | 'stone';
export type ReputationFaction = VillageFaction | 'akatsuki';

/** What one great village has on Kan (see reputation.ts). */
export type BingoEntry = {
  /** 0-100: how badly they want him, before cooling since lastDeedOn. */
  heat: number;
  /** When they wrote him into their bingo book. An entry is never removed. */
  listedOn?: CalendarDate;
  /** Their last new reason to want him; cooling counts from here. */
  lastDeedOn?: CalendarDate;
  lastReason?: string;
  /** True once Kan has seen or been told what they wrote about him. */
  known: boolean;
};

export type ReputationState = {
  villages: Partial<Record<VillageFaction, BingoEntry>>;
  /** -100..100: how the Akatsuki regard him. */
  akatsuki?: { standing: number; lastReason?: string; updatedOn?: CalendarDate };
  /** The last few changes, newest last. */
  recent: { faction: ReputationFaction; change: number; reason?: string; date: CalendarDate }[];
};

/** Someone's grudge against Kan, kept on their bond (see grudges.ts). */
export type Grudge = {
  since: CalendarDate;
  reason: string;
  /** 0-100, before the stewing since updatedOn. */
  heat: number;
  updatedOn: CalendarDate;
  lastStrike?: CalendarDate;
  strikes: number;
};

/**
 * One personal letter. `to-kan` letters come from someone Kan is close to
 * (a reply to his own letter, or unprompted); `from-kan` letters are the ones
 * he sends, which take days to arrive and move the recipient's bond.
 */
export type Letter = {
  id: string;
  direction: 'to-kan' | 'from-kan';
  entityId: string;
  name: string;
  sentOn: CalendarDate;
  arrivesOn: CalendarDate;
  /** What the letter says, in a few words (Kan's own letters). */
  gist?: string;
  /**
   * The letter itself, kept for the archive: Kan's own words (only spelling
   * and punctuation tidied), or the words the narrator gave the writer.
   */
  text?: string;
  /**
   * travelling: on its way; delivered: it reached its reader; lost: it never
   * arrived (see lostReason); unsent: a letter to the dead, kept, never sent.
   */
  status: 'travelling' | 'delivered' | 'lost' | 'unsent';
  /** Why a lost letter never arrived. */
  lostReason?: string;
  /** A to-kan letter answering one of Kan's. */
  replyTo?: string;
  deliveredOn?: CalendarDate;
  /** How it travels; sets its speed and how safe it is (see letters.ts). */
  carrier?: LetterCarrierKind;
  /** Written in a cipher. */
  coded?: boolean;
  /** Where the reader was thought to be when it set out (to notice they moved on). */
  toRegion?: string;
  /** Someone read it on the way (see letters.ts); Kan does not know until it comes back to him. */
  interceptedBy?: Interceptor;
  /** A birthday letter. */
  occasion?: 'birthday';
};

export type LetterCarrierKind = 'bird' | 'ninken' | 'summon' | 'courier' | 'dead-drop' | 'hand';

export type Interceptor = 'root' | 'akatsuki' | VillageFaction;

export type PostState = {
  letters: Letter[];
  /** When a letter last reached Kan. */
  lastLetterIn?: CalendarDate;
};

/** A deed people saw, which travels as talk and shapes what they call Kan (see renown.ts). */
export type Deed = {
  id: string;
  date: CalendarDate;
  text: string;
  /** Whose people saw it, when a village or the Akatsuki did. */
  faction?: ReputationFaction;
  /** Where it happened (geography.ts region). */
  region?: string;
  /** How much it moved the world's view of Kan (the reputation change, or a few points). */
  weight: number;
};

/** Who calls Kan by a name of their own. */
export type Audience = VillageFaction | 'akatsuki' | 'rain' | 'underworld';

export type Epithet = {
  name: string;
  since: CalendarDate;
  /** The theme it grew from (renown.ts), or 'story' when the story named him. */
  theme: string;
  /** Kan has heard himself called this. */
  known: boolean;
  /** Names it had before, oldest first. */
  history?: { name: string; since: CalendarDate }[];
};

export type RenownState = {
  deeds: Deed[];
  epithets: Partial<Record<Audience, Epithet>>;
};

/**
 * A choice that could come back later (see consequences.ts): who was
 * involved, who saw it, what they would want, and roughly when and where it
 * could return. It returns only if that is realistic, and only as an offer.
 */
export type ConsequenceSeed = {
  id: string;
  kind: ConsequenceKind;
  createdOn: CalendarDate;
  /** The person it comes back through, when the save knows them. */
  entityId?: string;
  /** Who it is, in words: a name, or "the bandit you spared at the ford". */
  who: string;
  /** What Kan did. */
  what: string;
  /** What they would want now. */
  want?: string;
  /** Ids of anyone else who saw it. */
  witnesses: string[];
  /** A village or the Akatsuki it could reach. */
  faction?: ReputationFaction;
  /** Where it happened (geography.ts region). */
  region?: string;
  /** Not before this date. */
  after: CalendarDate;
  /** It fades if it has not come back by this date. */
  before: CalendarDate;
  status: 'waiting' | 'returned' | 'faded';
  /** The letter it came from (an interception). */
  letterId?: string;
  /** The safehouse someone found out about (kind found). */
  safehouseId?: string;
  /** When it was last offered to the narrator. */
  offeredOn?: CalendarDate;
  resolvedOn?: CalendarDate;
};

export type ConsequenceKind =
  | 'spared'
  | 'lie'
  | 'helped'
  | 'witness'
  | 'betrayal'
  | 'humiliated'
  | 'promise'
  | 'debt'
  | 'intercepted'
  | 'found';

export type RawLogEntry = {
  /** The state call failed twice; this turn's state was read from the prose (Debug panel). */
  stateFromFallback?: boolean;
  id: string;
  turn: number;
  kind: LogKind;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  promptTokens: number;
  completionTokens: number;
  chapter: number;
  scene: string;
  inStoryDate: CalendarDate;
  createdAt: number;
  image?: string | null;
  /** In-story seconds this reply moved the clock (assistant story turns). */
  elapsedSeconds?: number;
  /** True once the player corrected elapsedSeconds by hand. */
  timeCorrected?: boolean;
  /** Which scene this turn belongs to (GameState.sceneSeq when it was applied). */
  sceneSeq?: number;
  /** Who was in the scene this turn (entity ids, from the scene cast, Kan excluded). */
  sceneCastIds?: string[];
  /** How the scene image on this entry was made, so drift can be traced and it can be redone. */
  imageMeta?: SceneImageMeta;
  /** The scene mode this reply was narrated in (assistant story turns). */
  sceneMode?: SceneModeName;
  /** The state tracker judged this beat visually striking (image_worthy). */
  imageWorthy?: boolean;
  /** Quick moves offered under a fight reply (written by the state tracker). */
  fightOptions?: string[];
  /** A turn played inside a flashback: which one, and the memory's clock when it began. */
  flashback?: { id: string; date: CalendarDate };
  /** A flashback offered to the narrator on this reply (see flashbacks.ts). */
  flashbackOffer?: string;
};

export type SceneImageMeta = {
  prompt: string;
  /** The short "who did what to whom" line the image followed. */
  action: string;
  /** The scrapbook caption, written in second person with the action line. */
  caption?: string;
  /** The director's camera line (shot, angle, lens, composition, light). */
  shot?: string;
  /** The shot type read from `shot`, for the variety tracker. */
  shotType?: string;
  /** A retouch: the player's tweak, and the stored image it was made from. */
  tweak?: string;
  previous?: string;
  /** The swapped-roles check: true when it found the roles reversed or extra people. */
  mightBeOff?: boolean;
  /** The references sent, in order: their kind, whose they are, and the stored image when there is one. */
  references: { kind: string; name?: string; ref?: string }[];
  model: string;
  createdAt: number;
};

export type EntityRecord = {
  id: string;
  name: string;
  type: EntityType;
  aliases: string[];
  birthday?: { month: number; day: number };
  /** True when canon gives no birthday and the app chose one (see yearly.ts). */
  birthdayInvented?: boolean;
  birthYear?: number;
  age?: number;
  role?: string;
  personality?: string;
  speechStyle?: string;
  status?: string;
  notes?: string;
  mood?: string;
  /**
   * Their base appearance: the lasting look (canon or original design), changed
   * only by real lasting changes like aging, scars or new clothing.
   */
  appearance?: string;
  /**
   * How they look right now: what they are wearing, wet, bloodied, Sharingan
   * active. Cleared when the scene changes or after rest, unless renewed.
   */
  currentLook?: string;
  /** The scene (GameState.sceneSeq) currentLook was last set in. */
  currentLookSeq?: number;
  /** Where the story last said they are or are going, when not with Kan. */
  whereabouts?: string;
  lastSeen?: CalendarDate;
  /** Where Kan last saw this person (state.location at the time). */
  lastSeenAt?: string;
  /**
   * Set once this person has died in the story (see deaths.ts). `known` is
   * whether Kan has seen it or been told; a canon death also becomes known
   * when the news of `canonEventId` reaches him.
   */
  deceased?: {
    date?: CalendarDate;
    cause?: string;
    known?: boolean;
    canonEventId?: string;
  };
  /** male, female, or unknown when the story hasn't said. */
  gender?: Gender;
  /**
   * Whether Kan (straight: only women) could ever win their heart:
   * winnable, lore-locked (a woman whose heart belongs elsewhere), or
   * not-applicable (men, and women not attracted to men). Kan has none.
   */
  romanceAccessibility?: 'winnable' | 'lore-locked' | 'not-applicable';
  canonDevotion?: string;
  orientation?: string;
  /**
   * false for canon cast members loaded at the start whom you have not met
   * yet: they are known to the state tracker but stay off the bonds list.
   * Missing means met (older saves, and everyone the story introduced).
   */
  met?: boolean;
  /**
   * Older saves only: spoiler names from before identities (names.ts).
   * Dropped on load by `ensureNames`.
   */
  hiddenAliases?: HiddenAlias[];
  /** How their name splits (see names.ts); worked out from the name when missing. */
  nameParts?: NameParts;
  /**
   * More than one identity (Tobi: persona "Tobi", claimed "Madara Uchiha",
   * true "Obito Uchiha"), with who in the world knows each (names.ts).
   */
  identities?: Identity[];
  /**
   * What Kan knows of their name. Missing means he knows it (older saves, and
   * anyone the story introduced by name). `{}` means nothing yet: he sees
   * only their label.
   */
  known?: NameKnowledge;
  /** The story has not given them a name yet: `name` is only their label. */
  unnamed?: true;
  /**
   * "minor": a one-scene character (a bounty target, a shopkeeper). No bond
   * card and no portrait unless they come back in a second scene, which
   * makes them an ordinary character.
   */
  tier?: 'minor';
  /**
   * Set while this person travels with Kan (see companions.ts): they are in
   * every scene until the story shows them leave, and the scenes they share
   * move their bond.
   */
  companion?: Companion;
  /** Small events in their own life while Kan was elsewhere (see lives.ts). */
  lifeEvents?: LifeEvent[];
  /** Set when Kan meets them again after a long time apart (see lives.ts). */
  reunion?: Reunion;
  tags: string[];
};

/**
 * Something that happened in someone's own life away from Kan: a promotion,
 * an injury, a move, a new team. `world` events are made by the engine as
 * time passes; `story` ones were stated on the page. `known` once Kan has
 * learned of it (he met them again, or a letter told him).
 */
export type LifeEvent = {
  date: CalendarDate;
  text: string;
  kind: LifeEventKind;
  source: 'world' | 'story';
  known?: boolean;
};

export type LifeEventKind =
  | 'mission'
  | 'injury'
  | 'posting'
  | 'team'
  | 'loss'
  | 'skill'
  | 'promotion'
  | 'move'
  | 'work'
  | 'family'
  | 'romance'
  | 'growth'
  | 'other';

/** Kan met them again after REUNION_DAYS apart: when, and when he had last seen them. */
export type Reunion = {
  on: CalendarDate;
  lastSeen: CalendarDate;
  lastSeenAt?: string;
  /** The scene it happened in (GameState.sceneSeq). */
  seq?: number;
};

export type Gender = 'male' | 'female' | 'unknown';

export type NameParts = { given?: string; family?: string; full?: string };

export type NamePart = 'given' | 'family' | 'full' | 'identity';

export type NameHow = 'introduced' | 'told' | 'written' | 'overheard' | 'recognised' | 'news' | 'start';

export type FameLevel = 'sight' | 'heard' | 'unknown';

export type IdentityKind = 'true' | 'claimed' | 'persona';

export type IdentityKnower = {
  /** Canon names or entity ids. */
  who: string[];
  /** From this milestone (in the world, not Kan's hearing of it). */
  from?: string;
  /** Or from this in-story date (Kan told them). */
  on?: CalendarDate;
  /** They know the truth but call him by the name he goes by (Zetsu). */
  playsAlong?: boolean;
  note?: string;
};

export type Identity = {
  name: string;
  kind: IdentityKind;
  /** Kan learns this identity when one of these milestones reaches him. */
  learnedWith?: string[];
  /** Who in the world knows them by this name, and from when. */
  knownBy?: IdentityKnower[];
  /** Everyone knows it from this milestone ("start": from the beginning). */
  publicFrom?: string;
  /** The identity exists only from this milestone (Tobi's act). */
  existsFrom?: string;
  /** Once this milestone has happened, the name reads differently (Masked Madara). */
  renamed?: { after: string; name: string };
  /** false: never added to aliases for matching (a name another person owns). */
  alias?: false;
  /** For the narrator only. */
  note?: string;
};

export type NameKnowledge = {
  /** A short description for someone Kan cannot name yet ("the red-haired girl"). */
  label?: string;
  given?: boolean;
  family?: boolean;
  /** Names of the identities he has learned. */
  identities?: string[];
  history?: { name: string; part: NamePart; how: NameHow; date: CalendarDate }[];
};

export type HiddenAlias = {
  name: string;
  /** Canon milestone whose news (or engagement) reveals this name to Kan. */
  revealedBy?: string;
};

export type Companion = {
  /** When they started travelling with Kan. */
  since: CalendarDate;
  /** Where they joined (state.location at the time). */
  sinceLocation?: string;
  /** Why, in a few words ("assigned as your Akatsuki partner"). */
  reason?: string;
  /** Scenes that ended with them at Kan's side. */
  sharedScenes: number;
  /** Shared-time progress toward the next bond step (see companions.ts). */
  bondPoints: number;
};

export type EventRecord = {
  id: string;
  chapter: number;
  scene: string;
  inStoryDate: CalendarDate;
  summary: string;
  /** Short name shown in the Journal; `summary` is then the description. */
  title?: string;
  /** The chapter summary this memory was written from. */
  summaryId?: string;
  importance: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  pinned: boolean;
  sourceLogId: string | null;
  /**
   * For a scene-end memory (sourceLogId null): the story turn it was made
   * on, so the chapter summary built from that turn takes it in.
   */
  turnLogId?: string;
  /**
   * The same memory as people who were there remember it, limited to what
   * they could see or hear, in their own voice (see povMemories.ts). Only
   * major characters, and only when the scene mattered to them.
   */
  povs?: { entityId: string; text: string }[];
  createdAt: number;
};

export type JutsuRecord = {
  id: string;
  name: string;
  user: string;
  chakraNature: string;
  effect: string;
  visual: string;
  firstSeen: CalendarDate;
  lastSeen: CalendarDate;
  timesUsed: number;
  description: string;
  tags: string[];
};

export type EventEntityRecord = {
  eventId: string;
  entityId: string;
  role: EventEntityRole;
};

/** One side of a bond: -10..10 and a short note. */
export type BondSide = { affinity: number; note: string };

export type BondRecord = {
  id: string;
  entityId: string;
  characterName: string;
  /** How they feel about Kan: always the same as theirFeelings.affinity. */
  affinity: number;
  status: string;
  lastKeyEventId: string | null;
  /** Always the same as theirFeelings.note. */
  note: string;
  /** How they feel about you, from what they could see or hear. */
  theirFeelings?: BondSide;
  /** How you feel about them; your inner thoughts move only this side. */
  yourFeelings?: BondSide;
  isMajor: boolean;
  relationship?: RelationshipStage;
  attraction?: Attraction;
  romanceNote?: string;
  /** Set while this person holds a grudge against Kan (grudges.ts). */
  grudge?: Grudge;
  /** The scene (GameState.sceneSeq) the relationship last stepped up in (bondGuard.ts). */
  stepSceneSeq?: number;
  /** The scene attraction last rose in. */
  attractionSceneSeq?: number;
  /** When "romantic interest" began; "lover" waits 30 in-story days after it. */
  romanticSince?: CalendarDate;
  updatedInStoryDate: CalendarDate;
};

export type FactRecord = {
  id: string;
  /** Who the fact is about. Always set for new facts (Kan when nobody else). */
  subjectEntityId: string | null;
  type: FactType;
  text: string;
  /** Entity ids of the people who know it. */
  whoKnows: string[];
  /** Groups who know it, as tags ("hidden-leaf-leadership", "anbu-command"). */
  whoKnowsGroups?: string[];
  validFrom: CalendarDate;
  /** Set when the fact ended: replaced, contradicted, expired. Only facts without it are active. */
  validTo: CalendarDate | null;
  /** confirmed: it happened. claimed: someone said so (see claimedBy). */
  confidence: 'confirmed' | 'rumored' | 'claimed';
  /** Entity id of whoever claimed it, for confidence "claimed". */
  claimedBy?: string;
  /** A temporary condition ends on its own at this date unless renewed. */
  expiresAt?: CalendarDate;
  /** A temporary condition that ends at the next sleep or long rest. */
  untilRest?: boolean;
  /** The fact this one replaced, if any. */
  supersedes?: string;
  sourceEventId: string | null;
  /** The story turn (assistant log entry) that recorded it. */
  sourceLogId?: string;
};

export type ThreadRecord = {
  id: string;
  type: ThreadType;
  title: string;
  description: string;
  status: 'open' | 'resolved';
  openedAt: CalendarDate;
  resolvedAt: CalendarDate | null;
  importance: 1 | 2 | 3 | 4 | 5;
  participants: string[];
  /** The same people as entity ids. */
  participantIds?: string[];
  sourceEventId: string | null;
  /** The story turn (assistant log entry) that opened it. */
  sourceLogId?: string;
};

export type LoreRecord = {
  id: string;
  keywords: string[];
  priority: number;
  text: string;
  enabled: boolean;
  /** Narrator-only guidance; never shown in the Journal. */
  hidden?: boolean;
  /** Always in the narrator's prompt, whatever the turn mentions (geography, say). */
  always?: boolean;
  /** Only once this holds (see loreActive). */
  activeAfter?: LoreCondition;
  /** Only until this holds. */
  activeUntil?: LoreCondition;
};

/**
 * Something the story reaches. Every field given must hold.
 * - milestone: a canon milestone Kan completed or took part in
 * - thread / threadStatus: a thread (by title) with that status (default resolved)
 * - fact: an active fact containing this text
 * - flag: a state flag the app works out (see LORE_FLAGS in lore.ts)
 */
export type LoreCondition = {
  milestone?: string;
  thread?: string;
  threadStatus?: 'open' | 'resolved';
  fact?: string;
  flag?: LoreFlag;
};

export type LoreFlag = 'hasSharingan' | 'hasMangekyo' | 'knowsIzumiDead' | 'headbandScratched' | 'joinedAkatsuki' | 'inRomance';

export type SummaryRecord = {
  id: string;
  level: SummaryLevel;
  range: {
    fromEventId: string;
    toEventId: string;
    from: CalendarDate;
    to: CalendarDate;
  };
  text: string;
  /** Short title written by the summary model. */
  title?: string;
  /** The chapter number this summary closes (chapter summaries). */
  chapter?: number;
  tokenCount: number;
  eventIds: string[];
  createdAt: number;
  /** Story log entries this summary was written from (chapter summaries). */
  sourceLogIds?: string[];
  /** Chapter summaries this summary rolled up (arc and year summaries). */
  sourceSummaryIds?: string[];
};

/**
 * A background memory step that runs after a turn's state is already saved.
 * Jobs live in the save so a failed or interrupted step survives a reload
 * and can be retried from the story screen.
 */
export type MemoryJobKind = 'state' | 'timeSkip' | 'scene' | 'arc' | 'year' | 'saga' | 'flashback';

export type MemoryJob = {
  id: string;
  kind: MemoryJobKind;
  /** queued = waiting or running, failed = needs a retry. */
  status: 'queued' | 'failed';
  /** The narrator reply this job belongs to. */
  turnLogId: string;
  /** state: the player's action for that turn. */
  userMessage?: string;
  /** scene: the story messages to summarize. */
  logIds?: string[];
  /** arc: the chapter summaries to roll up. saga: the arc summary to fold in. */
  summaryIds?: string[];
  /** flashback: the memory being written up (see flashbacks.ts). */
  flashbackId?: string;
  /** timeSkip: the jump being summarized. */
  fromDate?: CalendarDate;
  toDate?: CalendarDate;
  attempts: number;
  error?: string;
  createdAt: number;
};

export type MemoryIndex = {
  eventsByTag: Record<string, string[]>;
  eventsByEntity: Record<string, string[]>;
  eventsByDate: Record<string, string[]>;
  factsBySubject: Record<string, string[]>;
  threadsByStatus: Record<string, string[]>;
  loreByKeyword: Record<string, string[]>;
};

export type Settings = {
  narrationModel: string;
  summaryModel: string;
  extractionModel: string;
  imageModel: string;
  /** What the image model accepts, looked up when it is picked. */
  imageModelCaps?: ImageModelCaps | null;
  contextMessages: number;
  retrievalLimit: number;
  autoSummarizeThreshold: number;
  temperature: number;
  maxTokens: number;
  canonProgress: boolean;
  /** Upper bound on the narrator prompt, in estimated tokens. */
  promptTokenBudget: number;
  /** Frames each scene image (the "director"); empty = the narrator model. */
  imageDirectorModel?: string;
  /** Check each scene image for swapped roles and retry once (default on). */
  imageCheck?: boolean;
  /** Paint two takes and let you keep one (default off). */
  imageTwoTakes?: boolean;
};

export type CanonProgress = {
  version?: number;
  baselineDate?: CalendarDate;
  baselineTurn?: number;
  completed: string[];
  active: string[];
  engaged: string[];
  expired?: string[];
  heard?: Record<string, { from: string; date: CalendarDate }>;
  /** True when the last advance was held back because Kan was mid-fight. */
  heldForCombat?: boolean;
};

export type { RelationshipStage } from './romance';
import type { RelationshipStage } from './romance';

export type Attraction = 'none' | 'warm' | 'strong';

export type AppDatabase = {
  schemaVersion: 1;
  meta: {
    slotId: string;
    slotName: string;
    createdAt: number;
    updatedAt: number;
    /** Story entries (rawLog, kind story) when the save was last exported; drives the export reminder. */
    exportedAtTurn?: number;
    /** Real-world time of the last export. */
    exportedAt?: number;
  };
  settings: Settings;
  rawLog: RawLogEntry[];
  entities: EntityRecord[];
  jutsuRecords: JutsuRecord[];
  events: EventRecord[];
  eventEntities: EventEntityRecord[];
  bonds: BondRecord[];
  facts: FactRecord[];
  threads: ThreadRecord[];
  loreEntries: LoreRecord[];
  summaries: SummaryRecord[];
  state: GameState;
  indices: MemoryIndex;
  snapshots: TurnSnapshot[];
  portraits?: PortraitRecord[];
  /** Portraits of the people in your bonds (see characterPortrait.ts). */
  characterPortraits?: CharacterPortraitRecord[];
  /** Face references you chose for people, kept only on this device. */
  characterFaces?: CharacterFaceRecord[];
  memoryJobs?: MemoryJob[];
};

export type PortraitOutfit = 'black' | 'akatsuki';

export type PortraitExpression = 'calm' | 'grim' | 'angry' | 'tired' | 'warm' | 'sad';

export type PortraitSetting = 'village' | 'wilds' | 'road' | 'indoors';

export type PortraitSignature = {
  age: number;
  outfit: PortraitOutfit;
  expression: PortraitExpression;
  setting: PortraitSetting;
};

export type CharacterPortraitSignature = {
  /** null when their age is unknown. */
  age: number | null;
  expression: PortraitExpression;
  appearance: string;
};

export type CharacterPortraitRecord = {
  id: string;
  entityId: string;
  /** Image reference (img:...) or a data URI on platforms without IndexedDB. */
  image: string;
  signature: CharacterPortraitSignature;
  /** Whether their face reference was sent with this painting. */
  usedFace: boolean;
  inStoryDate: CalendarDate;
  createdAt: number;
};

export type CharacterFaceRecord = {
  entityId: string;
  /** Image reference (img:...) or a data URI. */
  image: string;
  addedAt: number;
};

export type PortraitRecord = {
  id: string;
  /** Image reference (img:...) or a data URI on platforms without IndexedDB. */
  image: string;
  signature: PortraitSignature;
  inStoryDate: CalendarDate;
  location: string;
  createdAt: number;
};

export type TurnSnapshot = {
  id: string;
  turn: number;
  database: AppDatabase;
  createdAt: number;
};

export type SceneInfo = {
  ended: boolean;
  summary?: string;
  tags?: string[];
  entities?: string[];
  importance?: 1 | 2 | 3 | 4 | 5;
  imageWorthy?: boolean;
};

export type TurnDiff = {
  state?: {
    mood?: string;
    worldDescription?: string;
    jutsuAdded?: string[];
    jutsuRemoved?: string[];
    inventoryAdded?: string[];
    inventoryRemoved?: string[];
    location?: string;
    locationKind?: LocationKind;
    inStoryDate?: CalendarDate;
    elapsedSeconds?: number;
    clockTime?: { hour: number; minute: number };
    scenePace?: ScenePace;
    canonPoint?: string;
    chapter?: number;
    scene?: string;
    sceneCast?: string[];
  };
  /** The state model judged this beat visually striking (queues a scene summary). */
  imageWorthy?: boolean;
  /** How this turn played, and who Kan was talking with (ids from the tracker). */
  beat?: { kind: SceneBeat; with: string[] };
  /** Moves Kan could make next while a fight goes on. */
  fightOptions?: string[];
  /** This turn opens a new chapter with this title (the state model's chapter_title). */
  chapterTitle?: string;
  /** A flashback offered this turn showed its trigger, Kan followed one into the memory, or the memory ended. */
  flashback?: 'offered' | 'started' | 'ended';
  /** Chakra natures Kan gained this turn: found innate, or taken with Thousand Souls. */
  naturesGained?: { nature: string; source: 'innate' | 'thousand-souls'; from?: string }[];
  /** Abilities Kan gained or that changed stage this turn (Sharingan 2 tomoe, Mangekyō...). */
  abilitiesChanged?: { name: string; stage?: string }[];
  /**
   * People the prose seems to show, read by the app when the state reply was
   * unreadable. Only a suggestion: it never marks anyone met or seen, and
   * never changes the scene cast (only characters_present does).
   */
  suggestedCast?: string[];
  entities?: {
    /** Set when the state tracker referred to a known character by ID. */
    entityId?: string;
    /** From new_characters with is_new: true — the only entries allowed to create someone. */
    isNew?: boolean;
    name: string;
    age?: number;
    role?: string;
    personality?: string;
    speechStyle?: string;
    mood?: string;
    /** New characters: their base look. Updates: their look right now (currentLook). */
    appearance?: string;
    /** A real lasting change to their base look (aging, a scar, new clothes for good). */
    lastingAppearance?: string;
    /** Where the story says they are or are going. */
    whereabouts?: string;
    /** character_updates only, original characters only: who they are has truly changed. */
    personalityChange?: string;
    speechStyleChange?: string;
    gender?: Gender;
    /** A one-scene character (see EntityRecord.tier). */
    minor?: boolean;
    /** Who they are drawn to: men, women, both, none, or unknown. */
    attractedTo?: 'men' | 'women' | 'both' | 'none' | 'unknown';
    /** A short description of how they look to Kan, for someone he cannot name. */
    label?: string;
    /** false: Kan doesn't know their name yet (a stranger: `name` is then only their label). */
    nameKnown?: boolean;
  }[];
  jutsuUsed?: {
    name: string;
    user: string;
    chakraNature?: string;
    effect?: string;
    visual?: string;
    description?: string;
  }[];
  bonds?: {
    /** Set when the state tracker referred to a known character by ID. */
    entityId?: string;
    character: string;
    /** Change to how they feel about you (their side). */
    affinityDelta?: number;
    status?: string;
    /** Their side's note. */
    note?: string;
    /** Change to how you feel about them (your side). */
    yourDelta?: number;
    yourNote?: string;
    isMajor?: boolean;
    relationship?: string;
    attraction?: string;
    romanceNote?: string;
  }[];
  facts?: {
    action: 'add' | 'end';
    type?: FactType;
    text: string;
    subject?: string;
    whoKnows?: string[];
    validFrom?: CalendarDate;
    /** Refs ("f-…") or ids of active facts this one replaces. */
    supersedes?: string[];
    /** How long it holds: lasting (default), until the next rest, or a number of days. */
    lasts?: 'lasting' | 'until_rest' | 'days';
    days?: number;
    /** Who said it, when it is only a claim. */
    claimedBy?: string;
  }[];
  /** Refs or ids of active facts that stopped being true this turn. */
  factsEnded?: string[];
  threads?: {
    action: 'open' | 'update' | 'resolve';
    title: string;
    description?: string;
    type?: ThreadType;
    importance?: 1 | 2 | 3 | 4 | 5;
    participants?: string[];
  }[];
  /** People who died this turn, or whose death Kan saw or was told of. */
  deaths?: { entityId?: string; name: string; cause?: string }[];
  /** People genuinely brought back to life (never Edo Tensei). */
  revived?: { entityId?: string; name: string }[];
  /** People who start travelling with Kan this turn. */
  companionsJoined?: { entityId?: string; name: string; reason?: string }[];
  /** Companions who part ways with Kan this turn. */
  companionsLeft?: { entityId?: string; name: string; reason?: string }[];
  canonCompleted?: string[];
  canonEngaged?: string[];
  canonPassed?: string[];
  newsRelayed?: { id: string; from?: string }[];
  /** Letters or messages Kan sent this turn to someone far away (or wrote to the dead). */
  lettersSent?: {
    entityId?: string;
    name: string;
    gist?: string;
    /** The letter as Kan wrote it, only spelling and punctuation tidied. */
    text?: string;
    carrier?: LetterCarrierKind;
    coded?: boolean;
  }[];
  /** People whose letter reached Kan on the page this turn, with its words. */
  lettersReceived?: { entityId?: string; name: string; text?: string }[];
  /** Things in someone's own life away from Kan that this turn revealed. */
  lifeEvents?: { entityId?: string; name: string; text: string }[];
  /** A name the story called Kan by this turn, and whose name it is. */
  epithet?: { audience: Audience; name: string };
  /** Choices this turn that could plausibly come back later. */
  consequences?: {
    kind: ConsequenceKind;
    entityId?: string;
    who: string;
    what: string;
    want?: string;
    witnesses?: string[];
    faction?: ReputationFaction;
    when?: 'weeks' | 'months' | 'years';
  }[];
  /** Ids of offered consequences that came back on the page this turn. */
  consequencesReturned?: string[];
  /** The weather as the page changed it this turn, in a few words. */
  weather?: string;
  /** A place Kan settles in or sleeps at, and what changed there (see safehouses.ts). */
  safehouse?: SafehouseDiff;
  /** Changes to Kan's own money this turn, in ryō (negative when he pays). */
  money?: { amount: number; reason: string }[];
  /** The total Kan has, when the prose states it. */
  moneyCounted?: number;
  /** What a village or the Akatsuki now has on Kan. */
  reputation?: { faction: ReputationFaction; change: number; reason?: string }[];
  /** People whose birthday Kan learned this turn (they said it, someone told him). */
  birthdaysLearned?: { entityId?: string; name: string }[];
  /** Names Kan heard, read or recognised this turn (names.ts). */
  namesLearned?: { entityId?: string; character: string; name: string; part: NamePart; how: NameHow }[];
  /** Someone in the scene learned another identity of a person (Kan told Deidara who Tobi is). */
  namesTold?: { entityId?: string; character: string; name: string; toldTo: string[] }[];
  /** Villages whose bingo-book entry on Kan he saw or was told of this turn. */
  bountySeen?: VillageFaction[];
  /** Grudges started, acted on, settled or forgiven this turn. */
  grudges?: {
    entityId?: string;
    name: string;
    event: 'wronged' | 'struck' | 'settled' | 'forgiven';
    reason?: string;
  }[];
  scene?: SceneInfo;
};

export type SafehouseDiff = {
  /** A listed safehouse id; none means where Kan is now. */
  id?: string;
  name?: string;
  kind?: SafehouseKind;
  paidNights?: number;
  host?: string;
  stored?: string[];
  taken?: string[];
  upgrade?: string;
  shownTo?: string[];
  residentsJoined?: string[];
  residentsLeft?: string[];
  ended?: Exclude<SafehouseEnd, 'left'>;
};

export type PromptBundle = {
  stable: {
    system: string;
    characterSheet: string;
    state: string;
    bonds: string;
    facts: string;
    threads: string;
    lore: string;
  };
  dynamic: {
    arcSummary: string | null;
    retrievedMemories: EventRecord[];
    recentMessages: RawLogEntry[];
  };
  estimatedTokens: number;
};

export type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  /**
   * Optional split of `content` into blocks, in order. A block marked `cache`
   * ends a cacheable prefix: providers that need explicit breakpoints
   * (Anthropic, Gemini) get a cache_control marker after it. `content` is
   * always the blocks joined, so token estimates and the debug view stay the same.
   */
  parts?: { text: string; cache?: boolean }[];
  /** Images sent with a user message (data URIs), for vision calls. */
  images?: string[];
};
