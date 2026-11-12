import { KAN_APPEARANCE } from './kanLook';
import { DEFAULT_DATE } from './calendar';
import { ensureCanonCast } from './canonCast';
import { NAMES_VERSION } from './names';
import { DEFAULT_SETTINGS, emptyIndex } from './defaults';
import { knowersOf } from './facts';
import { makeId } from './id';
import { startingPurse } from './money';
import type {
  AppDatabase,
  BondRecord,
  EntityRecord,
  EventRecord,
  FactRecord,
  JutsuRecord,
  LoreRecord,
  ThreadRecord,
} from './types';

/**
 * Where things are and how long a shinobi takes to get there: always in the
 * narrator's prompt, so directions and travel times stay consistent.
 */
export const GEOGRAPHY_LORE =
  'GEOGRAPHY (fixed; directions and shinobi travel times at a hard pace, with rest): The Land of Fire is the large forested country in the middle of the continent; Hidden Leaf sits near its center, below the Hokage Rock. Along its northern border, west to east: the Land of Waterfalls (Hidden Waterfall); the Mountain Graveyard, a barren land of giant bones that runs north as a long peninsula; the small Land of Sound (once called the Land of Rice Fields, and many still call it that; Orochimaru\'s Hidden Sound and its small hidden bases; the Valley of the End is on its border with Fire); and the Land of Hot Water (hot-spring towns, Bamboo Village on its coast), which wraps down Fire\'s north-east coast. North of Hot Water lies the small, cold Land of Frost, and past Frost the Land of Lightning (Hidden Cloud), whose mountains fill the far north-east; a gulf of sea lies between the Graveyard peninsula and Lightning. The Land of Iron (samurai) lies on the snowy northern tip of the Graveyard peninsula, among the Three Wolf Mountains. West of Fire lies the Land of Rain (Hidden Rain), a small, always-raining country of iron towers squeezed between Fire, Wind and Earth; the Land of Grass is NORTH of Rain (Hidden Grass, Tenchi Bridge), between Rain, Earth, the Waterfall and Fire, and the Land of Rivers (Hidden Valley) is a strip south-west of Fire, between Fire and Wind, running down to the southern sea. Far west lies the desert Land of Wind (Hidden Sand), walled by mountains on its north; north-west, the mountainous Land of Earth (Hidden Stone). Between Earth and Wind, west of Rain, runs a strip of small lands: the Land of Birds (the small Hidden Rock village) next to Rain, and the walled Land of Silence (Curtain Village) at the continent\'s western edge. The Land of Waves is a small island off the southern coast, south of Hidden Leaf, joined to Fire by the Great Naruto Bridge. Fire\'s south-east runs down in a long tongue of land to the Land of Tea, a crescent coast with fishing villages and Degarashi Port, plus the islands of Nagi and Ouza to its east; south of Tea, the scattered islands of the Land of the Sea. Off Fire\'s east coast, in a bay, lies the Land of Whirlpools, a small island with the ruins of Uzushio; the small Land of Woods borders Fire\'s south-east coast just below it. Further east lie the Land of Water islands (Hidden Mist), reached by boat from Fire\'s east coast. From Hidden Leaf: the Rain border about 2 days, Hidden Rain about 3 days; the Grass border about 2 days, the Waterfall about 2 days; the Sound\'s lands 1-2 days; the Mountain Graveyard about 2.5 days; Hot Water about 1.5 days; the Land of Waves about 2 days south; the Land of Tea about 2.5 days; Uzushio about 2 days with the crossing; Hidden Sand about 3 days; the Land of Silence 4-5 days; Hidden Stone about 5 days; Hidden Mist 4-5 days with the crossing; the Land of Frost about 3 days; the Land of Iron about 3.5 days; Hidden Cloud 5-7 days. Rain to Grass about 1 day north; Grass to the Waterfall about 1.5 days; Rain to Sand about 3 days west; Rain to the Land of Birds about 1.5 days west; Uzushio to Hidden Mist about 2.5 days by boat. Civilians and wagons take two to three times as long. Never contradict these: once a distance or direction is said, it holds.';

const ITACHI_ID = makeId('entity');
const HANA_ID = makeId('entity');
const IZUMI_ID = makeId('entity');
const SUZUME_ID = makeId('entity');
const KAN_ID = makeId('entity');
const FOREST_ID = makeId('entity');

