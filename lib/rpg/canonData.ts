// Canon timeline data. Pure data: no logic lives here (see canon.ts for the engine).
//
// In-story timeline spine: Kan is 13 in year 13 (the massacre year) and matches
// Itachi's age throughout. Year 17-18 is Part 1, year 21 is Itachi's death,
// year 22-23 is the Fourth War.
//
// A world milestone only fires once every earlier world milestone has fired.
// CANON_MILESTONES is sorted by opening date at the bottom of this file, so
// entries can be written in any order; give same-day events a distinct day
// when one must come first.
//
// The Fourth War runs on its canon clock: four days, 23/1/10 to 23/1/13.

import type { CalendarDate, ThreadType } from './types';
import { STAGE_TWO_PERSONAL, STAGE_TWO_WORLD } from './canonDataMore';

export type CanonProgress = {
  version?: number;
  baselineDate?: CalendarDate;
  /** Legacy; canon follows in-story dates only. Kept so old saves load unchanged. */
  baselineTurn?: number;
  completed: string[];
  active: string[];
  engaged: string[];
  expired?: string[];
  heard?: Record<string, { from: string; date: CalendarDate }>;
  /** True when the last advance was held back because Kan was mid-fight. */
  heldForCombat?: boolean;
};

export type CanonThreadSeed = {
  title: string;
  description: string;
  type: ThreadType;
  participants?: string[];
  importance?: 1 | 2 | 3 | 4 | 5;
};

export type CanonEncounter = {
  who: string;
  where: string;
  context: string;
};

/** Who could realistically know about an event, which decides who can tell Kan. */
export type CanonKnowledge = 'public' | 'village' | 'akatsuki' | 'witnesses' | 'secret';

export type CanonWindow = { year: number; month: number; day?: number };

export type CanonJutsuGrant = {
  name: string;
  chakraNature: string;
  effect: string;
  visual: string;
  description: string;
  tags?: string[];
};

export type CanonMilestone = {
  id: string;
  era: string;
  title: string;
  description: string;
  /** World-state line written to `state.canonPoint` when this fires. */
  canonPoint?: string;
  /**
   * A fixed visual hint for scene images painted at (or just after) this
   * moment, so its pictures always land (see imageDirection.ts).
   */
  artDirection?: string;
  from: CanonWindow;
  to?: CanonWindow;
  /** Where it happens. Defaults: region "the shinobi world", location = region. */
  region?: string;
  location?: string;
  /** Default 'public'. */
  knowledge?: CanonKnowledge;
  /** Named confidants for 'secret' events (otherwise derived from knowledge). */
  bearers?: string[];
  major?: boolean;
  /** Personal beat: offered to the player, never fired automatically. */
  playerDriven?: boolean;
  /** Personal beat offered ahead of every other open beat while its window is open. */
  priority?: boolean;
  /** Personal beat offered only once this milestone has actually happened. */
  after?: string;
  /** A personal beat is offered only while this holds (see lore.ts conditions). */
  requires?: import('./types').LoreCondition;
  /** Abilities you gain when it completes (recorded on your sheet with a stage). */
  grantsAbilities?: { name: string; stage: string }[];
  /**
   * The moment on the page that completes this beat, for the state tracker.
   * Until then it is only accepted (canon_engaged) and none of its facts,
   * threads or canon point are true yet.
   */
  completesWhen?: string;
  /** Jutsu Kan gains when this beat happens (recorded as signature jutsu). */
  grantsJutsu?: CanonJutsuGrant[];
  facts: string[];
  /**
   * Who must be alive for it to happen as written. Optional: by default the
   * canon people its title and description name (canonRoles.ts).
   */
  needs?: string[];
  /**
   * People this milestone kills, by name. When it fires they are marked dead
   * on their own record (deaths.ts); anyone the save does not have is skipped.
   */
  deaths?: string[];
  /** The dead this milestone brings back through Edo Tensei, and who holds the jutsu. */
  reanimates?: { names: string[]; by: string };
  /** Edo Tensei ends: for everyone one caster holds (`by`), or for everyone (`all`), sparing `except`. */
  releases?: { by?: string; all?: boolean; except?: string[] };
  /** People whose status this milestone changes, by exact name ("Sealed", "Free"). */
  setsStatus?: Record<string, string>;
  encounter?: CanonEncounter;
  attendanceFact?: string;
  opensThreads?: CanonThreadSeed[];
  resolvesThreadTitles?: string[];
};

export const CANON_VERSION = 3;

export const CANON_ERA_ORDER = [
  'Ashes',
  'The shadow war',
  'Part 1',
  'The hidden years',
  'Shippuden',
  'The sky falls',
  'The Fourth War',
  'After',
];

/**
 * What an era is called anywhere the player or the narrator reads it: names
 * from inside the world, never the series' part names (audit 6b.2). The
 * keys stay as they are in the data.
 */
const ERA_TITLE: Record<string, string> = {
  'Part 1': 'The new generation',
  Shippuden: 'The hunt for the beasts',
};

export function eraTitle(era: string): string {
  return ERA_TITLE[era] ?? era;
}

// ---------------------------------------------------------------------------
// How word travels
// ---------------------------------------------------------------------------

export const BEARERS_BY_KNOWLEDGE: Record<CanonKnowledge, string[]> = {
  // The fixed fallbacks. Anyone in the scene who could know comes first, and
  // the dead are dropped when the list is used (see newsDelivery.ts).
  akatsuki: [
    'Itachi Uchiha',
    'Kisame Hoshigaki',
    'Kakuzu',
    'Hidan',
    'Konan',
    'Pain',
    'Sasori',
    'Deidara',
    'Zetsu',
    'Tobi',
  ],
  village: ['Hana Inuzuka', 'Suzume', 'Itachi Uchiha'],
  public: ['Itachi Uchiha', 'Hana Inuzuka', 'Suzume', 'a traveling merchant', 'a bounty-station keeper'],
  witnesses: [],
  secret: [],
};

/**
 * Fixed bearers who are not in the organization for the whole story: they can
 * carry its news only after the milestone they join with has fired, and not
 * after the one they leave with (someone buried alive is not dead, but carries
 * no news). Deaths are handled separately by each person's death record.
 */
export const BEARER_TENURE: Record<string, { joins?: string; leaves?: string }> = {
  'Kisame Hoshigaki': { joins: 'kisame-joins' },
  Deidara: { joins: 'deidara-recruited' },
  Hidan: { joins: 'roster-completes', leaves: 'hidan-kakuzu' },
};

export const CHANNEL_BY_KNOWLEDGE: Record<CanonKnowledge, string> = {
  akatsuki: "Itachi's crow, Konan's paper butterfly, or Zetsu",
  village: 'a Leaf messenger hawk or a Hidden Leaf courier',
  public: 'a traveling merchant, a town crier, or a bounty-station bulletin',
  witnesses: 'only someone who was actually there',
  secret: 'only a named confidant, face to face',
};

/** Courier used for public/village news from a region. */
export const REGION_CHANNEL: Record<string, string> = {
  'Hidden Sand': 'a desert caravan or a Sand courier bird',
  'Land of Wind': 'a desert caravan or a Sand courier bird',
  'Hidden Mist': "a sailor or a ship's captain out of the Mist",
  'Land of Water': "a sailor or a ship's captain out of the Mist",
  'Hidden Cloud': 'a swift Cloud runner',
  'Land of Lightning': 'a swift Cloud runner',
  'Hidden Stone': 'a stone-route courier',
  'Land of Earth': 'a stone-route courier',
  'Land of Iron': 'a samurai rider or an official envoy',
  'Hidden Rain': "Itachi's crow or Konan's paper butterfly",
};

// Earlier third-person wording of canon points, so saves made before the
// second-person rewrite are still recognized by the canon migration.
export const LEGACY_CANON_POINTS: string[] = [
  "Kan and Itachi have joined the Akatsuki together.",
  "Kan is settling into life as an Akatsuki operative.",
  "Kan has blood on his hands from his first Akatsuki assignment.",
  "Hana Inuzuka's patrol crossed Kan's trail.",
  "Suzume is quietly investigating what happened to Kan and the Uchiha.",
  "Kan's bounty mission went wrong.",
  "Kan keeps a private life hidden even from the Akatsuki.",
  "Kan faced the people of Hidden Rain during a riot.",
  "Kan has heard rumors of a masked man present at the massacre.",
  "Kan has seen Hidden Leaf's new genin from the shadows.",
  "Kan met Hana and Suzume again after the invasion.",
  "Kan crossed paths with Sasuke Uchiha on the night of his defection.",
  "Kan has taken his place in the Akatsuki's beast hunt.",
  "Sasuke Uchiha has crossed paths with Kan again.",
  "Kan returned to Izumi's grave.",
  "Kan has made his choice about his place in the coming war.",
  "Kan has chosen his side in the Fourth Shinobi World War.",
  "Kan met Hana and Suzume on the war's battlefield.",
  "Kan's story is settling into its legacy.",
];

// ---------------------------------------------------------------------------
// The milestones (core spine; the living-world expansion follows below)
// ---------------------------------------------------------------------------

