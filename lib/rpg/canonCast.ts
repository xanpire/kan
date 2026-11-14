import { CAST_ADDITIONS } from './canonCastMore';
import { IDENTITIES } from './nameData';
import { castKnowledge } from './names';
import { loreProfileFor, romanceFor } from './romance';
import type { EntityRecord, Gender } from './types';

/**
 * The canon cast, loaded into every save from the start: the main players,
 * the wider world (the other villages, their Kage, all nine jinchūriki,
 * Orochimaru's people), village life, and the dead the story looks back on.
 *
 * Each person exists exactly once, with the names the story is likely to use
 * for them, so the state tracker can refer to them by ID instead of inventing
 * a second "Kisame" or "Hoshigaki Kisame". Entries start with `met: false`:
 * they stay out of the bonds list until you actually meet them.
 *
 * Roles describe each person at the start of the story (year 13); later
 * changes — Kisame joining the Akatsuki, Tsunade becoming Hokage — come from
 * the story and the canon timeline.
 *
 * Years count from Kan's birth (year 0); the massacre is in year 13, when Kan
 * and Itachi are 13. Ages follow the databooks loosely, lined up so Naruto is
 * 12 at the Chunin Exams.
 *
 * Aliases avoid common words ("Leader", "Guy", "Bee"): names are also matched
 * as whole words inside longer names, and "the guy with the scar" must not
 * become Might Guy.
 *
 * Some people only enter the save when a milestone fires (`appearsWith`):
 * the real Madara Uchiha (revived in the war; until then a bare "Madara"
 * belongs to the masked man, who claims that name), Kaguya (sealed in the
 * moon until she returns), and the children born after the story begins.
 * Until then they do not exist for the story: nobody can meet them, write to
 * them or mention them as alive. More people live in canonCastMore.ts.
 */
export type CastEntry = {
  name: string;
  aliases: string[];
  /** Every person has one; `birthdayInvented` marks the few canon never gives. */
  birthday?: { month: number; day: number };
  birthdayInvented?: boolean;
  /** Left out for those who do not age like people (Fukasaku, the tailed beasts). */
  birthYear?: number;
  role: string;
  personality: string;
  speechStyle: string;
  appearance: string;
  /**
   * Status at the start of the story, when it is not simply alive:
   * "Deceased", "Sealed" (Kaguya, a tailed beast inside its host), or
   * "Not yet born" (with `appearsWith` set to the birth milestone).
   */
  status?: string;
  /** The milestone that brings this person into the story (a birth, a revival, a return). */
  appearsWith?: string;
  /** For the genderless (the tailed beasts); otherwise FEMALE_CAST decides. */
  gender?: Gender;
  tags: string[];
};

