// Data only: what Kan knows of people's names at the start, the people who
// go by more than one identity (and who in the world knows which), who is
// famous enough to recognise on sight, and the short descriptions used for
// people Kan cannot name yet. The engine lives in names.ts.

import type { FameLevel, Identity, NameParts } from './types';

/**
 * People Kan knows by name and face when the story begins (year 13): Itachi,
 * Team 3 and its sensei, his parents, the Uchiha he grew up with, the Hokage
 * and the Leaf council, his ANBU colleagues (by the names ANBU used: Tenzo,
 * not Yamato), and the Leaf ninja a thirteen-year-old ANBU would have met.
 * The value lists the identities he knows for people who have more than one;
 * `true` means simply their name.
 */
export const KNOWN_AT_START: Record<string, true | string[]> = {
  Kan: true,
  'Itachi Uchiha': true,
  'Hana Inuzuka': true,
  'Izumi Uchiha': true,
  Suzume: true,
  'Erisa Uchiha': true,
  'Banri Uzumaki': true,
  // The Uchiha he grew up with.
  'Shisui Uchiha': true,
  'Sasuke Uchiha': true,
  'Fugaku Uchiha': true,
  'Mikoto Uchiha': true,
  'Yashiro Uchiha': true,
  'Inabi Uchiha': true,
  'Tekka Uchiha': true,
  'Kagami Uchiha': true,
  // The Hokage and the council.
  'Hiruzen Sarutobi': true,
  'Danzo Shimura': true,
  'Homura Mitokado': true,
  'Koharu Utatane': true,
  'Minato Namikaze': true,
  'Hashirama Senju': true,
  'Tobirama Senju': true,
  'Kushina Uzumaki': true,
  // ANBU.
  'Kakashi Hatake': true,
  Yamato: ['Tenzo'],
  'Yūgao Uzuki': true,
  Pakkun: true,
  // Leaf ninja and faces he would have met by thirteen.
  'Might Guy': true,
  'Asuma Sarutobi': true,
  'Kurenai Yuhi': true,
  'Anko Mitarashi': true,
  'Ibiki Morino': true,
  'Genma Shiranui': true,
  'Raido Namiashi': true,
  'Aoba Yamashiro': true,
  'Gekko Hayate': true,
  'Kotetsu Hagane': true,
  'Izumo Kamizuki': true,
  'Iruka Umino': true,
  Ebisu: true,
  'Shikaku Nara': true,
  'Inoichi Yamanaka': true,
  'Choza Akimichi': true,
  'Tsume Inuzuka': true,
  'Hiashi Hyuga': true,
  'Hizashi Hyuga': true,
  'Jiraiya': true,
  'Tsunade Senju': true,
  Orochimaru: true,
  'Naruto Uzumaki': true,
  'Konohamaru Sarutobi': true,
  Teuchi: true,
  Ayame: true,
  // Everyone in the Leaf knows what is sealed in Naruto, by this name.
  'Nine-Tails': ['Nine-Tails'],
};

/**
 * How a name splits, where the plain rule (two words: given, then family)
 * would be wrong. `full` is the whole name shown once Kan knows both parts.
 */
export const NAME_PARTS: Record<string, NameParts> = {
  Karin: { given: 'Karin', family: 'Uzumaki', full: 'Karin Uzumaki' },
  'Might Guy': { given: 'Guy', family: 'Might' },
  'Rock Lee': { given: 'Lee', family: 'Rock' },
  'Metal Lee': { given: 'Metal', family: 'Lee' },
  'Gekko Hayate': { given: 'Hayate', family: 'Gekko' },
  'Killer Bee': { given: 'Killer Bee' },
  'Son Gokū': { given: 'Son Gokū' },
  'Nine-Tails': { given: 'Nine-Tails' },
  Yagura: { given: 'Yagura', family: 'Karatachi', full: 'Yagura Karatachi' },
};

const AKATSUKI = ['Itachi Uchiha', 'Kisame Hoshigaki', 'Deidara', 'Hidan', 'Kakuzu', 'Pain', 'Konan', 'Zetsu'];
const TAKA = ['Sasuke Uchiha', 'Karin', 'Suigetsu Hozuki', 'Jugo'];
const KAGE_AT_THE_SUMMIT = ['Gaara', 'A', 'Onoki', 'Mei Terumi', 'Danzo Shimura', 'Mifune'];

/**
 * People with more than one identity. Priority for what Kan sees: a true
 * name he has learned > a claimed identity > a persona > the label.
 * `knownBy` is who in the world knows them by that name and from when;
 * the narrator uses it so everyone calls them by the name they know.
 */
