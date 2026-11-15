// Living-world Stage 2 (Nov 2026): more of the timeline. Pure data, merged
// into CANON_MILESTONES in canonData.ts (sorted by opening date there).
//
// - World events the timeline was missing: Kimimaro's illness, Root's last
//   test for Sai, Orochimaru's stopgap body, Jiraiya's reports, two deaths
//   the cast needs (Dosu, Raiga), Hashirama's history lesson in the war, the
//   post-war Hiden stories, and the births of the children the cast adds.
// - Personal beats for the long gaps, the Karin arc, Kan's failing eyes in
//   stages, the canon threads (the Naka Shrine tablet, Shisui's other eye,
//   the Uzumaki masks and Uzushio, the Seven Swordsmen's blades), and quiet
//   peacetime beats up to the Seventh Hokage.
//
// Checked against what the timeline already had: Zabuza and Haku against
// Kakashi are in "The dead march", Sasuke leaving on his journey is in
// "Sasuke's pardon", and Kan's own trial is "The reckoning".

import type { CanonMilestone } from './canonData';

export const STAGE_TWO_WORLD: CanonMilestone[] = [
  // --- The shadow war -------------------------------------------------------------
  {
    id: 'sai-root-test',
    era: 'The shadow war',
    title: "Root's last test",
    description:
      "Deep under the Leaf, Root sets its final exam: two boys raised as brothers must fight to the death. Shin dies of illness before the fight, and Sai comes out of it with no feelings he will admit to and a seal on his tongue.",
    from: { year: 15, month: 4 },
    to: { year: 16, month: 4 },
    region: 'Hidden Leaf',
    location: "Root's headquarters beneath the Hidden Leaf",
    knowledge: 'secret',
    bearers: ['Danzo Shimura', 'Sai', 'Torune Aburame', 'Fū Yamanaka'],
    facts: ["Sai finished Root's training after his brother Shin died of illness; Danzo sealed Sai's tongue so he can never speak of Root."],
  },
  {
    id: 'kimimaro-illness',
    era: 'The shadow war',
    title: "The vessel that broke",
    description:
      "Kimimaro, the last of the Kaguya clan and the body Orochimaru meant to take, falls ill with a disease no medicine reaches. Orochimaru turns his eyes to the Leaf, and to the last Uchiha child there.",
    from: { year: 16, month: 9 },
    to: { year: 17, month: 6 },
    region: 'Land of Rice Fields',
    location: "Orochimaru's hideouts in the Land of Rice Fields",
    knowledge: 'secret',
    bearers: ['Orochimaru', 'Kabuto Yakushi', 'Kimimaro'],
    facts: ['Kimimaro is dying of an incurable illness; Orochimaru can no longer use him as his next body.'],
  },

  // --- Part 1 -----------------------------------------------------------------------
  {
    id: 'dosu-falls',
    era: 'Part 1',
    title: 'The Sound genin who knew too much',
    description:
      'Before the final round of the exams, Dosu Kinuta goes looking for Sasuke to kill him and finds Gaara instead. Nobody finds much of him.',
    from: { year: 18, month: 7, day: 30 },
    to: { year: 18, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf hospital',
    knowledge: 'secret',
    bearers: ['Kabuto Yakushi', 'Gaara', 'Orochimaru'],
    deaths: ['Dosu Kinuta'],
    facts: ['Dosu Kinuta was killed by Gaara before the final round of the Chunin Exams.'],
  },
  {
    id: 'orochimaru-stopgap',
    era: 'The hidden years',
    title: 'A borrowed body',
    description:
      "Sasuke reached Orochimaru too late for the transfer. Rather than die waiting, Orochimaru takes a stopgap body, a prisoner named Gen'yūmaru, and settles in to wait three years for the Sharingan.",
    from: { year: 18, month: 11, day: 10 },
    to: { year: 19, month: 5, day: 8 },
    region: 'Land of Rice Fields',
    location: "Orochimaru's hideout",
    knowledge: 'secret',
    bearers: ['Kabuto Yakushi', 'Orochimaru', 'Sasuke Uchiha'],
    facts: ["Orochimaru took a temporary body, Gen'yūmaru, while he waits to take Sasuke's."],
  },
  {
    id: 'raiga-falls',
    era: 'The hidden years',
    title: 'The Thunder of the Mist is buried',
    description:
      'Raiga Kurosuki, the former Swordsman who ruled a mining town by burying people alive, dies when Leaf genin come to free the town. The twin swords Kiba are left without a hand.',
    from: { year: 19, month: 2, day: 3 },
    to: { year: 19, month: 8, day: 9 },
    region: 'Land of Fire',
    location: 'a mining town in the Land of Fire',
    knowledge: 'public',
    deaths: ['Raiga Kurosuki'],
    facts: ['Raiga Kurosuki, the Thunder of the Mist, died in a mining town in the Land of Fire.'],
  },
  {
    id: 'jiraiya-reports',
    era: 'The hidden years',
    title: "Jiraiya's reports",
    description:
      "Jiraiya's spy network starts sending what it has on the Akatsuki to the Fifth Hokage: they move in pairs, wear black cloaks with red clouds, and are hunting the jinchūriki. Leaf jōnin are briefed.",
    from: { year: 19, month: 4, day: 7 },
    to: { year: 20, month: 3, day: 17 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ["Jiraiya's spies told the Fifth Hokage that the Akatsuki work in pairs and are hunting the jinchūriki."],
  },

  // --- The Fourth War -----------------------------------------------------------
  {
    id: 'hashirama-history',
    era: 'The Fourth War',
    title: "Hashirama's story",
    description:
      'Revived beside his brother, Hashirama Senju tells Sasuke the true history of the Senju and the Uchiha, of Madara, and of what the village was meant to be. Sasuke decides to protect the Leaf.',
    from: { year: 22, month: 10, day: 9 },
    to: { year: 22, month: 10, day: 9 },
    region: 'Hidden Leaf',
    location: 'the Naka Shrine in the ruins of the Hidden Leaf',
    knowledge: 'secret',
    bearers: ['Sasuke Uchiha', 'Orochimaru', 'Jugo', 'Suigetsu Hozuki', 'Karin'],
    facts: ['Hashirama Senju told Sasuke the history of the Senju and the Uchiha; Sasuke chose to fight for the Leaf.'],
  },

  // --- After ------------------------------------------------------------------------
  {
    id: 'kakashi-first-crisis',
    era: 'After',
    title: "The Sixth Hokage's first crisis",
    description:
      'Before he has settled into the chair, Kakashi Hatake faces his first crisis as Hokage: a hijacked airship over the snow and a plot against the Leaf. He ends it himself, without the Sharingan he gave up in the war.',
    from: { year: 24, month: 4 },
    to: { year: 24, month: 9 },
    region: 'Land of Fire',
    location: 'the skies over the northern Land of Fire',
    knowledge: 'village',
    facts: ["Kakashi Hatake stopped a hijacked airship in his first crisis as Hokage."],
  },
  {
    id: 'shikamaru-silence',
    era: 'After',
    title: 'The Land of Silence',
    description:
      'Shikamaru Nara leads a secret mission into the Land of Silence against Gengo, a man whose words bend the will of whole villages. He is captured and nearly broken; Temari comes for him.',
    from: { year: 24, month: 9 },
    to: { year: 24, month: 12 },
    region: 'Land of Silence',
    location: 'the Land of Silence',
    knowledge: 'village',
    facts: ['Shikamaru Nara defeated Gengo in the Land of Silence; Temari came to his rescue.'],
  },
  {
    id: 'sakura-sasuke-leave',
    era: 'After',
    title: 'Sakura leaves with Sasuke',
    description:
      "An attack on Sakura's new clinic brings Sasuke home long enough to stand beside her. Not long after, Sakura leaves the village to travel at his side.",
    from: { year: 25, month: 6 },
    to: { year: 25, month: 12 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Sakura Haruno left the Hidden Leaf to travel with Sasuke Uchiha.'],
  },
  {
    id: 'gaara-marriage-talks',
    era: 'After',
    title: "The Kazekage's marriage talks",
    description:
      "The Sand's council decides the Kazekage needs a wife, and the whole village has opinions. Gaara sends Shikamaru to help him find a bride; it ends with Shikamaru and Temari engaged, and Gaara still alone.",
    from: { year: 25, month: 9 },
    to: { year: 26, month: 2 },
    region: 'Hidden Sand',
    location: 'the Hidden Sand Village',
    knowledge: 'public',
    facts: ['Shikamaru Nara and Temari are engaged.'],
  },

  // --- Births ---------------------------------------------------------------------
  {
    id: 'mirai-born',
    era: 'The sky falls',
    title: "Asuma's daughter",
    description:
      'As spring turns to summer in the Leaf, Kurenai Yuhi gives birth to a daughter, Mirai. Shikamaru stands at the door like a man on guard duty.',
    from: { year: 22, month: 5, day: 12 },
    to: { year: 22, month: 8 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Mirai Sarutobi, daughter of Kurenai Yuhi and the late Asuma Sarutobi, was born.'],
  },
  {
    id: 'chocho-born',
    era: 'After',
    title: "Chōji's daughter",
    description: 'Chōji Akimichi and Karui have a daughter, Chōchō, as loud as both of them together.',
    from: { year: 26, month: 8, day: 8 },
    to: { year: 27, month: 2 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Chōchō Akimichi, daughter of Chōji Akimichi and Karui, was born.'],
  },
  {
    id: 'shikadai-born',
    era: 'After',
    title: "Shikamaru's son",
    description: 'Temari gives birth to a son, Shikadai Nara. Shikamaru says it is a drag and does not stop smiling.',
    from: { year: 26, month: 9, day: 23 },
    to: { year: 27, month: 3 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Shikadai Nara, son of Shikamaru Nara and Temari, was born.'],
  },
  {
    id: 'metal-lee-born',
    era: 'After',
    title: "Lee's son",
    description: "Rock Lee has a son, Metal. Might Guy weeps openly at the news.",
    from: { year: 26, month: 10, day: 4 },
    to: { year: 27, month: 4 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Metal Lee, son of Rock Lee, was born.'],
  },
  {
    id: 'inojin-born',
    era: 'After',
    title: "Ino's son",
    description: 'Ino and Sai have a son, Inojin Yamanaka.',
    from: { year: 26, month: 12, day: 5 },
    to: { year: 27, month: 6 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    knowledge: 'village',
    facts: ['Inojin Yamanaka, son of Sai and Ino Yamanaka, was born.'],
  },
];

export const STAGE_TWO_PERSONAL: CanonMilestone[] = [
  // --- The Akatsuki years -------------------------------------------------------
  {
    id: 'ame-first-winter',
    era: 'The shadow war',
    title: 'A first winter in the Rain',
    description:
      "Winter in Hidden Rain is the same rain, only colder: sleet on the iron towers, people burning furniture, Pain's name said like a prayer. You learn where the dry places are.",
    from: { year: 14, month: 11 },
    to: { year: 16, month: 2 },
    region: 'Hidden Rain',
    location: 'the Hidden Rain Village',
    playerDriven: true,
    requires: { flag: 'joinedAkatsuki' },
    facts: [],
    encounter: {
      who: 'the people of Hidden Rain, perhaps Konan',
      where: 'Hidden Rain in winter',
      context:
        'The Rain is poor and grateful to its god. Kan sees how ordinary people live under Pain, and what the Akatsuki looks like from the street.',
    },
    attendanceFact: 'You spent your first winter in Hidden Rain.',
  },
  {
    id: 'sasori-puppets',
    era: 'The shadow war',
    title: "Sasori's test subject",
    description:
      'Sasori wants to see how a Sharingan reads his puppets, and whether a living Uchiha would make a good one. He asks you to test them.',
    from: { year: 15, month: 3 },
    to: { year: 18, month: 6, day: 10 },
    playerDriven: true,
    requires: { flag: 'joinedAkatsuki' },
    facts: [],
    encounter: {
      who: 'Sasori (inside Hiruko)',
      where: 'an Akatsuki hideout, or wherever Sasori works on his puppets',
      context:
        'Sasori hates waiting and believes art should last forever. He tests his poison-laced puppets on Kan. He is not entirely joking about wanting Kan as a puppet one day.',
    },
    attendanceFact: "You tested Sasori's puppets.",
  },
  {
    id: 'kan-meets-hidan',
    era: 'The shadow war',
    title: 'The Jashinist',
    description:
      "Hidan joins the Akatsuki and will not shut up about Jashin. He wants to know what god you pray to, and he does not like the answer.",
    from: { year: 16, month: 1 },
    to: { year: 16, month: 12 },
    playerDriven: true,
    requires: { flag: 'joinedAkatsuki' },
    facts: [],
    encounter: {
      who: 'Hidan',
      where: 'an Akatsuki hideout or the road with Kakuzu',
      context:
        "Hidan is loud, foul-mouthed and immortal. His rituals take an hour, his blood circle is sacred to him, and he takes faith seriously even when nothing else. He may try to convert Kan, or decide he's a heathen worth sacrificing.",
    },
    attendanceFact: 'You met Hidan and heard about Jashin.',
  },

  // --- The Karin arc ------------------------------------------------------------
  {
    id: 'karin-meets',
    era: 'The shadow war',
    title: 'The girl they bite',
    description:
      'An Akatsuki job takes you into the Land of Grass. The village keeps a red-haired girl, Karin, whom its shinobi bite to heal themselves. Her arms are covered in bite marks. Her mother died of the same thing.',
    canonPoint: 'You met Karin in the Land of Grass.',
    from: { year: 15, month: 6 },
    to: { year: 16, month: 12 },
    region: 'Land of Grass',
    location: 'the Hidden Grass Village',
    playerDriven: true,
    completesWhen: 'Kan meets Karin on the page: he sees what is done to her, or she patches him up and he notices the bite marks.',
    facts: [],
    encounter: {
      who: 'Karin, about eleven',
      where: 'the Hidden Grass Village, or its edge',
      context:
        "Karin is small, sharp-tongued and used to being used. She can feel chakra. The most wanted man in the world might be the only person she isn't afraid of. Kan can step in, or she patches him up. A big-brother bond only, never romance.",
    },
    attendanceFact: 'You met Karin in the Land of Grass.',
  },
  {
    id: 'karin-lessons',
    era: 'The shadow war',
    title: 'Small lessons in secret',
    description:
      "When jobs bring you near the Grass you go back. You teach Karin small things nobody else will: hiding her chakra, sensing better, throwing a kunai, and saying no when someone wants to bite her.",
    from: { year: 16, month: 1 },
    to: { year: 18, month: 6, day: 10 },
    region: 'Land of Grass',
    location: 'the woods outside the Hidden Grass Village',
    playerDriven: true,
    after: 'karin-meets',
    facts: [],
    encounter: {
      who: 'Karin',
      where: 'a hidden place near the Hidden Grass Village',
      context:
        'Light, warm scenes in dark years. Karin decides Kan is the strongest person alive. She stays on her canon path: Kan can change how she feels and what she knows, never where her life goes.',
    },
    attendanceFact: 'You trained Karin in secret.',
  },
  {
    id: 'karin-uzumaki-blood',
    era: 'The shadow war',
    title: 'The same blood',
    description:
      "Her red hair, the way her chakra heals, the weight of it: Karin is an Uzumaki, like your father. You may be the only family either of you has left. Whether you tell her is yours to decide.",
    from: { year: 16, month: 1 },
    to: { year: 18, month: 7 },
    playerDriven: true,
    after: 'karin-meets',
    facts: [],
    encounter: {
      who: 'Karin',
      where: 'wherever Kan sees her next',
      context:
        'Kan realises what Karin is. He can tell her, or keep it. Neither changes where her life is going.',
    },
    attendanceFact: 'You realised Karin is an Uzumaki.',
  },
  {
    id: 'karin-parting',
    era: 'Part 1',
    title: 'Karin goes to the exams',
    description:
      "The Grass is sending Karin to the Chunin Exams in the Leaf. You can't follow her into that. If the Akatsuki learns about her, she becomes a weapon against you, so you may have to push her away to keep her safe.",
    from: { year: 18, month: 4, day: 11 },
    to: { year: 18, month: 7, day: 17 },
    region: 'Land of Grass',
    location: 'the Land of Grass',
    playerDriven: true,
    after: 'karin-meets',
    facts: [],
    encounter: {
      who: 'Karin',
      where: 'the last time Kan sees her in the Grass',
      context:
        'In canon Sasuke saves Karin in the Forest of Death, and Orochimaru takes her in after the exams. Kan cannot stop that. The parting should hurt; it mirrors Itachi leaving Sasuke.',
    },
    attendanceFact: 'You said goodbye to Karin before the Chunin Exams.',
  },

  // --- Part 1 to the hunt ----------------------------------------------------------
  {
    id: 'itachi-on-defection',
    era: 'The hidden years',
    title: 'What Itachi says about Sasuke',
    description:
      "Word reaches the Akatsuki that Sasuke has gone to Orochimaru. In public Itachi says nothing. In private, with you, he says a little more.",
    from: { year: 18, month: 10, day: 10 },
    to: { year: 19, month: 8, day: 9 },
    playerDriven: true,
    after: 'sasuke-defects',
    facts: [],
    encounter: {
      who: 'Itachi Uchiha',
      where: 'somewhere Kisame cannot hear',
      context:
        "Sasuke chose Orochimaru to get strong enough to kill Itachi. Itachi wanted him to hate, and it worked; it is also killing him. Kan is the only person he could say any of that to.",
    },
    attendanceFact: 'Itachi talked to you about Sasuke going to Orochimaru.',
  },
  {
    id: 'kimimaro-report',
    era: 'The hidden years',
    title: "Kimimaro's last fight",
    description:
      "A report reaches you: Kimimaro died fighting Gaara of the Sand, still standing, killed by his own illness before the sand could do it. He died for Orochimaru's dream of a body he would never be.",
    from: { year: 18, month: 10, day: 10 },
    to: { year: 19, month: 5, day: 8 },
    playerDriven: true,
    after: 'sound-four-fall',
    facts: [],
    encounter: {
      who: 'Zetsu, Kabuto, or an Akatsuki report',
      where: 'wherever the news finds Kan',
      context:
        'Kimimaro gave his life for someone who had already moved on to Sasuke. Kan, who serves the Akatsuki for his own reasons, may see something in that.',
    },
    attendanceFact: "You heard how Kimimaro died.",
  },
  {
    id: 'pain-hunt-plan',
    era: 'The hidden years',
    title: 'The plan is laid out',
    description:
      'Every member is summoned through the rings. Pain lays out the hunt in order: which pair takes which beast, how long the sealing takes, and the order the beasts must be sealed in. Your name is on the list.',
    from: { year: 19, month: 7, day: 11 },
    to: { year: 19, month: 11, day: 12 },
    region: 'Hidden Rain',
    location: 'the Akatsuki sealing cave, by projection',
    playerDriven: true,
    after: 'jinchuriki-hunt-decree',
    requires: { flag: 'joinedAkatsuki' },
    facts: [],
    encounter: {
      who: 'Pain, Konan, Tobi and every Akatsuki member as projections',
      where: 'the rings summon Kan to the meeting',
      context:
        "The sealing takes three days and needs every member there as a projection. The Nine-Tails must be last. Pain does not ask for opinions. Itachi watches Kan's face.",
    },
    attendanceFact: "You were at the meeting where Pain laid out the beast hunt.",
  },

  // --- The cost of the Mangekyō, in stages -------------------------------------
  {
    id: 'kan-sight-strain',
    era: 'Shippuden',
    title: 'Blood in your eyes',
    description:
      'Now it is more than blur. Using the Mangekyō leaves blood on your cheeks and a headache that lasts a day, and Susanoo makes it worse. The dark at the edges stays a little longer every time.',
    canonPoint: 'Your Mangekyō strains your eyes badly every time you use it.',
    from: { year: 20, month: 7, day: 22 },
    to: { year: 22, month: 5, day: 26 },
    playerDriven: true,
    after: 'kan-sight-fades',
    facts: ["Kan's Mangekyō makes his eyes bleed and leaves headaches; his sight keeps getting worse."],
    encounter: {
      who: 'your own eyes, and whoever sees you after a fight',
      where: 'after a hard fight',
      context:
        "It runs alongside Itachi's illness. Itachi recognises the signs from his own eyes; Kisame notices too. Kan decides who knows.",
    },
  },
  {
    id: 'kan-eyes-choice',
    era: 'Shippuden',
    title: 'Going blind',
    description:
      "There are only a few ways out of the dark and none of them is clean: another Uchiha's eyes, the First Hokage's cells, or using the Mangekyō less and less until you stop. You have to choose.",
    canonPoint: 'You have faced the choice of what to do about your failing eyes.',
    from: { year: 21, month: 10, day: 18 },
    to: { year: 22, month: 10, day: 7 },
    playerDriven: true,
    after: 'kan-sight-strain',
    facts: [],
    encounter: {
      who: 'whoever Kan trusts with it: Itachi while he lives, the masked man, the snakes',
      where: 'when the dark will not clear',
      context:
        "Itachi is dying and his eyes are meant for Sasuke. The masked man keeps a vault of Uchiha eyes. Orochimaru and Kabuto have Hashirama's cells. Each way has a price, and canon still holds (Sasuke gets Itachi's eyes).",
    },
  },

  // --- The canon threads ------------------------------------------------------------
  {
    id: 'naka-tablet',
    era: 'The shadow war',
    title: 'The stone tablet',
    description:
      'Under the Naka Shrine, beneath the seventh mat from the right, is the Uchiha stone tablet. Read with the Sharingan it says more than any history the clan taught you. Getting there means walking into the Leaf as a wanted Uchiha.',
    canonPoint: 'You read the Uchiha stone tablet with the Sharingan.',
    from: { year: 14, month: 1 },
    to: { year: 33, month: 9 },
    region: 'Hidden Leaf',
    location: 'the secret hall under the Naka Shrine',
    playerDriven: true,
    requires: { flag: 'hasSharingan' },
    facts: [],
    encounter: {
      who: 'the tablet (and whoever guards the district)',
      where: 'beneath the Naka Shrine in the Uchiha district',
      context:
        'Root and ANBU watch the dead district. The tablet reveals more to each level of the eye: the Sharingan shows only part. It was rewritten by Black Zetsu long ago, which nobody knows.',
    },
    attendanceFact: 'You read the stone tablet under the Naka Shrine with the Sharingan.',
  },
  {
    id: 'naka-tablet-mangekyo',
    era: 'Shippuden',
    title: 'The tablet, read again',
    description:
      'With the Mangekyō the tablet says more: the Sage of Six Paths, the dream of one world, and things the clan was told to believe. It is a long way back to the Naka Shrine.',
    canonPoint: 'You read the stone tablet again with the Mangekyō.',
    from: { year: 14, month: 1 },
    to: { year: 33, month: 9 },
    region: 'Hidden Leaf',
    location: 'the secret hall under the Naka Shrine',
    playerDriven: true,
    after: 'naka-tablet',
    requires: { flag: 'hasMangekyo' },
    facts: [],
    encounter: {
      who: 'the tablet',
      where: 'beneath the Naka Shrine',
      context:
        "The Mangekyō reads further than the Sharingan; the Rinnegan would read further still. What it says points toward the moon and the Infinite Tsukuyomi, the masked man's dream.",
    },
    attendanceFact: 'You read the stone tablet again with the Mangekyō.',
  },
  {
    id: 'shisui-eye-trail',
    era: 'The shadow war',
    title: "Shisui's other eye",
    description:
      "Itachi carries one of Shisui's eyes. The other was taken. The longer you think about Shisui's last night, the more one name comes back: Danzō.",
    canonPoint: "You know Danzo took one of Shisui's eyes.",
    from: { year: 14, month: 1 },
    to: { year: 22, month: 3, day: 31 },
    playerDriven: true,
    after: 'shisui-truth',
    facts: [],
    encounter: {
      who: 'Itachi, or anyone who knew Root',
      where: 'wherever Kan learns it',
      context:
        "Danzō wears Shisui's right eye under his bandages and uses Kotoamatsukami with it; Itachi has the left in his crow. Kan can find out, but he cannot take it before the Land of Iron.",
    },
    attendanceFact: "You learned that Danzō took Shisui's eye.",
  },
  {
    id: 'shisui-eye-danzo',
    era: 'Shippuden',
    title: 'Close to Danzō',
    description:
      "Getting near Danzō means getting past Root: Torune's insects, Fū's sensing, and a man who sees everything. Each step toward Shisui's eye is a step into the dark.",
    from: { year: 19, month: 6, day: 9 },
    to: { year: 22, month: 4, day: 1 },
    playerDriven: true,
    after: 'shisui-eye-trail',
    facts: [],
    encounter: {
      who: 'Root agents (Torune Aburame, Fū Yamanaka), perhaps Danzō himself',
      where: 'the Land of Fire, near the Leaf',
      context:
        "Danzō is guarded and paranoid, with Izanagi in an arm full of Sharingan. Kan can learn where he goes and how he is guarded. Danzō keeps the eye until the Land of Iron, whatever Kan does.",
    },
    attendanceFact: "You got close to Danzō and Shisui's eye.",
  },
  {
    id: 'shisui-eye-iron',
    era: 'The sky falls',
    title: 'The end of the eye',
    description:
      "In the Land of Iron Danzō runs from the Summit with Sasuke behind him. When he dies, his last seal will take Shisui's eye with him. Whether you are there to see it is your choice.",
    from: { year: 22, month: 4, day: 2 },
    to: { year: 22, month: 4, day: 6 },
    region: 'Land of Iron',
    location: 'the bridge in the Land of Iron',
    playerDriven: true,
    after: 'shisui-eye-trail',
    facts: [],
    encounter: {
      who: 'Danzō Shimura, Sasuke and the masked man',
      where: 'the Land of Iron',
      context:
        "Sasuke kills Danzō. Danzō's dying reverse-sealing destroys his body and Shisui's eye with it, and denies the masked man the eye. Kan can witness it, be part of it, or let it go.",
    },
    attendanceFact: "You saw Shisui's eye end with Danzō.",
  },
  {
    id: 'uzumaki-masks',
    era: 'The shadow war',
    title: 'The mask shrine',
    description:
      "On the edge of the Leaf stands the Uzumaki clan's mask shrine, kept since Uzushio fell. Your father told you about it once. Something of your other blood is still in there.",
    from: { year: 14, month: 1 },
    to: { year: 33, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Uzumaki mask shrine on the outskirts of the Hidden Leaf',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'the shrine and its masks',
      where: 'the outskirts of the Hidden Leaf',
      context:
        "The shrine holds the Uzumaki's ceremonial masks, among them the Shinigami mask used for the Reaper Death Seal. It is quiet and neglected. If Kan knows Karin is Uzumaki, she is part of what he thinks about here.",
    },
    attendanceFact: 'You visited the Uzumaki mask shrine.',
  },
  {
    id: 'uzushio-ruins',
    era: 'The shadow war',
    title: 'Uzushio',
    description:
      "The Land of Whirlpools is ruins on an island: broken walls, sealing script on every stone, the whirlpools still turning around it. Your father's people lived here.",
    from: { year: 14, month: 6 },
    to: { year: 22, month: 9, day: 14 },
    region: 'Land of Whirlpools',
    location: 'the ruins of Uzushiogakure',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'the ruins, maybe a scavenger or an Akatsuki errand',
      where: 'the ruins of Uzushiogakure',
      context:
        'Uzushio was destroyed in the Second or Third War by villages that feared its sealing. What is left is ruins, old seals and graves. Kan can find something of his father here, or nothing at all.',
    },
    attendanceFact: 'You walked the ruins of Uzushio.',
  },
  {
    id: 'mist-swords',
    era: 'The shadow war',
    title: 'The swords of the Mist',
    description:
      "The Seven Swordsmen's blades are changing hands through the Bloody Mist years: stolen, lost, buried with their owners. Kisame knows where some of them went. Kakuzu knows what they are worth.",
    from: { year: 15, month: 3 },
    to: { year: 21, month: 3, day: 29 },
    region: 'Land of Water',
    location: 'the Land of Water',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'Kisame, Kakuzu, or someone carrying one of the swords',
      where: 'the Land of Water or the roads around it',
      context:
        'Kisame carries Samehada, Zabuza Kubikiribōchō, Raiga the twin swords Kiba; the others are scattered. Canon owners keep their swords, but Kan can cross paths with them.',
    },
    attendanceFact: 'You crossed paths with one of the Seven Swordsmen’s blades.',
  },
  {
    id: 'swords-at-war',
    era: 'The Fourth War',
    title: 'The dead swordsmen',
    description:
      'Kabuto sends the Seven Swordsmen back to the front as Edo Tensei, swords and all: the Heartless Pair, Mangetsu, Ameyuri, Fuguki. Their blades are on the battlefield again.',
    from: { year: 22, month: 10, day: 8 },
    to: { year: 22, month: 10, day: 9 },
    region: 'Land of Lightning',
    location: 'the Fourth War front',
    playerDriven: true,
    facts: [],
    encounter: {
      who: "the reanimated Seven Swordsmen against Kakashi's division",
      where: 'the Fourth War front',
      context:
        "They cannot die and do not tire. Kan may fight them, help seal them, or watch their swords fall to new hands after the war.",
    },
    attendanceFact: 'You faced the reanimated Seven Swordsmen in the war.',
  },

  // --- After the war ------------------------------------------------------------------
  {
    id: 'uzushio-return',
    era: 'After',
    title: 'Back to the whirlpools',
    description:
      "In peacetime there is no mission and no one to hide from. You can go to Uzushio for no reason except that it was your father's.",
    from: { year: 22, month: 12, day: 7 },
    to: { year: 27, month: 12 },
    region: 'Land of Whirlpools',
    location: 'the ruins of Uzushiogakure',
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'perhaps Karin, perhaps Naruto, perhaps no one',
      where: 'the ruins of Uzushiogakure',
      context:
        'The last Uzumaki are scattered: Naruto, Karin, Kan. Going back is quiet and personal; who Kan brings says a lot about him.',
    },
    attendanceFact: 'You went back to the Uzushio ruins after the war.',
  },
  {
    id: 'kakashi-asks',
    era: 'After',
    title: 'The Hokage needs a favour',
    description:
      "Kakashi has the hat now, and too many problems no regular shinobi should touch. He asks you for help, as quietly as he does everything.",
    from: { year: 24, month: 4 },
    to: { year: 26, month: 12 },
    region: 'Hidden Leaf',
    location: "the Hokage's office",
    playerDriven: true,
    after: 'kakashi-hokage',
    facts: [],
    encounter: {
      who: 'Kakashi Hatake',
      where: "the Hokage's office, or a rooftop at night",
      context:
        'Kakashi served with Itachi in ANBU and knows what Kan did in the cloak. He needs someone who knows the Akatsuki and the dark. It depends on how the reckoning went.',
    },
    attendanceFact: 'Kakashi asked for your help as Hokage.',
  },
  {
    id: 'sasuke-journey',
    era: 'After',
    title: 'On the road with Sasuke',
    description:
      'Sasuke is walking the world to atone and to watch for what is coming. For a stretch of it, you walk with him.',
    from: { year: 24, month: 1 },
    to: { year: 27, month: 2 },
    playerDriven: true,
    after: 'sasuke-trial',
    facts: [],
    encounter: {
      who: 'Sasuke Uchiha',
      where: 'the roads far from the Leaf',
      context:
        "Sasuke has one arm, the Rinnegan, and very little to say. He investigates Kaguya's traces in secret. Kan was Itachi's closest friend; the silences between them say a lot.",
    },
    attendanceFact: 'You travelled with Sasuke for part of his journey.',
  },
  {
    id: 'kan-peace-romance',
    era: 'After',
    title: 'Something that lasts',
    description:
      "For the first time there is no war waiting at the end of the week. You and the person you love have to work out what a quiet life together looks like.",
    from: { year: 22, month: 12, day: 7 },
    to: { year: 30, month: 12 },
    playerDriven: true,
    requires: { flag: 'inRomance' },
    facts: [],
    encounter: {
      who: 'the person Kan loves',
      where: 'a home, a village, a road',
      context:
        'Romance in peacetime: where to live, what Kan tells her about the cloak years, and whether either of them knows how to be ordinary.',
    },
    attendanceFact: 'You and the person you love began a life together.',
  },
  {
    id: 'kan-family',
    era: 'After',
    title: 'A family of your own',
    description:
      'Everyone around you is having children. The question comes up, the way it always does, at a dinner table: what about you?',
    from: { year: 25, month: 1 },
    to: { year: 33, month: 9 },
    playerDriven: true,
    after: 'kan-peace-romance',
    requires: { flag: 'inRomance' },
    facts: [],
    encounter: {
      who: 'the person Kan loves',
      where: 'home',
      context:
        "An Uchiha-Uzumaki child would carry two dangerous bloodlines. Whatever they decide, it's theirs, and it never has to happen.",
    },
    attendanceFact: 'You and the person you love talked about a family.',
  },
  {
    id: 'kakuzu-caches',
    era: 'After',
    title: "Kakuzu's money",
    description:
      "Kakuzu buried money all over the world for decades and told no one where. You walked his bounty roads with him. Some of those caches might still be there, and someone else might be looking too.",
    from: { year: 27, month: 1 },
    to: { year: 31, month: 12 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'old Akatsuki leftovers, bounty hunters, or no one',
      where: "one of Kakuzu's old bounty stations",
      context:
        'Kan remembers some of the places Kakuzu went. The money is blood money. Others who remember the Akatsuki may be looking too.',
    },
    attendanceFact: "You went looking for Kakuzu's hidden money.",
  },
  {
    id: 'sarada-asks',
    era: 'After',
    title: 'Sarada asks about the clan',
    description:
      'Sarada is old enough to ask questions, and her father is never home to answer them. She asks you what the Uchiha were.',
    from: { year: 30, month: 1 },
    to: { year: 33, month: 9 },
    region: 'Hidden Leaf',
    location: 'the Hidden Leaf Village',
    playerDriven: true,
    after: 'holding-sarada',
    facts: [],
    encounter: {
      who: 'Sarada Uchiha, a small girl',
      where: 'the Hidden Leaf, or wherever Sakura and Sarada are',
      context:
        'Sarada is three to six, bright and serious. She has no Sharingan. What Kan tells her about the clan, the massacre and Itachi shapes how she sees her family.',
    },
    attendanceFact: 'Sarada asked you about the Uchiha.',
  },
  {
    id: 'kan-peacetime',
    era: 'After',
    title: 'An ordinary day',
    description:
      'No mission, no hunters, no war. A morning with nowhere to be, a market, a meal with old friends. You are not sure you know how to do this.',
    from: { year: 28, month: 1 },
    to: { year: 33, month: 9 },
    playerDriven: true,
    facts: [],
    encounter: {
      who: 'old friends: Hana, Suzume, Naruto, whoever is left',
      where: 'wherever Kan has made a home',
      context:
        'A quiet beat. Peace is strange for a man who has lived in the cloak. Let it be small and real.',
    },
    attendanceFact: 'You had an ordinary day in peacetime.',
  },
];