const BASE_CAST: CastEntry[] = [
  {
    name: 'Sasuke Uchiha',
    aliases: ['Sasuke', 'Uchiha Sasuke'],
    birthday: { month: 7, day: 23 },
    birthYear: 5,
    role: 'Itachi’s little brother',
    personality: 'Proud, intense, lonely; lives for avenging his clan.',
    speechStyle: 'Curt, cold, dismissive.',
    appearance: 'Dark spiky hair swept back, black eyes, high-collared shirt with the Uchiha crest.',
    tags: ['canon', 'uchiha', 'leaf'],
  },
  {
    name: 'Naruto Uzumaki',
    aliases: ['Naruto', 'Uzumaki Naruto'],
    birthday: { month: 10, day: 10 },
    birthYear: 5,
    role: 'Leaf orphan · Nine-Tails jinchuriki',
    personality: 'Loud, stubborn, warm, never gives up.',
    speechStyle: 'Brash and energetic, ends sentences with "dattebayo".',
    appearance: 'Spiky blond hair, blue eyes, whisker marks, bright orange jumpsuit.',
    tags: ['canon', 'uzumaki', 'leaf', 'jinchuriki'],
  },
  {
    name: 'Sakura Haruno',
    aliases: ['Sakura', 'Haruno Sakura'],
    birthday: { month: 3, day: 28 },
    birthYear: 5,
    role: 'Leaf kunoichi',
    personality: 'Bright, short-tempered, determined to prove herself.',
    speechStyle: 'Sharp and expressive.',
    appearance: 'Pink hair, green eyes, broad forehead, red qipao-style top.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Kakashi Hatake',
    aliases: ['Kakashi', 'Hatake Kakashi', 'Copy Ninja Kakashi'],
    birthday: { month: 9, day: 15 },
    birthYear: -9,
    role: 'Leaf jonin · former ANBU',
    personality: 'Laid-back on the surface, sharp and grieving underneath.',
    speechStyle: 'Lazy, dry, mildly teasing.',
    appearance: 'Spiky silver hair, mask over the lower face, headband over his left Sharingan eye.',
    tags: ['canon', 'leaf', 'anbu'],
  },
  {
    name: 'Hiruzen Sarutobi',
    aliases: ['Hiruzen', 'Third Hokage', 'Lord Third', 'Sarutobi Hiruzen'],
    birthday: { month: 2, day: 8 },
    birthYear: -51,
    role: 'Third Hokage',
    personality: 'Wise, gentle, burdened by the compromises of leading.',
    speechStyle: 'Grandfatherly, patient, measured.',
    appearance: 'Elderly man with a goatee and pipe, wearing the white-and-red Hokage robes.',
    tags: ['canon', 'leaf', 'hokage'],
  },
  {
    name: 'Danzo Shimura',
    aliases: ['Danzo', 'Shimura Danzo'],
    birthday: { month: 1, day: 6 },
    birthYear: -50,
    role: 'Leaf elder · head of Root',
    personality: 'Ruthless, cold, convinced the village survives only through darkness.',
    speechStyle: 'Flat, clipped, commanding.',
    appearance: 'Old man with bandages over his right eye, an X-shaped chin scar, and a cane.',
    tags: ['canon', 'leaf', 'root'],
  },
  {
    name: 'Jiraiya',
    aliases: ['Jiraiya-sama', 'Toad Sage', 'Pervy Sage'],
    birthday: { month: 11, day: 11 },
    birthYear: -33,
    role: 'Legendary Sannin · spymaster',
    personality: 'Boisterous and lecherous, perceptive and kind beneath it.',
    speechStyle: 'Theatrical, boastful, suddenly serious.',
    appearance: 'Tall man with long spiky white hair, red lines under his eyes, and a horned headband.',
    tags: ['canon', 'leaf', 'sannin'],
  },
  {
    name: 'Tsunade Senju',
    aliases: ['Tsunade', 'Lady Tsunade', 'Fifth Hokage'],
    birthday: { month: 8, day: 2 },
    birthYear: -33,
    role: 'Legendary Sannin · medical ninja',
    personality: 'Fierce, proud, grieving, a reckless gambler.',
    speechStyle: 'Blunt and commanding.',
    appearance: 'Looks far younger than her age; blonde pigtails, a diamond mark on her forehead, green haori.',
    tags: ['canon', 'leaf', 'sannin', 'senju'],
  },
  {
    name: 'Orochimaru',
    aliases: ['Orochimaru-sama', 'Lord Orochimaru'],
    birthday: { month: 10, day: 27 },
    birthYear: -33,
    role: 'Legendary Sannin · rogue scientist',
    personality: 'Curious, patient, chillingly amoral; collects talent.',
    speechStyle: 'Silky, amused, unhurried.',
    appearance: 'Pale skin, long black hair, golden snake-like eyes, purple eye markings.',
    tags: ['canon', 'sannin', 'rogue'],
  },
  {
    name: 'Kabuto Yakushi',
    aliases: ['Kabuto', 'Yakushi Kabuto'],
    birthday: { month: 2, day: 29 },
    birthYear: -2,
    role: 'Spy · Orochimaru’s right hand',
    personality: 'Polite mask over a hollow, shifting identity.',
    speechStyle: 'Courteous, mild, quietly mocking.',
    appearance: 'Silver hair in a ponytail, round glasses, purple shinobi clothes.',
    tags: ['canon', 'rogue'],
  },
  {
    name: 'Shisui Uchiha',
    aliases: ['Shisui', 'Shisui of the Body Flicker'],
    birthday: { month: 10, day: 19 },
    birthYear: -3,
    role: 'Leaf jonin · Uchiha',
    personality: 'Gentle, selfless, devoted to peace.',
    speechStyle: 'Warm and easygoing.',
    appearance: 'Curly black hair, kind dark eyes, Leaf flak jacket.',
    status: 'Deceased',
    tags: ['canon', 'uchiha', 'leaf'],
  },
  {
    name: 'Kisame Hoshigaki',
    aliases: ['Kisame', 'Hoshigaki Kisame'],
    birthday: { month: 3, day: 18 },
    birthYear: -12,
    role: 'Mist swordsman · one of the Seven Swordsmen',
    personality: 'Bloodthirsty, jovial, surprisingly loyal to his partner.',
    speechStyle: 'Toothy, sardonic, chuckling.',
    appearance: 'Huge man with blue-grey skin, gill marks, shark teeth, and the bandaged sword Samehada.',
    tags: ['canon', 'akatsuki', 'mist'],
  },
  {
    name: 'Kakuzu',
    aliases: ['Kakuzu of the Waterfall'],
    birthday: { month: 8, day: 15 },
    birthYear: -71,
    role: 'Akatsuki · treasurer',
    personality: 'Greedy, short-tempered, coldly practical.',
    speechStyle: 'Gruff and impatient.',
    appearance: 'Tall masked man with green-on-red eyes, a dark hood, and stitched dark skin.',
    tags: ['canon', 'akatsuki', 'waterfall'],
  },
  {
    name: 'Hidan',
    aliases: ['Hidan of the Hot Springs'],
    birthday: { month: 4, day: 2 },
    birthYear: -2,
    role: 'Jashinist from the Hot Springs Village',
    personality: 'Fanatical, crude, immortal, relishes pain.',
    speechStyle: 'Loud and foul-mouthed.',
    appearance: 'Slicked-back silver hair, violet eyes, a three-bladed scythe, and a Jashin pendant.',
    tags: ['canon', 'akatsuki'],
  },
  {
    name: 'Deidara',
    aliases: ['Deidara of the Stone'],
    birthday: { month: 5, day: 5 },
    birthYear: 1,
    role: 'Stone ninja · explosives artist',
    personality: 'Arrogant, hot-headed, obsessed with art as an explosion.',
    speechStyle: 'Cocky, ends sentences with "un" or "hm".',
    appearance: 'Long blond hair in a half ponytail covering one eye, a scope over the other, mouths on his palms.',
    tags: ['canon', 'akatsuki', 'stone'],
  },
  {
    name: 'Sasori',
    aliases: ['Sasori of the Red Sand', 'Hiruko'],
    birthday: { month: 11, day: 8 },
    birthYear: -15,
    role: 'Akatsuki · puppet master',
    personality: 'Impatient, cold, sees people as puppets.',
    speechStyle: 'Terse and irritable.',
    appearance: 'Usually hidden inside the hunched puppet Hiruko; really a red-haired youth of eternal age.',
    tags: ['canon', 'akatsuki', 'sand'],
  },
  {
    name: 'Konan',
    aliases: ['Angel of the Rain'],
    birthday: { month: 2, day: 20 },
    birthYear: -15,
    role: 'Akatsuki · Pain’s partner',
    personality: 'Calm, distant, devoted to Pain.',
    speechStyle: 'Quiet and economical.',
    appearance: 'Short blue hair with a paper flower, amber eyes, a lip piercing.',
    tags: ['canon', 'akatsuki', 'rain'],
  },
  {
    name: 'Pain',
    aliases: ['Six Paths of Pain', 'Deva Path', 'Asura Path', 'Animal Path', 'Human Path', 'Preta Path', 'Naraka Path'],
    // Who is behind the six bodies is an identity (nameData.ts): the Leaf learns it when Pain falls there.
    birthday: { month: 9, day: 19 },
    birthYear: -15,
    role: 'Akatsuki leader',
    personality: 'Cold, godlike, convinced pain brings peace.',
    speechStyle: 'Solemn and absolute.',
    appearance: 'Orange-haired man pierced with black rods, ringed purple Rinnegan eyes.',
    tags: ['canon', 'akatsuki', 'rain'],
  },
  {
    // Named Tobi, not "Masked man": "the masked man" is ordinary description
    // (Kakuzu wears a mask too) and must never land on him.
    // His three identities (Tobi, the Madara he claims to be, Obito) and who
    // knows which are in nameData.ts.
    name: 'Tobi',
    aliases: [],
    birthday: { month: 2, day: 10 },
    birthYear: -9,
    role: 'Akatsuki’s hidden hand',
    personality: 'Two faces: a silly, cowardly act and a cold, controlled self.',
    speechStyle: 'Low and cold; in his act high, goofy, third person.',
    appearance: 'Black cloak, an orange swirl mask with one eyehole showing a Sharingan.',
    tags: ['canon', 'akatsuki', 'uchiha'],
  },
  {
    name: 'Zetsu',
    aliases: ['Black Zetsu', 'White Zetsu'],
    birthday: { month: 1, day: 1 },
    birthdayInvented: true,
    birthYear: -30,
    role: 'Akatsuki · spy',
    personality: 'Two voices in one body: one cheerful, one cold.',
    speechStyle: 'Alternates between a light and a deep voice.',
    appearance: 'Plant-like Venus flytrap leaves around a half-black, half-white face.',
    tags: ['canon', 'akatsuki'],
  },
  {
    name: 'Gaara',
    aliases: ['Gaara of the Desert', 'Gaara of the Sand'],
    birthday: { month: 1, day: 19 },
    birthYear: 5,
    role: 'Sand · One-Tail jinchuriki',
    personality: 'Isolated and dangerous; slowly learns to care.',
    speechStyle: 'Flat and quiet.',
    appearance: 'Short red hair, dark-rimmed eyes, the kanji for love on his forehead, a gourd of sand.',
    tags: ['canon', 'sand', 'jinchuriki'],
  },
  {
    name: 'Killer Bee',
    aliases: ['Killer B'],
    birthday: { month: 5, day: 15 },
    birthYear: -18,
    role: 'Cloud shinobi · Eight-Tails jinchuriki',
    personality: 'Carefree, confident, fiercely loyal to his brother.',
    speechStyle: 'Raps in bad rhymes.',
    appearance: 'Muscular dark-skinned man with sunglasses, a bull-horn tattoo, and seven swords.',
    tags: ['canon', 'cloud', 'jinchuriki'],
  },
  {
    name: 'Might Guy',
    aliases: ['Might Gai', 'Guy-sensei'],
    birthday: { month: 1, day: 1 },
    birthYear: -9,
    role: 'Leaf jonin · taijutsu master',
    personality: 'Passionate, endlessly upbeat, Kakashi’s self-declared rival.',
    speechStyle: 'Loud, preaches the springtime of youth.',
    appearance: 'Bowl haircut, thick eyebrows, green jumpsuit with orange leg warmers.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Hinata Hyuga',
    aliases: ['Hinata', 'Hyuga Hinata'],
    birthday: { month: 12, day: 27 },
    birthYear: 5,
    role: 'Hyuga heiress',
    personality: 'Shy, kind, quietly brave.',
    speechStyle: 'Soft and hesitant.',
    appearance: 'Dark blue hair, pale lavender Byakugan eyes, oversized jacket.',
    tags: ['canon', 'leaf', 'hyuga'],
  },
  {
    name: 'Neji Hyuga',
    aliases: ['Neji', 'Hyuga Neji'],
    birthday: { month: 7, day: 3 },
    birthYear: 4,
    role: 'Hyuga branch house prodigy',
    personality: 'Proud, fatalistic, brilliant.',
    speechStyle: 'Cool and lecturing about fate.',
    appearance: 'Long dark hair, pale Byakugan eyes, a forehead protector hiding the caged-bird seal.',
    tags: ['canon', 'leaf', 'hyuga'],
  },
  {
    name: 'Shikamaru Nara',
    aliases: ['Shikamaru', 'Nara Shikamaru'],
    birthday: { month: 9, day: 22 },
    birthYear: 5,
    role: 'Nara clan strategist',
    personality: 'Lazy genius who cannot help solving things.',
    speechStyle: 'Bored sighs, "what a drag".',
    appearance: 'Black hair in a spiky ponytail, earrings, sleepy eyes.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Kiba Inuzuka',
    aliases: ['Kiba', 'Inuzuka Kiba'],
    birthday: { month: 7, day: 7 },
    birthYear: 5,
    role: 'Hana’s little brother',
    personality: 'Brash, competitive, loyal.',
    speechStyle: 'Loud and cocky.',
    appearance: 'Messy brown hair, red fang marks on his cheeks, a puppy named Akamaru.',
    tags: ['canon', 'leaf', 'inuzuka'],
  },
  {
    name: 'Rock Lee',
    aliases: ['Lee'],
    birthday: { month: 11, day: 27 },
    birthYear: 4,
    role: 'Leaf · taijutsu specialist',
    personality: 'Earnest, hard-working, never quits.',
    speechStyle: 'Formal and passionate.',
    appearance: 'Bowl cut, huge round eyes, thick eyebrows, green jumpsuit like his sensei’s.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Anko Mitarashi',
    aliases: ['Anko'],
    birthday: { month: 10, day: 24 },
    birthYear: -11,
    role: 'Leaf special jonin · Orochimaru’s former student',
    personality: 'Bold, wild, scarred by her old master.',
    speechStyle: 'Teasing and aggressive.',
    appearance: 'Purple hair in a short spiky ponytail, a mesh bodysuit and tan trench coat.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Kurenai Yuhi',
    aliases: ['Kurenai'],
    birthday: { month: 6, day: 11 },
    birthYear: -9,
    role: 'Leaf jonin · genjutsu specialist',
    personality: 'Calm, caring, fiercely protective of her students.',
    speechStyle: 'Composed and warm.',
    appearance: 'Long wavy black hair, red eyes, a dress of wrapped bandage-like cloth.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Asuma Sarutobi',
    aliases: ['Asuma'],
    birthday: { month: 10, day: 18 },
    birthYear: -10,
    role: 'Leaf jonin · son of the Third Hokage',
    personality: 'Laid-back, principled, protective.',
    speechStyle: 'Easygoing, through cigarette smoke.',
    appearance: 'Short dark hair, beard, cigarette, trench knives.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Shizune',
    aliases: ['Shizune-san'],
    birthday: { month: 11, day: 18 },
    birthYear: -10,
    role: 'Medical ninja · Tsunade’s apprentice',
    personality: 'Earnest, worried, competent.',
    speechStyle: 'Polite and fretful.',
    appearance: 'Short black hair, dark kimono, often carrying the pig Tonton.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Yamato',
    aliases: ['Tenzo', 'Captain Yamato'],
    birthday: { month: 8, day: 10 },
    birthYear: -5,
    role: 'Leaf ANBU · Wood Style user',
    personality: 'Dutiful, polite, quietly intimidating.',
    speechStyle: 'Formal, with a scary stare when crossed.',
    appearance: 'Short brown hair, wide dark eyes, a face-guard headband.',
    tags: ['canon', 'leaf', 'anbu'],
  },
  {
    name: 'Karin',
    aliases: ['Karin Uzumaki'],
    birthday: { month: 3, day: 30 },
    birthYear: 4,
    role: 'Uzumaki sensor',
    personality: 'Sharp-tongued, guarded, secretly sentimental.',
    speechStyle: 'Snappish.',
    appearance: 'Long red hair cut unevenly, red eyes, glasses.',
    tags: ['canon', 'uzumaki', 'rogue'],
  },
  {
    name: 'Suigetsu Hozuki',
    aliases: ['Suigetsu'],
    birthday: { month: 2, day: 18 },
    birthYear: 5,
    role: 'Hozuki clan · Mist',
    personality: 'Cheeky, sword-obsessed, lazy.',
    speechStyle: 'Mocking and casual.',
    appearance: 'White-blue hair, purple eyes, shark-like teeth, always drinking water.',
    tags: ['canon', 'mist', 'rogue'],
  },
  {
    name: 'Jūzō Biwa',
    aliases: ['Juzo Biwa', 'Juzo', 'Jūzō'],
    birthday: { month: 4, day: 10 },
    birthdayInvented: true,
    birthYear: -18,
    role: 'Akatsuki · former Mist swordsman',
    personality: 'Calm, deadly, a man of few words.',
    speechStyle: 'Low and economical.',
    appearance: 'Bandaged lower face, heavy brows, the axe-sword Kubikiribōchō.',
    tags: ['canon', 'akatsuki', 'mist'],
  },
  // ── Hidden Leaf: the next generation ──────────────────────────────────────
  {
    name: 'Ino Yamanaka',
    aliases: ['Ino', 'Yamanaka Ino'],
    birthday: { month: 9, day: 23 },
    birthYear: 5,
    role: 'Yamanaka clan heir · Academy student',
    personality: 'Vain, bossy, sharp-eyed; loyal under the rivalry.',
    speechStyle: 'Bubbly, gossipy, quick to scold.',
    appearance: 'Long platinum-blonde ponytail, bangs over one eye, pale blue eyes, purple outfit.',
    tags: ['canon', 'leaf', 'yamanaka'],
  },
  {
    name: 'Choji Akimichi',
    aliases: ['Choji', 'Chōji', 'Chōji Akimichi', 'Akimichi Choji'],
    birthday: { month: 5, day: 1 },
    birthYear: 5,
    role: 'Akimichi clan heir · Academy student',
    personality: 'Gentle, loyal, sensitive; fierce for his friends.',
    speechStyle: 'Mild, often mid-snack; snaps at the word "fat".',
    appearance: 'Big-boned boy, swirl marks on his cheeks, spiky brown hair, a scarf, a bag of chips.',
    tags: ['canon', 'leaf', 'akimichi'],
  },
  {
    name: 'Shino Aburame',
    aliases: ['Shino', 'Aburame Shino'],
    birthday: { month: 1, day: 23 },
    birthYear: 5,
    role: 'Aburame clan · Academy student',
    personality: 'Quiet, logical, easily overlooked and hurt by it.',
    speechStyle: 'Formal and precise; explains himself at length.',
    appearance: 'High collar hiding his face, dark round glasses, a hood; insects live in his body.',
    tags: ['canon', 'leaf', 'aburame'],
  },
  {
    name: 'Tenten',
    aliases: ['TenTen'],
    birthday: { month: 3, day: 9 },
    birthYear: 4,
    role: 'Academy student · weapons specialist',
    personality: 'Upbeat, practical, idolizes Tsunade.',
    speechStyle: 'Friendly and straightforward.',
    appearance: 'Brown hair in two buns, brown eyes, pink sleeveless top, scrolls of weapons.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Sai',
    aliases: ['Sai of Root'],
    birthday: { month: 11, day: 25 },
    birthYear: 4,
    role: 'Root operative in training',
    personality: 'Emotionless by training; studies feelings from books.',
    speechStyle: 'Polite smile, blunt insults he thinks are kind.',
    appearance: 'Pale skin, short black hair, black eyes, an ink brush and scroll.',
    tags: ['canon', 'leaf', 'root'],
  },
  {
    name: 'Iruka Umino',
    aliases: ['Iruka', 'Iruka-sensei', 'Umino Iruka'],
    birthday: { month: 5, day: 26 },
    birthYear: -6,
    role: 'Leaf chunin · Academy teacher',
    personality: 'Warm, strict, orphaned by the Nine-Tails.',
    speechStyle: 'Kind, but loud when scolding.',
    appearance: 'Brown hair in a ponytail, a scar across the bridge of his nose, Leaf flak jacket.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Konohamaru Sarutobi',
    aliases: ['Konohamaru', 'Sarutobi Konohamaru'],
    birthday: { month: 12, day: 30 },
    birthYear: 9,
    role: 'Grandson of the Third Hokage',
    personality: 'Bratty, bold, desperate to be seen as himself.',
    speechStyle: 'Loud and bratty, ends sentences with "kore".',
    appearance: 'Small boy with spiky brown hair and a long blue scarf.',
    tags: ['canon', 'leaf', 'sarutobi'],
  },
  {
    name: 'Hanabi Hyuga',
    aliases: ['Hanabi', 'Hyuga Hanabi'],
    birthday: { month: 3, day: 27 },
    birthYear: 10,
    role: 'Hinata’s little sister',
    personality: 'Serious, proud, trained hard from early childhood.',
    speechStyle: 'Cool and blunt.',
    appearance: 'Long brown hair, pale Byakugan eyes, small and stern.',
    tags: ['canon', 'leaf', 'hyuga'],
  },
  {
    name: 'Hiashi Hyuga',
    aliases: ['Hiashi', 'Hyuga Hiashi', 'Lord Hiashi'],
    birthday: { month: 1, day: 8 },
    birthYear: -25,
    role: 'Head of the Hyuga clan',
    personality: 'Stern, proud; hides grief for his twin brother.',
    speechStyle: 'Cold and formal.',
    appearance: 'Long dark hair, pale Byakugan eyes, traditional robes.',
    tags: ['canon', 'leaf', 'hyuga'],
  },
  {
    name: 'Shikaku Nara',
    aliases: ['Shikaku', 'Nara Shikaku'],
    birthday: { month: 7, day: 15 },
    birthYear: -20,
    role: 'Leaf jonin commander · Nara clan head',
    personality: 'Lazy-looking genius strategist; dry and kind.',
    speechStyle: 'Drawling and unhurried, always three moves ahead.',
    appearance: 'Spiky ponytail, goatee, two scars on the right side of his face, flak jacket.',
    tags: ['canon', 'leaf', 'nara'],
  },
  {
    name: 'Inoichi Yamanaka',
    aliases: ['Inoichi', 'Yamanaka Inoichi'],
    birthday: { month: 1, day: 24 },
    birthYear: -21,
    role: 'Yamanaka clan head · intelligence division',
    personality: 'Calm, perceptive, a devoted father.',
    speechStyle: 'Measured and gentle.',
    appearance: 'Long blond hair in a ponytail, Leaf flak jacket.',
    tags: ['canon', 'leaf', 'yamanaka'],
  },
  {
    name: 'Choza Akimichi',
    aliases: ['Choza', 'Chōza', 'Chōza Akimichi', 'Akimichi Choza'],
    birthday: { month: 4, day: 22 },
    birthYear: -22,
    role: 'Akimichi clan head',
    personality: 'Big-hearted, jovial, fiercely protective.',
    speechStyle: 'Warm and booming.',
    appearance: 'Huge man with long spiky red hair, swirl marks on his cheeks, armored vest.',
    tags: ['canon', 'leaf', 'akimichi'],
  },
  {
    name: 'Tsume Inuzuka',
    aliases: ['Tsume', 'Inuzuka Tsume'],
    birthday: { month: 8, day: 12 },
    birthYear: -20,
    role: 'Inuzuka clan head · Hana and Kiba’s mother',
    personality: 'Wild, fierce, loud; loyal as a pack wolf.',
    speechStyle: 'Rough, loud, no patience for excuses.',
    appearance: 'Wild brown hair, red fang marks, slit pupils, her one-eyed ninken Kuromaru.',
    tags: ['canon', 'leaf', 'inuzuka'],
  },
  {
    name: 'Ibiki Morino',
    aliases: ['Ibiki', 'Morino Ibiki'],
    birthday: { month: 3, day: 20 },
    birthYear: -18,
    role: 'Head of Torture and Interrogation',
    personality: 'Cold, methodical, knows where every mind breaks.',
    speechStyle: 'Deep, slow, intimidating.',
    appearance: 'Huge scarred man, a bandana covering his scalp, black trench coat.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Genma Shiranui',
    aliases: ['Genma', 'Shiranui Genma'],
    birthday: { month: 7, day: 17 },
    birthYear: -12,
    role: 'Leaf special jonin',
    personality: 'Cool, laid-back, quietly capable.',
    speechStyle: 'Casual drawl around a senbon.',
    appearance: 'Brown hair, bandana headband, a senbon held between his teeth.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Gekko Hayate',
    aliases: ['Hayate', 'Hayate Gekko', 'Gekkō Hayate'],
    birthday: { month: 11, day: 2 },
    birthYear: -5,
    role: 'Leaf special jonin · swordsman',
    personality: 'Sickly, quiet, deadly with a blade.',
    speechStyle: 'Soft-spoken, broken by coughing.',
    appearance: 'Pale with dark-ringed eyes, short brown hair, bandana headband.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Kotetsu Hagane',
    aliases: ['Kotetsu', 'Hagane Kotetsu'],
    birthday: { month: 7, day: 21 },
    birthYear: -7,
    role: 'Leaf chunin · gate guard',
    personality: 'Easygoing, a little lazy, dependable.',
    speechStyle: 'Casual banter.',
    appearance: 'Spiky black hair, a bandage across his nose, Leaf flak jacket.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Izumo Kamizuki',
    aliases: ['Izumo', 'Kamizuki Izumo'],
    birthday: { month: 11, day: 25 },
    birthYear: -7,
    role: 'Leaf chunin · gate guard',
    personality: 'Calm, dutiful, Kotetsu’s steady partner.',
    speechStyle: 'Polite and level.',
    appearance: 'Brown hair falling over one eye, bandana headband, Leaf flak jacket.',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Homura Mitokado',
    aliases: ['Homura', 'Mitokado Homura'],
    birthday: { month: 5, day: 8 },
    birthYear: -51,
    role: 'Leaf elder · village council',
    personality: 'Rigid, cautious, values the village over people.',
    speechStyle: 'Stern and formal.',
    appearance: 'Old man with glasses and grey hair, council robes.',
    tags: ['canon', 'leaf', 'elder'],
  },
  {
    name: 'Koharu Utatane',
    aliases: ['Koharu', 'Utatane Koharu'],
    birthday: { month: 9, day: 1 },
    birthYear: -51,
    role: 'Leaf elder · village council',
    personality: 'Shrewd, conservative, quietly hard.',
    speechStyle: 'Clipped and reproving.',
    appearance: 'Elderly woman, grey hair in a bun held with pins, council robes.',
    tags: ['canon', 'leaf', 'elder'],
  },
  {
    name: 'Teuchi',
    aliases: ['Old Man Teuchi', 'Ichiraku Teuchi'],
    birthday: { month: 8, day: 10 },
    birthYear: -30,
    role: 'Owner of Ichiraku Ramen',
    personality: 'Kind, generous, proud of his broth.',
    speechStyle: 'Cheerful, old-fashioned.',
    appearance: 'Middle-aged man with narrow smiling eyes, white chef’s hat and apron.',
    tags: ['canon', 'leaf', 'civilian'],
  },
  {
    name: 'Ayame',
    aliases: ['Ichiraku Ayame'],
    birthday: { month: 2, day: 14 },
    birthYear: -2,
    role: 'Ichiraku Ramen · Teuchi’s daughter',
    personality: 'Sunny, kind, fond of her regulars.',
    speechStyle: 'Bright and welcoming.',
    appearance: 'Brown hair under a white bandana, an apron.',
    tags: ['canon', 'leaf', 'civilian'],
  },

  // ── Hidden Leaf: the fallen (dead before the story starts) ────────────────
  {
    name: 'Minato Namikaze',
    aliases: ['Minato', 'Fourth Hokage', 'Yellow Flash', 'Namikaze Minato'],
    birthday: { month: 1, day: 25 },
    birthYear: -19,
    role: 'Fourth Hokage · Naruto’s father',
    personality: 'Gentle genius, humble, unmatched in speed.',
    speechStyle: 'Kind, calm, quietly confident.',
    appearance: 'Spiky blond hair, blue eyes, white flame-trimmed haori over jonin gear.',
    status: 'Deceased',
    tags: ['canon', 'leaf', 'hokage'],
  },
  {
    name: 'Kushina Uzumaki',
    aliases: ['Kushina', 'Uzumaki Kushina', 'Red Hot-Blooded Habanero'],
    birthday: { month: 7, day: 10 },
    birthYear: -19,
    role: 'Naruto’s mother · Nine-Tails jinchuriki',
    personality: 'Fiery, loud, loving, fierce.',
    speechStyle: 'Excitable, ends sentences with "dattebane".',
    appearance: 'Very long red hair, grey-violet eyes, a simple dress.',
    status: 'Deceased',
    tags: ['canon', 'leaf', 'uzumaki', 'jinchuriki'],
  },
  {
    name: 'Fugaku Uchiha',
    aliases: ['Fugaku', 'Uchiha Fugaku'],
    birthday: { month: 8, day: 16 },
    birthYear: -27,
    role: 'Uchiha clan head · Itachi’s father',
    personality: 'Proud, stern, cornered into planning a coup.',
    speechStyle: 'Grave and terse.',
    appearance: 'Short dark hair, a lined stern face, dark robes with the Uchiha crest.',
    status: 'Deceased',
    tags: ['canon', 'leaf', 'uchiha'],
  },
  {
    name: 'Mikoto Uchiha',
    aliases: ['Mikoto', 'Uchiha Mikoto'],
    birthday: { month: 6, day: 1 },
    birthYear: -24,
    role: 'Itachi and Sasuke’s mother',
    personality: 'Kind, perceptive, steel beneath the warmth.',
    speechStyle: 'Soft and warm.',
    appearance: 'Long black hair, dark eyes, an apron over plain clothes.',
    status: 'Deceased',
    tags: ['canon', 'leaf', 'uchiha'],
  },
  {
    name: 'Hazuki Uchiha',
    aliases: ['Hazuki', 'Aunt Hazuki'],
    // Canon (Itachi Shinden) gives her no birthday; this one is the app's.
    birthday: { month: 2, day: 21 },
    birthdayInvented: true,
    birthYear: -27,
    role: 'Izumi’s mother · Kan’s aunt',
    personality: 'Warm, wry, quietly uneasy about the clan’s mood; married outside the clan and lived apart from it before the Nine-Tails night.',
    speechStyle: 'Gentle and teasing, plain-spoken.',
    appearance: 'A slight woman with Izumi’s soft dark hair worn loose, tired kind eyes, plain house clothes.',
    status: 'Deceased',
    tags: ['canon', 'leaf', 'uchiha', 'family'],
  },
  {
    name: 'Rin Nohara',
    aliases: ['Rin', 'Nohara Rin'],
    birthday: { month: 11, day: 15 },
    birthYear: -9,
    role: 'Medic of Team Minato',
    personality: 'Caring, brave; died protecting the village.',
    speechStyle: 'Gentle and encouraging.',
    appearance: 'Short brown hair, purple marks on her cheeks.',
    status: 'Deceased',
    tags: ['canon', 'leaf'],
  },
  {
    name: 'Hashirama Senju',
    aliases: ['Hashirama', 'First Hokage', 'Senju Hashirama'],
    birthday: { month: 10, day: 23 },
    birthYear: -76,
    role: 'First Hokage · founder of the Leaf',
    personality: 'Generous, cheerful, terrifying when serious.',
    speechStyle: 'Big laugh; sulks when scolded.',
    appearance: 'Long straight black hair, red armor, a warm broad smile.',
    status: 'Deceased',
    tags: ['canon', 'leaf', 'hokage', 'senju'],
  },
  {
    name: 'Tobirama Senju',
    aliases: ['Tobirama', 'Second Hokage', 'Senju Tobirama'],
    birthday: { month: 2, day: 19 },
    birthYear: -73,
    role: 'Second Hokage',
    personality: 'Pragmatic, cold, a brilliant inventor of jutsu.',
    speechStyle: 'Blunt and lecturing.',
    appearance: 'Spiky white hair, red eyes, red face markings, blue armor with a fur collar.',
    status: 'Deceased',
    tags: ['canon', 'leaf', 'hokage', 'senju'],
  },
  {
    name: 'Dan Katō',
    aliases: ['Dan Kato'],
    birthday: { month: 12, day: 4 },
    birthYear: -33,
    role: 'Tsunade’s late love',
    personality: 'Idealistic and gentle; dreamed of being Hokage.',
    speechStyle: 'Soft and earnest.',
    appearance: 'Long pale-blue hair, Leaf jonin gear.',
    status: 'Deceased',
    tags: ['canon', 'leaf'],
  },

  // ── Hidden Sand ───────────────────────────────────────────────────────────
  {
    name: 'Temari',
    aliases: ['Temari of the Sand'],
    birthday: { month: 8, day: 23 },
    birthYear: 2,
    role: 'Sand kunoichi · Gaara’s sister',
    personality: 'Tough, sharp, protective of her brothers.',
    speechStyle: 'Bossy and direct.',
    appearance: 'Sandy-blonde hair in four short ponytails, teal eyes, a giant war fan.',
    tags: ['canon', 'sand'],
  },
  {
    name: 'Kankuro',
    aliases: ['Kankurō', 'Kankuro of the Sand'],
    birthday: { month: 5, day: 15 },
    birthYear: 3,
    role: 'Sand puppeteer · Gaara’s brother',
    personality: 'Cocky and abrasive; protective deep down.',
    speechStyle: 'Snarky, quick to taunt.',
    appearance: 'Black hooded suit with cat-ear points, purple face paint, a wrapped puppet.',
    tags: ['canon', 'sand'],
  },
  {
    name: 'Chiyo',
    aliases: ['Lady Chiyo', 'Granny Chiyo'],
    birthday: { month: 10, day: 15 },
    birthYear: -52,
    role: 'Sand elder · retired puppet master',
    personality: 'Bitter, cunning, guilty over her grandson Sasori.',
    speechStyle: 'Crotchety and sarcastic.',
    appearance: 'Tiny elderly woman, grey hair in a bun, long earrings.',
    tags: ['canon', 'sand'],
  },
  {
    name: 'Rasa',
    aliases: ['Fourth Kazekage'],
    birthday: { month: 3, day: 29 },
    birthYear: -25,
    role: 'Fourth Kazekage · Gaara’s father',
    personality: 'Cold, calculating, sees Gaara as a weapon.',
    speechStyle: 'Commanding and distant.',
    appearance: 'Short auburn hair, a stern face, Kazekage robes.',
    tags: ['canon', 'sand', 'kage'],
  },
  {
    name: 'Baki',
    aliases: ['Baki of the Sand'],
    birthday: { month: 7, day: 4 },
    birthYear: -15,
    role: 'Sand jonin · sensei to Gaara’s siblings',
    personality: 'Disciplined, ruthless, loyal to his village.',
    speechStyle: 'Curt and military.',
    appearance: 'A veil covering half his face, red face markings, Sand flak vest.',
    tags: ['canon', 'sand'],
  },

  // ── Hidden Mist ───────────────────────────────────────────────────────────
  {
    name: 'Zabuza Momochi',
    aliases: ['Zabuza', 'Momochi Zabuza', 'Demon of the Hidden Mist'],
    birthday: { month: 8, day: 15 },
    birthYear: -9,
    role: 'Mist swordsman · one of the Seven Swordsmen',
    personality: 'Brutal and cold; secretly bound to Haku.',
    speechStyle: 'Menacing and gravelly.',
    appearance: 'Bandages over his mouth, no eyebrows, a huge cleaver-like sword on his back.',
    tags: ['canon', 'mist'],
  },
  {
    name: 'Haku',
    aliases: ['Haku Yuki', 'Haku Yūki'],
    birthday: { month: 1, day: 9 },
    birthYear: 2,
    role: 'Ice Release orphan · Zabuza’s companion',
    personality: 'Gentle, selfless; lives only to serve Zabuza.',
    speechStyle: 'Soft, polite, sorrowful.',
    appearance: 'Long black hair, delicate features often taken for a girl’s, a hunter-nin mask.',
    tags: ['canon', 'mist'],
  },
  {
    name: 'Yagura',
    aliases: ['Yagura Karatachi', 'Fourth Mizukage'],
    birthday: { month: 4, day: 3 },
    birthYear: -10,
    role: 'Fourth Mizukage · Three-Tails jinchuriki',
    personality: 'Cold and merciless; secretly held by genjutsu.',
    speechStyle: 'Flat and detached.',
    appearance: 'Looks like a child; grey hair, pink eyes, a scar by his eye, a hooked staff.',
    tags: ['canon', 'mist', 'kage', 'jinchuriki'],
  },
  {
    name: 'Mei Terumi',
    aliases: ['Mei', 'Mei Terumī', 'Fifth Mizukage'],
    birthday: { month: 5, day: 21 },
    birthYear: -10,
    role: 'Mist kunoichi · leader of the rebels',
    personality: 'Charming, ruthless, touchy about being unmarried.',
    speechStyle: 'Sweet and teasing; deadly calm.',
    appearance: 'Long auburn hair over one eye, green eyes, a blue dress.',
    tags: ['canon', 'mist'],
  },
  {
    name: 'Ao',
    aliases: ['Ao of the Mist'],
    birthday: { month: 8, day: 1 },
    birthYear: -21,
    role: 'Mist sensor · Byakugan thief',
    personality: 'Stern veteran, suspicious, old-fashioned.',
    speechStyle: 'Gruff and lecturing.',
    appearance: 'Spiky blue hair, an eyepatch over a stolen Byakugan, an earpiece.',
    tags: ['canon', 'mist'],
  },
  {
    name: 'Chojuro',
    aliases: ['Chōjūrō'],
    birthday: { month: 11, day: 1 },
    birthYear: 3,
    role: 'Mist student · swordsman in training',
    personality: 'Timid, polite, braver than he thinks.',
    speechStyle: 'Hesitant and apologetic.',
    appearance: 'Light-blue hair, glasses, sharp teeth, the twin-hilted sword Hiramekarei.',
    tags: ['canon', 'mist'],
  },
  {
    name: 'Utakata',
    aliases: ['Utakata of the Mist'],
    birthday: { month: 6, day: 16 },
    birthYear: 0,
    role: 'Mist · Six-Tails jinchuriki',
    personality: 'Aloof, melancholy, distrusts teachers.',
    speechStyle: 'Quiet and indifferent.',
    appearance: 'Dark hair over one eye, an open kimono, a pipe that blows bubbles.',
    tags: ['canon', 'mist', 'jinchuriki'],
  },

  // ── Hidden Cloud ──────────────────────────────────────────────────────────
  {
    // A single-letter name is never matched in story text, so the titles
    // carry him.
    name: 'A',
    aliases: ['Fourth Raikage', 'Raikage A', 'Lord Raikage'],
    birthday: { month: 6, day: 1 },
    birthYear: -27,
    role: 'Fourth Raikage · Killer Bee’s brother',
    personality: 'Hot-tempered, proud, loves his brother fiercely.',
    speechStyle: 'Shouting, blunt, impatient.',
    appearance: 'Huge dark-skinned man, white slicked-back hair, a mustache, gold bracers.',
    tags: ['canon', 'cloud', 'kage'],
  },
  {
    name: 'Darui',
    aliases: ['Darui of the Cloud'],
    birthday: { month: 1, day: 6 },
    birthYear: -8,
    role: 'Cloud jonin · the Raikage’s right hand',
    personality: 'Laid-back, loyal, lethal with Storm Release.',
    speechStyle: 'Lazy drawl; finds everything "so dull".',
    appearance: 'Dark skin, white hair over one eye, a cleaver sword on his back.',
    tags: ['canon', 'cloud'],
  },
  {
    name: 'Yugito Nii',
    aliases: ['Yugito', 'Nii Yugito'],
    birthday: { month: 7, day: 24 },
    birthYear: -5,
    role: 'Cloud · Two-Tails jinchuriki',
    personality: 'Composed, proud, deadly serious about duty.',
    speechStyle: 'Calm and formal.',
    appearance: 'Long blonde braid, dark eyes, purple outfit, cat-like grace.',
    tags: ['canon', 'cloud', 'jinchuriki'],
  },
  {
    name: 'Omoi',
    aliases: ['Omoi of the Cloud'],
    birthday: { month: 12, day: 26 },
    birthYear: 6,
    role: 'Cloud student · swordsman',
    personality: 'Anxious overthinker who spirals into worst cases.',
    speechStyle: 'Rambling worry around a lollipop.',
    appearance: 'Dark skin, short white hair, a lollipop, a long sword.',
    tags: ['canon', 'cloud'],
  },
  {
    name: 'Karui',
    aliases: ['Karui of the Cloud'],
    birthday: { month: 2, day: 14 },
    birthYear: 6,
    role: 'Cloud student · kunoichi',
    personality: 'Hot-headed, blunt, quick to punch.',
    speechStyle: 'Loud and aggressive.',
    appearance: 'Dark skin, short red hair, a katana at her side.',
    tags: ['canon', 'cloud'],
  },
  {
    name: 'Samui',
    aliases: ['Samui of the Cloud'],
    birthday: { month: 1, day: 7 },
    birthYear: 3,
    role: 'Cloud kunoichi',
    personality: 'Cool, sensible, unimpressed by everything.',
    speechStyle: 'Short and flat.',
    appearance: 'Short blonde hair, blue eyes, a short sword on her back.',
    tags: ['canon', 'cloud'],
  },

  // ── Hidden Stone ──────────────────────────────────────────────────────────
  {
    name: 'Onoki',
    aliases: ['Ōnoki', 'Third Tsuchikage', 'Lord Tsuchikage'],
    birthday: { month: 10, day: 8 },
    birthYear: -56,
    role: 'Third Tsuchikage',
    personality: 'Stubborn, cynical, cranky about his back.',
    speechStyle: 'Grumpy, mutters complaints.',
    appearance: 'Tiny old man with a big red nose, a white topknot and bushy beard.',
    tags: ['canon', 'stone', 'kage'],
  },
  {
    name: 'Kurotsuchi',
    aliases: ['Kurotsuchi of the Stone'],
    birthday: { month: 9, day: 6 },
    birthYear: 3,
    role: 'Stone kunoichi · Ōnoki’s granddaughter',
    personality: 'Bold, sarcastic, loyal to her grandfather.',
    speechStyle: 'Teasing and frank.',
    appearance: 'Short black hair, pink eyes, red armored vest.',
    tags: ['canon', 'stone'],
  },
  {
    name: 'Roshi',
    aliases: ['Rōshi', 'Rōshi of the Stone'],
    birthday: { month: 6, day: 4 },
    birthYear: -39,
    role: 'Stone · Four-Tails jinchuriki',
    personality: 'Grizzled loner who left his village behind.',
    speechStyle: 'Gruff and weary.',
    appearance: 'Red hair and a long red beard, a helmet-like hat, armor.',
    tags: ['canon', 'stone', 'jinchuriki'],
  },
  {
    name: 'Han',
    aliases: ['Han of the Stone'],
    birthday: { month: 5, day: 10 },
    birthYear: -19,
    role: 'Stone · Five-Tails jinchuriki',
    personality: 'Silent and steady; kind to those who earn it.',
    speechStyle: 'Few words, muffled by his mask.',
    appearance: 'Huge man in red armor and a kasa hat, a steam boiler on his back.',
    tags: ['canon', 'stone', 'jinchuriki'],
  },

  // ── Other lands ───────────────────────────────────────────────────────────
  {
    name: 'Fū',
    aliases: ['Fu', 'Fū of the Waterfall'],
    birthday: { month: 8, day: 8 },
    birthYear: 5,
    role: 'Waterfall · Seven-Tails jinchuriki',
    personality: 'Cheerful and lonely; wants a hundred friends.',
    speechStyle: 'Bubbly and earnest.',
    appearance: 'Short mint-green hair, orange eyes, an orange hair clip; insect wings in battle.',
    tags: ['canon', 'waterfall', 'jinchuriki'],
  },
  {
    name: 'Hanzō',
    aliases: ['Hanzo', 'Hanzo the Salamander', 'Hanzō the Salamander'],
    birthday: { month: 2, day: 12 },
    birthYear: -45,
    role: 'Leader of the Hidden Rain',
    personality: 'Paranoid tyrant, once a legend.',
    speechStyle: 'Cold and suspicious.',
    appearance: 'A respirator mask over his face, spiky dark hair, a kusarigama.',
    tags: ['canon', 'rain'],
  },
  {
    name: 'Yahiko',
    aliases: ['Yahiko of the Rain'],
    birthday: { month: 2, day: 20 },
    birthYear: -15,
    role: 'Founder of the Akatsuki',
    personality: 'Bright idealist who dreamed of peace.',
    speechStyle: 'Confident and warm.',
    appearance: 'Spiky orange hair, a cheerful grin.',
    status: 'Deceased',
    tags: ['canon', 'rain', 'akatsuki'],
  },
  {
    name: 'Chiriku',
    aliases: ['Monk Chiriku', 'Chiriku of the Fire Temple'],
    birthday: { month: 9, day: 30 },
    birthdayInvented: true,
    birthYear: -16,
    role: 'Head monk of the Fire Temple · former Guardian Ninja',
    personality: 'Serene, disciplined, compassionate.',
    speechStyle: 'Calm and prayerful.',
    appearance: 'Bald monk with a beard and temple robes, prayer beads in hand.',
    tags: ['canon', 'fire-temple'],
  },
  {
    name: 'Mifune',
    aliases: ['General Mifune'],
    birthday: { month: 4, day: 1 },
    birthYear: -39,
    role: 'General of the Land of Iron samurai',
    personality: 'Honorable, neutral, wise.',
    speechStyle: 'Formal and measured.',
    appearance: 'Old samurai with a long grey beard and topknot, armor, a katana.',
    tags: ['canon', 'iron', 'samurai'],
  },
  {
    // A toad: his age is not counted in human years.
    name: 'Fukasaku',
    aliases: ['Lord Fukasaku', 'Great Toad Sage Fukasaku'],
    birthday: { month: 5, day: 9 },
    role: 'Toad sage of Mount Myōboku',
    personality: 'Wise, cranky, endlessly patient teacher.',
    speechStyle: 'Croaky old-man scolding.',
    appearance: 'Small grey-green toad with a white beard, a cape, a walking stick.',
    tags: ['canon', 'toad'],
  },

  // ── Orochimaru’s people ───────────────────────────────────────────────────
  {
    name: 'Kimimaro',
    aliases: ['Kimimaro Kaguya', 'Kaguya Kimimaro'],
    birthday: { month: 6, day: 15 },
    birthYear: 2,
    role: 'Orochimaru’s devoted servant · Kaguya clan',
    personality: 'Serene; loyal to Orochimaru unto death.',
    speechStyle: 'Quiet, courteous, absolute.',
    appearance: 'Pale, long white hair, two red dots on his brow, blades of bone from his body.',
    tags: ['canon', 'sound'],
  },
  {
    name: 'Jugo',
    aliases: ['Jūgo'],
    birthday: { month: 10, day: 1 },
    birthYear: 3,
    role: 'Source of the curse mark · Orochimaru’s prisoner',
    personality: 'Gentle; terrified of his own killing urges.',
    speechStyle: 'Soft-spoken and calm.',
    appearance: 'Tall, spiky orange hair, kind eyes; birds gather around him.',
    tags: ['canon', 'sound', 'rogue'],
  },
  {
    name: 'Tayuya',
    aliases: ['Tayuya of the Sound'],
    birthday: { month: 2, day: 15 },
    birthYear: 3,
    role: 'Sound Four · Orochimaru’s guard',
    personality: 'Foul-mouthed, vicious, proud.',
    speechStyle: 'Crude insults, curses constantly.',
    appearance: 'Long red hair under a dark cap, a flute for genjutsu.',
    tags: ['canon', 'sound'],
  },
  {
    name: 'Sakon',
    aliases: ['Sakon of the Sound'],
    birthday: { month: 6, day: 20 },
    birthYear: 3,
    role: 'Sound Four leader · Ukon’s twin',
    personality: 'Arrogant, sadistic, cool under pressure.',
    speechStyle: 'Smug and mocking.',
    appearance: 'Grey hair over one eye, dark lipstick; his twin hides inside his body.',
    tags: ['canon', 'sound'],
  },
  {
    name: 'Ukon',
    aliases: ['Ukon of the Sound'],
    birthday: { month: 6, day: 20 },
    birthYear: 3,
    role: 'Sound Four · Sakon’s twin',
    personality: 'A cruder, crueler echo of his brother.',
    speechStyle: 'Snide and lazy.',
    appearance: 'Identical to Sakon; sleeps inside his brother’s body.',
    tags: ['canon', 'sound'],
  },
  {
    name: 'Jirobo',
    aliases: ['Jirōbō'],
    birthday: { month: 6, day: 26 },
    birthYear: 3,
    role: 'Sound Four · Orochimaru’s guard',
    personality: 'Polite on the surface, gluttonous, resentful.',
    speechStyle: 'Mannered, then crude when angered.',
    appearance: 'Huge round boy with an orange mohawk, a thick rope belt.',
    tags: ['canon', 'sound'],
  },
  {
    name: 'Kidomaru',
    aliases: ['Kidōmaru'],
    birthday: { month: 12, day: 16 },
    birthYear: 3,
    role: 'Sound Four · Orochimaru’s guard',
    personality: 'Treats every fight like a game.',
    speechStyle: 'Playful and taunting.',
    appearance: 'Six arms, tan skin, black hair in a ponytail; a third eye in battle.',
    tags: ['canon', 'sound'],
  },
];