export const IDENTITIES: Record<string, Identity[]> = {
  Tobi: [
    {
      name: 'Tobi',
      kind: 'persona',
      // The act begins when he joins as Sasori's replacement and Deidara's partner.
      existsFrom: 'tobi-joins-akatsuki',
      learnedWith: ['tobi-joins-akatsuki'],
      knownBy: [{ who: AKATSUKI, from: 'tobi-joins-akatsuki' }],
    },
    {
      name: 'Madara Uchiha',
      kind: 'claimed',
      // A bare "Madara" already finds him (entities.ts), and the real one
      // must keep his own name: this one is never added as an alias.
      alias: false,
      learnedWith: ['masked-man-audience'],
      renamed: { after: 'madara-revived', name: 'Masked Madara' },
      publicFrom: 'kage-summit',
      knownBy: [
        // Kisame from his recruitment; Pain and Konan from when he courted them.
        // Konan glimpses his face as she falls (konan-falls) but never learns Obito.
        { who: ['Itachi Uchiha', 'Kisame Hoshigaki', 'Pain', 'Konan', 'Zetsu'] },
        { who: TAKA, from: 'masked-man-truth' },
        { who: ['Kabuto Yakushi'], from: 'kabuto-pact', note: 'knows he is not the real Madara' },
        { who: KAGE_AT_THE_SUMMIT, from: 'kage-summit' },
      ],
    },
    {
      name: 'Obito Uchiha',
      kind: 'true',
      learnedWith: ['obito-unmasked'],
      publicFrom: 'obito-unmasked',
      knownBy: [
        { who: ['Zetsu'], playsAlong: true },
        { who: ['Madara Uchiha'], from: 'madara-revived' },
        { who: ['Kakashi Hatake', 'Naruto Uzumaki', 'Might Guy', 'Killer Bee'], from: 'obito-unmasked' },
      ],
    },
  ],
  Pain: [
    {
      name: 'Pain',
      kind: 'persona',
      knownBy: [{ who: [...AKATSUKI, 'Tobi'] }],
      publicFrom: 'pain-assault',
    },
    {
      name: 'Nagato Uzumaki',
      kind: 'true',
      learnedWith: ['pain-assault'],
      knownBy: [
        { who: ['Konan', 'Tobi', 'Zetsu'] },
        { who: ['Jiraiya'], from: 'jiraiya-dies' },
        { who: ['Naruto Uzumaki', 'Kakashi Hatake', 'Tsunade Senju'], from: 'pain-assault' },
      ],
    },
  ],
  Sasori: [
    { name: 'Hiruko', kind: 'persona' },
    { name: 'Sasori', kind: 'true', knownBy: [{ who: [...AKATSUKI, 'Chiyo', 'Kabuto Yakushi', 'Orochimaru'] }] },
  ],
  Yamato: [
    { name: 'Kinoe', kind: 'persona', knownBy: [{ who: ['Danzo Shimura'] }] },
    { name: 'Yamato', kind: 'persona', learnedWith: ['sai-yamato'], publicFrom: 'sai-yamato' },
    {
      name: 'Tenzo',
      kind: 'true',
      knownBy: [{ who: ['Kakashi Hatake', 'Hiruzen Sarutobi', 'Danzo Shimura', 'Yūgao Uzuki', 'Itachi Uchiha'] }],
    },
  ],
  'Nine-Tails': [
    { name: 'Nine-Tails', kind: 'claimed', publicFrom: 'start' },
    {
      name: 'Kurama',
      kind: 'true',
      learnedWith: ['naruto-joins-war'],
      knownBy: [{ who: ['Naruto Uzumaki', 'Killer Bee', 'Gyūki'], from: 'naruto-joins-war' }],
    },
  ],
  'Kabuto Yakushi': [
    {
      name: 'Kabuto Yakushi',
      kind: 'true',
      note: "secretly Orochimaru's spy, and once Sasori's",
      knownBy: [{ who: ['Orochimaru', 'Sasori'] }],
    },
  ],
};

/**
 * Who Kan can recognise without an introduction, and from when.
 * - sight: famous enough that their look gives them away.
 * - heard: he knows the name but not the face; he needs an introduction or a clear sign.
 * Anyone missing is unknown. The last step whose milestone has happened applies.
 */