export function seedDatabase(slotId: string, slotName: string): AppDatabase {
  const now = Date.now();

  const storyEntities: EntityRecord[] = [
    {
      id: KAN_ID,
      name: 'Kan',
      type: 'character',
      aliases: ['Uchiha-Uzumaki Kan'],
      birthday: { month: 6, day: 30 },
      birthYear: 0,
      role: 'Missing-nin (former ANBU)',
      personality: 'Reserved, watchful, hard to read. Smart and versatile, hides his feelings. A trace of the timid, quiet child he was at the Academy still shows when he is caught off guard.',
      speechStyle: 'Short, restrained, rarely volunteers more than necessary.',
      status: 'Former ANBU, now missing-nin',
      notes: 'Original character. Uchiha-Uzumaki lineage, usually goes only by Kan. Grew up with Itachi and Shisui; the three were inseparable. Outside Team 3 they were his only real friends. Lost a fight to Itachi days before the massacre, but held back because he would not truly hurt him; how strong Kan really is remains an open question.',
      mood: 'Numb, guarded, torn',
      appearance: KAN_APPEARANCE,
      gender: 'male',
      met: true,
      tags: ['player', 'uchiha', 'uzumaki', 'anbu'],
    },
    {
      id: ITACHI_ID,
      name: 'Itachi Uchiha',
      type: 'character',
      aliases: ['Itachi'],
      birthday: { month: 6, day: 9 },
      birthYear: 0,
      met: true,
      lastSeen: { year: 13, month: 9, day: 28, hour: 21, minute: 0 },
      lastSeenAt: 'Forest outside Hidden Leaf',
      role: 'Missing-nin · Akatsuki',
      personality: 'Calm, perceptive, self-sacrificing, gentle beneath a controlled surface.',
      speechStyle: 'Quiet, precise, polite, often speaking in gentle observations.',
      status: 'Missing-nin, Akatsuki',
      notes: 'Kan’s closest friend, like an older brother; with Shisui, the three grew up together. Joined ANBU one year before Kan. A few days before the massacre he told Kan what he was going to do, beat him in the fight that followed, and sent him to hide in the forest and wait — promising to explain everything afterwards. He wants Kan beside him in the Akatsuki, the two of them spying on it together.',
      mood: 'Burdened, controlled, grieving beneath the calm',
      // His look at thirteen, the night he leaves; the Akatsuki cloak comes later.
      appearance: 'Slim thirteen-year-old with long black hair tied low at the nape, sharp dark eyes and faint tear-trough lines; dark high-collared shirt, ANBU-issue arm guards, dark trousers, and a Hidden Leaf forehead protector.',
      gender: 'male',
      romanceAccessibility: 'not-applicable',
      canonDevotion: 'His heart belongs to his brother and the village; love is a luxury he denied himself.',
      orientation: 'Not interested; devoted to duty',
      tags: ['uchiha', 'anbu', 'akatsuki', 'friend'],
    },
    {
      id: HANA_ID,
      name: 'Hana Inuzuka',
      type: 'character',
      aliases: ['Hana'],
      birthday: { month: 4, day: 13 },
      birthYear: 0,
      met: true,
      lastSeen: { year: 13, month: 9, day: 27, hour: 18, minute: 0 },
      lastSeenAt: 'Hidden Leaf',
      role: 'Hidden Leaf shinobi · Team 3',
      personality: 'Loud, loyal, instinctive, protective, quick to act.',
      speechStyle: 'Direct, blunt, teasing, with little patience for hesitation.',
      status: 'Hidden Leaf shinobi',
      notes: 'Kan’s former teammate from Team 3; he left the team when he joined ANBU, but they stayed close. He has a secret crush on her.',
      mood: 'Worried, restless, fiercely loyal',
      appearance: 'Athletic girl with tousled brown hair, fang-like markings on her cheeks, and a practical Inuzuka jacket.',
      romanceAccessibility: 'winnable',
      gender: 'female',
      canonDevotion: 'Loyal to her pack and her village; blunt about everything but her own heart.',
      orientation: 'Attracted to men',
      tags: ['inuzuka', 'team-3', 'crush'],
    },
    {
      id: IZUMI_ID,
      name: 'Izumi Uchiha',
      type: 'character',
      aliases: ['Izumi'],
      // Canon gives Izumi no birthday; this one is the app's.
      birthday: { month: 8, day: 14 },
      birthdayInvented: true,
      birthYear: 0,
      met: true,
      lastSeen: { year: 13, month: 9, day: 27, hour: 18, minute: 0 },
      lastSeenAt: 'Hidden Leaf',
      role: 'Hidden Leaf shinobi · Team 3',
      personality: 'Kind, observant, gentle, quietly stubborn.',
      speechStyle: 'Soft and careful, with a warm teasing streak.',
      status: 'Deceased',
      // Kan learns of it when someone tells him, or when news of her funeral reaches him.
      deceased: { known: false, canonEventId: 'event_canon_izumi-funeral' },
      notes: 'Kan’s former teammate from Team 3; he left the team when he joined ANBU, but they stayed close. Killed in the Uchiha massacre. She had loved Itachi since the Academy, and Kan knew it.',
      mood: 'Unknown',
      appearance: 'Young Uchiha girl with soft dark hair, gentle eyes, and the quiet posture of someone who always waited for others.',
      romanceAccessibility: 'lore-locked',
      gender: 'female',
      canonDevotion: 'Her heart belonged to Itachi Uchiha from childhood until the night she died.',
      orientation: 'Attracted to men (devoted to Itachi)',
      tags: ['uchiha', 'team-3'],
    },
    {
      id: SUZUME_ID,
      name: 'Suzume',
      type: 'character',
      aliases: ['Suzume-sensei'],
      birthday: { month: 10, day: 19 },
      birthYear: -16,
      met: true,
      lastSeen: { year: 13, month: 9, day: 25, hour: 9, minute: 0 },
      lastSeenAt: 'Hidden Leaf training grounds',
      role: 'Hidden Leaf jonin · Team 3 sensei',
      personality: 'Patient, sharp, protective, demanding in the field.',
      speechStyle: 'Dry, measured, with occasional warmth.',
      status: 'Hidden Leaf jonin',
      notes: 'Team 3’s sensei, and Kan’s former sensei: he left her team when he joined ANBU, but they stayed close.',
      mood: 'Concerned, patient, watchful',
      appearance: 'Seasoned jonin woman with practical field clothes, tied-back hair, and the calm stance of a teacher who has buried students.',
      romanceAccessibility: 'winnable',
      gender: 'female',
      canonDevotion: 'Dedicated to her students and the village; guarded about her private life.',
      orientation: 'Attracted to men',
      tags: ['team-3', 'sensei'],
    },
    {
      id: FOREST_ID,
      name: 'Forest outside Hidden Leaf',
      type: 'place',
      aliases: ['the woods', 'the forest'],
      notes: 'Rain-soaked meeting place after the Uchiha massacre.',
      tags: ['location', 'forest', 'rain'],
    },
    {
      id: makeId('entity'),
      name: 'Akatsuki',
      type: 'faction',
      aliases: ['the Akatsuki'],
      status: 'Active',
      notes: 'Itachi wants Kan to join with him so the two of them can spy on the organization together.',
      tags: ['faction', 'akatsuki'],
    },
  ];

  // The main canon cast is loaded up front, each person once, so the state
  // tracker refers to them by ID instead of inventing duplicates.
  const entities = ensureCanonCast(storyEntities, () => makeId('entity'));

  const openingEvent: EventRecord = {
    id: makeId('event'),
    chapter: 1,
    scene: 'The rain after',
    inStoryDate: DEFAULT_DATE,
    summary:
      'You wait alone in the rain-soaked forest outside Hidden Leaf, where Itachi sent you days ago. Tonight the massacre has happened, but you were already in the forest: you do not know whether Itachi went through with it, how it happened, or who died, Izumi included. Itachi is about to arrive and ask you to come with him and join the Akatsuki; he promised an explanation, but he will hold the truth back until you are far from the village.',
    importance: 5,
    tags: ['opening', 'itachi', 'massacre', 'izumi', 'rain', 'forest', 'akatsuki'],
    pinned: true,
    sourceLogId: null,
    createdAt: now,
  };

  const jutsuRecords: JutsuRecord[] = [
    {
      id: makeId('jutsu'),
      name: 'Shinobi taijutsu',
      user: 'Kan',
      chakraNature: 'Physical',
      effect:
        'Close-quarters shinobi combat built for silent takedowns, precise strikes, and quick escapes.',
      visual:
        'Fast, economical movements with almost no sound; you close distance in a low stance and end exchanges in one or two blows.',
      firstSeen: DEFAULT_DATE,
      lastSeen: DEFAULT_DATE,
      timesUsed: 0,
      description: 'Close-quarters hand-to-hand combat focused on speed, silence, and precision.',
      tags: ['taijutsu', 'kan'],
    },
    {
      id: makeId('jutsu'),
      name: 'Thousand Souls',
      user: 'Kan',
      chakraNature: 'Yin',
      effect:
        'Your own forbidden jutsu. Steals a target’s chakra, permanently expands your chakra capacity and gives you their chakra nature. It never steals jutsu. Still rough; it perfects with use.',
      visual:
        'Ragged threads of chakra bleed from the target into your palm, and whatever nature they carried flickers across your skin before it settles.',
      firstSeen: DEFAULT_DATE,
      lastSeen: DEFAULT_DATE,
      timesUsed: 0,
      description: 'A secret forbidden jutsu of your own design that steals chakra and chakra natures. No one else knows it exists.',
      tags: ['forbidden', 'original', 'secret', 'signature', 'kan'],
    },
  ];

  // Shisui comes from the canon cast (dead before the story starts); you grew up with him.
  const shisui = entities.find((entity) => entity.name === 'Shisui Uchiha');

  if (shisui) {
    Object.assign(shisui, {
      met: true,
      status: 'Deceased',
      lastSeen: { year: 13, month: 9, day: 20, hour: 20, minute: 0 },
      lastSeenAt: 'Hidden Leaf',
    });
  }

  const bonds: BondRecord[] = [
    {
      id: makeId('bond'),
      entityId: ITACHI_ID,
      characterName: 'Itachi Uchiha',
      affinity: 8,
      status: 'Like an older brother, now strained',
      lastKeyEventId: openingEvent.id,
      note: 'He loves you like a brother and wants you safe beside him, even if it costs him your trust.',
      theirFeelings: { affinity: 8, note: 'He loves you like a brother and wants you safe beside him, even if it costs him your trust.' },
      yourFeelings: {
        affinity: 7,
        note: 'You grew up together with Shisui and joined ANBU a year apart. Days ago he told you he would kill the clan; you fought, and you lost while holding back. The love is still there, and so are dread, anger and unanswered questions.',
      },
      isMajor: true,
      relationship: 'old friend',
      attraction: 'none',
      updatedInStoryDate: DEFAULT_DATE,
    },
    {
      id: makeId('bond'),
      entityId: HANA_ID,
      characterName: 'Hana Inuzuka',
      affinity: 5,
      status: 'Former teammate, secret crush',
      lastKeyEventId: null,
      note: 'Your former Team 3 teammate. She trusted you in the field, still teases you off it, and you stayed close after you left for ANBU.',
      theirFeelings: { affinity: 5, note: 'Your former Team 3 teammate. She trusted you in the field, still teases you off it, and you stayed close after you left for ANBU.' },
      yourFeelings: { affinity: 7, note: 'You hide your feelings and have never told her.' },
      isMajor: true,
      relationship: 'teammate',
      attraction: 'warm',
      romanceNote: 'Your unspoken crush; she doesn’t know.',
      updatedInStoryDate: DEFAULT_DATE,
    },
    {
      id: makeId('bond'),
      entityId: IZUMI_ID,
      characterName: 'Izumi Uchiha',
      affinity: 7,
      status: 'Former teammate',
      lastKeyEventId: null,
      note: 'Former Team 3 teammate. She loved Itachi, and you knew it.',
      theirFeelings: { affinity: 7, note: 'Former Team 3 teammate. She loved Itachi, and you knew it.' },
      yourFeelings: { affinity: 7, note: 'A gentle friend you would have trusted with anything.' },
      isMajor: true,
      relationship: 'teammate',
      attraction: 'none',
      updatedInStoryDate: DEFAULT_DATE,
    },
    {
      id: makeId('bond'),
      entityId: SUZUME_ID,
      characterName: 'Suzume',
      affinity: 5,
      status: 'Former sensei',
      lastKeyEventId: null,
      note: 'Your old sensei from Team 3; proud of you, worried about you.',
      theirFeelings: { affinity: 5, note: 'Your old sensei from Team 3; proud of you, worried about you.' },
      yourFeelings: { affinity: 6, note: 'She saw more in you than you showed.' },
      isMajor: false,
      relationship: 'mentor',
      attraction: 'none',
      updatedInStoryDate: DEFAULT_DATE,
    },
  ];

  if (shisui) {
    bonds.push({
      id: makeId('bond'),
      entityId: shisui.id,
      characterName: shisui.name,
      affinity: 9,
      status: 'Deceased · Childhood friend',
      lastKeyEventId: null,
      note: 'He was the third of you, with Itachi: the one who made you laugh.',
      theirFeelings: { affinity: 9, note: 'He was the third of you, with Itachi: the one who made you laugh.' },
      yourFeelings: { affinity: 9, note: 'You never believed he would take his own life.' },
      isMajor: true,
      relationship: 'old friend',
      attraction: 'none',
      updatedInStoryDate: DEFAULT_DATE,
    });
  }

  const facts: FactRecord[] = [
    {
      id: makeId('fact'),
      subjectEntityId: KAN_ID,
      type: 'death',
      text: 'Your parents, Erisa and Banri, died in the Nine-Tails attack.',
      whoKnows: ['Kan', 'village elders'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: openingEvent.id,
    },
    {
      id: makeId('fact'),
      subjectEntityId: KAN_ID,
      type: 'event',
      text: 'You were five years old when the Nine-Tails attacked.',
      whoKnows: ['Kan'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: null,
    },
    {
      id: makeId('fact'),
      subjectEntityId: KAN_ID,
      type: 'membership',
      text: 'You joined ANBU at twelve, one year after Itachi.',
      whoKnows: ['Kan', 'ANBU command'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: null,
    },
    {
      id: makeId('fact'),
      subjectEntityId: KAN_ID,
      type: 'secret',
      text: 'You have a crush on Hana Inuzuka and have never told her.',
      whoKnows: ['Kan'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: null,
    },
    {
      id: makeId('fact'),
      subjectEntityId: ITACHI_ID,
      type: 'event',
      text: 'Itachi massacred the Uchiha clan.',
      whoKnows: ['Itachi Uchiha', 'Hidden Leaf leadership'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: openingEvent.id,
    },
    {
      id: makeId('fact'),
      subjectEntityId: ITACHI_ID,
      type: 'secret',
      text: 'A few days before the massacre, Itachi told you he was going to kill the Uchiha. You fought him and lost, holding back because you would not truly hurt him. He then sent you to hide in the forest and wait, promising to explain everything once it was over.',
      whoKnows: ['Kan', 'Itachi Uchiha'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: null,
    },
    {
      id: makeId('fact'),
      subjectEntityId: KAN_ID,
      type: 'knowledge',
      text: 'You left for the forest days before the massacre. You do not know whether Itachi went through with it, how it happened, who died, or why. Itachi promised to tell you.',
      whoKnows: ['Kan', 'Itachi Uchiha'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: openingEvent.id,
    },
    {
      id: makeId('fact'),
      subjectEntityId: IZUMI_ID,
      type: 'death',
      text: 'Izumi Uchiha, your former teammate, was killed in the Uchiha massacre. You do not know this yet.',
      whoKnows: ['Itachi Uchiha', 'Hidden Leaf'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: openingEvent.id,
    },
    {
      id: makeId('fact'),
      subjectEntityId: null,
      type: 'death',
      text: 'Shisui Uchiha was found dead in the Naka River shortly before the massacre. The official story is suicide. You, Itachi and Shisui grew up together.',
      whoKnows: ['Kan', 'Itachi Uchiha', 'Hidden Leaf'],
      validFrom: DEFAULT_DATE,
      validTo: null,
      confidence: 'confirmed',
      sourceEventId: null,
    },
  ];

  const threads: ThreadRecord[] = [
    {
      id: makeId('thread'),
      type: 'mystery',
      title: 'What really happened to Shisui?',
      description:
        'Shisui was found in the Naka River, and the village calls it suicide. You grew up with him. You don’t believe it.',
      status: 'open',
      openedAt: DEFAULT_DATE,
      resolvedAt: null,
      importance: 4,
      participants: ['Kan', 'Itachi'],
      sourceEventId: openingEvent.id,
    },
    {
      id: makeId('thread'),
      type: 'quest',
      title: 'Itachi’s offer: join Akatsuki',
      description:
        'Itachi wants you to join the Akatsuki with him, so the two of you can spy on it from the inside. The choice is yours.',
      status: 'open',
      openedAt: DEFAULT_DATE,
      resolvedAt: null,
      importance: 5,
      participants: ['Kan', 'Itachi'],
      sourceEventId: openingEvent.id,
    },
    {
      id: makeId('thread'),
      type: 'goal',
      title: 'Make Itachi explain',
      description:
        'Itachi told you he would kill the clan, sent you into the woods, and promised to explain everything once it was over. You still don’t know if he did it.',
      status: 'open',
      openedAt: DEFAULT_DATE,
      resolvedAt: null,
      importance: 4,
      participants: ['Kan'],
      sourceEventId: openingEvent.id,
    },
  ];

  // One voice throughout: "you" is Kan. Entries that stop being true carry
  // an activeUntil (see lore.ts), so they leave the prompt when the story
  // moves past them.
  const loreEntries: LoreRecord[] = [
    {
      id: makeId('lore'),
      keywords: ['uchiha', 'uzumaki', 'clan', 'heritage', 'parents', 'mother', 'father'],
      priority: 5,
      text: 'You are of mixed Uchiha-Uzumaki heritage. Your Uchiha mother and Uzumaki father died in the Nine-Tails attack. You rarely mention your clan names.',
      enabled: true,
    },
    {
      id: makeId('lore'),
      keywords: ['sharingan', 'eyes', 'dojutsu', 'dōjutsu', 'awaken'],
      priority: 5,
      text: 'You have not awakened the Sharingan.',
      enabled: true,
      activeUntil: { flag: 'hasSharingan' },
    },
    {
      id: makeId('lore'),
      keywords: ['sharingan', 'awaken', 'truth', 'itachi', 'explain', 'coup'],
      priority: 5,
      text: 'Your Sharingan awakens in the moment Itachi finally tells you the truth about why he killed the clan: not in a fight, not from fear, and not before that moment. Until then you have no Sharingan.',
      enabled: true,
      hidden: true,
      activeUntil: { flag: 'hasSharingan' },
    },
    {
      id: makeId('lore'),
      keywords: ['itachi', 'truth', 'explain', 'why', 'coup', 'tell', 'promise'],
      priority: 5,
      text: 'When Itachi reaches you in the forest he does NOT tell you the truth yet. You are too close to the Leaf: he asks you to come with him (and to join the Akatsuki) first, and promises to explain once you are far from the village. The full truth (the coup, the order, Shisui) comes later, on the road, well away from the Leaf.',
      enabled: true,
      hidden: true,
      activeUntil: { thread: 'Make Itachi explain', threadStatus: 'resolved' },
    },
    {
      id: makeId('lore'),
      keywords: ['thousand souls', 'forbidden', 'steal', 'chakra', 'absorb', 'drain', 'nature'],
      priority: 5,
      text: 'Thousand Souls is a forbidden jutsu you created yourself, in secret; nobody else knows it exists. It steals a target’s chakra, which makes your reserves effectively limitless whenever you choose to use it and permanently expands your own chakra capacity, and it permanently gives you the chakra nature of whoever you steal from (drain a Wood Release user and you can use Wood Release). It is strictly chakra, chakra nature and capacity: it NEVER steals jutsu, techniques, memories or kekkei genkai abilities beyond the nature itself. It is not yet perfected: slower, harder to control, and it takes a toll on you. It becomes perfected after about 10 uses (see its use count under KAN’S JUTSU). You decide when to use it; never use it for you.',
      enabled: true,
      hidden: true,
    },
    {
      id: makeId('lore'),
      keywords: ['learn', 'copy', 'observe', 'jutsu', 'technique', 'train', 'study'],
      priority: 4,
      text: 'You are a versatile shinobi who learns jutsu fairly quickly after watching them, as long as you have the chakra nature they need. Learning still takes some practice and is never instant; this is talent, not the Sharingan and not Thousand Souls. Your own chakra nature is not known yet: the story finds it out.',
      enabled: true,
      hidden: true,
    },
    {
      id: makeId('lore'),
      keywords: ['orochimaru', 'thousand souls', 'curse mark', 'experiment'],
      priority: 4,
      text: 'Orochimaru is in the Akatsuki until he betrays it. If he ever sees or learns of Thousand Souls, he becomes intensely interested in you: a jutsu that takes chakra natures is exactly what he hunts. He studies you, probes you, and may try to tempt or take you, before and after his defection. He does not know about the jutsu unless he witnesses it or someone tells him.',
      enabled: true,
      hidden: true,
    },
    {
      id: makeId('lore'),
      keywords: ['akatsuki', 'partner', 'pair', 'juzo', 'kisame', 'kakuzu', 'hidan'],
      priority: 4,
      text: 'If you join the Akatsuki, you are NOT Itachi’s partner. Itachi’s partner follows canon: Jūzō Biwa first, then Kisame Hoshigaki. Pain pairs you with Kakuzu, who has killed every partner he has had; you are the first to survive him. When Hidan joins, Kakuzu is paired with Hidan as in canon and your partnership with Kakuzu ends. From then on you are a flexible member: you work alone or are sent with different members as Pain needs. You and Itachi meet and talk from time to time between missions.',
      enabled: true,
      hidden: true,
    },
    {
      id: makeId('lore'),
      keywords: ['nine-tails', 'kurama', 'attack'],
      priority: 5,
      text: 'The Nine-Tails attack killed your parents when you were five. It left you quiet, guarded, and slow to rely on anyone.',
      enabled: true,
    },
    {
      id: makeId('lore'),
      keywords: ['team 3', 'team-3', 'hana', 'izumi', 'suzume', 'sensei', 'teammate', 'anbu'],
      priority: 4,
      text: 'You were on Team 3, with Hana Inuzuka and Izumi Uchiha under Suzume, from graduation at nine until you joined ANBU at twelve. Then you left the team: Hana and Izumi stayed on Team 3 without you. You stayed close to Hana, Izumi and Suzume and still saw them from time to time.',
      enabled: true,
    },
    {
      id: makeId('lore'),
      keywords: ['anbu'],
      priority: 4,
      text: 'ANBU are Hidden Leaf’s masked special forces. You joined at twelve, one year after Itachi. You are no longer part of ANBU: you left the village and carry no ANBU equipment.',
      enabled: true,
    },
    {
      id: makeId('lore'),
      keywords: ['itachi', 'fight', 'massacre', 'forest', 'promise'],
      priority: 5,
      text: 'Days before the massacre Itachi told you his plan. Shaken, you fought him and lost, but you held back, unwilling to really hurt him, so nobody knows what you can do when you go all out. He sent you to hide in the forest and wait, promising to explain everything afterwards.',
      enabled: true,
      hidden: true,
    },
    {
      id: makeId('lore'),
      keywords: ['itachi', 'massacre', 'forest', 'wait', 'clan', 'happened'],
      priority: 5,
      text: 'You have been in the forest since that fight, so you do not know whether Itachi went through with it, how, or who died. Between you there is real tension: love and trust on one side, dread, anger and the need to know on the other.',
      enabled: true,
      hidden: true,
      activeUntil: { thread: 'Make Itachi explain', threadStatus: 'resolved' },
    },
    {
      id: makeId('lore'),
      keywords: ['izumi', 'team 3', 'team-3'],
      priority: 5,
      text: 'Izumi Uchiha, your former Team 3 teammate, died in the massacre. She had loved Itachi since the Academy, and you knew it. You do NOT know she is dead until someone tells you (Itachi, news, or the funeral); never reveal it through narration.',
      enabled: true,
      hidden: true,
      activeUntil: { flag: 'knowsIzumiDead' },
    },
    {
      id: makeId('lore'),
      keywords: ['izumi', 'team 3', 'team-3', 'grave'],
      priority: 5,
      text: 'Izumi Uchiha, your former Team 3 teammate, died in the massacre. She had loved Itachi since the Academy, and you knew it.',
      enabled: true,
      activeAfter: { flag: 'knowsIzumiDead' },
    },
    {
      id: makeId('lore'),
      keywords: ['shisui'],
      priority: 4,
      text: 'Shisui Uchiha grew up with you and Itachi. He was found dead in the Naka River shortly before the massacre, officially a suicide. You do not know the truth.',
      enabled: true,
      hidden: true,
      activeUntil: { thread: 'What really happened to Shisui?', threadStatus: 'resolved' },
    },
    {
      id: makeId('lore'),
      keywords: ['headband', 'forehead protector', 'protector', 'leaf', 'village', 'itachi', 'scratch'],
      priority: 4,
      text: 'Your Hidden Leaf forehead protector is still whole: you have not cut your tie to the village. Early on, once you are away from the Leaf, Itachi may show you the line through his own and quietly encourage you to do the same. You decide whether and when; never do it for you.',
      enabled: true,
      hidden: true,
      activeUntil: { flag: 'headbandScratched' },
    },
    {
      id: makeId('lore'),
      keywords: [],
      priority: 5,
      always: true,
      text: GEOGRAPHY_LORE,
      enabled: true,
      hidden: true,
    },
  ];

  // who_knows holds entity ids; anyone not in the cast is a group tag.
  const knownFacts: FactRecord[] = facts.map((fact) => {
    const knowers = knowersOf({ entities } as AppDatabase, fact.whoKnows);
    return {
      ...fact,
      whoKnows: knowers.ids,
      ...(knowers.groups.length > 0 ? { whoKnowsGroups: knowers.groups } : {}),
      // Everything you know at the start comes with the opening memory.
      sourceEventId: fact.sourceEventId ?? openingEvent.id,
      subjectEntityId: fact.subjectEntityId ?? (fact.text.startsWith('Shisui') ? (entities.find((e) => e.name === 'Shisui Uchiha')?.id ?? KAN_ID) : KAN_ID),
    };
  });

  const database: AppDatabase = {
    schemaVersion: 1,
    meta: {
      slotId,
      slotName,
      createdAt: now,
      updatedAt: now,
    },
    settings: DEFAULT_SETTINGS,
    rawLog: [],
    entities,
    jutsuRecords,
    events: [openingEvent],
    eventEntities: [
      { eventId: openingEvent.id, entityId: KAN_ID, role: 'participant' },
      { eventId: openingEvent.id, entityId: ITACHI_ID, role: 'present' },
      { eventId: openingEvent.id, entityId: FOREST_ID, role: 'present' },
    ],
    bonds,
    facts: knownFacts,
    threads,
    loreEntries,
    summaries: [],
    state: {
      player: {
        name: 'Kan',
        lineage: ['Uchiha', 'Uzumaki'],
        birthday: { month: 6, day: 30 },
        birthYear: 0,
        rank: 'Missing-nin (former ANBU)',
        role: 'Missing shinobi',
        team: ['Hana Inuzuka', 'Izumi Uchiha'],
        sensei: 'Suzume',
        personality: [
          'smart',
          'learns naturally',
          'dislikes studying',
          'reserved',
          'watchful',
          'hard to read',
          'versatile',
          'a little timid underneath',
          'hides his feelings',
        ],
        secretNotes: [
          'Has a secret crush on Hana Inuzuka.',
          'Rarely mentions his clan names.',
          'Created a forbidden jutsu, Thousand Souls, in secret. No one knows it exists.',
        ],
      },
      mood: 'Numb, guarded, torn',
      worldDescription: 'The Hidden Leaf still carries the scars of the Nine-Tails attack. Tonight the rain is heavy, and the forest around the village is silent.',
      jutsu: ['Shinobi taijutsu', 'Thousand Souls'],
      inventory: [
        'Hidden Leaf forehead protector',
        'Kunai pouch (6 kunai)',
        'Shuriken (10)',
        'Ninja wire',
        'Explosive tags (3)',
        'Smoke bombs (2)',
        'Basic ration pack',
      ],
      location: 'Forest outside Hidden Leaf',
      inStoryDate: DEFAULT_DATE,
      canonPoint: 'The night Itachi said he would act. He is coming to the forest to find you.',
      chapter: 1,
      chapterTitle: 'The flight from the Leaf',
      chapterStart: { turn: 1, date: DEFAULT_DATE },
      scene: 'The rain after',
      // The opening is a heavy downpour (Session 1: the world rolled "cloudy").
      weather: { region: 'fire', condition: 'downpour', text: 'heavy rain', since: DEFAULT_DATE, source: 'story' },
      purse: startingPurse(),
      // A new story tracks which names Kan knows from the start (names.ts).
      namesVersion: NAMES_VERSION,
    },
    indices: emptyIndex(),
    snapshots: [],
  };

  return database;
}