export const CANON_CAST: CastEntry[] = [...BASE_CAST, ...CAST_ADDITIONS];

function lower(value: string) {
  return value.trim().toLowerCase();
}

function namesOf(entity: { name: string; aliases: string[] }) {
  return [entity.name, ...entity.aliases].map(lower);
}

/** The women of the canon cast; everyone else in it is a man. */
export const FEMALE_CAST = new Set([
  'Sakura Haruno', 'Tsunade Senju', 'Konan', 'Hinata Hyuga', 'Anko Mitarashi', 'Kurenai Yuhi',
  'Shizune', 'Karin', 'Ino Yamanaka', 'Tenten', 'Hanabi Hyuga', 'Tsume Inuzuka', 'Koharu Utatane',
  'Ayame', 'Kushina Uzumaki', 'Mikoto Uchiha', 'Hazuki Uchiha', 'Rin Nohara', 'Temari', 'Chiyo', 'Mei Terumi',
  'Yugito Nii', 'Karui', 'Samui', 'Kurotsuchi', 'Fū', 'Tayuya',
  'Kaguya Ōtsutsuki', 'Sarada Uchiha', 'Himawari Uzumaki', 'Chōchō Akimichi', 'Mirai Sarutobi',
  'Ameyuri Ringo', 'Mito Uzumaki', 'Moegi Kazamatsuri', 'Yūgao Uzuki', 'Mebuki Haruno', 'Pakura',
  'Mabui', 'Kin Tsuchi', 'Katsuyu', 'Shima',
]);

