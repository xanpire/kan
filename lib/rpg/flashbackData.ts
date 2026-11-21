/**
 * The twenty-three playable flashbacks of Kan's life before the story (ages 0–13).
 * Data only; the engine lives in flashbacks.ts.
 *
 * Kan, Itachi, Izumi and Hana are born in year 0, Shisui in year -3, Sasuke
 * and Naruto in year 5. Izumi is Kan's cousin: her mother Hazuki raised him
 * from five (14 Nov 2026). Team 3 (Kan, Hana, Izumi, with Suzume as sensei)
 * runs from Kan's graduation at 9 until he joins ANBU at 12 (Kan its only
 * chūnin); after that he meets them as friends, never as their teammate.
 */
import type { CalendarDate, LocationKind } from './types';

export type FlashbackTriggers = {
  /** Words in the present scene (the last reply and Kan's input). */
  words?: RegExp;
  /** People in the present scene, by their entity name. */
  people?: string[];
  /** Map place ids or place words in the present location. */
  places?: { ids?: string[]; words?: RegExp };
  /** Days of the year it fits, within FLASHBACK_DATE_WINDOW days. */
  dates?: { month: number; day: number }[];
  /** Personal beats or world milestones reached in the last few days. */
  beats?: string[];
  /** Only right after a fight (Kan's own first kill). */
  afterFight?: boolean;
};

export type FlashbackRecord = {
  id: string;
  /** Its place in Kan's life, 1–23. */
  number: number;
  title: string;
  date: CalendarDate;
  place: string;
  locationKind: LocationKind;
  /** Who is in it, by entity name (Erisa and Banri are made when needed). */
  cast: string[];
  /** What the scene is, for the narrator. */
  scene: string;
  /** How some of them were at the time. */
  castNotes?: string[];
  /** Ideas for the trigger the narrator lets touch Kan in the present. */
  hint: string;
  triggers: FlashbackTriggers;
  /** What the memory cannot change. */
  fixed: string[];
  /** What it must never show or tell Kan. */
  hidden?: string[];
  /** Milestones Kan must have reached first. */
  requires?: string[];
  /**
   * Only for stories that began with this opening (section 17): "false-order"
   * for stories from v1.25.5 on (saves from before began with Itachi telling
   * Kan his plan, which "The order" would contradict). Unset: any story.
   */
  opening?: 'false-order';
  /** The memory a sentence long, until its write-up lands. */
  memoryLine: string;
  importance: 3 | 4 | 5;
};

/** Kan's mother and father: not in the canon cast, made when a flashback needs them. */
export const KAN_PARENTS = [
  {
    name: 'Erisa Uchiha',
    aliases: ['Erisa'],
    role: 'Your mother · Leaf kunoichi of the Uchiha clan',
    personality: 'Steady and warm, quick to laugh, fierce when it counts.',
    speechStyle: 'Plain and direct, teasing when she is at ease.',
    appearance: 'Dark hair worn tied back, the Uchiha dark eyes, the clan crest on her collar.',
    gender: 'female' as const,
  },
  {
    name: 'Banri Uzumaki',
    aliases: ['Banri'],
    role: 'Your father · an Uzumaki of the Leaf',
    personality: 'Gentle and patient, a storyteller, stubborn about the old Uzumaki ways.',
    speechStyle: 'Slow and warm; tells stories when he means advice.',
    appearance: 'Red hair, kind eyes, the Uzumaki swirl stitched on his sleeve.',
    gender: 'male' as const,
  },
];

const at = (year: number, month: number, day: number, hour: number, minute = 0): CalendarDate => ({
  year,
  month,
  day,
  hour,
  minute,
  second: 0,
});

const NO_SHISUI_TRUTH =
  'how Shisui will die, what Danzō does, or where Shisui’s eyes go';