const CORE_MILESTONES: CanonMilestone[] = [
  {
    id: 'izumi-funeral',
    era: 'Ashes',
    title: "Izumi Uchiha's funeral",
    description: 'Izumi Uchiha is buried with the rest of the clan in the Uchiha cemetery. Hana and Suzume stand at the grave.',
    from: { year: 13, month: 10, day: 6 },
    to: { year: 14, month: 3 },
    region: 'Land of Fire',
    location: 'the Uchiha cemetery outside the Hidden Leaf',
    knowledge: 'village',
    deaths: ['Izumi Uchiha'],
    facts: ['Izumi Uchiha was buried with the Uchiha clan after the massacre.'],
    encounter: {
      who: 'Hana Inuzuka and Suzume',
      where: 'the Uchiha cemetery outside Hidden Leaf',
      context: 'Hana and Suzume are grieving and angry. Kan can attend in disguise, watch from the treeline, or stay away.',
    },
    attendanceFact: "Kan was at Izumi Uchiha's funeral.",
  },
  {
    id: 'kan-joins-akatsuki',
    era: 'Ashes',
    title: 'You take the cloak',
    description:
      "You accept Itachi's offer and go with him into the Akatsuki. In the Rain you are given the cloak, but no ring: the leader does not count you as a member yet. Until you have proven yourself on a few missions you are Itachi's responsibility, and you go out at his side.",
    canonPoint: 'You and Itachi have gone into the Akatsuki together; you are on trial.',
    from: { year: 13, month: 10 },
    to: { year: 14, month: 3 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    knowledge: 'akatsuki',
    major: true,
    playerDriven: true,
    completesWhen:
      'Pain, Konan or Itachi hands you the Akatsuki cloak on the page, or the leader lets you in on trial. Agreeing to go with Itachi, travelling to the Rain or waiting to be seen is only canon_engaged.',
    facts: [
      'You went into the Akatsuki together with Itachi Uchiha.',
      'You wear an Akatsuki cloak with red clouds.',
      "You have no Akatsuki ring yet: until you prove yourself, you are Itachi's responsibility, not a member.",
    ],
    opensThreads: [
      {
        title: 'Prove yourself to the Akatsuki',
        description: 'Carry out the missions you are given well enough that the leader accepts you as a member: a ring, and a partner of your own.',
        type: 'quest',
        participants: ['Kan', 'Itachi Uchiha'],
        importance: 4,
      },
    ],
    resolvesThreadTitles: ['itachi’s offer: join akatsuki', "itachi's offer: join akatsuki"],
  },
  {
    id: 'kan-accepted-akatsuki',
    era: 'Ashes',
    title: 'You earn your ring',
    description:
      "Your missions have spoken for you. The leader accepts you as a full member of the Akatsuki: your own ring, and your own partner. Itachi keeps his; Pain pairs you with Kakuzu, so you and Itachi only meet between missions.",
    canonPoint: 'You are a full member of the Akatsuki.',
    from: { year: 13, month: 10 },
    to: { year: 14, month: 6 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    knowledge: 'akatsuki',
    major: true,
    playerDriven: true,
    after: 'kan-joins-akatsuki',
    // Only once a trial mission went well, or the trial ran its two months (akatsukiTrial.ts).
    requires: { flag: 'akatsukiTrialOpen' },
    completesWhen: 'Pain (or Konan for him) accepts you as a full member on the page: your ring is given and Kakuzu is named as your partner.',
    facts: [
      'You are a full member of the Akatsuki.',
      'You wear an Akatsuki ring.',
      "You are not Itachi's Akatsuki partner; Itachi has his own.",
      'Pain paired you with Kakuzu.',
    ],
    resolvesThreadTitles: ['prove yourself to the akatsuki'],
  },
  {
    id: 'shisui-truth',
    era: 'Ashes',
    title: 'The truth about Shisui',
    description:
      "Itachi finally tells you how Shisui died: Danzō took one of his eyes, Shisui gave Itachi the other and asked him to protect the village, then threw himself into the Naka River. It was never the suicide the village called it, and never Itachi's doing.",
    canonPoint: 'You know how Shisui really died.',
    from: { year: 13, month: 10, day: 3 },
    to: { year: 21, month: 3 },
    region: 'the shinobi world',
    location: 'wherever you and Itachi talk alone',
    knowledge: 'secret',
    bearers: ['Itachi Uchiha'],
    playerDriven: true,
    completesWhen: 'Itachi (or someone who truly knows) tells you on the page how Shisui died: the eye Danzō took, the eye he gave Itachi, the river.',
    facts: [
      "Danzō Shimura took one of Shisui Uchiha's eyes; Shisui gave the other to Itachi and then drowned himself in the Naka River to protect the village.",
    ],
    resolvesThreadTitles: ['what really happened to shisui?'],
  },
  {
    id: 'kan-bingo-book',
    era: 'Ashes',
    title: 'Your page in the bingo book',
    description:
      'Someone shows you, or tells you, what the Hidden Leaf wrote about you: your name, your rank, the price on your head, next to Itachi\'s.',
    canonPoint: 'You know you are in the Leaf\'s bingo book.',
    from: { year: 13, month: 11 },
    to: { year: 16, month: 12 },
    region: 'the shinobi world',
    location: 'a bounty station, a hunter\'s pack, or an Akatsuki briefing',
    knowledge: 'public',
    playerDriven: true,
    after: 'itachi-bingo-book',
    completesWhen: 'You see your own bingo-book entry on the page, or someone tells you exactly what it says (also report bounty_seen).',
    facts: ['You know the Hidden Leaf has listed you in its bingo book.'],
    resolvesThreadTitles: ['your name in the bingo books'],
  },
  {
    id: 'masked-man-audience',
    era: 'Ashes',
    title: "The masked man's audience",
    description: 'Itachi is summoned to a secret meeting with a masked man who calls himself Madara Uchiha. Itachi invites you to come along; only those present learn that this masked man stands above the Akatsuki.',
    canonPoint: 'A masked man calling himself Madara Uchiha secretly stands above the Akatsuki.',
    from: { year: 13, month: 11 },
    to: { year: 15, month: 6 },
    region: 'Land of Fire',
    location: 'a hidden meeting place near the Hidden Leaf',
    knowledge: 'secret',
    bearers: ['Itachi Uchiha'],
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'the masked man (with Itachi Uchiha)',
      where: 'a hidden meeting arranged by Itachi',
      context: "The masked man wears an orange spiral mask and claims to be Madara Uchiha. Nobody sees his face — not Itachi, not Kan. If Kan attends, he hears the masked man's plans; if not, he learns nothing of this meeting.",
    },
    attendanceFact: "Kan attended Itachi's secret meeting with the masked man who calls himself Madara Uchiha.",
  },
  {
    id: 'akatsuki-rhythm',
    era: 'Ashes',
    title: 'First missions under the cloak',
    description: "You take your first missions as an Akatsuki member — surveillance, retrieval, and quiet eliminations that teach you the organization's rhythm.",
    canonPoint: 'You are settling into life as an Akatsuki operative.',
    from: { year: 14, month: 1 },
    playerDriven: true,
    facts: ['Kan completed his first missions for the Akatsuki.'],
  },
  {
    id: 'mission-first-blood',
    era: 'Ashes',
    title: 'The first execution',
    description: 'Pain assigns you your first execution for the Akatsuki: a deserter whose mouth has grown too loud.',
    canonPoint: 'You have blood on your hands from your first Akatsuki assignment.',
    from: { year: 14, month: 1 },
    to: { year: 15, month: 6 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'a marked Akatsuki target',
      where: 'a border town',
      context: 'The target begs, bargains, or fights. Kan decides what kind of Akatsuki he is becoming.',
    },
  },
  {
    id: 'juzo-death',
    era: 'Ashes',
    title: 'Jūzō Biwa falls in Kumo',
    description: "Itachi's first partner, Jūzō Biwa, dies fighting the Fourth Raikage's squad. The sentient blade Samehada passes to Kisame Hoshigaki.",
    canonPoint: 'Jūzō Biwa is dead; Samehada has passed to Kisame Hoshigaki.',
    from: { year: 14, month: 8 },
    to: { year: 15, month: 8 },
    region: 'Land of Lightning',
    location: 'the border passes of the Land of Lightning',
    knowledge: 'akatsuki',
    deaths: ['Jūzō Biwa'],
    facts: [
      "Jūzō Biwa, Itachi's first Akatsuki partner, died fighting the Fourth Raikage's squad.",
      'The sentient blade Samehada now belongs to Kisame Hoshigaki.',
    ],
    encounter: {
      who: 'Jūzō Biwa and Itachi Uchiha',
      where: 'a mission into the Land of Lightning',
      context: "Jūzō is Itachi's partner until his death against the Raikage's squad. Kan could be on this mission and witness his death.",
    },
    attendanceFact: "Kan was on the mission when Jūzō Biwa fell to the Raikage's squad.",
  },
  {
    id: 'hana-hunt',
    era: 'The shadow war',
    title: "Hana's patrol",
    description: 'Hana, now a chunin, leads a patrol that picks up your trail. She has to decide whether the missing-nin in the cloak is still her teammate.',
    canonPoint: "Hana Inuzuka's patrol crossed your trail.",
    from: { year: 14, month: 6 },
    to: { year: 16, month: 9 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka',
      where: 'the border woods of the Land of Fire',
      context: 'Hana is torn between duty and memory. She may report Kan, warn him, or let him vanish.',
    },
    attendanceFact: "Kan crossed paths with Hana Inuzuka's patrol.",
  },
  {
    id: 'kisame-joins',
    era: 'Ashes',
    title: "Kisame becomes Itachi's partner",
    description: "Kisame Hoshigaki, the Monster of the Hidden Mist, joins the Akatsuki and becomes Itachi's new partner.",
    canonPoint: "Kisame Hoshigaki is Itachi's partner in the Akatsuki.",
    from: { year: 15, month: 1 },
    to: { year: 16, month: 6 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    knowledge: 'akatsuki',
    facts: ["Kisame Hoshigaki joined the Akatsuki as Itachi's partner."],
    encounter: {
      who: 'Kisame Hoshigaki',
      where: "the Akatsuki's ranks",
      context: "Kisame is introduced to Itachi — and to Kan, if Itachi brings him along. Samehada chose Kisame after Jūzō's death.",
    },
  },
  {
    id: 'suzume-inquiry',
    era: 'The shadow war',
    title: "Suzume's inquiry",
    description: 'Suzume quietly investigates your disappearance, the massacre, and the things Hidden Leaf will not say aloud.',
    canonPoint: 'Suzume is quietly investigating what happened to you and the Uchiha.',
    from: { year: 15, month: 1 },
    to: { year: 17, month: 6 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Suzume',
      where: 'Hidden Leaf archives and the roads beyond',
      context: 'Suzume follows records and rumors. She may find Kan, or find only the shape of the lie.',
    },
    attendanceFact: 'Kan crossed paths with Suzume during her inquiry.',
  },
  {
    id: 'orochimaru-betrayal',
    era: 'Ashes',
    title: 'Orochimaru betrays the Akatsuki',
    description: "Orochimaru tries to steal Itachi's body and is caught in a single genjutsu. He loses his hand and defects from the organization.",
    canonPoint: "Orochimaru has betrayed and left the Akatsuki after failing to take Itachi's body.",
    from: { year: 15, month: 6 },
    to: { year: 16, month: 6 },
    region: 'Hidden Rain',
    location: 'an Akatsuki hideout in the Hidden Rain',
    knowledge: 'akatsuki',
    facts: [
      "Orochimaru tried to steal Itachi's body, lost his hand, and defected from the Akatsuki.",
    ],
    encounter: {
      who: 'Orochimaru and Itachi Uchiha',
      where: 'an Akatsuki hideout',
      context: "Orochimaru's ambush of Itachi ends with him trapped in genjutsu. Kan could witness the Snake Sannin's humiliation.",
    },
  },
  {
    id: 'mission-bounty',
    era: 'The shadow war',
    title: 'The bounty that went wrong',
    description: 'A bounty hunt with Itachi and Kisame goes wrong when the target turns out to be someone you know.',
    canonPoint: 'Your bounty mission went wrong.',
    from: { year: 15, month: 6 },
    to: { year: 17, month: 6 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kisame Hoshigaki and Itachi Uchiha',
      where: 'a bounty station in the Land of Water',
      context: "The target is connected to Kan's past. Itachi watches what Kan chooses.",
    },
  },
  {
    id: 'deidara-recruited',
    era: 'Ashes',
    title: 'Deidara is recruited',
    description: 'Itachi defeats the rogue artist Deidara in a duel, and Sasori mediates his recruitment into the Akatsuki.',
    canonPoint: "Deidara has been recruited into the Akatsuki by Itachi's victory.",
    from: { year: 15, month: 8 },
    to: { year: 16, month: 8 },
    region: 'Land of Earth',
    location: 'a stone quarry in the Land of Earth',
    knowledge: 'akatsuki',
    facts: ['Deidara was recruited into the Akatsuki after losing a duel to Itachi.'],
    encounter: {
      who: 'Deidara, Itachi Uchiha, and Sasori',
      where: "Deidara's hideout",
      context: 'The recruitment duel. Kan could accompany Itachi and meet the explosive artist and the puppet master Sasori.',
    },
  },
  {
    id: 'roster-completes',
    era: 'Ashes',
    title: "The Akatsuki's roster completes",
    description: "Hidan, Kakuzu, and Zetsu fill the final rings. The Akatsuki's ten-member roster is complete, its true purpose still hidden.",
    canonPoint: "The Akatsuki's full roster is complete: ten rings, ten monsters.",
    from: { year: 16, month: 1 },
    to: { year: 17, month: 4 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    knowledge: 'akatsuki',
    facts: [
      "The Akatsuki's roster is complete: Pain, Konan, Itachi, Kisame, Sasori, Deidara, Hidan, Kakuzu, and Zetsu.",
    ],
  },
  {
    id: 'itachi-double-life',
    era: 'Ashes',
    title: "Itachi's double life",
    description: 'Itachi quietly feeds intelligence to Hidden Leaf while wearing the Akatsuki cloak. You may notice the errands Itachi takes alone.',
    canonPoint: 'Rumors whisper that some Akatsuki members have loyalties besides the cloak.',
    from: { year: 14, month: 4 },
    to: { year: 17, month: 4 },
    knowledge: 'secret',
    bearers: ['Itachi Uchiha'],
    facts: [],
    opensThreads: [
      {
        title: 'Who does Itachi really answer to?',
        description: 'Itachi disappears on errands he never explains. You wonder where his true loyalty lies.',
        type: 'mystery',
        participants: ['Kan', 'Itachi Uchiha'],
        importance: 3,
      },
    ],
  },
  {
    id: 'pain-civil-war',
    era: 'The shadow war',
    title: "Pain's civil war in Hidden Rain",
    description: 'Pain defeats Hanzo the Salamander and takes control of the Hidden Rain. The village begins to worship its new god.',
    canonPoint: 'Pain rules the Hidden Rain after defeating Hanzo.',
    from: { year: 15, month: 9 },
    to: { year: 16, month: 9 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    deaths: ['Hanzō', 'Hanzo the Salamander'],
    facts: ['Pain defeated Hanzo the Salamander and seized control of the Hidden Rain Village.'],
    encounter: {
      who: 'Pain and Konan',
      where: 'Hidden Rain, in the rain',
      context: "The civil war against Hanzo. Kan could witness Pain's power for the first time.",
    },
  },
  {
    id: 'ame-stronghold',
    era: 'The shadow war',
    title: 'Hidden Rain becomes the stronghold',
    description: "The Hidden Rain becomes the Akatsuki's home base. Your second home is a city of perpetual rain and worshipful eyes.",
    canonPoint: "Hidden Rain serves as the Akatsuki's stronghold under Pain.",
    from: { year: 16, month: 2 },
    to: { year: 17, month: 6 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    knowledge: 'akatsuki',
    facts: ["The Hidden Rain Village is the Akatsuki's stronghold."],
  },
  {
    id: 'kabuto-embedded',
    era: 'The shadow war',
    title: 'Kabuto embedded in Hidden Leaf',
    description: "Kabuto Yakushi becomes Sasori's spy inside Hidden Leaf, wearing the village's trust like a mask.",
    canonPoint: 'Kabuto Yakushi spies on Hidden Leaf for Sasori.',
    from: { year: 16, month: 4 },
    to: { year: 17, month: 6 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    facts: ["Kabuto Yakushi works as Sasori's spy inside Hidden Leaf."],
  },
  {
    id: 'kan-reputation',
    era: 'The shadow war',
    title: 'Your reputation grows',
    description: 'A stray Uchiha in an Akatsuki cloak starts appearing in bounty ledgers and border reports. Nobody can quite place him.',
    canonPoint: 'Whispers spread of an unidentified Uchiha running with the Akatsuki.',
    from: { year: 14, month: 6 },
    to: { year: 17, month: 6 },
    playerDriven: true,
    facts: [
      'Bounty ledgers and border reports mention an unidentified Uchiha in an Akatsuki cloak.',
    ],
  },
  {
    id: 'kan-life-outside',
    era: 'The shadow war',
    title: 'A life outside the cloak',
    description: 'Between missions, you build something of your own — safehouses, contacts, maybe someone close. You shape this through the story.',
    canonPoint: 'You keep a private life hidden even from the Akatsuki.',
    from: { year: 14, month: 6 },
    to: { year: 17, month: 10 },
    playerDriven: true,
    facts: [],
  },
  {
    id: 'mission-ame-riot',
    era: 'The shadow war',
    title: 'The rain riot',
    description: "A riot in Hidden Rain forces you to choose between the Akatsuki's order and the people under Pain's rain.",
    canonPoint: 'You faced the people of Hidden Rain during a riot.',
    from: { year: 16, month: 6 },
    to: { year: 18, month: 6 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Konan',
      where: "Hidden Rain's flooded streets",
      context: "Konan watches Kan handle the crowd. Pain's order is absolute; the people are starving.",
    },
  },
  {
    id: 'masked-man-rumors',
    era: 'The shadow war',
    title: 'Rumors of the masked man',
    description: 'Whispers reach you of the masked man who was there the night of the massacre — the one who helped Itachi.',
    canonPoint: 'You have heard rumors of a masked man present at the massacre.',
    from: { year: 16, month: 6 },
    to: { year: 18, month: 6 },
    region: 'Land of Fire',
    location: 'the roads of the Land of Fire',
    knowledge: 'village',
    facts: [
      'Kan has heard rumors of a masked man who helped Itachi during the Uchiha massacre.',
    ],
  },
  {
    id: 'rasa-assassinated',
    era: 'The shadow war',
    title: 'The Fourth Kazekage is assassinated',
    description: 'Orochimaru murders Rasa, the Fourth Kazekage, and steals his identity for the exams to come.',
    canonPoint: 'The Fourth Kazekage is dead, killed and impersonated by Orochimaru.',
    from: { year: 17, month: 6 },
    to: { year: 18, month: 4 },
    region: 'Hidden Sand',
    location: 'the desert outside the Hidden Sand Village',
    deaths: ['Rasa'],
    facts: ['Orochimaru assassinated Rasa, the Fourth Kazekage, and impersonated him.'],
  },
  {
    id: 'otogakure-grows',
    era: 'The shadow war',
    title: 'Hidden Sound rises',
    description: "Orochimaru's hidden Sound Village grows in secret — cursed seals, experiments, and an army of disposable shinobi.",
    canonPoint: "Orochimaru's Hidden Sound Village is growing in secret.",
    from: { year: 16, month: 8 },
    to: { year: 18, month: 6 },
    region: 'Hidden Sound',
    location: 'the Hidden Sound Village',
    facts: ['Orochimaru has built the Hidden Sound Village with cursed seals and experiments.'],
  },
  {
    id: 'team-7-formed',
    era: 'Part 1',
    title: 'Team 7 is formed',
    description: "The Nine-Tails' host graduates the Academy. Kakashi Hatake takes on Naruto Uzumaki, Sasuke Uchiha, and Sakura Haruno.",
    canonPoint: 'Team 7 — Naruto, Sasuke, and Sakura under Kakashi — has just been formed.',
    from: { year: 17, month: 8 },
    to: { year: 18, month: 6 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    facts: [
      'Naruto Uzumaki, Sasuke Uchiha, and Sakura Haruno formed Team 7 under Kakashi Hatake.',
    ],
  },
  {
    id: 'land-of-waves',
    era: 'Part 1',
    title: 'The Land of Waves',
    description: 'Zabuza Momochi and Haku fall in the Land of Waves. Team 7 returns changed; the world barely notices.',
    canonPoint: 'Zabuza Momochi and Haku are dead; Team 7 survived the Land of Waves.',
    from: { year: 17, month: 10 },
    to: { year: 18, month: 8 },
    region: 'Land of Water',
    location: 'the Land of Waves',
    deaths: ['Zabuza Momochi', 'Haku'],
    facts: ['Zabuza Momochi and Haku died in the Land of Waves.'],
  },
  {
    id: 'kan-shadow-team-7',
    era: 'Part 1',
    title: 'Shadows over Team 7',
    description: 'You cross paths with the Hidden Leaf rookies from the outside — a figure in a cloak watching the team your old village sent to hunt you.',
    canonPoint: "You have seen Hidden Leaf's new genin from the shadows.",
    from: { year: 17, month: 10 },
    to: { year: 18, month: 10 },
    region: 'Land of Fire',
    location: 'the roads of the Land of Fire',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Naruto Uzumaki, Sasuke Uchiha, or Team 7',
      where: "a road or border town Hidden Leaf's genin pass through",
      context: 'Kan is five years older than these genin. They would see a stranger in a black cloak with red clouds — a dangerous man, not a peer. Kan chooses whether to show himself.',
    },
  },
  {
    id: 'chunin-exams',
    era: 'Part 1',
    title: 'The Chunin Exams convene',
    description: 'Every village sends its genin to Hidden Leaf for the Chunin Exams — the rookies, Gaara of the Sand, and dangers hiding in every crowd.',
    canonPoint: 'The Chunin Exams are convening in Hidden Leaf.',
    from: { year: 18, month: 1 },
    to: { year: 18, month: 8 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    facts: ['The Chunin Exams are being held in Hidden Leaf.'],
    encounter: {
      who: 'the exam crowds — Hidden Leaf rookies, Gaara of the Sand, and foreign genin',
      where: 'Hidden Leaf, in the exam halls and streets',
      context: 'Hidden Leaf is full of foreign shinobi. A missing-nin could slip in disguised — or watch from outside the walls.',
    },
  },
  {
    id: 'sasuke-cursed-seal',
    era: 'Part 1',
    title: 'Sasuke is branded',
    description: 'Orochimaru brands Sasuke Uchiha with the cursed seal in the Forest of Death.',
    canonPoint: "Sasuke Uchiha carries Orochimaru's cursed seal.",
    from: { year: 18, month: 2 },
    to: { year: 18, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Forest of Death',
    facts: ['Orochimaru branded Sasuke Uchiha with the cursed seal.'],
  },
  {
    id: 'hayate-death',
    era: 'Part 1',
    title: 'Hayate falls',
    description: 'Gekko Hayate is killed by Baki of the Sand before the invasion, his body left in the dark.',
    canonPoint: 'Gekko Hayate has been murdered before the invasion.',
    from: { year: 18, month: 2 },
    to: { year: 18, month: 10 },
    deaths: ['Gekko Hayate'],
    facts: ['Gekko Hayate was killed by Baki before the invasion of Hidden Leaf.'],
  },
  {
    id: 'konoha-invasion',
    era: 'Part 1',
    title: 'The Invasion of Hidden Leaf',
    description: "Sand and Sound attack Hidden Leaf during the exams' final round. The Third Hokage dies sealing Orochimaru's arms. The village burns.",
    canonPoint: 'The Third Hokage is dead; Hidden Leaf was invaded by Sand and Sound.',
    from: { year: 18, month: 3 },
    to: { year: 18, month: 10 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    major: true,
    // Zaku and Kin are the sacrifices Orochimaru spends on Edo Tensei.
    deaths: ['Hiruzen Sarutobi', 'Zaku Abumi', 'Kin Tsuchi'],
    facts: [
      "Hidden Leaf was invaded by Sand and Sound forces; the Third Hokage, Hiruzen Sarutobi, died sealing Orochimaru's arms.",
    ],
    encounter: {
      who: 'Orochimaru, or the invading forces',
      where: 'Hidden Leaf, under attack',
      context: 'The village Kan abandoned is burning. He could be inside the walls, outside them, or far away.',
    },
  },
  {
    id: 'team-3-reunion',
    era: 'Part 1',
    title: 'The team that was',
    description: 'After the invasion, Hana and Suzume cross your path — the team that was, standing on opposite sides of the same war.',
    canonPoint: 'You met Hana and Suzume again after the invasion.',
    from: { year: 18, month: 3 },
    to: { year: 19, month: 9 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka and Suzume',
      where: 'the ruined edge of Hidden Leaf',
      context: 'Suzume wants answers; Hana wants to know why Kan abandoned them. Both still care, under the anger.',
    },
    attendanceFact: 'Kan met Hana and Suzume after the invasion.',
  },
  {
    id: 'tsunade-hokage',
    era: 'Part 1',
    title: 'Tsunade becomes Fifth Hokage',
    description: 'Tsunade Senju returns to Hidden Leaf and takes the hat of the Fifth Hokage with Jiraiya at her side.',
    canonPoint: 'Tsunade Senju is the Fifth Hokage of Hidden Leaf.',
    from: { year: 18, month: 4 },
    to: { year: 19, month: 2 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    facts: [
      'Tsunade Senju became the Fifth Hokage.',
      "Tsunade woke Kakashi Hatake and Sasuke Uchiha from Itachi's Tsukuyomi.",
    ],
  },
  {
    id: 'itachi-hunt-naruto',
    era: 'Part 1',
    title: 'Itachi and Kisame hunt the Nine-Tails',
    description: "Itachi and Kisame find Naruto Uzumaki at a roadside inn. Jiraiya intervenes, and the Akatsuki withdraws. Itachi's true purpose stays his own.",
    canonPoint: "Itachi and Kisame were driven off by Jiraiya while hunting the Nine-Tails' host.",
    from: { year: 18, month: 3 },
    to: { year: 19, month: 4 },
    region: 'Land of Fire',
    location: 'a roadside inn outside the Hidden Leaf',
    playerDriven: true,
    facts: [
      'Itachi and Kisame attempted to capture Naruto Uzumaki but withdrew when Jiraiya intervened.',
    ],
    encounter: {
      who: 'Itachi Uchiha, Kisame Hoshigaki, Naruto Uzumaki, and Jiraiya',
      where: 'a roadside inn outside Hidden Leaf',
      context: "Itachi could ask Kan to accompany them on this mission — or Kan could follow them. What he sees of Itachi's hesitation is his to witness.",
    },
    attendanceFact: "Kan accompanied Itachi and Kisame on the mission to hunt the Nine-Tails' host.",
  },
  {
    id: 'sasuke-defects',
    era: 'Part 1',
    title: 'Sasuke defects',
    description: 'Sasuke Uchiha abandons Hidden Leaf for Orochimaru, escorted out by the Sound Four.',
    canonPoint: 'Sasuke Uchiha has defected from Hidden Leaf to Orochimaru.',
    from: { year: 18, month: 5 },
    to: { year: 19, month: 4 },
    region: 'Land of Fire',
    location: 'the roads out of the Hidden Leaf',
    facts: ['Sasuke Uchiha defected from Hidden Leaf to join Orochimaru.'],
  },
  {
    id: 'valley-of-the-end',
    era: 'Part 1',
    title: 'The Valley of the End',
    description: 'Naruto fights Sasuke at the Valley of the End and fails to bring him home. The retrieval mission collapses.',
    canonPoint: 'Naruto failed to stop Sasuke at the Valley of the End.',
    from: { year: 18, month: 5 },
    to: { year: 19, month: 5 },
    region: 'Land of Fire',
    location: 'the Valley of the End',
    facts: [
      'Naruto Uzumaki fought Sasuke Uchiha at the Valley of the End and failed to retrieve him.',
    ],
  },
  {
    id: 'kan-intercept-sasuke',
    era: 'Part 1',
    title: 'A fork in the road',
    description: 'The night Sasuke flees Hidden Leaf, his path could cross yours. One conversation could change everything — or nothing.',
    canonPoint: 'You crossed paths with Sasuke Uchiha on the night of his defection.',
    from: { year: 18, month: 5 },
    to: { year: 19, month: 6 },
    region: 'Land of Fire',
    location: 'the roads out of the Land of Fire',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Sasuke Uchiha',
      where: 'the roads out of the Land of Fire',
      context: "The Sound Four escort Sasuke toward Orochimaru. Kan is his older cousin's age and a missing-nin of the same clan. If Kan appears, Sasuke sees the clan's other survivor.",
    },
  },
  {
    id: 'sasuke-trains',
    era: 'The hidden years',
    title: 'Sasuke under Orochimaru',
    description: "Sasuke trains under Orochimaru's wing, and the cursed seal deepens its hold on him.",
    canonPoint: 'Sasuke trains under Orochimaru at Hidden Sound.',
    from: { year: 18, month: 7 },
    to: { year: 20, month: 6 },
    facts: ['Sasuke Uchiha is training under Orochimaru.'],
  },
  {
    id: 'naruto-trains',
    era: 'The hidden years',
    title: 'Naruto under Jiraiya',
    description: 'Naruto leaves the village to train under Jiraiya. Hidden Leaf rebuilds around Tsunade.',
    canonPoint: 'Naruto is away training under Jiraiya.',
    from: { year: 18, month: 7 },
    to: { year: 20, month: 6 },
    facts: ['Naruto Uzumaki left Hidden Leaf to train under Jiraiya.'],
  },
  {
    id: 'itachi-illness',
    era: 'The hidden years',
    title: "Itachi's hidden illness",
    description: 'Itachi is dying — a disease he hides behind a calm mask. Whether he ever tells you is a matter between the two of you.',
    canonPoint: 'Itachi hides a terminal illness.',
    from: { year: 19, month: 1 },
    to: { year: 21, month: 3 },
    knowledge: 'secret',
    bearers: ['Itachi Uchiha'],
    playerDriven: true,
    facts: [],
  },
  {
    id: 'jinchuriki-hunt-decree',
    era: 'The hidden years',
    title: 'The jinchūriki hunt decreed',
    description: "The Leader sets the Akatsuki's true purpose in motion: capture all nine tailed beasts.",
    canonPoint: 'The Akatsuki has begun its hunt for the nine tailed beasts.',
    from: { year: 19, month: 2 },
    to: { year: 21, month: 1 },
    facts: ["The Akatsuki's true goal is to capture all nine tailed beasts."],
  },
  {
    id: 'kan-hunt-role',
    era: 'The hidden years',
    title: 'Your role in the hunt',
    description: 'The hunt assigns you a role: capture, surveillance, or quiet sabotage. You choose what your conscience allows.',
    canonPoint: "You have taken your place in the Akatsuki's beast hunt.",
    from: { year: 19, month: 2 },
    to: { year: 21, month: 4 },
    playerDriven: true,
    facts: [],
  },
  {
    id: 'kan-sasuke-paths',
    era: 'The hidden years',
    title: 'Paths crossing again',
    description: 'Sasuke, now stronger and hungrier, crosses your path asking about Itachi.',
    canonPoint: 'Sasuke Uchiha has crossed paths with you again.',
    from: { year: 19, month: 1 },
    to: { year: 21, month: 6 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Sasuke Uchiha',
      where: "anywhere Orochimaru's errands or Akatsuki missions overlap",
      context: "Sasuke wants Itachi's head and information about the Akatsuki. He would press Kan for both.",
    },
  },
  {
    id: 'gaara-kage',
    era: 'The hidden years',
    title: 'Gaara becomes Kazekage',
    description: 'Gaara becomes the Fifth Kazekage, the monster of the Sand remade as its protector.',
    canonPoint: 'Gaara is the Fifth Kazekage.',
    from: { year: 20, month: 6 },
    to: { year: 21, month: 2 },
    region: 'Hidden Sand',
    location: 'the Hidden Sand Village',
    facts: ['Gaara became the Fifth Kazekage.'],
  },
  {
    id: 'izumi-grave',
    era: 'Shippuden',
    title: "Izumi's grave, years later",
    description: "You return to Izumi's grave years after the massacre. Hana is there, and neither of you has the words.",
    canonPoint: "You returned to Izumi's grave.",
    from: { year: 20, month: 6 },
    to: { year: 22, month: 12 },
    region: 'Land of Fire',
    location: 'the Uchiha cemetery outside the Hidden Leaf',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka',
      where: "Izumi's grave outside Hidden Leaf",
      context: 'Hana is visiting Izumi. The two survivors of Team 3 can talk, fight, or stand in silence.',
    },
    attendanceFact: "Kan met Hana at Izumi's grave.",
  },
  {
    id: 'gaara-captured',
    era: 'Shippuden',
    title: 'Gaara captured',
    description: 'Deidara and Sasori capture Gaara of the Sand. The Shukaku is extracted, and Gaara dies — until Chiyo buys his life with her own.',
    canonPoint: "Gaara was captured; the Shukaku was extracted; Chiyo's sacrifice revived him.",
    artDirection: 'the giant statue in a dark cavern, Akatsuki members standing on its fingers, beams of chakra drawn from the body below',
    from: { year: 21, month: 1 },
    to: { year: 21, month: 7 },
    region: 'Hidden Sand',
    location: 'the Hidden Sand Village',
    major: true,
    deaths: ['Chiyo'],
    facts: [
      'Deidara and Sasori captured Gaara and extracted the Shukaku.',
      'Chiyo sacrificed her life to revive Gaara after the extraction.',
    ],
  },
  {
    id: 'sasori-falls',
    era: 'Shippuden',
    title: 'Sasori falls',
    description: "Sasori of the Red Sand dies in his grandmother Chiyo's arms, defeated by her and Sakura Haruno.",
    canonPoint: 'Sasori is dead, defeated by Chiyo and Sakura.',
    from: { year: 21, month: 2 },
    to: { year: 21, month: 8 },
    region: 'Land of Wind',
    location: 'an Akatsuki cave lair in the Land of Wind',
    knowledge: 'akatsuki',
    deaths: ['Sasori'],
    facts: ['Sasori of the Red Sand was killed by Chiyo and Sakura Haruno.'],
  },
  {
    // The masked man's act begins: from here the Akatsuki who only ever meet
    // the act know him as Tobi (nameData.ts).
    id: 'tobi-joins-akatsuki',
    era: 'Shippuden',
    title: 'Tobi joins the Akatsuki',
    description:
      "A new recruit in an orange swirl mask, who calls himself Tobi, takes Sasori's ring and becomes Deidara's partner: loud, clumsy, cheerful and cowardly, and a constant irritation to Deidara.",
    canonPoint: "A masked recruit called Tobi has taken Sasori's place as Deidara's partner.",
    from: { year: 21, month: 3 },
    to: { year: 21, month: 9 },
    region: 'Land of Rain',
    location: 'an Akatsuki hideout',
    knowledge: 'akatsuki',
    facts: ["A masked recruit called Tobi took Sasori's ring and became Deidara's partner."],
    encounter: {
      who: 'Tobi and Deidara',
      where: 'an Akatsuki hideout or a gathering of the rings',
      context:
        "If Kan is with the Akatsuki, he can meet the new recruit in person: a goofy, cheerful man in an orange swirl mask who talks about himself in the third person and pesters Deidara. Whether Kan sees through the act depends on what he already knows of the masked man.",
    },
  },
  {
    id: 'naruto-sage-training',
    era: 'Shippuden',
    title: 'Sage training',
    description: "With Jiraiya dead, Naruto goes to Mount Myoboku and learns sage mode from the old toad Fukasaku — stillness, and the shape of the world's chakra.",
    canonPoint: 'Naruto is training in sage mode at Mount Myoboku.',
    from: { year: 21, month: 10 },
    to: { year: 21, month: 12 },
    region: 'Land of Fire',
    location: 'Mount Myoboku',
    facts: ['Naruto Uzumaki trained in sage mode at Mount Myoboku.'],
  },
  {
    id: 'team-kakashi-bridge',
    era: 'Shippuden',
    title: 'Tenchi Bridge',
    description: "Team Kakashi, now with Sai and Yamato, meets Sasori's spy at Tenchi Bridge and finds Kabuto instead. They follow him to Orochimaru's hideout, where Sasuke nearly kills Naruto and walks away.",
    canonPoint: "Naruto found Sasuke in Orochimaru's hideout and was refused.",
    from: { year: 21, month: 3 },
    to: { year: 21, month: 9 },
    region: 'Land of Fire',
    location: "Tenchi Bridge and Orochimaru's hideout",
    facts: ["Naruto confronted Sasuke in Orochimaru's hideout; Sasuke overpowered him but spared him."],
  },
  {
    id: 'hidan-kakuzu',
    era: 'Shippuden',
    title: 'Hidan and Kakuzu',
    description: 'Asuma Sarutobi dies against Hidan and Kakuzu. Shikamaru Nara hunts them down and ends them both.',
    canonPoint: "Asuma is dead; Hidan and Kakuzu were destroyed by Shikamaru's vengeance.",
    from: { year: 21, month: 4 },
    to: { year: 21, month: 10 },
    region: 'Land of Fire',
    location: 'the forests of the Land of Fire',
    major: true,
    deaths: ['Asuma Sarutobi', 'Kakuzu'],
    facts: [
      'Asuma Sarutobi was killed by Hidan of the Akatsuki.',
      "Hidan was buried alive by Shikamaru Nara and Kakuzu was killed in the Nine-Tails' chakra cloak.",
    ],
    encounter: {
      who: 'Hidan and Kakuzu',
      where: 'the Land of Fire, on their bounty circuit',
      context: 'The immortal pair travel together collecting bounties. Kan could be assigned alongside them or cross their path.',
    },
  },
  {
    id: 'two-tails-captured',
    era: 'Shippuden',
    title: 'The Two-Tails captured',
    description: 'Yugito Nii of the Hidden Cloud falls to Hidan and Kakuzu, and the Two-Tails is sealed into the statue over three days and nights. Yugito does not survive the extraction.',
    canonPoint: 'Yugito Nii and the Two-Tails have been captured by the Akatsuki.',
    artDirection: 'the giant statue in a dark cavern, Akatsuki members standing on its fingers, beams of chakra drawn from the body below',
    from: { year: 21, month: 3, day: 10 },
    to: { year: 21, month: 6 },
    region: 'Land of Lightning',
    location: 'the Land of Lightning',
    knowledge: 'akatsuki',
    deaths: ['Yugito Nii'],
    facts: ['Yugito Nii, jinchūriki of the Two-Tails, was captured by Hidan and Kakuzu and died when the beast was extracted.'],
  },
  {
    id: 'three-tails-captured',
    era: 'Shippuden',
    title: 'The Three-Tails captured',
    description: 'The masked man and Deidara capture the Three-Tails, working side by side for the first time.',
    canonPoint: 'The Three-Tails has been captured by the masked man and Deidara.',
    artDirection: 'the giant statue in a dark cavern, Akatsuki members standing on its fingers, beams of chakra drawn from the body below',
    from: { year: 21, month: 6 },
    to: { year: 21, month: 12 },
    region: 'Land of Water',
    location: 'a lake in the Land of Water',
    knowledge: 'akatsuki',
    facts: ['The Three-Tails was captured by the masked man and Deidara.'],
    encounter: {
      who: 'the masked man and Deidara',
      where: 'a lake where the Three-Tails swims',
      context: 'Kan could be assigned to this capture — his first long work alongside the masked man.',
    },
  },
  {
    id: 'sasuke-absorbs-orochimaru',
    era: 'Shippuden',
    title: 'Sasuke absorbs Orochimaru',
    description: 'Sasuke turns on his weakened master and absorbs Orochimaru into himself, then gathers Suigetsu, Karin, and Jūgo as Hebi — Snake — to hunt Itachi.',
    canonPoint: 'Sasuke absorbed Orochimaru and formed Hebi to hunt Itachi.',
    from: { year: 21, month: 7 },
    to: { year: 22, month: 1 },
    region: 'Hidden Sound',
    location: 'the Hidden Sound Village',
    facts: ['Sasuke absorbed Orochimaru and formed Hebi (Snake) with Suigetsu, Karin, and Jūgo.'],
  },
  {
    id: 'deidara-dies',
    era: 'Shippuden',
    title: "Deidara's final masterpiece",
    description: "Deidara fights Sasuke for his brother's honor and detonates himself in a final work of art.",
    canonPoint: 'Deidara is dead, destroyed in his final battle against Sasuke.',
    from: { year: 21, month: 8 },
    to: { year: 22, month: 2 },
    region: 'Land of Earth',
    location: 'the badlands of the Land of Earth',
    // Sasuke shields himself with Manda from the blast.
    deaths: ['Deidara', 'Manda'],
    facts: ['Deidara killed himself in a suicidal explosion attacking Sasuke.'],
  },
  {
    id: 'sasuke-rescue',
    era: 'Shippuden',
    title: 'Half-dead in the road',
    description: 'Sasuke collapses after his battle with Deidara. In canon, the masked man retrieves him. You could be the one who finds him first.',
    canonPoint: "Sasuke lay half-dead after Deidara's blast — and someone found him.",
    from: { year: 21, month: 8 },
    to: { year: 22, month: 2 },
    region: 'Land of Earth',
    location: "the ruins of Deidara's battlefield",
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Sasuke Uchiha',
      where: "the ruins of Deidara's battlefield",
      context: 'Sasuke is unconscious and dying. Whoever reaches him first decides who he owes his life to.',
    },
  },
  {
    id: 'itachi-crow',
    era: 'Shippuden',
    title: "Itachi's crow",
    description: "Before his final battle, Itachi feeds Naruto a crow carrying Shisui's eye — insurance against a certain masked man.",
    canonPoint: "Itachi gave Naruto a crow carrying Shisui's eye.",
    from: { year: 21, month: 8 },
    to: { year: 22, month: 3 },
    region: 'Land of Fire',
    location: 'a forest in the Land of Fire',
    knowledge: 'secret',
    bearers: ['Itachi Uchiha', 'Naruto Uzumaki'],
    facts: ["Itachi gave Naruto a crow carrying Shisui Uchiha's eye."],
  },
  {
    id: 'itachi-vs-sasuke',
    era: 'Shippuden',
    title: 'Itachi falls',
    description: "Itachi dies at Sasuke's hand in their final battle, his last touch pushing Sasuke out of the rain. His truth dies with him — for now.",
    canonPoint: 'Itachi Uchiha is dead, killed by Sasuke in their final battle.',
    artDirection: 'storm clouds boiling overhead, a ruined Uchiha hall open to the sky, the ghostly glow of Susanoo light, rain starting to fall',
    from: { year: 21, month: 9, day: 12 },
    to: { year: 22, month: 2 },
    region: 'Land of Fire',
    location: 'an abandoned Uchiha hideout',
    knowledge: 'witnesses',
    major: true,
    deaths: ['Itachi Uchiha'],
    facts: [
      'Itachi Uchiha died in battle against Sasuke.',
      'Itachi died still believing the masked man was Madara Uchiha.',
    ],
    encounter: {
      who: 'Itachi Uchiha and Sasuke Uchiha',
      where: 'an abandoned Uchiha hideout',
      context: "Itachi could ask Kan to stay away — or to be there. Whether Kan witnesses his friend's death is a player choice.",
    },
    attendanceFact: "Kan witnessed Itachi's final battle and death against Sasuke.",
  },
  {
    id: 'masked-man-truth',
    era: 'Shippuden',
    title: "The masked man's truth",
    description: "The masked man, still masked and still calling himself Madara, tells Sasuke that Hidden Leaf's leadership ordered the Uchiha massacre.",
    canonPoint: "The masked man claims Hidden Leaf's leadership ordered the Uchiha massacre.",
    from: { year: 21, month: 9, day: 13 },
    to: { year: 22, month: 3 },
    region: 'Land of Fire',
    location: 'the Uchiha hideout',
    knowledge: 'secret',
    bearers: ['Sasuke Uchiha', 'Tobi'],
    major: true,
    facts: [
      "The masked man told Sasuke that Hidden Leaf's leadership ordered the Uchiha massacre.",
    ],
    encounter: {
      who: 'the masked man (with Sasuke Uchiha)',
      where: "the Uchiha hideout after Itachi's death",
      context: "The masked man remains masked and claims to be Madara. If Kan is present, he hears the massacre's true order — but still does not learn who the man is.",
    },
    attendanceFact: "Kan heard the masked man reveal that Hidden Leaf's leadership ordered the Uchiha massacre.",
  },
  {
    id: 'killer-bee-fail',
    era: 'Shippuden',
    title: 'Taka hunts the Eight-Tails',
    description: "Sasuke's Taka (Hawk) attacks Killer Bee for the masked man. They bring back a tentacle — the Eight-Tails' host faked his capture and slipped away on vacation.",
    canonPoint: 'Taka failed to capture Killer Bee and the Eight-Tails.',
    from: { year: 21, month: 10, day: 15 },
    to: { year: 22, month: 4 },
    region: 'Land of Lightning',
    location: 'the Land of Lightning',
    knowledge: 'akatsuki',
    facts: ["Taka failed to capture Killer Bee, the Eight-Tails' jinchūriki; he faked his capture."],
  },
  {
    id: 'killer-bee-training',
    era: 'Shippuden',
    title: 'The Island Turtle',
    description: "The Alliance hides its two jinchūriki on the Island Turtle, a living island off the Land of Lightning, and Naruto trains with Killer Bee to control the Nine-Tails' chakra.",
    canonPoint: 'Naruto and Killer Bee are hidden on the Island Turtle, training.',
    from: { year: 22, month: 8 },
    to: { year: 22, month: 12, day: 31 },
    region: 'Land of Lightning',
    location: 'the Island Turtle',
    facts: ['Naruto Uzumaki and Killer Bee are hidden on the Island Turtle; Naruto trains with Bee to control the Nine-Tails.'],
  },
  {
    id: 'itachi-posthumous',
    era: 'Shippuden',
    title: "Itachi's posthumous plans",
    description: "Itachi left plans behind — a crow, a Shisui eye, a truth meant for Sasuke's eyes only. Whether you ever learn of them is up to you.",
    canonPoint: 'Whispers circulate of plans Itachi left behind.',
    from: { year: 21, month: 10 },
    to: { year: 23, month: 3 },
    knowledge: 'secret',
    bearers: ['Itachi Uchiha', 'Naruto Uzumaki', 'Sasuke Uchiha'],
    playerDriven: true,
    facts: [],
  },
  {
    id: 'jiraiya-dies',
    era: 'Shippuden',
    title: 'Jiraiya dies in the rain',
    description: "While Sasuke hunts Itachi, Jiraiya infiltrates Hidden Rain and dies against the Six Paths of Pain, sending his final intel out as a code tattooed on Fukasaku's back.",
    canonPoint: 'Jiraiya is dead, killed by Pain in Hidden Rain.',
    from: { year: 21, month: 9, day: 5 },
    to: { year: 22, month: 3 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    major: true,
    deaths: ['Jiraiya'],
    facts: ['Jiraiya died fighting Pain in the Hidden Rain Village.'],
  },
  {
    id: 'pain-assault',
    era: 'The sky falls',
    title: "Pain's assault on Hidden Leaf",
    description: 'Six bodies flatten Hidden Leaf. Naruto defeats Pain and meets Nagato, whose sacrifice revives the dead of the village.',
    canonPoint: 'Pain destroyed and was repelled from Hidden Leaf; Nagato sacrificed himself to revive the dead.',
    artDirection: 'Pain floating high above a flattened crater, Hidden Leaf a ring of rubble below, a cold, empty blue sky',
    from: { year: 22, month: 1 },
    to: { year: 22, month: 6 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    major: true,
    deaths: ['Nagato', 'Fukasaku'],
    facts: [
      'Pain destroyed Hidden Leaf; Naruto defeated him and Nagato sacrificed his life to revive the dead.',
      'The world now knows Pain is Nagato, working with Konan.',
      'Kakashi Hatake died against Pain and was brought back by Nagato; the toad sage Fukasaku stayed dead.',
      'Hinata Hyuga confessed her love to Naruto while shielding him from Pain.',
      'Tsunade fell into a coma after shielding the village; Naruto is hailed as the hero of Hidden Leaf.',
    ],
    encounter: {
      who: 'Pain',
      where: 'Hidden Leaf or Hidden Rain',
      context: 'If Kan is in the rain city or the ruined Leaf, he sees the Six Paths of Pain at war.',
    },
  },
  {
    id: 'danzo-hokage',
    era: 'The sky falls',
    title: 'Danzo takes the hat',
    description: "Danzo Shimura maneuvers himself into the Sixth Hokage's seat.",
    canonPoint: 'Danzo Shimura is the Sixth Hokage.',
    from: { year: 22, month: 2 },
    to: { year: 22, month: 8 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    facts: ['Danzo Shimura became the Sixth Hokage.'],
  },
  {
    id: 'kage-summit',
    era: 'The sky falls',
    title: 'The Five Kage Summit in the Land of Iron',
    description: 'The five Kage meet in the Land of Iron to answer the Akatsuki. The masked man appears and declares war on the shinobi world.',
    canonPoint: 'At the summit in the Land of Iron, the masked man declared war on the shinobi world.',
    from: { year: 22, month: 3 },
    to: { year: 22, month: 9 },
    region: 'Land of Iron',
    location: 'the Summit hall in the Land of Iron',
    major: true,
    facts: ['At the Five Kage Summit, the masked man declared war on the shinobi world.'],
  },
  {
    id: 'sasuke-rampage',
    era: 'The sky falls',
    title: "Sasuke's rampage",
    description: "Sasuke attacks the Summit and is defeated by the Raikage and Kazekage. He then kills Danzo, the man who ordered his clan's death.",
    canonPoint: 'Sasuke attacked the Kage Summit and killed Danzo Shimura.',
    from: { year: 22, month: 3, day: 3 },
    to: { year: 22, month: 9 },
    region: 'Land of Iron',
    location: 'the Land of Iron',
    // The masked man spends Fū to bring Torune back, then kills them both.
    deaths: ['Danzo Shimura', 'Torune Aburame', 'Fū Yamanaka'],
    facts: [
      'Sasuke attacked the Five Kage Summit and killed Danzo Shimura.',
      "Danzo's Root bodyguards, Torune Aburame and Fū Yamanaka, died in the Land of Iron.",
    ],
  },
  {
    id: 'kisame-dies',
    era: 'The sky falls',
    title: "Kisame's end",
    description: 'Kisame slips onto the Island Turtle hidden inside Samehada. Might Guy catches him; rather than give up the Akatsuki, Kisame sends the stolen intel out by shark and lets his own summons devour him.',
    canonPoint: 'Kisame Hoshigaki is dead.',
    from: { year: 22, month: 12, day: 20 },
    to: { year: 23, month: 1, day: 9 },
    region: 'Land of Lightning',
    location: 'the Island Turtle, off the Land of Lightning',
    knowledge: 'akatsuki',
    deaths: ['Kisame Hoshigaki'],
    facts: ['Kisame Hoshigaki is dead; Might Guy caught him spying on the Island Turtle and he killed himself before he could be interrogated.'],
  },
  {
    id: 'konan-falls',
    era: 'The sky falls',
    title: 'Konan falls',
    description: "Konan defends Nagato's grave from the masked man and dies in the burning paper ocean.",
    canonPoint: 'Konan is dead, killed by the masked man.',
    from: { year: 22, month: 6 },
    to: { year: 23, month: 1 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    knowledge: 'akatsuki',
    deaths: ['Konan'],
    facts: ["Konan was killed by the masked man defending Nagato's grave."],
  },
  {
    id: 'kabuto-pact',
    era: 'The sky falls',
    title: "Kabuto's pact",
    description: 'Kabuto Yakushi offers the masked man an army of Edo Tensei corpses, including Madara Uchiha himself.',
    canonPoint: 'Kabuto has allied with the masked man with an Edo Tensei army.',
    from: { year: 22, month: 5 },
    to: { year: 23, month: 1, day: 9 },
    region: 'Hidden Sound',
    location: 'a hidden lair of the Hidden Sound',
    knowledge: 'akatsuki',
    facts: [
      'Kabuto Yakushi allied with the masked man, bringing an army of Edo Tensei corpses.',
    ],
  },
  {
    id: 'kan-akatsuki-exit',
    era: 'The sky falls',
    title: 'Leaving the cloak',
    description: 'War is coming and the Akatsuki is dissolving around you. Defect, stay, or play both sides — you choose.',
    canonPoint: 'You have made your choice about your place in the coming war.',
    from: { year: 22, month: 7 },
    to: { year: 23, month: 1, day: 9 },
    playerDriven: true,
    facts: [],
  },
  {
    id: 'war-begins',
    era: 'The Fourth War',
    title: 'The Fourth Shinobi World War begins',
    description: "The masked man's army of a hundred thousand white Zetsu and Kabuto's reanimated dead march on the Allied Shinobi Forces. The war will last four days.",
    canonPoint: 'The Fourth Shinobi World War has begun.',
    artDirection: 'an endless battlefield, armies as tiny figures, columns of smoke, a giant silhouette on the horizon',
    from: { year: 23, month: 1, day: 10 },
    to: { year: 23, month: 1, day: 14 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: [
      'The five villages united as the Allied Shinobi Forces against the Akatsuki.',
      'The Fourth Shinobi World War has begun.',
    ],
  },
  {
    id: 'kan-war-side',
    era: 'The Fourth War',
    title: 'Your side of the war',
    description: "The Alliance, the Akatsuki, or yourself alone — you pick your place in the world's last war.",
    canonPoint: 'You have chosen your side in the Fourth Shinobi World War.',
    from: { year: 22, month: 9 },
    to: { year: 23, month: 1, day: 13 },
    playerDriven: true,
    facts: [],
  },
  {
    id: 'edo-itachi',
    era: 'The Fourth War',
    title: 'Edo Itachi',
    reanimates: { names: ['Itachi Uchiha', 'Nagato'], by: 'Kabuto' },
    description: "Kabuto's Edo Tensei returns Itachi to the battlefield. Breaking free of the control, he fights beside Naruto and Killer Bee against Nagato — and for a short while he walks the world again, as himself.",
    canonPoint: 'Edo Tensei Itachi walks the battlefield again.',
    from: { year: 23, month: 1, day: 10 },
    to: { year: 23, month: 1, day: 11 },
    major: true,
    facts: ['Edo Tensei returned Itachi to the battlefield during the war.'],
    encounter: {
      who: 'Itachi Uchiha (Edo Tensei)',
      where: 'the war battlefield',
      context: "Itachi is a reanimated corpse, free of Kabuto's control. The reunion with Kan is the timeline's hardest conversation.",
    },
    attendanceFact: 'Kan met Itachi again on the battlefield during the war.',
  },
  {
    id: 'team-3-war',
    era: 'The Fourth War',
    title: 'Team 3 on the battlefield',
    description: 'Hana Inuzuka and Suzume fight in the Allied Shinobi Forces. On a battlefield full of masked shinobi, the old team finds each other again.',
    canonPoint: "You met Hana and Suzume on the war's battlefield.",
    from: { year: 23, month: 1, day: 10 },
    to: { year: 23, month: 1, day: 13 },
    major: true,
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka and Suzume',
      where: 'a battlefield of the Fourth War',
      context: "Hana and Suzume are exhausted and outnumbered. Kan's side of the war matters more than ever here.",
    },
    attendanceFact: 'Kan fought beside Hana and Suzume during the war.',
  },
  {
    id: 'madara-revived',
    era: 'The Fourth War',
    title: 'Madara is revived',
    reanimates: { names: ['Madara Uchiha'], by: 'Kabuto' },
    description: "Kabuto's Edo Tensei returns the REAL Madara Uchiha to the war — the legend himself, not the masked man's borrowed name.",
    canonPoint: 'The real Madara Uchiha has been revived for the war.',
    from: { year: 23, month: 1, day: 11 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: ['The real Madara Uchiha was revived by Edo Tensei during the war.'],
  },
  {
    id: 'hokage-edo',
    era: 'The Fourth War',
    title: 'The four Hokage return',
    reanimates: { names: ['Hashirama Senju', 'Tobirama Senju', 'Hiruzen Sarutobi', 'Minato Namikaze'], by: 'Orochimaru' },
    description: 'Orochimaru revives the four Hokage with Edo Tensei. Minato, Hashirama, Tobirama, and Hiruzen walk the battlefield again.',
    canonPoint: 'The four Hokage have been revived by Edo Tensei.',
    from: { year: 23, month: 1, day: 11 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: ['Orochimaru revived the four Hokage with Edo Tensei during the war.'],
  },
  {
    id: 'obito-unmasked',
    era: 'The Fourth War',
    title: 'The mask breaks',
    description: "In the clash with Kakashi and Naruto, the masked man's mask shatters. The Alliance learns the truth: he is Obito Uchiha, Kakashi's teammate who died decades ago.",
    canonPoint: 'The masked man has been unmasked — he is Obito Uchiha.',
    from: { year: 23, month: 1, day: 11 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    knowledge: 'witnesses',
    major: true,
    facts: [
      "The masked man's mask shattered in battle; the Allied Forces learned he is Obito Uchiha, Kakashi's former teammate.",
    ],
    encounter: {
      who: 'the masked man (battling Kakashi and Naruto)',
      where: 'the war battlefield',
      context: 'Only those on this battlefield see the mask break. If Kan is elsewhere, he learns it later — from witnesses.',
    },
    attendanceFact: "Kan saw the masked man's mask shatter against Kakashi and learned he is Obito Uchiha.",
  },
  {
    id: 'ten-tails',
    era: 'The Fourth War',
    title: 'The Ten-Tails resurrected',
    description: 'Obito and Madara revive the Ten-Tails on the battlefield.',
    canonPoint: 'The Ten-Tails has been revived.',
    from: { year: 23, month: 1, day: 11 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: ['Obito and Madara revived the Ten-Tails.'],
  },
  {
    id: 'shikaku-inoichi-death',
    era: 'The Fourth War',
    title: 'Headquarters falls',
    description: 'The Ten-Tails destroys the Alliance headquarters, killing Shikaku Nara and Inoichi Yamanaka.',
    canonPoint: 'Shikaku Nara and Inoichi Yamanaka are dead.',
    from: { year: 23, month: 1, day: 12 },
    to: { year: 23, month: 1, day: 14 },
    region: 'Land of Lightning',
    location: 'the Allied headquarters',
    deaths: ['Shikaku Nara', 'Inoichi Yamanaka', 'Mabui'],
    facts: ['Shikaku Nara, Inoichi Yamanaka and the Raikage’s assistant Mabui died when the Ten-Tails destroyed headquarters.'],
  },
  {
    id: 'obito-jinchuriki',
    era: 'The Fourth War',
    title: "Obito becomes the Ten-Tails' jinchūriki",
    description: 'Obito seals the Ten-Tails into himself and becomes a god on the battlefield.',
    canonPoint: "Obito Uchiha is the Ten-Tails' jinchūriki.",
    from: { year: 23, month: 1, day: 12 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: ["Obito became the Ten-Tails' jinchūriki."],
  },
  {
    id: 'neji-death',
    era: 'The Fourth War',
    title: 'Neji dies',
    description: "Neji Hyuga dies shielding Naruto and Hinata from the Ten-Tails' attack.",
    canonPoint: 'Neji Hyuga is dead.',
    from: { year: 23, month: 1, day: 12 },
    to: { year: 23, month: 1, day: 14 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    deaths: ['Neji Hyuga'],
    facts: ['Neji Hyuga died protecting Naruto and Hinata.'],
  },
  {
    id: 'madara-betrayal',
    era: 'The Fourth War',
    title: "Madara's betrayal",
    description: "Black Zetsu moves at last. Madara takes the Ten-Tails for himself, casting the Infinite Tsukuyomi's stage.",
    canonPoint: 'Madara betrayed Obito and took the Ten-Tails for himself.',
    from: { year: 23, month: 1, day: 12 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: ['Madara betrayed Obito and took the Ten-Tails.'],
  },
  {
    id: 'kaguya-awakens',
    era: 'The Fourth War',
    title: 'Kaguya returns',
    description: 'Black Zetsu betrays Madara and Kaguya Otsutsuki returns, the true architect of the infinite dream.',
    canonPoint: 'Kaguya Otsutsuki has returned.',
    from: { year: 23, month: 1, day: 13 },
    to: { year: 23, month: 1, day: 14 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: ['Kaguya Otsutsuki returned through Madara.'],
  },
  {
    id: 'obito-redemption',
    era: 'The Fourth War',
    title: "Obito's choice",
    description: 'Obito turns against Madara and dies protecting Kakashi and Naruto, choosing the boy he could have been.',
    canonPoint: 'Obito Uchiha turned against Madara and died defending his old team.',
    from: { year: 23, month: 1, day: 13 },
    to: { year: 23, month: 1, day: 14 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    knowledge: 'witnesses',
    major: true,
    deaths: ['Obito Uchiha'],
    facts: ['Obito Uchiha turned against Madara and died defending Kakashi and Naruto.'],
  },
  {
    id: 'kaguya-sealed',
    era: 'The Fourth War',
    title: 'The infinite dream ends',
    description: 'Team 7 seals Kaguya and ends the infinite dream.',
    canonPoint: 'Kaguya has been sealed by Team 7.',
    setsStatus: { 'Kaguya Ōtsutsuki': 'Sealed' },
    from: { year: 23, month: 1, day: 13 },
    to: { year: 23, month: 1, day: 14 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    facts: ['Team 7 sealed Kaguya Otsutsuki.'],
  },
  {
    id: 'war-ends',
    era: 'The Fourth War',
    title: 'The sealing',
    description: 'The Allied Forces prevail and the Fourth Shinobi World War formally ends.',
    canonPoint: 'The Fourth Shinobi World War has ended.',
    from: { year: 23, month: 1, day: 13 },
    to: { year: 23, month: 2 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    major: true,
    // The Hokage pass on when the war is over; Madara dies with it.
    releases: { all: true },
    deaths: ['Madara Uchiha'],
    // Torn out of Madara, the beasts go free; Kurama and Gyūki stay with Naruto and Bee.
    setsStatus: {
      Shukaku: 'Free',
      Matatabi: 'Free',
      Isobu: 'Free',
      'Son Gokū': 'Free',
      Kokuō: 'Free',
      Saiken: 'Free',
      Chōmei: 'Free',
      'Nine-Tails': 'Sealed in Naruto',
      Gyūki: 'Sealed in Killer Bee',
    },
    facts: [
      'The Fourth Shinobi World War ended after four days with Kaguya sealed.',
      'Madara Uchiha died after the tailed beasts were torn out of him, with Hashirama at his side.',
    ],
  },
  {
    id: 'valleys-end',
    era: 'The Fourth War',
    title: "The valley's end",
    description: 'Naruto and Sasuke fight their final battle at the Valley of the End, each losing an arm, and release the infinite dream together.',
    canonPoint: 'Naruto and Sasuke ended their war at the Valley of the End.',
    from: { year: 23, month: 1, day: 13 },
    to: { year: 23, month: 1, day: 20 },
    region: 'Land of Fire',
    location: 'the Valley of the End',
    knowledge: 'witnesses',
    major: true,
    facts: ['Naruto and Sasuke had their final battle and were both maimed by it.'],
  },
  {
    id: 'epilogue',
    era: 'After',
    title: 'The world after',
    description: 'The villages bury their dead and rebuild. Your place in the new world is yours to write.',
    canonPoint: 'The war is over and the villages are rebuilding.',
    from: { year: 23, month: 2 },
    to: { year: 24, month: 6 },
    playerDriven: true,
    facts: [],
  },
  {
    id: 'sasuke-trial',
    era: 'After',
    title: "Sasuke's pardon",
    description: "Kakashi and Naruto speak for him, and Sasuke is pardoned. He leaves Hidden Leaf to walk the world, atoning in his own way — with one arm, and Kakashi's trust.",
    canonPoint: 'Sasuke Uchiha has been pardoned and left Hidden Leaf.',
    from: { year: 23, month: 5 },
    to: { year: 24, month: 6 },
    facts: ['Sasuke Uchiha was pardoned and left Hidden Leaf to travel.'],
  },
  {
    id: 'naruto-hokage',
    era: 'After',
    title: 'The Seventh Hokage',
    description: "More than ten years after the war, Kakashi steps down and Naruto Uzumaki becomes the Seventh Hokage, with Shikamaru as his adviser.",
    canonPoint: 'Naruto Uzumaki is the Seventh Hokage.',
    from: { year: 33, month: 10 },
    to: { year: 35, month: 12 },
    major: true,
    facts: ['Naruto Uzumaki became the Seventh Hokage.'],
  },
  {
    id: 'kan-legacy',
    era: 'After',
    title: 'Your legacy',
    description: 'Your place in the new world: the people you saved, the ones you lost, and what you leave behind.',
    canonPoint: 'Your story is settling into its legacy.',
    from: { year: 23, month: 2 },
    to: { year: 36, month: 12 },
    playerDriven: true,
    facts: [],
  },
];

// ---------------------------------------------------------------------------
// The living world: village news, the other beast hunts, and the long after.
// Hunts come in pairs: a personal offer (Kan can be on it) that closes on the
// day the world event fires, whether or not Kan went.
// ---------------------------------------------------------------------------

const WORLD_EXPANSION: CanonMilestone[] = [
  // --- Ashes / The shadow war (13-17) -------------------------------------
  {
    id: 'itachi-bingo-book',
    era: 'Ashes',
    title: 'Itachi in the bingo books',
    description:
      "Hidden Leaf names Itachi Uchiha the sole killer of his clan and lists him as an S-rank missing-nin. Bounty stations across the nations pin up his face; Sasuke is the only Uchiha left inside the Leaf's walls.",
    canonPoint: 'Itachi Uchiha is listed in every bingo book as an S-rank missing-nin.',
    from: { year: 13, month: 10, day: 20 },
    to: { year: 14, month: 4 },
    region: 'Land of Fire',
    location: 'bounty stations across the nations',
    facts: [
      'Hidden Leaf declared Itachi Uchiha an S-rank missing-nin for the Uchiha massacre.',
      'Sasuke Uchiha is the only Uchiha still living in Hidden Leaf.',
    ],
  },
  {
    id: 'mist-civil-war',
    era: 'The shadow war',
    title: 'The Bloody Mist bleeds',
    description:
      'Under the Fourth Mizukage, Yagura, the Hidden Mist hunts its own bloodline clans and makes its students kill each other to graduate. Rebels gather around Mei Terumī, and the Land of Water slides into open civil war.',
    canonPoint: 'The Hidden Mist is torn by civil war against the Fourth Mizukage.',
    from: { year: 15, month: 3 },
    to: { year: 17, month: 3 },
    region: 'Hidden Mist',
    location: 'the Hidden Mist Village',
    facts: [
      'The Hidden Mist under the Fourth Mizukage, Yagura, persecutes bloodline clans and is called the Bloody Mist.',
      'Rebels led by Mei Terumī are fighting the Fourth Mizukage.',
    ],
  },
  {
    id: 'wind-budget-cuts',
    era: 'The shadow war',
    title: 'The Sand goes hungry',
    description:
      "The Daimyo of the Land of Wind cuts the Hidden Sand's funding and sends his missions to the Leaf instead. The Fourth Kazekage starts looking for allies who can make his village feared again.",
    from: { year: 17, month: 2 },
    to: { year: 17, month: 12 },
    region: 'Hidden Sand',
    location: 'the Hidden Sand Village',
    facts: [
      "The Daimyo of the Land of Wind cut the Hidden Sand's funding and sends missions to Hidden Leaf instead.",
    ],
  },

  // --- Part 1 (17-18) ------------------------------------------------------
  {
    id: 'mizuki-incident',
    era: 'Part 1',
    title: 'The Scroll of Seals',
    description:
      "Tricked by the instructor Mizuki, Naruto Uzumaki steals the Scroll of Seals, learns the Shadow Clone Jutsu in a single night, and beats Mizuki with it. Iruka ties his own headband on him; Naruto graduates after all.",
    from: { year: 17, month: 7, day: 20 },
    to: { year: 17, month: 10 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: [
      'Naruto Uzumaki graduated the Academy after stopping the traitor Mizuki.',
      'Mizuki was arrested and imprisoned for trying to steal the Scroll of Seals.',
      'Naruto Uzumaki can make hundreds of shadow clones.',
    ],
  },
  {
    id: 'itachi-leaf-incursion',
    era: 'Part 1',
    title: 'Itachi walks back into the Leaf',
    description:
      "Days after the Third Hokage's funeral, Itachi and Kisame walk into Hidden Leaf. Kakashi falls to Tsukuyomi against them, Might Guy drives them off, and Sasuke is found broken at a roadside inn after Itachi tortures him in a dream.",
    canonPoint: "Itachi and Kisame struck inside Hidden Leaf; Kakashi and Sasuke lie in Tsukuyomi comas.",
    from: { year: 18, month: 3, day: 20 },
    to: { year: 18, month: 6 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: [
      'Itachi Uchiha and Kisame Hoshigaki entered Hidden Leaf after the Third Hokage’s funeral and fought Kakashi, Asuma, and Kurenai.',
      "Kakashi Hatake and Sasuke Uchiha were left comatose by Itachi's Tsukuyomi.",
    ],
  },
  {
    id: 'sand-leaf-alliance',
    era: 'Part 1',
    title: "The Sand's apology",
    description:
      "The Hidden Sand finds its Kazekage's body in the desert and learns Orochimaru wore his face during the invasion. The Sand surrenders, apologizes, and renews its alliance with the Leaf.",
    canonPoint: 'The Hidden Sand has renewed its alliance with Hidden Leaf.',
    from: { year: 18, month: 3, day: 25 },
    to: { year: 18, month: 9 },
    region: 'Hidden Sand',
    location: 'the Hidden Sand Village',
    facts: [
      'The Hidden Sand learned Orochimaru murdered the Fourth Kazekage and renewed its alliance with Hidden Leaf.',
    ],
  },
  {
    id: 'shikamaru-chunin',
    era: 'Part 1',
    title: 'One new chunin',
    description:
      'The exam results are posted at last. Of every genin who entered, only Shikamaru Nara — who forfeited a match he was winning — is promoted to chunin.',
    from: { year: 18, month: 4, day: 10 },
    to: { year: 18, month: 7 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Shikamaru Nara was the only genin promoted to chunin after the exams.'],
  },
  {
    id: 'sound-four-fall',
    era: 'Part 1',
    title: 'The retrieval squad',
    description:
      "Shikamaru's squad chases Sasuke and pays in blood. Jirōbō, Kidōmaru, Sakon and Ukon, and Tayuya of the Sound Four are dead; Kimimaro's illness kills him mid-fight against Gaara. Choji and Neji barely live, and the Sand siblings arrived as Leaf allies.",
    from: { year: 18, month: 5, day: 2 },
    to: { year: 18, month: 7 },
    region: 'Land of Fire',
    location: 'the forests between Hidden Leaf and the Valley of the End',
    knowledge: 'village',
    deaths: ['Jirōbō', 'Kidōmaru', 'Sakon', 'Ukon', 'Tayuya', 'Kimimaro'],
    facts: [
      'The Sound Four and Kimimaro died fighting the Sasuke retrieval squad.',
      'Gaara, Temari, and Kankurō of the Sand came to Hidden Leaf’s aid during the retrieval.',
    ],
  },

  // --- The hidden years (18-20) -------------------------------------------
  {
    id: 'sakura-apprentice',
    era: 'The hidden years',
    title: "Tsunade's apprentice",
    description:
      'With Naruto gone and Sasuke lost, Sakura Haruno begs the Fifth Hokage to teach her. Tsunade takes her on: medical ninjutsu, and fists that crack the earth.',
    from: { year: 18, month: 7, day: 15 },
    to: { year: 19, month: 1 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Sakura Haruno is apprenticed to the Fifth Hokage, Tsunade.'],
  },
  {
    id: 'kan-hunt-five-tails',
    era: 'The hidden years',
    title: 'The steam-armored man',
    description:
      'Pain names the first beast: Han of the Hidden Stone, the Five-Tails’ jinchūriki. Canon never says who took him. It could be you.',
    canonPoint: 'You took part in the hunt for the Five-Tails.',
    from: { year: 19, month: 6 },
    to: { year: 19, month: 10 },
    region: 'Land of Earth',
    location: 'the mountain roads of the Land of Earth',
    playerDriven: true,
    facts: [],
    encounter: {
      who: "Han, the Five-Tails' jinchūriki",
      where: 'the mountain roads of the Land of Earth',
      context:
        'Han is huge, quiet, and armored in boiling steam. Pain wants him alive. Kan can volunteer, be sent with Kakuzu, or refuse and let another pair take him.',
    },
    attendanceFact: 'Kan took part in the capture of Han and the Five-Tails.',
  },
  {
    id: 'five-tails-captured',
    era: 'The hidden years',
    title: 'The Five-Tails sealed',
    description:
      "Han and the Five-Tails are taken and sealed into the statue over three days and nights. Every member is summoned by Pain's phantom technique to lend chakra. Han does not survive the extraction.",
    canonPoint: "The Five-Tails is sealed in the Akatsuki's statue.",
    artDirection: 'the giant statue in a dark cavern, Akatsuki members standing on its fingers, beams of chakra drawn from the body below',
    from: { year: 19, month: 10 },
    to: { year: 20, month: 1 },
    region: 'Land of Earth',
    location: 'an Akatsuki cave in the Land of Earth',
    knowledge: 'akatsuki',
    deaths: ['Han'],
    facts: [
      'The Akatsuki captured Han and extracted the Five-Tails; Han died.',
      'Each extraction takes three days and nights, and every Akatsuki member lends chakra to the statue.',
    ],
  },
  {
    id: 'kan-hunt-seven-tails',
    era: 'The hidden years',
    title: "Kakuzu's job in the Waterfall",
    description:
      'Kakuzu and Hidan are sent for the Seven-Tails: Fū of the Hidden Waterfall. Kakuzu has a use for his old partner — a third pair of hands is cheaper than a mistake.',
    canonPoint: 'You hunted the Seven-Tails with Kakuzu.',
    from: { year: 20, month: 2 },
    to: { year: 20, month: 6 },
    region: 'Land of Waterfalls',
    location: 'the forests around the Hidden Waterfall Village',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kakuzu and Hidan, hunting Fū',
      where: 'the forests around the Hidden Waterfall Village',
      context:
        'Fū is cheerful, lonely, and flies on insect wings. Kakuzu wants it done fast with a bounty on the side; Hidan wants a sacrifice. Kan can join them, steer the hunt, or stay out of it.',
    },
    attendanceFact: 'Kan hunted Fū and the Seven-Tails beside Kakuzu and Hidan.',
  },
  {
    id: 'yagura-dies',
    era: 'The hidden years',
    title: 'The Fourth Mizukage falls',
    description:
      'Yagura, the Fourth Mizukage, is dead, and the Bloody Mist era dies with him. His Three-Tails reforms in the lakes of the Land of Water, masterless.',
    canonPoint: 'The Fourth Mizukage is dead; the Bloody Mist era is over.',
    from: { year: 20, month: 3 },
    to: { year: 20, month: 8 },
    region: 'Hidden Mist',
    location: 'the Hidden Mist Village',
    deaths: ['Yagura', 'Yagura Karatachi'],
    facts: [
      'Yagura, the Fourth Mizukage and the Three-Tails’ jinchūriki, is dead.',
      'The Three-Tails roams free in the lakes of the Land of Water.',
    ],
  },
  {
    id: 'yagura-puppet',
    era: 'The hidden years',
    title: "The Mizukage's strings",
    description:
      "What almost no one will ever learn: for years Yagura ruled under a Sharingan genjutsu cast by the masked man. The Bloody Mist was his work. Kisame, who served him in the Mist, knows.",
    from: { year: 20, month: 3, day: 2 },
    to: { year: 20, month: 8 },
    region: 'Hidden Mist',
    location: 'the Hidden Mist Village',
    knowledge: 'secret',
    bearers: ['Tobi', 'Kisame Hoshigaki'],
    facts: [],
  },
  {
    id: 'mei-mizukage',
    era: 'The hidden years',
    title: 'Mei Terumī becomes Fifth Mizukage',
    description:
      'The rebel leader Mei Terumī takes the hat of the Fifth Mizukage and starts dismantling the Bloody Mist: the death exams end, and the Mist opens its doors to the other villages again.',
    canonPoint: 'Mei Terumī is the Fifth Mizukage of the Hidden Mist.',
    from: { year: 20, month: 5 },
    to: { year: 20, month: 11 },
    region: 'Hidden Mist',
    location: 'the Hidden Mist Village',
    facts: [
      'Mei Terumī became the Fifth Mizukage.',
      'The Hidden Mist ended its death-match graduation exams.',
    ],
  },
  {
    id: 'seven-tails-captured',
    era: 'The hidden years',
    title: 'The Seven-Tails sealed',
    description:
      "Kakuzu and Hidan bring Fū in, and the Seven-Tails is sealed into the statue. Fū does not survive the extraction. Kakuzu collects on the side.",
    canonPoint: "The Seven-Tails is sealed in the Akatsuki's statue.",
    artDirection: 'the giant statue in a dark cavern, Akatsuki members standing on its fingers, beams of chakra drawn from the body below',
    from: { year: 20, month: 6 },
    to: { year: 20, month: 9 },
    region: 'Land of Waterfalls',
    location: 'an Akatsuki cave',
    knowledge: 'akatsuki',
    deaths: ['Fū'],
    facts: ['Kakuzu and Hidan captured Fū and the Seven-Tails was extracted; Fū died.'],
  },
  {
    id: 'rookies-rise',
    era: 'The hidden years',
    title: 'The rookies grow up',
    description:
      "Two and a half years change the Leaf's genin. Neji Hyuga makes jonin, nearly all the rest make chunin, Temari of the Sand is the Sand's envoy to the Leaf — and Naruto, away with Jiraiya, is still a genin.",
    from: { year: 20, month: 9 },
    to: { year: 21, month: 1 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: [
      'Neji Hyuga was promoted to jonin.',
      "Most of Hidden Leaf's rookie genin are now chunin; Naruto Uzumaki is still a genin.",
    ],
  },
  {
    id: 'kan-hunt-one-tail',
    era: 'The hidden years',
    title: 'The young Kazekage',
    description:
      "Deidara and Sasori are given the One-Tails — Gaara, now the Fifth Kazekage. Sasori's sleeper inside the Sand has already opened the gate.",
    canonPoint: 'You rode with Deidara and Sasori against the Hidden Sand.',
    from: { year: 20, month: 10 },
    to: { year: 21, month: 1 },
    region: 'Hidden Sand',
    location: 'the desert outside the Hidden Sand',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Deidara and Sasori',
      where: 'the desert outside the Hidden Sand',
      context:
        'Deidara wants to prove his art against the Kazekage; Sasori hates waiting. Kan can ride along, stand watch at the hideout, or keep his distance and watch.',
    },
    attendanceFact: 'Kan took part in the capture of Gaara, the Fifth Kazekage.',
  },
  {
    id: 'naruto-returns',
    era: 'Shippuden',
    title: 'Naruto comes home',
    description:
      "After two and a half years on the road with Jiraiya, Naruto Uzumaki walks back through the Leaf's gate taller and steadier. Within days he and Sakura take Kakashi's bells.",
    from: { year: 20, month: 12, day: 20 },
    to: { year: 21, month: 2 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Naruto Uzumaki returned to Hidden Leaf after two and a half years of training with Jiraiya.'],
  },

  // --- Shippuden (21) -------------------------------------------------------
  {
    id: 'kan-hunt-two-tails',
    era: 'Shippuden',
    title: 'Two immortals and a cat',
    description:
      'Hidan and Kakuzu are sent into the Land of Lightning for Yugito Nii, the Two-Tails’ jinchūriki of the Hidden Cloud. Kakuzu would take a third pair of hands that knows how he works.',
    canonPoint: 'You hunted the Two-Tails with Hidan and Kakuzu.',
    from: { year: 21, month: 1, day: 15 },
    to: { year: 21, month: 3, day: 10 },
    region: 'Land of Lightning',
    location: 'the caverns near the Hidden Cloud',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hidan and Kakuzu, hunting Yugito Nii',
      where: 'the caverns near the Hidden Cloud',
      context:
        'Yugito is a seasoned jinchūriki who can become a burning two-tailed cat. Hidan wants a ritual; Kakuzu wants it finished before the Cloud notices. Kan can join, sabotage, or refuse.',
    },
    attendanceFact: 'Kan hunted Yugito Nii beside Hidan and Kakuzu.',
  },
  {
    id: 'sai-yamato',
    era: 'Shippuden',
    title: "Team Kakashi's new faces",
    description:
      "With Kakashi bedridden from Sharingan strain, Tsunade fills Team Kakashi: Yamato, an ANBU captain who uses Wood Release, and Sai, a Root operative who smiles like he learned it from a book.",
    from: { year: 21, month: 2, day: 20 },
    to: { year: 21, month: 5 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: [
      'Yamato and Sai joined Team Kakashi.',
      "Yamato uses Wood Release; Sai comes from Danzo's Root.",
    ],
  },
  {
    id: 'chiriku-killed',
    era: 'Shippuden',
    title: "The Fire Temple's monk",
    description:
      'Hidan and Kakuzu walk into the Fire Temple for a bounty. Chiriku, one of the Twelve Guardian Ninja, dies, and Kakuzu cashes his body at a bounty station.',
    from: { year: 21, month: 3, day: 25 },
    to: { year: 21, month: 6 },
    region: 'Land of Fire',
    location: 'the Fire Temple',
    deaths: ['Chiriku'],
    facts: ['Hidan and Kakuzu killed the monk Chiriku of the Fire Temple and sold his body for the bounty.'],
  },
  {
    id: 'kurenai-pregnant',
    era: 'Shippuden',
    title: "Asuma's child",
    description:
      "In the weeks after Asuma's funeral, word moves quietly through the Leaf: Kurenai Yuhi is carrying his child. Shikamaru swears he will teach it what Asuma taught him.",
    from: { year: 21, month: 5 },
    to: { year: 21, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ["Kurenai Yuhi is pregnant with Asuma Sarutobi's child."],
  },
  {
    id: 'kan-hunt-four-tails',
    era: 'Shippuden',
    title: 'Kisame and the Four-Tails',
    description:
      'Kisame goes after Rōshi of the Hidden Stone, the lava-wielding Four-Tails’ jinchūriki, while Itachi keeps to himself. Kisame would not mind company.',
    canonPoint: 'You hunted the Four-Tails with Kisame.',
    from: { year: 21, month: 5, day: 10 },
    to: { year: 21, month: 7 },
    region: 'Land of Earth',
    location: 'the volcanic hot-spring country of the Land of Earth',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kisame Hoshigaki, hunting Rōshi',
      where: 'the volcanic hot-spring country of the Land of Earth',
      context:
        'Rōshi is old, proud, and melts stone. Samehada wants his chakra. Kan can fight beside Kisame, watch, or let the old man run.',
    },
    attendanceFact: 'Kan fought Rōshi and the Four-Tails beside Kisame.',
  },
  {
    id: 'kan-hunt-six-tails',
    era: 'Shippuden',
    title: 'The bubble man',
    description:
      'Pain himself goes after Utakata, the Six-Tails’ jinchūriki, a Mist deserter wandering the Land of Water with a young apprentice who trusts him too much.',
    canonPoint: "You went with Pain after the Six-Tails.",
    from: { year: 21, month: 6, day: 15 },
    to: { year: 21, month: 8 },
    region: 'Land of Water',
    location: 'the coasts and marshes of the Land of Water',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Pain, hunting Utakata',
      where: 'the coasts and marshes of the Land of Water',
      context:
        'Utakata fights with soap bubbles and trusts no one; his apprentice Hotaru trusts him completely. Pain wants a witness from the organization, not a partner. Kan can go, watch from the edges, or warn Utakata.',
    },
    attendanceFact: 'Kan was there when Pain captured Utakata and the Six-Tails.',
  },
  {
    id: 'four-tails-captured',
    era: 'Shippuden',
    title: 'The Four-Tails sealed',
    description:
      'Kisame brings Rōshi in, and the Four-Tails is sealed into the statue over three days and nights. Rōshi dies when the beast is torn out.',
    canonPoint: "The Four-Tails is sealed in the Akatsuki's statue.",
    artDirection: 'the giant statue in a dark cavern, Akatsuki members standing on its fingers, beams of chakra drawn from the body below',
    from: { year: 21, month: 7 },
    to: { year: 21, month: 10 },
    region: 'Land of Earth',
    location: 'an Akatsuki cave',
    knowledge: 'akatsuki',
    deaths: ['Rōshi', 'Roshi'],
    facts: ['Kisame Hoshigaki captured Rōshi and the Four-Tails was extracted; Rōshi died.'],
  },
  {
    id: 'six-tails-captured',
    era: 'Shippuden',
    title: 'The Six-Tails sealed',
    description:
      'Pain takes Utakata, and the Six-Tails joins the others in the statue. Seven of the nine beasts are now sealed; only the Eight-Tails and the Nine-Tails remain.',
    canonPoint: 'Seven of the nine tailed beasts are sealed; only the Eight-Tails and Nine-Tails remain.',
    from: { year: 21, month: 8 },
    to: { year: 21, month: 11 },
    region: 'Land of Water',
    location: 'an Akatsuki cave',
    knowledge: 'akatsuki',
    deaths: ['Utakata'],
    facts: [
      'Pain captured Utakata and the Six-Tails was extracted; Utakata died.',
      'Only the Eight-Tails and the Nine-Tails remain outside the statue.',
    ],
  },
  {
    id: 'itachi-pursuit',
    era: 'Shippuden',
    title: 'The hunt for the Uchiha brothers',
    description:
      'Team Kakashi and Team 8 race through the Land of Fire to reach Sasuke before he reaches Itachi. The masked man and Zetsu stand in the road and stall them for hours.',
    from: { year: 21, month: 8, day: 25 },
    to: { year: 21, month: 9, day: 20 },
    region: 'Land of Fire',
    location: 'the roads of the Land of Fire',
    knowledge: 'village',
    facts: ['Team Kakashi and Team 8 hunted for Sasuke and Itachi and were held up by the masked man.'],
  },
  {
    id: 'taka-formed',
    era: 'Shippuden',
    title: 'Snake becomes Hawk',
    description:
      "Knowing now what the Leaf did to his clan, Sasuke renames Hebi to Taka — Hawk — and lends it to the masked man's Akatsuki. Its target is Hidden Leaf.",
    canonPoint: "Sasuke's Taka works with the Akatsuki and has turned on Hidden Leaf.",
    from: { year: 21, month: 9, day: 20 },
    to: { year: 21, month: 12 },
    region: 'Land of Fire',
    location: 'an Akatsuki hideout',
    knowledge: 'akatsuki',
    facts: ['Sasuke renamed Hebi to Taka (Hawk) and joined forces with the Akatsuki to destroy Hidden Leaf.'],
  },

  // --- The sky falls (22) ----------------------------------------------------
  {
    id: 'raikage-fury',
    era: 'The sky falls',
    title: "The Raikage's fury",
    description:
      'The Fourth Raikage learns his brother Killer Bee was taken by an Uchiha in an Akatsuki cloak. He demands answers from the Leaf and calls the five Kage to the Land of Iron.',
    from: { year: 22, month: 2, day: 10 },
    to: { year: 22, month: 3 },
    region: 'Land of Lightning',
    location: 'the Hidden Cloud Village',
    facts: ["The Fourth Raikage called a Five Kage Summit after his brother Killer Bee was taken by Sasuke's team."],
  },
  {
    id: 'tsunade-wakes',
    era: 'The sky falls',
    title: 'Tsunade wakes',
    description:
      "Tsunade wakes from the coma Pain's assault left her in and takes her hat back from a dead man's council. Kakashi's brief nomination as Sixth Hokage is set aside.",
    canonPoint: 'Tsunade is awake and Hokage again.',
    from: { year: 22, month: 4 },
    to: { year: 22, month: 7 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Tsunade woke from her coma and resumed her duties as Fifth Hokage.'],
  },
  {
    id: 'sasuke-itachi-eyes',
    era: 'The sky falls',
    title: "Itachi's eyes",
    description:
      "In the masked man's lair, Sasuke has Itachi's eyes transplanted into his own sockets and wakes behind bandages with the Eternal Mangekyō Sharingan.",
    from: { year: 22, month: 4, day: 10 },
    to: { year: 22, month: 10 },
    region: 'Land of Fire',
    location: "the masked man's hidden lair",
    knowledge: 'secret',
    bearers: ['Tobi', 'Sasuke Uchiha'],
    facts: [],
  },
  {
    id: 'alliance-mobilizes',
    era: 'The sky falls',
    title: 'The Allied Shinobi Forces muster',
    description:
      'Eighty thousand shinobi from five villages form one army in five divisions. The Raikage commands, Gaara leads the field forces, and Shikaku Nara runs the war from headquarters in the Land of Lightning.',
    canonPoint: 'The five villages have formed the Allied Shinobi Forces and are mobilizing for war.',
    from: { year: 22, month: 8, day: 15 },
    to: { year: 23, month: 1, day: 9 },
    region: 'Land of Lightning',
    location: 'the Allied headquarters',
    facts: [
      'The Allied Shinobi Forces number about eighty thousand shinobi in five divisions.',
      'Gaara commands the field forces; Shikaku Nara leads strategy from headquarters.',
    ],
  },
  {
    id: 'kurama-mastered',
    era: 'The sky falls',
    title: 'Naruto and the Nine-Tails',
    description:
      "Behind the Falls of Truth, Naruto defeats his own hatred, meets what remains of his mother Kushina in the seal, and tears the Nine-Tails' chakra out of its cage.",
    from: { year: 22, month: 12, day: 10 },
    to: { year: 23, month: 1, day: 9 },
    region: 'Land of Lightning',
    location: 'the Falls of Truth on the Island Turtle',
    knowledge: 'village',
    facts: ["Naruto Uzumaki learned to control the Nine-Tails' chakra and met his mother's chakra in the seal."],
  },
  {
    id: 'yamato-captured',
    era: 'The sky falls',
    title: 'Yamato is taken',
    description:
      'Kabuto and Zetsu slip onto the Island Turtle and carry Yamato away, to farm his Wood Release cells for the white Zetsu army.',
    from: { year: 22, month: 12, day: 20 },
    to: { year: 23, month: 1, day: 9 },
    region: 'Land of Lightning',
    location: 'the Island Turtle',
    knowledge: 'village',
    facts: ['Kabuto Yakushi captured Yamato on the Island Turtle.'],
  },

  // --- The Fourth War (23/1/10 - 23/1/13) ------------------------------------
  {
    id: 'edo-dead-march',
    era: 'The Fourth War',
    title: 'The dead march',
    reanimates: { names: ['Zabuza Momochi', 'Haku', 'Rasa'], by: 'Kabuto' },
    description:
      "Kabuto's coffins open across the front: the Seven Swordsmen of the Mist, Zabuza and Haku against Kakashi's division, and four dead Kage — Gaara's father Rasa among them — against Gaara's.",
    from: { year: 23, month: 1, day: 10 },
    to: { year: 23, month: 1, day: 12 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    facts: ["Kabuto's Edo Tensei sent dead shinobi into the war, among them Zabuza, Haku, and four former Kage."],
  },
  {
    id: 'naruto-joins-war',
    era: 'The Fourth War',
    title: 'Naruto reaches the front',
    description:
      "Naruto and Killer Bee break out of the Island Turtle. Naruto's shadow clones, burning with the Nine-Tails' golden chakra, reach every division at once and expose the white Zetsu hiding in the ranks.",
    from: { year: 23, month: 1, day: 11 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    facts: ['Naruto Uzumaki joined the war and spread his clones across every division.'],
  },
  {
    id: 'itachi-izanami',
    era: 'The Fourth War',
    title: 'Izanami',
    // Madara cut himself free of the jutsu and stayed.
    releases: { by: 'Kabuto', except: ['Madara Uchiha'] },
    description:
      'Free of Kabuto, Itachi finds Sasuke and fights beside his little brother one last time. He traps Kabuto in Izanami — a loop that ends only when Kabuto accepts who he is — and through him releases Edo Tensei. Itachi tells Sasuke the truth, says goodbye, and passes on.',
    canonPoint: 'Itachi stopped Kabuto with Izanami, ended Edo Tensei, and passed on.',
    from: { year: 23, month: 1, day: 11 },
    to: { year: 23, month: 1, day: 12 },
    region: 'Land of Lightning',
    location: "the caverns where Kabuto hides",
    knowledge: 'witnesses',
    major: true,
    facts: [
      'Edo Tensei Itachi trapped Kabuto in Izanami and released the Edo Tensei; the reanimated dead passed on.',
      'Madara Uchiha had cut himself free of the jutsu and stayed.',
      'Itachi told Sasuke the truth about the massacre before he passed on.',
    ],
    encounter: {
      who: 'Itachi Uchiha (Edo Tensei) and Sasuke Uchiha',
      where: 'the caverns where Kabuto hides',
      context:
        "Itachi's last hours walking the world. If Kan reaches the brothers, he can fight beside them against Kabuto and hear Itachi's goodbye — to Sasuke, and to him.",
    },
    attendanceFact: "Kan stood with Itachi and Sasuke against Kabuto and heard Itachi's goodbye.",
  },
  {
    id: 'gai-night-guy',
    era: 'The Fourth War',
    title: 'Night Guy',
    description:
      "Might Guy opens the Eighth Gate, the Gate of Death, and nearly kills Madara with a single kick. He lives only because Naruto's new power holds his burning body together; his leg is ruined for good.",
    from: { year: 23, month: 1, day: 12 },
    to: { year: 23, month: 1, day: 13 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    facts: ['Might Guy opened the Eighth Gate against Madara and survived, crippled.'],
  },
  {
    id: 'infinite-tsukuyomi',
    era: 'The Fourth War',
    title: 'The Infinite Tsukuyomi',
    description:
      "Madara casts his eye onto the moon. Its light pours across the world and everyone it touches falls into a dream of the life they wanted, wrapped in the roots of the God Tree. Only Team 7, under Sasuke's Susanoo, stays awake.",
    canonPoint: 'The Infinite Tsukuyomi holds the world in a dream.',
    from: { year: 23, month: 1, day: 12 },
    to: { year: 23, month: 1, day: 13 },
    region: 'the shinobi world',
    location: 'everywhere under the moon',
    major: true,
    facts: ['Madara cast the Infinite Tsukuyomi; nearly everyone alive was caught in the dream.'],
    encounter: {
      who: "the moon's light",
      where: 'everywhere under the sky',
      context:
        "Unless Kan is shielded — inside Sasuke's Susanoo, or truly hidden from the moon — he falls into a dream of the life he wanted until Naruto and Sasuke break it.",
    },
    attendanceFact: 'Kan was caught in the Infinite Tsukuyomi, or saw it fall.',
  },

  // --- After -----------------------------------------------------------------
  {
    id: 'kakashi-elected',
    era: 'After',
    title: 'Kakashi, Hokage-elect',
    description:
      'Tsunade steps down. The daimyo and the council name Kakashi Hatake the next Hokage; he has a year to stop pretending he does not want it.',
    canonPoint: 'Kakashi Hatake has been named the next Hokage.',
    from: { year: 23, month: 3 },
    to: { year: 23, month: 8 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Kakashi Hatake was named Hokage-elect after the war.'],
  },
  {
    id: 'kakashi-hokage',
    era: 'After',
    title: 'The Sixth Hokage',
    description: 'Kakashi Hatake is inaugurated as the Sixth Hokage of Hidden Leaf.',
    canonPoint: 'Kakashi Hatake is the Sixth Hokage.',
    from: { year: 24, month: 3 },
    to: { year: 24, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    major: true,
    facts: ['Kakashi Hatake became the Sixth Hokage.'],
  },
  {
    id: 'the-falling-moon',
    era: 'After',
    title: 'The falling moon',
    description:
      'Toneri Ōtsutsuki steals Hanabi Hyuga’s eyes, drags the moon toward the earth, and tries to take Hinata as his bride. Naruto’s team follows them to the moon and back; Naruto and Hinata come home together.',
    canonPoint: 'The falling moon was stopped; Naruto Uzumaki and Hinata Hyuga are together.',
    from: { year: 24, month: 12 },
    to: { year: 25, month: 2 },
    region: 'the shinobi world',
    location: 'the sky over the five nations',
    major: true,
    facts: [
      'Toneri Ōtsutsuki nearly dropped the moon onto the earth; Naruto and his friends stopped him.',
      'Naruto Uzumaki and Hinata Hyuga are a couple.',
    ],
  },
  {
    id: 'sakura-clinic',
    era: 'After',
    title: "Sakura's clinic",
    description:
      "Sakura Haruno opens a clinic in the Leaf for the children the war broke in ways medical ninjutsu cannot reach.",
    from: { year: 25, month: 2 },
    to: { year: 25, month: 8 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ["Sakura Haruno opened a children's mental health clinic in Hidden Leaf."],
  },
  {
    id: 'naruto-hinata-wedding',
    era: 'After',
    title: 'The wedding',
    description:
      'Naruto Uzumaki marries Hinata Hyuga in Hidden Leaf. Half the shinobi world comes; Sasuke sends word from the road.',
    canonPoint: 'Naruto Uzumaki and Hinata Hyuga are married.',
    from: { year: 25, month: 5 },
    to: { year: 25, month: 10 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    facts: ['Naruto Uzumaki married Hinata Hyuga.'],
  },
  {
    id: 'boruto-born',
    era: 'After',
    title: "Naruto's son",
    description: 'Hinata gives birth to a son, Boruto Uzumaki.',
    from: { year: 27, month: 3, day: 27 },
    to: { year: 27, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Boruto Uzumaki, son of Naruto and Hinata, was born.'],
  },
  {
    id: 'sarada-born',
    era: 'After',
    title: 'An Uchiha is born',
    description:
      "Far from the Leaf, travelling at Sasuke's side, Sakura gives birth to their daughter, Sarada Uchiha. The clan you came from is three people now, and one of them is new.",
    from: { year: 27, month: 3, day: 31 },
    to: { year: 27, month: 12 },
    region: 'the shinobi world',
    location: 'a hideout far from the Hidden Leaf',
    knowledge: 'village',
    facts: ['Sarada Uchiha, daughter of Sasuke and Sakura, was born away from the village.'],
  },
  {
    id: 'himawari-born',
    era: 'After',
    title: "Naruto's daughter",
    description: 'Naruto and Hinata have a daughter, Himawari Uzumaki.',
    from: { year: 30, month: 3, day: 21 },
    to: { year: 30, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Himawari Uzumaki, daughter of Naruto and Hinata, was born.'],
  },
];

// ---------------------------------------------------------------------------
// Kan's own story: Thousand Souls, the Uzumaki blood, the Mangekyō, Team 3,
// and the choices only an Uchiha in the Akatsuki would face. All personal:
// offered, never forced.
// ---------------------------------------------------------------------------

const PERSONAL_BEATS: CanonMilestone[] = [
  {
    id: 'kan-mangekyo',
    era: 'Ashes',
    title: "Izumi's grave: the Mangekyō",
    description:
      "You stand at Izumi's grave and finally let her be dead. The grief goes all the way down, and your Sharingan changes shape. It brings an ability that belongs to no other Uchiha, and a Susanoo of your own — and both cost your eyes a little every time.",
    canonPoint: "You awakened the Mangekyō Sharingan at Izumi's grave, with your own ability and a Susanoo.",
    from: { year: 13, month: 11 },
    to: { year: 17, month: 7, day: 31 },
    region: 'Land of Fire',
    location: 'the Uchiha cemetery outside the Hidden Leaf',
    playerDriven: true,
    priority: true,
    // Only once you know she is dead: you cannot grieve what you don't know.
    requires: { flag: 'knowsIzumiDead' },
    grantsAbilities: [
      { name: 'Mangekyō Sharingan', stage: 'awakened' },
      { name: 'Susanoo', stage: 'ribs and an arm' },
    ],
    completesWhen: "You stand at Izumi's grave, knowing she is dead, and the Mangekyō awakens on the page.",
    facts: [
      "Kan awakened the Mangekyō Sharingan at Izumi Uchiha's grave.",
      'Kan has his own Mangekyō ability, unique to him, and can manifest Susanoo.',
      'Every use of the Mangekyō or Susanoo wears down the eyes toward blindness.',
    ],
    grantsJutsu: [
      {
        name: 'Mangekyō Sharingan',
        chakraNature: 'Yin',
        effect:
          "Your own Mangekyō ability, born from Izumi's death. It belongs to no other Uchiha. If you say what it does, that is what it does; otherwise the story shapes it from your grief the first time you call on it, and once named it never changes. Each use strains your eyes toward blindness.",
        visual:
          "Your pattern is your own and never seen before. The eye bleeds a little when the ability is pushed.",
        description: "Your Mangekyō Sharingan and its unique ability, awakened at Izumi's grave.",
        tags: ['mangekyo', 'uchiha', 'dojutsu'],
      },
      {
        name: 'Susanoo',
        chakraNature: 'Yin',
        effect:
          'A giant chakra warrior rises around you, in a color that is yours. It grows in stages with practice and strain: ribs and an arm first, then a skeletal torso, then a muscled warrior, then full armor. Manifesting it strains your whole body and your eyes.',
        visual:
          'Chakra bones knit themselves around you in your color, then flesh, then armor, flickering at the edges like flame.',
        description: "The Susanoo of your Mangekyō Sharingan. It starts as ribs and grows with use.",
        tags: ['mangekyo', 'uchiha', 'susanoo'],
      },
    ],
    encounter: {
      who: "Izumi's grave",
      where: 'the Uchiha cemetery outside Hidden Leaf, usually at night',
      context:
        "This only happens when Kan comes to Izumi's grave knowing she is dead and lets the loss land. Alone, or found there by Hana or Itachi. The Mangekyō's pattern and ability are new; if the player names the ability, use it exactly. Susanoo starts as ribs and an arm.",
    },
  },

  // --- Itachi -----------------------------------------------------------------
  {
    id: 'itachi-sees-mangekyo',
    era: 'Ashes',
    title: 'Two Mangekyō',
    description:
      'Itachi sees your new eyes before you can hide them. He has carried the same pattern of grief since Shisui died. He tells you what it costs, how fast the dark comes, and that there is one way past it no one should take.',
    canonPoint: 'Itachi knows about your Mangekyō and has warned you of its cost.',
    from: { year: 13, month: 11 },
    to: { year: 18, month: 6 },
    playerDriven: true,
    after: 'kan-mangekyo',
    facts: [],
    encounter: {
      who: 'Itachi Uchiha',
      where: 'anywhere the two of them are alone',
      context:
        "Itachi's own Mangekyō came from Shisui's death. He knows about the blindness, and that taking a sibling's or close kin's eyes gives an Eternal Mangekyō. He would never want Kan to go that way, and will not say why it matters so much to him.",
    },
    attendanceFact: "Itachi saw Kan's Mangekyō and warned him of its cost.",
  },
  {
    id: 'itachi-last-night',
    era: 'Shippuden',
    title: 'The last night',
    description:
      'Itachi finds you the night before he goes to meet Sasuke. He does not say goodbye. He says something close to it.',
    canonPoint: 'Itachi came to you the night before his last battle.',
    from: { year: 21, month: 9, day: 1 },
    to: { year: 21, month: 9, day: 11 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Itachi Uchiha',
      where: 'wherever Kan is, the night before the Uchiha hideout',
      context:
        "Itachi is dying and nearly blind, and he means to die at Sasuke's hand. He may ask Kan to stay away, to look after Sasuke, or simply sit with him. He will not be talked out of it.",
    },
    attendanceFact: 'Itachi spent his last free night with Kan.',
  },

  // --- The Kakuzu years and Thousand Souls -----------------------------------
  {
    id: 'kakuzu-thousand-souls',
    era: 'Ashes',
    title: 'Kakuzu takes an interest',
    description:
      "Kakuzu watches you tear a chakra nature out of a dying man and keep it. He steals natures too — five hearts sewn into his back. He has never seen anyone do it without a knife.",
    canonPoint: 'Kakuzu has seen Thousand Souls.',
    from: { year: 14, month: 2 },
    to: { year: 15, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kakuzu',
      where: 'a mission with his partner',
      context:
        "Kakuzu has killed every partner who annoyed him. Thousand Souls fascinates him, threatens him, and makes him wonder what Kan's hearts would be worth. He may test Kan, bargain, or quietly plan.",
    },
    attendanceFact: 'Kakuzu saw Kan use Thousand Souls.',
  },
  {
    id: 'orochimaru-thousand-souls',
    era: 'Ashes',
    title: 'The snake hears of Thousand Souls',
    description:
      "Orochimaru learns that the Akatsuki's young Uchiha steals chakra natures — permanently — and that nobody taught him how. He wants to see it. He wants to own it.",
    canonPoint: 'Orochimaru has learned of Thousand Souls.',
    from: { year: 14, month: 9 },
    to: { year: 15, month: 6 },
    region: 'Hidden Rain',
    location: 'an Akatsuki hideout in the Hidden Rain',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Orochimaru',
      where: 'an Akatsuki hideout, between missions',
      context:
        "Orochimaru is still in the Akatsuki, planning to take Itachi's body. He is charming, patient, and asks questions with a scalpel's precision. Kan's Uchiha eyes and his jutsu both interest him; whatever Kan shows him, Orochimaru will remember after he leaves.",
    },
    attendanceFact: 'Orochimaru learned about Thousand Souls from Kan.',
  },
  {
    id: 'nagato-uzumaki',
    era: 'The shadow war',
    title: 'Uzumaki blood',
    description:
      "Pain's ringed eyes linger on you too long. Somewhere in the rain, the man behind them has felt chakra he knows — Uzumaki chakra, his own clan's — in an Uchiha.",
    canonPoint: 'Pain knows you carry Uzumaki blood.',
    from: { year: 14, month: 3 },
    to: { year: 16, month: 12 },
    region: 'Hidden Rain',
    location: 'the tower at the heart of the Hidden Rain',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Pain and Konan',
      where: 'the Hidden Rain tower',
      context:
        "Nagato is an Uzumaki and hides behind Pain's bodies. Konan may ask the questions he will not. A shared clan could make Kan valuable, trusted, or watched more closely than anyone.",
    },
    attendanceFact: "Pain and Konan learned of Kan's Uzumaki blood.",
  },
  {
    id: 'hidan-replaces-you',
    era: 'The shadow war',
    title: "Kakuzu's new partner",
    description:
      'Hidan of the Hidden Hot Water joins, and Pain gives him to Kakuzu: a partner Kakuzu cannot kill. Your years at Kakuzu’s side are over. You survived them, which almost no one has.',
    canonPoint: 'Hidan is Kakuzu’s partner now; you work alone or wherever Pain sends you.',
    from: { year: 16, month: 1 },
    to: { year: 16, month: 5 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    playerDriven: true,
    facts: ["Kan is no longer Kakuzu's partner; Hidan replaced him."],
    encounter: {
      who: 'Kakuzu and Hidan',
      where: 'the Hidden Rain',
      context:
        "Hidan is loud, devout, and immortal. Kakuzu is relieved, and will never say whether he respects Kan for lasting this long. Pain makes Kan a flexible member who goes where he is needed.",
    },
  },

  // --- Team 3 ----------------------------------------------------------------
  {
    id: 'suzume-new-team',
    era: 'Part 1',
    title: "Suzume's new genin",
    description:
      'Suzume has been given a new team of genin — three children who are not you. Their first mission outside the walls crosses your road.',
    canonPoint: "You crossed paths with Suzume and her new genin.",
    from: { year: 17, month: 8 },
    to: { year: 18, month: 2 },
    region: 'Land of Fire',
    location: 'a road in the Land of Fire',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Suzume and her new genin',
      where: 'a road or village on a low-rank mission',
      context:
        'Suzume would put herself between a cloaked missing-nin and her students without hesitating, even if it is Kan. Her genin have heard stories about the student who vanished.',
    },
    attendanceFact: 'Kan met Suzume and her new genin.',
  },
  {
    id: 'hana-chunin-exams',
    era: 'Part 1',
    title: 'A familiar scent',
    description:
      "Kiba is in the Chunin Exams, and Hana is in the stands for her little brother. If you slip into the crowded Leaf, her nose — or her dogs' — may find you before you find her.",
    canonPoint: 'Hana caught your scent during the Chunin Exams.',
    from: { year: 18, month: 1 },
    to: { year: 18, month: 3 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka and the Haimaru brothers',
      where: 'the crowded Leaf during the exams',
      context:
        'Hana is a chunin and a vet now. Her three dogs remember Kan. She has to decide in seconds whether to raise the alarm, follow him, or pretend she smelled nothing.',
    },
    attendanceFact: 'Kan and Hana met in Hidden Leaf during the Chunin Exams.',
  },
  {
    id: 'hana-ambushed',
    era: 'The hidden years',
    title: 'Dogs in the dark',
    description:
      "A Leaf squad is ambushed by Sound shinobi near the border. Above the shouting you hear dogs you know — Hana's.",
    canonPoint: "You came across Hana's squad under attack.",
    from: { year: 19, month: 4 },
    to: { year: 20, month: 4 },
    region: 'Land of Fire',
    location: 'the border forests of the Land of Fire',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka and her squad',
      where: 'the border forests',
      context:
        "Hana is outnumbered and one of her dogs is hurt. Helping means showing his face — and his eyes — to Leaf shinobi. Walking away means living with it.",
    },
    attendanceFact: "Kan came across Hana's squad under attack near the border.",
  },
  {
    id: 'suzume-trail',
    era: 'Shippuden',
    title: "Suzume's file",
    description:
      'Suzume has followed your trail through official channels for years. Now she has a name for a bounty station you use, and she is waiting there.',
    canonPoint: 'Suzume found you through your bounty trail.',
    from: { year: 20, month: 6 },
    to: { year: 21, month: 6 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Suzume',
      where: 'a bounty station on the Land of Fire border',
      context:
        'She came alone and told no one. She wants the truth about the massacre and about Kan, and she has not decided what she will do with it.',
    },
    attendanceFact: 'Suzume found Kan at a bounty station.',
  },
  {
    id: 'hana-pursuit',
    era: 'Shippuden',
    title: "Hana's nose on the hunt",
    description:
      'The Leaf throws its trackers at the Uchiha brothers, and Hana runs with them. On the road to the old Uchiha hideout, it is your trail she finds.',
    canonPoint: 'Hana found your trail during the hunt for the Uchiha brothers.',
    from: { year: 21, month: 8, day: 25 },
    to: { year: 21, month: 9, day: 20 },
    region: 'Land of Fire',
    location: 'the roads of the Land of Fire',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka',
      where: 'the rain-soaked roads near the Uchiha hideout',
      context:
        "Hana is a jonin tracking alongside Team 8 and her brother Kiba. Kan may be racing toward Itachi's last fight himself. She can slow him, help him, or ask him to come home.",
    },
    attendanceFact: 'Kan and Hana met during the hunt for the Uchiha brothers.',
  },
  {
    id: 'hana-after-pain',
    era: 'The sky falls',
    title: 'The crater',
    description:
      'The Leaf is a crater. Everyone Pain killed is breathing again, but the village is gone. If you come to see whether Hana lived, you find her in a field hospital, stitching dogs and people.',
    canonPoint: 'You found Hana in the ruins of Hidden Leaf.',
    from: { year: 22, month: 1, day: 10 },
    to: { year: 22, month: 4 },
    region: 'Hidden Leaf',
    location: 'the crater where Hidden Leaf stood',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka (and maybe Suzume)',
      where: 'a field hospital in the ruined Leaf',
      context:
        "Pain wore the same cloak Kan does. Every survivor here has reason to hate it. Hana is exhausted and frightened for him and of him.",
    },
    attendanceFact: 'Kan found Hana in the ruins of Hidden Leaf after Pain’s assault.',
  },

  // --- After Itachi -------------------------------------------------------------
  {
    id: 'karin-senses-uzumaki',
    era: 'Shippuden',
    title: "Karin's eyes",
    description:
      "Hebi's sensor stares at you too long. Karin feels chakra like a temperature, and yours feels like her own blood: Uzumaki. If you knew her as a child in the Grass, she knows exactly who you are.",
    canonPoint: 'Karin sensed Uzumaki chakra in you.',
    from: { year: 21, month: 7, day: 10 },
    to: { year: 21, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Karin, with Sasuke and Hebi',
      where: 'wherever Hebi crosses an Akatsuki trail',
      context:
        "Karin is sharp, flustered around Sasuke, and an Uzumaki without a clan. If Kan trained her in the Land of Grass (see the memories), she is grown and changed and still remembers him: the lessons, the parting, maybe the hurt. If not, she knows what Kan is before he says a word. Either way she may tell Sasuke, or keep it for herself. Never romance; her heart is Sasuke's.",
    },
    attendanceFact: 'Karin sensed that Kan carries Uzumaki chakra.',
  },
  {
    id: 'masked-man-courts-kan',
    era: 'Shippuden',
    title: 'The other Uchiha',
    description:
      "With Itachi dead, the masked man comes to you as he came to Sasuke: the truth of the massacre, the Leaf's orders, Danzo's name — and a place at his side.",
    canonPoint: 'The masked man offered you a place in his plan.',
    from: { year: 21, month: 9, day: 14 },
    to: { year: 22, month: 1 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'the masked man',
      where: 'an Akatsuki hideout, after Itachi’s death',
      context:
        "He still calls himself Madara and never shows his face. He wants Kan's eyes on his side and knows exactly how much Kan already knew. Kan can accept, refuse, or pretend.",
    },
    attendanceFact: "The masked man made Kan his offer after Itachi's death.",
  },
  {
    id: 'sasuke-taka-offer',
    era: 'Shippuden',
    title: 'Join Taka',
    description:
      "Sasuke knows the truth now. He comes to the last other Uchiha he has with one question: will you help me destroy the Leaf?",
    canonPoint: 'Sasuke asked you to join Taka.',
    from: { year: 21, month: 9, day: 20 },
    to: { year: 22, month: 3, day: 2 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Sasuke Uchiha and Taka',
      where: 'a hideout or a crossroads Taka passes',
      context:
        "Sasuke is grieving and furious, and he has Itachi's truth. Kan was Itachi's closest friend. Whatever Kan answers, Sasuke will remember it as either loyalty or betrayal.",
    },
    attendanceFact: 'Sasuke asked Kan to join Taka.',
  },
  {
    id: 'kan-danzo',
    era: 'The sky falls',
    title: 'The man who gave the order',
    description:
      "Danzo Shimura wears the Hokage's hat and travels to the Land of Iron with a small Root guard. The man who ordered your clan's death is on an open road.",
    canonPoint: 'You faced Danzo Shimura.',
    from: { year: 22, month: 2, day: 15 },
    to: { year: 22, month: 3, day: 3 },
    region: 'Land of Iron',
    location: 'the snow roads to the Land of Iron',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Danzo Shimura and his Root guard',
      where: 'the snow roads to the Land of Iron, or the summit',
      context:
        "Danzo hides Shisui's stolen eye and an arm full of Sharingan beneath his bandages. In canon Sasuke kills him after the summit; Kan can confront him first, help Sasuke, or let Sasuke have him.",
    },
    attendanceFact: 'Kan confronted Danzo Shimura.',
  },
  {
    id: 'kabuto-izumi-offer',
    era: 'The sky falls',
    title: 'The offer in the coffin',
    description:
      "Kabuto has Orochimaru's face growing over his own and a cave full of coffins. He has heard about the girl you lost, and he can bring her back — for a price.",
    canonPoint: 'Kabuto offered to reanimate Izumi.',
    from: { year: 22, month: 5, day: 10 },
    to: { year: 23, month: 1, day: 9 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kabuto Yakushi',
      where: 'a hidden cave lair',
      context:
        'An Edo Tensei Izumi would be a corpse with her voice, bound to Kabuto. She would remember everything. Kabuto wants Kan in the war, his eyes, or a sample of Thousand Souls.',
    },
    attendanceFact: 'Kabuto offered Kan an Edo Tensei Izumi.',
  },

  // --- The war and after --------------------------------------------------------
  {
    id: 'kan-tsukuyomi-dream',
    era: 'The Fourth War',
    title: 'Your dream',
    description:
      'If the moon catches you, you dream the life you wanted. The narrator shows it to you — and it ends.',
    canonPoint: 'You dreamed inside the Infinite Tsukuyomi.',
    from: { year: 23, month: 1, day: 12 },
    to: { year: 23, month: 1, day: 13 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'the dream',
      where: 'inside the Infinite Tsukuyomi',
      context:
        "Build the dream from what Kan has actually lost and wanted in the story so far — Izumi alive, Itachi without the massacre, Team 3 whole, someone he loves. It feels completely real until it breaks.",
    },
    attendanceFact: 'Kan dreamed inside the Infinite Tsukuyomi.',
  },
  {
    id: 'kan-reckoning',
    era: 'After',
    title: 'The reckoning',
    description:
      "The war is over and you are an Uchiha who wore the Akatsuki's cloak for ten years. Hidden Leaf has to decide what you are: criminal, spy, or one of its own.",
    canonPoint: 'Hidden Leaf has decided what to do with you.',
    from: { year: 23, month: 2 },
    to: { year: 24, month: 6 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kakashi Hatake, the council, and anyone who speaks for Kan',
      where: 'Hidden Leaf',
      context:
        "What Kan did in the war, who he saved, and who will vouch for him — Hana, Suzume, Naruto, Sasuke — decide whether he is pardoned, imprisoned, or exiled. Itachi's truth may come out here.",
    },
    attendanceFact: 'Kan faced Hidden Leaf’s judgment after the war.',
  },
  {
    id: 'uchiha-district',
    era: 'After',
    title: 'The empty district',
    description:
      'You walk the Uchiha district for the first time since the night it died. The paint on the fan crests is peeling. Somewhere here is the house you grew up in.',
    canonPoint: 'You returned to the Uchiha district.',
    from: { year: 23, month: 2 },
    to: { year: 26, month: 12 },
    region: 'Hidden Leaf',
    location: 'the Uchiha district of the Hidden Leaf',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'the empty Uchiha district (perhaps with Sasuke)',
      where: 'the Uchiha district',
      context:
        'Nothing has been touched in ten years. Sasuke may be the only other person who ever comes here. Kan decides what to keep, what to burn, and whether to stay.',
    },
    attendanceFact: 'Kan walked the Uchiha district again.',
  },
  {
    id: 'naruto-kin',
    era: 'After',
    title: 'Cousins, of a kind',
    description:
      "Naruto knows now that his mother was Kushina Uzumaki. Your blood and his share a name, and he has never had family.",
    canonPoint: 'Naruto knows you are Uzumaki kin.',
    from: { year: 23, month: 1, day: 14 },
    to: { year: 25, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Naruto Uzumaki',
      where: 'wherever Kan and Naruto end up after the war',
      context:
        'Naruto has spent his life alone and would grab a relative with both hands. Kan is reserved and was once on the side that hunted him. That makes this harder and better.',
    },
    attendanceFact: 'Kan and Naruto talked about their Uzumaki blood.',
  },

  // --- The cost of the Mangekyō ---------------------------------------------
  {
    id: 'kan-sight-fades',
    era: 'The hidden years',
    title: 'The edges go dark',
    description:
      "Your Mangekyō has been working for years. Now the world blurs at the edges after you use it, and the blur takes longer each time to clear.",
    canonPoint: 'Your sight is failing from the Mangekyō.',
    from: { year: 19, month: 6 },
    to: { year: 21, month: 6 },
    playerDriven: true,
    after: 'kan-mangekyo',
    facts: ["Kan's eyesight is failing from Mangekyō use."],
    encounter: {
      who: 'your own eyes',
      where: 'after a hard fight',
      context:
        "Kan's sight is failing from Mangekyō and Susanoo use. It gets worse with use and never heals on its own. Kan decides whether to tell anyone — Itachi would understand best.",
    },
  },
  {
    id: 'hashirama-cells-offer',
    era: 'Shippuden',
    title: "The First Hokage's cells",
    description:
      "Word of your eyes reaches the snakes. Orochimaru — and after him, Kabuto — has cells grown from the First Hokage, and claims they can hold back the dark. Everything they offer has a price.",
    canonPoint: "You were offered the First Hokage's cells for your eyes.",
    from: { year: 20, month: 1 },
    to: { year: 22, month: 12 },
    playerDriven: true,
    after: 'kan-sight-fades',
    facts: [],
    encounter: {
      who: 'Orochimaru, or Kabuto Yakushi after Orochimaru falls',
      where: 'a Sound hideout or a cave lair',
      context:
        "Hashirama's cells are real and dangerous; most of Orochimaru's test subjects died of them. Whoever offers wants Kan's eyes studied, Thousand Souls, or a debt.",
    },
    attendanceFact: "Kan was offered the First Hokage's cells for his failing eyes.",
  },
  {
    id: 'masked-man-eyes',
    era: 'Shippuden',
    title: 'The vault of eyes',
    description:
      "The masked man shows you what he took from the Uchiha district: rows of eyes in jars. Some belonged to people you knew. He offers you a pair, and light that will never go out.",
    canonPoint: "The masked man offered you Uchiha eyes from the massacre.",
    from: { year: 21, month: 9, day: 14 },
    to: { year: 23, month: 1, day: 9 },
    playerDriven: true,
    after: 'kan-sight-fades',
    facts: [],
    encounter: {
      who: 'the masked man',
      where: "the masked man's hidden lair",
      context:
        "Implanting eyes from a close relative would give Kan an Eternal Mangekyō; eyes from anyone else give only another Sharingan. Whether any of these were Kan's family is something the masked man may lie about. Taking them binds Kan to him.",
    },
    attendanceFact: "The masked man showed Kan the massacre's stolen eyes.",
  },

  // --- The Root hunter -------------------------------------------------------
  {
    id: 'root-hunter',
    era: 'The shadow war',
    title: 'The mask with no face',
    description:
      "Someone has been on your trail for weeks. A Root agent in a blank mask who calls himself Nagi, sent by Danzo to finish what the massacre missed: the Uchiha who got away.",
    canonPoint: 'A Root agent named Nagi is hunting you for Danzo.',
    from: { year: 14, month: 4 },
    to: { year: 15, month: 10 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Nagi, a Root agent',
      where: 'a border town or a forest road',
      context:
        "Nagi is Kan's age, raised in Root, emotionless by training, and very good. A curse seal on his tongue stops him from ever speaking of Danzo. He wants Kan's eyes or Kan's body. He may escape to try again.",
    },
    attendanceFact: 'Kan fought Nagi, the Root agent hunting him.',
  },
  {
    id: 'root-hunter-returns',
    era: 'Part 1',
    title: 'Nagi again',
    description:
      'Nagi is back, older and with a squad, and this time he has learned how you fight.',
    canonPoint: 'Nagi of Root came after you again.',
    from: { year: 17, month: 3 },
    to: { year: 19, month: 12 },
    playerDriven: true,
    after: 'root-hunter',
    facts: [],
    encounter: {
      who: 'Nagi and a Root squad',
      where: 'wherever Kan is careless',
      context:
        'If Nagi died in their first fight, this is someone wearing his mask and his orders. He has studied Kan: his jutsu, his eyes, the people he still cares about in the Leaf.',
    },
    attendanceFact: 'Nagi and his Root squad came for Kan again.',
  },
  {
    id: 'root-hunter-free',
    era: 'The sky falls',
    title: "Danzo's dog off the leash",
    description:
      "Danzo is dead and the curse seal on Nagi's tongue has gone with him. For the first time in his life he can say who sent him — and choose what he does next.",
    canonPoint: 'With Danzo dead, Nagi is free of Root.',
    from: { year: 22, month: 3, day: 4 },
    to: { year: 22, month: 12 },
    playerDriven: true,
    after: 'root-hunter-returns',
    facts: [],
    encounter: {
      who: 'Nagi, free of Root',
      where: 'wherever he finds Kan',
      context:
        "Nagi has never had a choice before. He may want a last fight, an apology, a purpose, or to be told what he was. How Kan treated him before decides how this ends.",
    },
    attendanceFact: 'Kan settled things with Nagi after Danzo died.',
  },

  // --- Akatsuki bonds --------------------------------------------------------
  {
    id: 'kisame-on-itachi',
    era: 'The shadow war',
    title: "Kisame's question",
    description:
      'On a long night watch, Kisame asks what you are to Itachi. Then he tells you what Itachi is to him.',
    canonPoint: 'Kisame told you what Itachi means to him.',
    from: { year: 15, month: 6 },
    to: { year: 21, month: 8 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kisame Hoshigaki',
      where: 'a camp or inn on a shared mission',
      context:
        "Kisame has spent his life betraying comrades for his village and despises liars. He respects Itachi completely and suspects there is more to him. He is testing whether Kan is a friend or a weakness.",
    },
    attendanceFact: 'Kisame and Kan talked about Itachi.',
  },
  {
    id: 'deidara-art',
    era: 'The shadow war',
    title: 'Art is an explosion',
    description:
      "Deidara has decided you are an audience. He wants you to say his art is real — and your Sharingan to look at it and not see through it.",
    canonPoint: 'Deidara made you watch his art.',
    from: { year: 15, month: 9 },
    to: { year: 21, month: 7 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Deidara (and maybe Sasori)',
      where: 'a cliff, a hideout, or the edge of a mission',
      context:
        "Deidara hates Itachi's Sharingan for seeing through his art, and Kan has the same eyes. He is loud, proud, and lonely under it. Sasori thinks art should last forever and will argue.",
    },
    attendanceFact: 'Deidara showed Kan his art.',
  },
  {
    id: 'konan-flower',
    era: 'The sky falls',
    title: 'A paper flower',
    description:
      "Nagato is dead and Konan has brought his body home. She finds you in the rain and puts a paper flower in your hand.",
    canonPoint: 'Konan gave you a paper flower after Nagato died.',
    from: { year: 22, month: 1, day: 10 },
    to: { year: 22, month: 5, day: 31 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Konan',
      where: 'the Hidden Rain, in the rain',
      context:
        "Konan has left the Akatsuki and put her hope in Naruto. She knows the masked man will come for Nagato's eyes. She may warn Kan, ask him to choose, or simply want someone who knew Nagato to see her grieve.",
    },
    attendanceFact: 'Konan gave Kan a paper flower after Nagato died.',
  },

  // --- Endings -----------------------------------------------------------------
  {
    id: 'hana-after-war',
    era: 'After',
    title: 'You and Hana',
    description:
      'The war is over and Hana is alive. So are you. For the first time since you were thirteen, nothing stands between you but what you choose to say.',
    canonPoint: 'You and Hana have decided what you are to each other.',
    from: { year: 23, month: 2 },
    to: { year: 26, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Hana Inuzuka',
      where: 'the Inuzuka kennels, a hospital, or the village gate',
      context:
        "Whatever happened between them over ten years shapes this — her anger, her loyalty, her bond with Kan. It can be love, friendship, or a goodbye. She will not pretend.",
    },
    attendanceFact: 'Kan and Hana decided what they are to each other after the war.',
  },
  {
    id: 'suzume-after-war',
    era: 'After',
    title: 'The student who came back',
    description:
      'Suzume never stopped looking for you. Now there is nothing left to find — you are standing in front of her.',
    canonPoint: 'You and Suzume have made your peace, or not.',
    from: { year: 23, month: 2 },
    to: { year: 25, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Suzume',
      where: 'the old Team 3 training ground',
      context:
        "Suzume blamed herself for losing two of her three students. She wants the whole truth now. Whatever she was to Kan — sensei, family, something more — this decides it.",
    },
    attendanceFact: 'Kan and Suzume met at the old Team 3 training ground after the war.',
  },
  {
    id: 'last-uchiha',
    era: 'After',
    title: 'The last two',
    description:
      "Sasuke has been pardoned. There are two grown Uchiha left in the world, and you are both standing in what is left of the clan.",
    canonPoint: 'You and Sasuke have spoken as the last of the Uchiha.',
    from: { year: 23, month: 5 },
    to: { year: 26, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Sasuke Uchiha',
      where: 'the Uchiha district, or the road before Sasuke leaves',
      context:
        "Sasuke has one arm, a Rinnegan, and Itachi's truth. Kan was Itachi's closest friend. Together they decide what the clan is now — and whether it ends with them.",
    },
    attendanceFact: 'Kan and Sasuke spoke as the last of the Uchiha.',
  },
  {
    id: 'holding-sarada',
    era: 'After',
    title: 'The first new Uchiha',
    description:
      "Sasuke and Sakura's daughter is a few weeks old. Someone puts her in your arms. She is the first Uchiha born since the massacre.",
    canonPoint: 'You held Sarada Uchiha.',
    from: { year: 27, month: 4 },
    to: { year: 28, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Sakura Haruno and the infant Sarada Uchiha',
      where: 'wherever Sakura and Sarada are',
      context:
        'Sasuke is often away. Kan may be the only other Uchiha Sarada will know growing up. What he becomes to her starts here.',
    },
    attendanceFact: 'Kan held Sarada Uchiha as a baby.',
  },
];

function openingKey(milestone: CanonMilestone): number {
  return (milestone.from.year * 12 + milestone.from.month) * 32 + (milestone.from.day ?? 1);
}

/** Every milestone, in the order the world reaches them (stable for ties). */
export const CANON_MILESTONES: CanonMilestone[] = [
  ...CORE_MILESTONES,
  ...WORLD_EXPANSION,
  ...STAGE_TWO_WORLD,
  ...PERSONAL_BEATS,
  ...STAGE_TWO_PERSONAL,
].sort(
  (a, b) => openingKey(a) - openingKey(b)
);