/**
 * Birthdays older saves carry that were wrong: a person still on the old
 * date is moved to the right one (see section 6 of the living-world notes).
 */
const BIRTHDAY_FIXES: Record<string, { from: { month: number; day: number }; to: { month: number; day: number } }> = {
  'Hana Inuzuka': { from: { month: 4, day: 12 }, to: { month: 4, day: 13 } },
  Suzume: { from: { month: 11, day: 3 }, to: { month: 10, day: 19 } },
  'Danzo Shimura': { from: { month: 1, day: 3 }, to: { month: 1, day: 6 } },
  'Anko Mitarashi': { from: { month: 10, day: 27 }, to: { month: 10, day: 24 } },
  Kimimaro: { from: { month: 6, day: 2 }, to: { month: 6, day: 15 } },
  'Killer Bee': { from: { month: 6, day: 23 }, to: { month: 5, day: 15 } },
};

/** Birthdays the app chose because canon gives none (the seed's people included). */
const INVENTED_BIRTHDAYS = new Set(['Izumi Uchiha']);

function fixBirthday(entity: EntityRecord): EntityRecord {
  const fix = BIRTHDAY_FIXES[entity.name];

  if (fix && entity.birthday && entity.birthday.month === fix.from.month && entity.birthday.day === fix.from.day) {
    return { ...entity, birthday: { ...fix.to } };
  }

  return entity;
}