export const FAME: Record<string, { level: FameLevel; from?: string }[]> = {
  // The Sannin.
  Jiraiya: [{ level: 'sight' }],
  'Tsunade Senju': [{ level: 'sight' }],
  Orochimaru: [{ level: 'sight' }],
  // The Kage, in their robes.
  'Hiruzen Sarutobi': [{ level: 'sight' }],
  Rasa: [{ level: 'sight' }],
  Yagura: [{ level: 'sight' }],
  A: [{ level: 'sight' }],
  Onoki: [{ level: 'sight' }],
  Gaara: [{ level: 'heard' }, { level: 'sight', from: 'gaara-kage' }],
  'Mei Terumi': [{ level: 'heard' }, { level: 'sight', from: 'mei-mizukage' }],
  'Hashirama Senju': [{ level: 'sight' }],
  'Tobirama Senju': [{ level: 'sight' }],
  'Minato Namikaze': [{ level: 'sight' }],
  'Madara Uchiha': [{ level: 'sight' }],
  // Bingo-book names with a famous look or weapon.
  'Kisame Hoshigaki': [{ level: 'sight' }],
  'Zabuza Momochi': [{ level: 'sight' }],
  'Jūzō Biwa': [{ level: 'sight' }],
  'Fuguki Suikazan': [{ level: 'sight' }],
  'Jinpachi Munashi': [{ level: 'sight' }],
  'Kushimaru Kuriarare': [{ level: 'sight' }],
  'Jinin Akebino': [{ level: 'sight' }],
  'Ameyuri Ringo': [{ level: 'sight' }],
  'Raiga Kurosuki': [{ level: 'sight' }],
  'Mangetsu Hōzuki': [{ level: 'sight' }],
  Hanzō: [{ level: 'sight' }],
  Kakuzu: [{ level: 'heard' }],
  Sasori: [{ level: 'heard' }],
  Deidara: [{ level: 'heard', from: 'deidara-recruited' }],
  'Killer Bee': [{ level: 'heard' }],
  Chiyo: [{ level: 'heard' }],
  Mifune: [{ level: 'heard' }],
  // The Leaf: faces from his ANBU years.
  'Kakashi Hatake': [{ level: 'sight' }],
  'Might Guy': [{ level: 'sight' }],
  'Danzo Shimura': [{ level: 'sight' }],
  'Itachi Uchiha': [{ level: 'sight' }],
  'Naruto Uzumaki': [{ level: 'heard' }, { level: 'sight', from: 'pain-assault' }],
  'Sasuke Uchiha': [{ level: 'heard' }],
  // Pain is never recognisable: his bodies are strangers' faces.
  Pain: [],
};

/**
 * Names a canon beat itself gives Kan: the people who introduce themselves,
 * or are named to him, in the moment the beat completes. Pain receives Kan
 * and names his partner at the joining (its facts say so), so the goal
 * "Survive Kakuzu" can never show a name Kan hasn't heard.
 */
export const INTRODUCED_AT: Record<string, string[]> = {
  'kan-joins-akatsuki': ['Pain'],
  'kan-accepted-akatsuki': ['Kakuzu'],
};

/**
 * Short descriptions for people Kan cannot name yet, where their look alone
 * would make a poor one (or would give a name away).
 */
export const LABELS: Record<string, string> = {
  Tobi: 'the masked man',
  Pain: 'the pierced man',
  Konan: 'the woman with the paper flower',
  Zetsu: 'the plant-like man',
  Sasori: 'the hunched puppet-like figure',
  Kakuzu: 'the masked man with stitched arms',
  Hidan: 'the silver-haired zealot',
  Deidara: 'the blond bomber',
  Kisame: 'the shark-faced swordsman',
  'Kisame Hoshigaki': 'the shark-faced swordsman',
  Karin: 'the red-haired girl',
  'Suigetsu Hozuki': 'the sharp-toothed swordsman',
  Jugo: 'the giant gentle-eyed man',
  'Kabuto Yakushi': 'the silver-haired medic with glasses',
  'Madara Uchiha': 'the long-haired Uchiha ghost',
  Gaara: 'the red-haired boy with the gourd',
  'Killer Bee': 'the rapping swordsman',
  Yamato: 'the wood-style captain',
  'Nine-Tails': 'the Nine-Tails',
  Shukaku: 'the One-Tail',
  Matatabi: 'the Two-Tails',
  Isobu: 'the Three-Tails',
  'Son Gokū': 'the Four-Tails',
  Kokuō: 'the Five-Tails',
  Saiken: 'the Six-Tails',
  Chōmei: 'the Seven-Tails',
  Gyūki: 'the Eight-Tails',
  Gamabunta: 'the giant toad with the pipe',
  Shima: 'the old toad woman',
  Fukasaku: 'the old toad sage',
  Manda: 'the giant purple snake',
  Katsuyu: 'the giant slug',
  Akamaru: 'the little white dog',
  Kaguya: 'the horned goddess',
  'Kaguya Ōtsutsuki': 'the horned goddess',
};