export const FLASHBACKS: FlashbackRecord[] = [
  // ---------------------------------------------------------------------
  // Early childhood
  {
    id: 'three-boys',
    number: 1,
    title: 'Three boys',
    date: at(4, 6, 9, 15),
    place: 'the Uchiha district, Hidden Leaf',
    locationKind: 'settlement',
    cast: ['Itachi Uchiha', 'Shisui Uchiha', 'Mikoto Uchiha'],
    scene:
      'The first real day you, Itachi and Shisui spend together: Itachi’s fourth birthday, the Uchiha district streets and rooftops, the three of you on your own for an afternoon.',
    castNotes: [
      'Shisui, six, already acts like the big brother: he leads, shows off a little, and keeps the two small ones out of trouble.',
      'Itachi, just four, is quiet and watches everything.',
    ],
    hint: 'a quiet moment beside Itachi, children running past, the Uchiha district, Itachi’s birthday',
    triggers: {
      people: ['Itachi Uchiha'],
      places: { ids: ['uchiha-district'], words: /\buchiha district\b/i },
      dates: [{ month: 6, day: 9 }],
      words: /\b(when we were (small|little|kids|children)|as (kids|children)|growing up|childhood)\b/i,
    },
    fixed: ['The three of you become inseparable from here on.'],
    memoryLine: 'The first day you, Itachi and Shisui spent together, in the Uchiha district on Itachi’s fourth birthday.',
    importance: 3,
  },
  {
    id: 'erisa-and-banri',
    number: 3,
    title: 'Erisa and Banri',
    date: at(5, 4, 20, 10),
    place: 'your family’s house at the edge of the Uchiha district, Hidden Leaf',
    locationKind: 'structure',
    cast: ['Erisa Uchiha', 'Banri Uzumaki'],
    scene:
      'An ordinary spring day at home with your Uchiha mother and your Uzumaki father. Banri tells you about Uzushio, the island village of the Uzumaki, the way his own people told it to him.',
    hint: 'the Uzumaki swirl, the sea, a red-haired stranger, someone saying the name Uzushio',
    triggers: {
      beats: ['uzushio-ruins', 'uzumaki-masks', 'karin-uzumaki-blood', 'uzushio-return'],
      places: { ids: ['uzushio'] },
      words: /\b(uzushio|uzushiogakure|whirlpools?|uzumaki)\b/i,
    },
    fixed: [
      'Erisa and Banri are alive and well; nothing happens to them today.',
      'Uzushio fell long before you were born; Banri knows it only from his people’s stories and his own childhood.',
    ],
    hidden: ['anything about Kushina carrying the Nine-Tails'],
    memoryLine: 'A spring day at home with your mother and father, and Banri’s stories of Uzushio.',
    importance: 4,
  },
  {
    id: 'the-battlefield',
    number: 2,
    title: 'The battlefield',
    date: at(4, 9, 14, 18, 30),
    place: 'your family’s house in the Uchiha district, Hidden Leaf',
    locationKind: 'structure',
    cast: ['Erisa Uchiha', 'Banri Uzumaki', 'Itachi Uchiha'],
    scene:
      'The last days of the Third War. Erisa and Banri come home from the front after weeks away, while you waited not knowing if they would. The same week Fugaku took four-year-old Itachi to see a battlefield, and Itachi has barely spoken since; when he finally talks to you about it, it comes only in pieces.',
    castNotes: [
      'Itachi, four, carries something he cannot share: the first time you see him like that.',
      'Banri can tell the Uzumaki side of the war: Kushina, and the Seven Swordsmen of the Mist.',
    ],
    hint: 'a field of dead, the smell after a battle, a soldier home from a war, talk of the war',
    triggers: {
      words: /\b(battlefield|field of (the )?dead|war dead|fourth (great )?(ninja|shinobi) war|third (great )?(ninja|shinobi) war)\b/i,
      beats: ['naruto-joins-war'],
    },
    fixed: [
      'The Third War ends this year.',
      'Erisa and Banri come home from it alive; the Nine-Tails takes them a year later, but nobody knows that yet.',
      'Itachi saw the battlefield; it shapes him for life.',
    ],
    hidden: ['the Nine-Tails attack that is coming'],
    memoryLine: 'The week your parents came home from the Third War, and Itachi came back from the battlefield changed.',
    importance: 4,
  },
  {
    id: 'sasuke-is-born',
    number: 4,
    title: 'Sasuke is born',
    date: at(5, 7, 23, 16),
    place: 'Fugaku’s house in the Uchiha district, Hidden Leaf',
    locationKind: 'structure',
    cast: ['Itachi Uchiha', 'Mikoto Uchiha', 'Fugaku Uchiha', 'Sasuke Uchiha'],
    scene: 'The day Sasuke is born. Itachi becomes a big brother, and you watch him hold Sasuke for the first time.',
    castNotes: ['Sasuke is a newborn.', 'Itachi, five, is careful and amazed and trying not to show it.'],
    hint: 'Sasuke in the scene, Itachi talking about his brother, Sasuke’s birthday, a newborn crying',
    triggers: {
      people: ['Sasuke Uchiha'],
      dates: [{ month: 7, day: 23 }],
      words: /\b(sasuke|little brother|baby brother)\b/i,
    },
    fixed: ['Sasuke is born healthy today.'],
    memoryLine: 'The day Sasuke was born, and Itachi held his brother for the first time.',
    importance: 3,
  },
  {
    id: 'nine-tails-night',
    number: 5,
    title: 'The Nine-Tails night',
    date: at(5, 10, 10, 21, 40),
    place: 'the Hidden Leaf, the night the Nine-Tails attacks',
    locationKind: 'settlement',
    cast: ['Erisa Uchiha', 'Banri Uzumaki'],
    scene:
      'The night the Nine-Tails attacks the Leaf. The village burns and shakes, and you lose Erisa and Banri. The heaviest memory you have.',
    hint: 'the anniversary of that night, an orange glow, the Nine-Tails’ chakra, Naruto, the smell of a village burning',
    triggers: {
      dates: [{ month: 10, day: 10 }],
      people: ['Naruto Uzumaki'],
      words: /\b(nine[- ]tails|nine[- ]tailed|kyūbi|kyuubi|kyubi|kurama|tailed beast|jinch[uū]riki)\b/i,
    },
    fixed: [
      'Erisa and Banri die tonight; you survive.',
      'The Fourth Hokage stops the beast tonight and dies doing it.',
    ],
    hidden: [
      'where the Nine-Tails was sealed, or that a baby holds it',
      'who Naruto’s parents are',
      'the masked man behind the attack',
    ],
    memoryLine: 'The night the Nine-Tails attacked the Leaf, and you lost your mother and father.',
    importance: 5,
  },

  // ---------------------------------------------------------------------
  // The Academy and Team 3
  {
    id: 'the-academy',
    number: 6,
    title: 'The Academy',
    date: at(6, 4, 7, 8, 30),
    place: 'the Ninja Academy, Hidden Leaf',
    locationKind: 'structure',
    cast: ['Itachi Uchiha', 'Izumi Uchiha', 'Hana Inuzuka'],
    scene: 'Your first day at the Academy. Izumi looks at Itachi, and you are the first to notice.',
    castNotes: [
      'Izumi, shy, your cousin: she lost her father in the Nine-Tails attack the night you lost your parents, and you have lived in her mother Hazuki’s house ever since. She already has the Sharingan from that night (you know); others look at her sideways for being raised outside the clan.',
      'Hana is loud and already has a puppy at home she won’t stop talking about.',
    ],
    hint: 'Izumi’s name, Izumi’s grave, Hana talking about her, a schoolyard',
    triggers: {
      words: /\b(izumi|the academy|academy days|schoolyard)\b/i,
    },
    fixed: ['Izumi’s feelings for Itachi start here; she never says them aloud today.'],
    memoryLine: 'Your first day at the Academy, and the moment you saw Izumi look at Itachi.',
    importance: 3,
  },
  {
    id: 'itachi-leaves-them-behind',
    number: 7,
    title: 'Itachi leaves them behind',
    date: at(7, 11, 2, 11),
    place: 'the Ninja Academy yard, Hidden Leaf',
    locationKind: 'settlement',
    cast: ['Itachi Uchiha', 'Izumi Uchiha', 'Hana Inuzuka', 'Fugaku Uchiha'],
    scene:
      'Itachi graduates at seven, top of his class, after a single year. You stay behind in the Academy; you will graduate two years later, at nine.',
    hint: 'someone praising Itachi, being compared with Itachi, a prodigy, standing in someone’s shadow',
    triggers: {
      words: /\b(prodigy|genius|in (his|itachi'?s) shadow|compared? (you )?(to|with) itachi|just like itachi|better than itachi|itachi'?s little shadow)\b/i,
    },
    fixed: ['Itachi graduates today; you do not.', 'You graduate in Year 9.'],
    memoryLine: 'The day Itachi graduated at seven and left you behind in the Academy.',
    importance: 3,
  },
  {
    id: 'team-three',
    number: 9,
    title: 'Team 3',
    date: at(9, 9, 20, 9),
    place: 'a training ground in the Hidden Leaf',
    locationKind: 'wilderness',
    cast: ['Hana Inuzuka', 'Izumi Uchiha', 'Suzume'],
    scene:
      'You graduate at nine, and you, Hana and Izumi meet Suzume as your sensei on a training ground for the first time: Team 3.',
    castNotes: [
      'Suzume is younger and sharper than she will be, testing whether the three of you are worth teaching.',
      'Izumi is your cousin; she has had the Sharingan since the Nine-Tails night. You will be the one of the three who makes chūnin.',
      'You tie your new Leaf protector into your belt at the waist, not on your forehead.',
    ],
    hint: 'Suzume in the scene, your old Leaf headband, a training ground, Suzume’s birthday',
    triggers: {
      people: ['Suzume'],
      dates: [{ month: 10, day: 19 }],
      words: /\b(forehead protector|headband|team 3|team three|suzume)\b/i,
    },
    fixed: ['Team 3 is formed today, and Suzume keeps you.'],
    memoryLine: 'The day Team 3 was formed: you, Hana and Izumi, and Suzume as your sensei.',
    importance: 4,
  },
  {
    id: 'the-chains',
    number: 10,
    title: 'The chains',
    date: at(10, 7, 12, 2, 40),
    place: 'your room in Hazuki’s house, the Uchiha district, Hidden Leaf',
    locationKind: 'structure',
    cast: [],
    scene:
      'Two weeks after your tenth birthday you wake in the dark from a nightmare of the Nine-Tails night, and golden chains of chakra are pouring out of your back: they have smashed the lamp, wrapped the bedposts and pinned the door, and you cannot make them stop. You have never seen anything like them, and they are yours. When they finally sink back into you, you hide the damage before morning and go to your father’s scrolls, and in the margin of an old Uzumaki passage on chakra chains you find a name in Banri’s hand: Kushina.',
    castNotes: [
      'You are ten, a genin on Team 3, living in Hazuki’s house with Izumi and her mother; they sleep down the hall and must not wake. Nobody else is in the scene unless the player brings someone in, and then they see only a frightened boy, never the chains.',
      'Banri’s scrolls are the Uzumaki working collection he carried out of Uzushio; the chain passage is half legend, his notes in the margin.',
    ],
    hint: 'chains of chakra, Kan’s chains in a fight, Kushina’s name, someone who knew Kushina, an Uzumaki, Hazuki’s house',
    triggers: {
      beats: ['karin-senses-uzumaki', 'kurama-mastered'],
      places: { ids: ['hazuki-house'], words: /\bhazuki'?s house\b/i },
      words: /\b(chakra chains?|sealing chains?|golden chains?|adamantine( sealing)? chains?|your chains|kushina)\b/i,
    },
    fixed: [
      'The chains come out on their own tonight, for the first time, and they frighten you.',
      'Nobody sees them: you hide what happened, and from now on you show them to almost no one.',
      'You find the chain passage in Banri’s scrolls with Kushina’s name in his hand.',
    ],
    hidden: [
      'that Kushina carried the Nine-Tails, or that she was Minato’s wife and Naruto’s mother',
      'how strong the chains will become: never show their limit',
    ],
    memoryLine: 'The night your chakra chains first broke out of you, and you found Kushina’s name in your father’s scrolls.',
    importance: 4,
  },
  {
    id: 'hanas-dogs',
    number: 11,
    title: 'Hana’s dogs',
    date: at(10, 8, 3, 7, 30),
    place: 'the forests of the Land of Fire, on a Team 3 mission',
    locationKind: 'wilderness',
    cast: ['Hana Inuzuka', 'Izumi Uchiha', 'Suzume'],
    scene: 'A Team 3 mission with Hana and her three ninken, the Haimaru brothers, tracking something through the forest.',
    castNotes: ['The Haimaru brothers are three young grey ninken, Hana’s and devoted to her.', 'Izumi is your cousin.'],
    hint: 'Hana in the scene, a dog barking, ninken, a scent trail, the Inuzuka compound',
    triggers: {
      people: ['Hana Inuzuka'],
      places: { words: /\binuzuka\b/i },
      words: /\b(dogs?|ninken|hounds?|pupp(y|ies)|haimaru)\b/i,
    },
    fixed: ['Team 3 comes home from this mission together.'],
    memoryLine: 'A Team 3 mission with Hana and the Haimaru brothers in the forests of Fire.',
    importance: 3,
  },
  {
    id: 'the-finals',
    number: 12,
    title: 'The finals',
    date: at(11, 1, 24, 14),
    place: 'the Chūnin Exam arena of the Hidden Leaf, then the gate outside it',
    locationKind: 'structure',
    cast: ['Hana Inuzuka', 'Izumi Uchiha', 'Suzume', 'Itachi Uchiha', 'Hazuki Uchiha', 'Hiruzen Sarutobi'],
    scene:
      'The Chūnin Exam finals in the Leaf’s arena. Team 3 got through the forest together, but the preliminaries ended it for Hana and Izumi; only you reached the finals. Your bout is against a bigger, older genin from another village (one that fits the time: the Sand or the Waterfall). You win it the way you do everything, without letting anyone see where your limit is. Afterwards, at the gate: Hazuki proud and fussing, Izumi teasing you for looking bored the whole match, Hana pretending she isn’t jealous and failing; Suzume quietly telling you the judges saw more than you showed. Itachi, already a chūnin, watched from the stands; he says one thing to you, or nothing. The Third Hokage names you chūnin a week later: the only one on Team 3.',
    castNotes: [
      'You are ten, a little over a year out of the Academy; the Academy bored you and you never tried hard there, which is why this surprises people.',
      'Hana and Izumi are ten too, genin, proud of you and stung at once; Suzume, your sensei, sees more than she says.',
      'Itachi is ten and already a chūnin, a few months from ANBU; Hazuki is your aunt, who raised you.',
      'The Third Hokage presides from the Kage box; you only see him from below.',
    ],
    hint: 'an arena, a crowd, an exam, a promotion, someone watching a match from the stands',
    triggers: {
      beats: ['chunin-exams', 'hana-chunin-exams', 'shikamaru-chunin'],
      words: /(ch[uū]nin exams?|exam finals?|the finals|arena|stadium|promotion|promoted to ch[uū]nin)/i,
    },
    fixed: [
      'You win your final bout and are made chūnin, the only one on Team 3; Hana and Izumi stay genin.',
      'You never show your full strength.',
    ],
    hidden: ['the coup and the massacre', 'Izumi’s and Itachi’s future'],
    memoryLine: 'The Chūnin Exam finals, and the promotion that made you the only chūnin on Team 3.',
    importance: 3,
  },
  {
    id: 'the-long-night',
    number: 13,
    title: 'The long night',
    date: at(11, 7, 18, 21),
    place: 'the kennels of the Inuzuka compound, Hidden Leaf',
    locationKind: 'structure',
    cast: ['Hana Inuzuka', 'Tsume Inuzuka'],
    scene:
      'On a Team 3 mission today the smallest of the Haimaru brothers took a blade meant for Hana, and the clan’s vet says he may not last the night. Hana refuses to leave him. You were supposed to go home; you stay. Through the night you hold him still, keep the lamp going and fetch water while she cleans and stitches the wound with shaking hands, the first time she has done it for real. In the small hours, when he finally breathes easier, she tells you this is what she wants: to heal the dogs, not only fight beside them. Near dawn she falls asleep against your shoulder, and you don’t move until the sun is up.',
    castNotes: [
      'Hana, eleven, a genin: loud and stubborn by day, tonight quiet, scared and fiercely determined; she does not cry in front of you until he is out of danger.',
      'Tsume stays at the edges: rough, few words, sees more than she says. She looks in once in the night, sees you there and says nothing; at dawn she finds Hana asleep on your shoulder and lets you both be. That is where her teasing Hana about you starts.',
      'The Haimaru brothers are three young grey ninken; the hurt one is the smallest.',
      'You are eleven and already a chūnin, still on Team 3.',
    ],
    hint: 'a wounded animal, someone tending a wound through the night, the Inuzuka kennels, Hana at work as a vet',
    triggers: {
      people: ['Hana Inuzuka'],
      places: { words: /\binuzuka\b/i },
      words:
        /\b(wounded (dog|animal|hound)|(hurt|sick|injured) (dog|animal|hound)|stitch(ed|es|ing)? (the|a|his|her) wound|tend(ed|ing)? (the|a|his|her) wound|vet|veterinar\w*|kennels?|(stayed|stay|sat) up all night|all night beside|asleep (on|against) (my|your|his|her) shoulder)\b/i,
    },
    fixed: [
      'The dog lives.',
      'Hana decides tonight to become a ninken medic, the clan’s vet.',
      'You never tell her how you feel, and she never knows: the narrator can let the player feel the crush, never have you say it.',
    ],
    memoryLine: 'The night you stayed with Hana in the kennels while she kept the smallest Haimaru brother alive.',
    importance: 4,
  },
  {
    id: 'itachis-eyes',
    number: 8,
    title: 'Itachi’s eyes',
    date: at(8, 12, 3, 20),
    place: 'the Naka Shrine grounds in the Uchiha district, Hidden Leaf',
    locationKind: 'settlement',
    cast: ['Itachi Uchiha'],
    scene:
      'Itachi, eight, has just awakened his Sharingan: days ago his teammate Tenma Izumo was killed in front of him, on a mission guarding the Fire Daimyō. He shows you his eyes. You have no Sharingan yet.',
    hint: 'your own eyes aching, a talk about the Sharingan, red eyes in the dark',
    triggers: {
      beats: ['kan-sight-strain', 'kan-sight-fades'],
      words: /\b(sharingan|tomoe|your eyes|his eyes|mangeky[oō])\b/i,
    },
    fixed: ['Itachi has the Sharingan; you do not.', 'Tenma Izumo is dead.'],
    hidden: ['anything about who killed Tenma, or the killer’s eye'],
    memoryLine: 'The night Itachi showed you the Sharingan he woke after Tenma Izumo died.',
    importance: 4,
  },

  // ---------------------------------------------------------------------
  // The ANBU years
  {
    id: 'itachi-joins-anbu',
    number: 14,
    title: 'Itachi joins ANBU',
    date: at(11, 8, 12, 19),
    place: 'the rooftops of the Uchiha district, Hidden Leaf',
    locationKind: 'settlement',
    cast: ['Itachi Uchiha'],
    scene:
      'Itachi, eleven, joins ANBU, the youngest it has ever taken, in Kakashi’s unit. He tells you on a rooftop, mask in his hand. You are a chūnin now, Team 3’s only one, but still on Team 3, and you will be left behind for a year.',
    hint: 'Kakashi in the scene, ANBU masks, Yūgao, rooftops at night',
    triggers: {
      people: ['Kakashi Hatake', 'Yūgao Uzuki'],
      words: /\banbu\b/i,
    },
    fixed: ['Itachi joins ANBU under Kakashi; you join a year later.'],
    hidden: ['the coup, or anything Itachi is asked to watch in his clan'],
    memoryLine: 'The night Itachi told you he had joined ANBU, and you were left behind for a year.',
    importance: 3,
  },
  {
    id: 'guy-and-the-gate',
    number: 15,
    title: 'Guy and the Gate',
    date: at(11, 11, 4, 21, 30),
    place: 'a training ground in the forest at the edge of the Hidden Leaf',
    locationKind: 'wilderness',
    cast: ['Might Guy'],
    scene:
      'Weeks after you watched Guy open a Gate in a spar, you have worked out the first ones yourself. Tonight, alone on a training ground, you push past what your body can take, and Guy, out on one of his night runs, finds you: skin flushed, muscles tearing, still forcing the next one open. He is horrified. He shuts you down, carries you back, and the next day starts teaching you to open them without tearing yourself apart, and makes you promise never to go past what he shows you.',
    castNotes: [
      'Might Guy, a jōnin in his twenties with no team of his own yet: loud, earnest and absurd, until he sees what you have done to yourself; then he is deadly serious, the only time you see him like that. He has given you some taijutsu sessions and spars before tonight, but you are not close and never will be.',
      'You are eleven, already a chūnin, still on Team 3. Your taijutsu is your own style, and Uzumaki stamina is why you can keep going when you shouldn’t.',
    ],
    hint: 'Guy in the scene, opening a Gate, the Front or Reverse Lotus, torn muscles after a fight, someone talking about youth or a promise',
    triggers: {
      people: ['Might Guy', 'Rock Lee'],
      beats: ['gai-night-guy'],
      words: /\b(eight (inner )?gates|(first|second|third|fourth|fifth|sixth|seventh|eighth) gate|gate of (opening|healing|life|pain|limit|view|wonder|death)|(front|reverse) lotus|might guy)\b/i,
    },
    fixed: [
      'Guy catches you opening the Gates on your own and is horrified.',
      'He teaches you to open them safely, with the Front and Reverse Lotus, and you promise never to go past what he shows you: you keep that promise.',
      'You and Guy are not close, before or after.',
    ],
    hidden: [
      'the Eighth Gate’s true cost and Night Guy: what Guy will one day do',
      'how far you could really push the Gates: never show the limit',
    ],
    memoryLine: 'The night Guy caught you forcing open the Gates on your own, and made you promise never to go past what he showed you.',
    importance: 4,
  },
  {
    id: 'the-mask',
    number: 17,
    title: 'The mask',
    date: at(12, 7, 15, 17),
    place: 'ANBU headquarters, then the Team 3 training ground, Hidden Leaf',
    locationKind: 'structure',
    cast: ['Hana Inuzuka', 'Izumi Uchiha', 'Suzume', 'Danzo Shimura'],
    scene:
      'You join ANBU and leave Team 3 for good: the bat mask, the oath, your place in Kakashi’s unit (Team Ro, with Itachi and Tenzō), saying goodbye to Hana, Izumi and Suzume. Nobody will replace you on Team 3. Danzō is somewhere in the background, watching.',
    castNotes: [
      'Danzō is only a presence at the edge of the room: he says little, and his attention is the point.',
      'Your mask is a bat. Izumi is your cousin; you still live under her mother’s roof.',
    ],
    hint: 'an ANBU mask, Root, Danzō, an oath, someone who never takes off his mask',
    triggers: {
      people: ['Danzo Shimura'],
      beats: ['root-hunter', 'root-hunter-returns', 'kan-danzo'],
      words: /\b(anbu mask|root|danz[oō]|oath)\b/i,
    },
    fixed: ['You join ANBU today and leave Team 3 for good.'],
    hidden: ['what Danzō will do to Shisui, or Root’s plans'],
    memoryLine: 'The day you put on the ANBU mask and said goodbye to Team 3.',
    importance: 4,
  },
  {
    id: 'her-dream',
    number: 18,
    title: 'Her dream',
    date: at(12, 8, 14, 19),
    place: 'Hazuki’s house in the Uchiha district, Hidden Leaf: the kitchen, then the roof',
    locationKind: 'structure',
    cast: ['Izumi Uchiha', 'Hazuki Uchiha'],
    scene:
      'Izumi’s twelfth birthday. You come home late from an ANBU duty, the bat mask still at your hip, and find Izumi waited for you; Hazuki kept the birthday meal warm and teases you both. Later Izumi pulls you up onto the roof, the way she did when you were small. Under the stars she tells you her dream: not to be a great shinobi, but an ordinary life (a home of her own, a family, growing old in peace) and, she makes you swear not to tell, Itachi in it. She asks what yours is; you can answer or not.',
    castNotes: [
      'Izumi, twelve, your cousin and a genin still on Team 3 with Hana under Suzume: gentle and shy with others but teasing with you; she has had the Sharingan since the Nine-Tails night and rarely uses it; she has worried about you since you joined ANBU and notices you come home different.',
      'Hazuki, your aunt, who raised you: widowed, lived outside the clan before, warm with both of you, quietly uneasy about the clan’s mood (she never says why). She stays at the edges; the heart of it is you and Izumi.',
      'You are twelve, a few months into ANBU, still living in Hazuki’s house.',
    ],
    hint: 'Izumi’s birthday, a roof under the stars, someone talking about the life they want, a family meal, a couple',
    triggers: {
      dates: [{ month: 8, day: 14 }],
      beats: ['izumi-grave'],
      words:
        /\b(birthday|rooftop|on the roof|under the stars|an ordinary life|(her|his|their|my|your) dream|wedding|newlyweds?|young couple|hazuki)\b/i,
    },
    fixed: [
      'Izumi tells you her dream, Itachi included; you keep her secret and never tell Itachi.',
      'It is a happy night.',
    ],
    hidden: [
      'her Mangekyō, and how and when she dies',
      'that Itachi will give her exactly this life in a genjutsu as she dies (the Long Dream)',
      'the coup and the massacre',
    ],
    memoryLine: 'Izumi’s twelfth birthday, and the night on the roof she told you her dream.',
    importance: 4,
  },
  {
    id: 'first-kill',
    number: 19,
    title: 'First kill',
    date: at(12, 9, 3, 2, 10),
    place: 'a pine forest on the Land of Fire’s northern border, on an ANBU mission',
    locationKind: 'wilderness',
    cast: [],
    scene: 'An ANBU mission at night with your unit, and the first life you take.',
    castNotes: ['Your unit is Kakashi’s, Team Ro: masked squadmates with code names (Kakashi as captain, Tenzō, perhaps Itachi); invent others sparingly. Your mask is a bat.'],
    hint: 'blood on your hands, a body at your feet, the quiet after a kill',
    triggers: {
      afterFight: true,
      words: /\b(killed|kills?|corpse|body|bodies|blood on your hands|took (a|his|her|their) life|dead (man|woman|ninja|shinobi))\b/i,
    },
    fixed: ['You kill someone on this mission and come home alive.'],
    memoryLine: 'The ANBU mission on the northern border where you took a life for the first time.',
    importance: 4,
  },
  {
    id: 'the-three-vultures',
    number: 20,
    title: 'The three vultures',
    date: at(12, 10, 21, 16),
    place: 'a high crag in the mountains on the Land of Fire’s northern border, on an ANBU assignment',
    locationKind: 'wilderness',
    cast: ['Itachi Uchiha'],
    scene:
      'An ANBU assignment in the mountains with Itachi, still in Kakashi’s unit. Under a crag you find three young bearded vultures, badly wounded and dying, their nest torn down. You can’t leave them. Over the following nights you care for them and keep them alive by feeding them your own chakra, and the memory ends on the moment you understand they now live on it: your chakra did not heal them so much as replace what they had lost, until it is what they are made of. Itachi sees it all.',
    castNotes: [
      'Itachi, twelve, an ANBU like you: quiet, curious, unsettled by what he is seeing, and he keeps it to himself. From now on he knows the vultures are yours.',
      'The three are young bearded vultures: slate-black backs and wings, a black mask through the eye and a black beard under the bill, and where a wild one would be rust-orange (head, neck, chest) they turn blood red as your chakra takes them over. They will become Okuri, Hōmuri and Tomurai; you can name them here or later.',
      'You are twelve. Thousand Souls does not exist yet: this is where the idea for it begins.',
    ],
    hint: 'vultures overhead, birds circling, carrion birds, a bird on your shoulder, Okuri, Hōmuri or Tomurai',
    triggers: {
      people: ['Itachi Uchiha'],
      words: /\b(vultures?|okuri|h[oō]muri|tomurai|carrion birds?|circling birds?)\b/i,
    },
    fixed: [
      'The three vultures live, on your chakra, and from now on they are part of you.',
      'Itachi sees it and keeps it between the two of you.',
    ],
    hidden: ['Thousand Souls: it does not exist yet, and the memory never names it'],
    memoryLine: 'The mountain crag where you and Itachi found three dying young vultures, and you kept them alive on your own chakra.',
    importance: 4,
  },
  {
    id: 'shuriken-in-the-trees',
    number: 21,
    title: 'Shuriken in the trees',
    date: at(12, 11, 9, 16, 30),
    place: 'the training forest behind the Uchiha district, Hidden Leaf: the clearing with the hidden targets',
    locationKind: 'wilderness',
    cast: ['Sasuke Uchiha', 'Mikoto Uchiha'],
    scene:
      'Sasuke, seven, has waited by the door all afternoon for Itachi, who left on a mission again with a poke to the forehead and "next time". You find him sulking and take him to the forest behind the district, to the targets Itachi hides behind rocks and branches, and teach him to throw the way Itachi does: the angle, the ricochet, the one target you cannot see. He misses, sulks, tries again, and calls you "Kan-nii" for the first time when one finally hits. Mikoto finds you both at dusk and calls you in to eat.',
    castNotes: [
      'Sasuke at seven: worships Itachi, desperate to be noticed by his father, stubborn, quick to pout and quicker to try again; with you he is less on guard than with Itachi.',
      'Mikoto: warm, amused, a little tired; Fugaku is never home before dark these days.',
      'You are twelve, in ANBU a few months; the coup talk in the clan is only a mood yet, nothing you can name.',
    ],
    hint: 'a child practising with shuriken, a target behind a rock, a younger brother left behind, a boy waiting for someone who doesn’t come',
    triggers: {
      people: ['Sasuke Uchiha'],
      beats: ['sasuke-defects', 'kan-intercept-sasuke', 'itachi-vs-sasuke', 'kan-sasuke-paths', 'sasuke-taka-offer'],
      words: /(shuriken practice|hidden targets?|little brother|kan-nii)/i,
    },
    fixed: ['Sasuke hits the hidden target before dusk and calls you "Kan-nii".', 'Itachi is away; he is not in this memory.'],
    hidden: ['the coup and the massacre', 'what Sasuke will become', 'Shisui’s death'],
    memoryLine: 'The afternoon you taught seven-year-old Sasuke to throw at Itachi’s hidden targets, and he first called you Kan-nii.',
    importance: 4,
  },
  {
    id: 'shisui-of-the-body-flicker',
    number: 16,
    title: 'Shisui of the Body Flicker',
    date: at(12, 4, 9, 6, 30),
    place: 'a training ground in the forest outside the Uchiha district, Hidden Leaf',
    locationKind: 'wilderness',
    cast: ['Shisui Uchiha', 'Itachi Uchiha'],
    scene: 'Shisui trains you and Itachi at dawn, and you see why the world calls him Shisui of the Body Flicker.',
    castNotes: ['Shisui, fifteen, is famous already and wears it lightly.'],
    hint: 'a Body Flicker, Shisui’s eye, Danzō, someone moving faster than the eye can follow',
    triggers: {
      beats: ['shisui-eye-trail', 'shisui-eye-danzo', 'shisui-eye-iron'],
      people: ['Danzo Shimura'],
      words: /\b(body flicker|shunshin|shisui)\b/i,
    },
    fixed: ['Shisui is the fastest of the three of you by far.'],
    hidden: [NO_SHISUI_TRUTH],
    memoryLine: 'A dawn on the training ground when Shisui showed you why they call him Shisui of the Body Flicker.',
    importance: 3,
  },

  // ---------------------------------------------------------------------
  // The last days (year 13)
  {
    id: 'last-good-day',
    number: 22,
    title: 'The last good day',
    date: at(13, 9, 14, 15),
    place: 'the banks of the Naka River, Hidden Leaf',
    locationKind: 'wilderness',
    cast: ['Itachi Uchiha', 'Shisui Uchiha'],
    scene: 'The three of you at the Naka River on an afternoon off, before everything breaks.',
    castNotes: ['Shisui is tired in a way he hides well.', 'Itachi is quieter than he used to be.'],
    hint: 'the Naka River, running water like it, Shisui’s eye, Itachi’s death',
    triggers: {
      places: { ids: ['naka-river'], words: /\bnaka river\b/i },
      beats: ['itachi-vs-sasuke', 'shisui-truth', 'shisui-eye-trail', 'shisui-eye-danzo'],
      words: /\b(naka river|shisui'?s eyes?)\b/i,
    },
    fixed: ['Nothing breaks today: it is a good, ordinary afternoon.'],
    hidden: [NO_SHISUI_TRUTH, 'the coup'],
    memoryLine: 'The last good day: you, Itachi and Shisui at the Naka River before everything broke.',
    importance: 4,
  },
  {
    id: 'shisuis-last-night',
    number: 23,
    title: 'Shisui’s last night',
    date: at(13, 9, 20, 20),
    place: 'near the Naka Shrine, Hidden Leaf',
    locationKind: 'settlement',
    cast: ['Shisui Uchiha'],
    scene: 'You see Shisui one last time, the night he dies, and something feels wrong.',
    hint: 'the truth about Shisui, the Naka Shrine, a goodbye that didn’t sound like one',
    triggers: {
      beats: ['shisui-truth'],
      words: /\b(shisui)\b/i,
    },
    requires: ['shisui-truth'],
    fixed: [
      'Shisui dies tonight in the Naka River, after he leaves you.',
      'You learn nothing true tonight: Shisui does not tell you about Danzō, his eyes or the coup.',
    ],
    hidden: ['what Danzō did to Shisui tonight', 'where Shisui goes after he leaves you'],
    memoryLine: 'The last time you saw Shisui, the night he died, and the feeling that something was wrong.',
    importance: 5,
  },
  {
    id: 'the-week-before',
    number: 24,
    title: 'The week before',
    date: at(13, 9, 24, 14),
    place: 'a dango shop in the Hidden Leaf',
    locationKind: 'structure',
    cast: ['Hana Inuzuka', 'Izumi Uchiha'],
    castNotes: ['Izumi is your cousin; you came from the same house this morning.'],
    scene:
      'Not a Team 3 day: you have been in ANBU for over a year. You meet Hana and Izumi off duty, the three of you like old times for one afternoon: the last ordinary one.',
    hint: 'Izumi’s grave, Hana at the grave, dango, an afternoon off',
    triggers: {
      beats: ['izumi-grave', 'izumi-funeral'],
      words: /\b(izumi'?s grave|dango)\b/i,
    },
    fixed: ['It is an ordinary afternoon; Izumi is alive and nobody knows what is coming.'],
    hidden: ['the coup, and the massacre that is coming'],
    memoryLine: 'The last ordinary afternoon with Hana and Izumi, a week before the massacre.',
    importance: 4,
  },
  {
    // Section 17 (15 Nov 2026): Itachi tells Kan nothing; this is the last
    // time Kan sees Izumi and Hazuki alive.
    id: 'the-order',
    number: 25,
    title: 'The order',
    date: at(13, 9, 29, 19, 30),
    place: 'Hazuki’s house in the Uchiha district, Hidden Leaf',
    locationKind: 'settlement',
    cast: ['Itachi Uchiha', 'Izumi Uchiha', 'Hazuki Uchiha'],
    castNotes: [
      'Itachi is very calm, calmer than he should be.',
      'Izumi is your cousin and lights up when Itachi is at the door.',
      'Hazuki asks Itachi to stay and eat.',
    ],
    scene:
      'Two days before the massacre. Itachi comes to Hazuki’s house at dusk with an urgent ANBU order for you, sealed: a scroll for a contact at a waystation a day north, leave tonight. Hazuki asks him to stay and eat; Izumi teases you both; he does not stay. You pack and go without asking why, because it is Itachi. The last time you see Izumi and Hazuki alive.',
    hint: 'an order, a sealed scroll, someone at the door, Izumi’s grave, Hazuki, the last time you saw them, the anniversary of the massacre',
    triggers: {
      dates: [{ month: 9, day: 29 }, { month: 10, day: 1 }],
      people: ['Itachi Uchiha'],
      beats: ['izumi-funeral', 'kan-mangekyo', 'itachi-vs-sasuke', 'masked-man-eyes'],
      words: /\b(orders?|sealed scroll|hazuki|the last time you saw)\b/i,
    },
    fixed: [
      'Itachi gives you the order; you take it without question and leave tonight.',
      'Izumi and Hazuki are alive, and this is the last time you see them.',
      'Itachi tells you nothing of what is coming.',
    ],
    hidden: [
      'that the order is false: nothing in the scene may reveal it',
      'the massacre, the coup, Danzō, or anything Itachi plans',
    ],
    memoryLine: 'The evening Itachi came to Hazuki’s door with an urgent order, and the last time you saw Izumi and Hazuki alive.',
    importance: 5,
    opening: 'false-order',
  },
];

export const FLASHBACK_BY_ID: Record<string, FlashbackRecord> = Object.fromEntries(
  FLASHBACKS.map((record) => [record.id, record])
);