/** The cast members a milestone brings into the story (births, revivals, returns). */
export function castAppearingWith(milestoneId: string): CastEntry[] {
  return CANON_CAST.filter((entry) => entry.appearsWith === milestoneId);
}

/** Whether this cast member is in the story yet (see `appearsWith`). */
export function castMemberPresent(entry: CastEntry, completed: ReadonlySet<string>) {
  return !entry.appearsWith || completed.has(entry.appearsWith);
}

/** Cast entries become entities. Existing saves get the people they lack. */
export function castEntity(entry: CastEntry, id: string): EntityRecord {
  const lore = loreProfileFor(entry.name);
  const gender: Gender = entry.gender ?? (FEMALE_CAST.has(entry.name) ? 'female' : 'male');
  // Someone who arrives with a milestone (a birth, Kaguya's return) enters
  // the save alive and not yet met; the revived dead stay dead.
  const status = entry.appearsWith && entry.status !== 'Deceased' ? undefined : entry.status;

  return {
    id,
    name: entry.name,
    type: 'character',
    aliases: [...entry.aliases],
    ...(IDENTITIES[entry.name] ? { identities: IDENTITIES[entry.name].map((identity) => ({ ...identity, knownBy: identity.knownBy?.map((knower) => ({ ...knower, who: [...knower.who] })) })) } : {}),
    // What Kan knows of their name at the start (names.ts): most canon people only by sight.
    ...(castKnowledge(entry.name) ? { known: castKnowledge(entry.name) } : {}),
    ...(entry.birthday ? { birthday: { ...entry.birthday } } : {}),
    ...(entry.birthdayInvented ? { birthdayInvented: true } : {}),
    ...(entry.birthYear !== undefined ? { birthYear: entry.birthYear } : {}),
    role: entry.role,
    personality: entry.personality,
    speechStyle: entry.speechStyle,
    status: status ?? 'Not yet met',
    ...(status === 'Deceased' ? { deceased: { known: true } } : {}),
    notes: '',
    mood: 'Unknown',
    appearance: entry.appearance,
    gender,
    // The genderless (tailed beasts) are never romance options.
    romanceAccessibility:
      gender === 'unknown'
        ? 'not-applicable'
        : romanceFor(gender, { lore: lore?.romanceAccessibility ?? 'winnable' }),
    canonDevotion: lore?.canonDevotion,
    orientation: lore?.orientation,
    met: false,
    tags: [...entry.tags],
  };
}

/**
 * Adds missing canon cast members to a save. A cast member who already exists
 * under any of their names gets the missing names added as aliases, so the
 * state tracker can find them however the story calls them, and a birthday
 * or birth year they lack (or a birthday older saves had wrong). Never
 * touches anyone's story details, and never adds someone the save already
 * has. People who enter the story with a milestone (`appearsWith`) are only
 * added once that milestone is in `completed`.
 */
export function ensureCanonCast(
  entities: EntityRecord[],
  makeEntityId: () => string,
  completed: Iterable<string> = []
): EntityRecord[] {
  const done = new Set(completed);
  const next = entities.map((entity) => {
    const fixed = entity.type === 'character' ? fixBirthday(entity) : entity;

    return INVENTED_BIRTHDAYS.has(fixed.name) && fixed.birthday && !fixed.birthdayInvented
      ? { ...fixed, birthdayInvented: true }
      : fixed;
  });

  for (const entry of CANON_CAST) {
    const entryNames = namesOf(entry);
    const index = next.findIndex(
      (entity) =>
        entity.type === 'character' &&
        namesOf(entity).some((name) => entryNames.includes(name))
    );

    if (index === -1) {
      if (castMemberPresent(entry, done)) {
        next.push(castEntity(entry, makeEntityId()));
      }
      continue;
    }

    const existing = next[index];
    const known = new Set(namesOf(existing));
    const missing = [entry.name, ...entry.aliases].filter((name) => !known.has(lower(name)));
    const needsBirthday = !existing.birthday && entry.birthday;
    const needsYear = existing.birthYear === undefined && entry.birthYear !== undefined;

    if (missing.length > 0 || needsBirthday || needsYear) {
      next[index] = {
        ...existing,
        aliases: missing.length > 0 ? [...existing.aliases, ...missing].slice(0, 10) : existing.aliases,
        birthday: existing.birthday ?? (entry.birthday ? { ...entry.birthday } : undefined),
        ...(needsBirthday && entry.birthdayInvented ? { birthdayInvented: true } : {}),
        birthYear: existing.birthYear ?? entry.birthYear,
      };
    }

  }

  return next;
}
