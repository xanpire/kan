// Section 8 of claude/before-variety-ideas.md (Xan, 14 Nov 2026): living NPCs.
// One "voice and reactions" line per cast member: temperament, how they show
// surprise, fear, joy and grief, and their verbal habits. Sent to the narrator
// only for the people in the scene (voices.ts). Never shown in the UI.
//
// Format: temperament | surprise | fear | joy | grief | habits. Short on
// purpose: the card already carries personality and speech style.

/**
 * Era accuracy (section 1): a voice that is only true from a milestone on.
 * Until `until` has happened, the narrator gets this line instead.
 */
export const EARLY_VOICES: Record<string, { until: string; voice: string }> = {
  // Before Naruto beats him in the invasion, Gaara is the killer the Sand fears.
  Gaara: {
    until: 'konoha-invasion',
    voice:
      'flat, cold, murderous | surprise: none shown; the sand twitches | fear: never admits it; lashes out | joy: only in killing, a thin terrible smile | grief: buried under hatred | habits: "I love only myself", "mother wants your blood"; no sleep; trusts no one, his siblings fear him',
  },
};

export const CAST_VOICES: Record<string, string> = {
  // --- Kan's own people
  'Itachi Uchiha':
    'still water | surprise: a half-second pause, nothing more | fear: never for himself; for you or Sasuke, a quiet hardening | joy: the smallest softening, a two-finger poke to the forehead | grief: hidden behind calm, a cough he turns away from | worries about you without a word; answers questions with questions; says "forgive me" instead of explaining; never defends himself against your hatred and never asks you to forgive him: he lets you hate him',
  'Hana Inuzuka':
    'loud and warm, a pack animal | surprise: out loud, a laugh or a curse | fear: turns to anger and protectiveness at once | joy: shoves, teases, grins wide | grief: goes short and busy, works through it with her hands | teases you about everything; talks to the Haimaru brothers as if they were people; smells things before she trusts them',
  'Izumi Uchiha':
    'gentle and bright, stubborn underneath | surprise: covers her mouth, then laughs at herself | fear: goes very still and holds someone’s sleeve | joy: hums, teases softly | grief: quiet tears she apologises for | notices small things about people; teases you warmly; talks about an ordinary life as if it were close',
  'Suzume':
    'dry field veteran | surprise: one raised eyebrow | fear: shows as orders, short and clear | joy: a rare small nod, "not bad" | grief: says nothing, makes tea | measures everything as a lesson; still calls her old students by their genin habits',

  // --- Team 7 and the Rookies
  'Sasuke Uchiha':
    'proud and cold, burning underneath | surprise: masked fast, a tightened jaw | fear: turns into aggression | joy: almost never shown, a smirk | grief: rage aimed at Itachi | "hn"; calls Naruto an idiot (usuratonkachi); to him you were almost another big brother',
  'Naruto Uzumaki':
    'loud, open, all heart | surprise: shouts and points | fear: shouts louder and charges | joy: whoops, grins, wants ramen | grief: breaks openly, then swears to do better | "dattebayo"; gives people nicknames; asks you to teach him the jutsu he just saw',
  'Sakura Haruno':
    'quick, bright, temper on a short fuse | surprise: a sharp "eh?!" | fear: freezes, then forces herself forward | joy: bright and talkative | grief: cries, then gets angry at herself | punches Naruto; analyses out loud; an inner voice that yells "shannaro!"',
  'Kakashi Hatake':
    'lazy surface, razor underneath | surprise: the book lowers an inch | fear: a calm, exact plan | joy: the eye-smile | grief: visits the memorial stone, late to everything | reads Icha Icha in any lull; measures you first and keeps an eye on your Sharingan; reports to the Hokage',
  'Hinata Hyuga':
    'shy and kind, braver than she looks | surprise: a tiny startled sound, fingers together | fear: trembles and stays anyway | joy: a soft hidden smile | grief: quiet tears | stammers "u-um"; presses her fingers together; faints near Naruto',
  'Neji Hyuga':
    'proud, cool, certain | surprise: the Byakugan veins flare | fear: lectures about fate to steady himself | joy: a cool smile | grief: bitterness at the main house | lectures about destiny; sees chakra points and the drain itself with the Byakugan',
  'Shikamaru Nara':
    'lazy genius | surprise: a long look, then "huh" | fear: thinks faster, hands in the rat sign | joy: a lazy half-smile | grief: lights a cigarette he does not smoke (after Asuma) | "what a drag"; sighs; plays out three moves ahead aloud; watches clouds',
  'Kiba Inuzuka':
    'brash and loyal | surprise: loud disbelief | fear: bravado, Akamaru whines first | joy: whoops and roughhousing | grief: anger on someone else’s behalf | sniffs the air; talks with Akamaru; knows you by smell; angry for Hana’s sake',
  'Rock Lee':
    'earnest, burning | surprise: shouts his amazement and salutes it | fear: vows to train harder | joy: tears of joy, a thumbs-up | grief: weeps openly | talks of the springtime of youth; promises laps if he fails; bows deeply',
  'Ino Yamanaka':
    'bossy, sharp-eyed gossip | surprise: a squeal, then questions | fear: grabs a friend’s arm | joy: chatty and pleased with herself | grief: brittle, then sobs | gossips; reads people and flowers; teases Sakura ("billboard brow")',
  'Choji Akimichi':
    'gentle, loyal | surprise: stops chewing | fear: hides behind his friends, then fights for them | joy: offers food | grief: stops eating | always mid-snack; flares at "fat"; shares chips with friends',
  'Shino Aburame':
    'quiet and logical | surprise: adjusts his glasses | fear: explains the danger precisely | joy: barely visible | grief: hurt at being forgotten | "because…" explanations; insects stir when he is upset',
  'Tenten':
    'practical, upbeat | surprise: an honest "whoa" | fear: reaches for a scroll | joy: friendly and frank | grief: keeps busy | talks about weapons; idolises Tsunade',
  'Sai':
    'emotionless by training | surprise: a polite smile that does not change | fear: none he can name | joy: learns it from a book | grief: puzzled by it | blunt insults he thinks are kind; nicknames; quotes books about feelings',
  'Iruka Umino':
    'warm, strict | surprise: a loud "what?!" | fear: steps in front of children | joy: treats kids to ramen | grief: quiet, rubs the scar on his nose | scolds loudly; rubs his nose when embarrassed',
  'Konohamaru Sarutobi':
    'bratty and bold | surprise: jumps and points | fear: hides it badly | joy: brags | grief: furious tears | "kore"; calls Naruto "boss"; wants to be seen as himself',
  'Udon Ise': 'shy, slow | surprise: sniffles | fear: hides behind Moegi | joy: quiet pride | habits: runny nose, counts things',
  'Moegi Kazamatsuri': 'sensible, bossy | surprise: hands on hips | fear: tries to lead anyway | joy: bright and pleased | habits: keeps Konohamaru in line',

  // --- The Leaf's elders, jonin and clans
  'Hiruzen Sarutobi':
    'patient grandfather, heavy-hearted | surprise: draws on his pipe | fear: measured, protective | joy: a warm chuckle | grief: long silence over the pipe | knows you left with Itachi and keeps the file as cover; never tells Sasuke or Danzō',
  'Danzo Shimura':
    'cold, absolute | surprise: none shown | fear: none shown; plans | joy: satisfaction at a useful tool | grief: none | wants you found, then in Root or dead; calls people assets; leans on his cane',
  'Jiraiya':
    'theatrical, lecherous, sharp | surprise: a big pose, then a serious look | fear: serious and quiet | joy: boasts, laughs | grief: drinks alone | introduces himself grandly; "research" at the hot springs; turns serious in one sentence',
  'Tsunade Senju':
    'fierce, proud | surprise: slams the table | fear: blood makes her freeze (early on) | joy: drinks, laughs too loud | grief: drinks, snaps at people | gambles and loses; flicks foreheads; heals while scolding',
  'Shizune':
    'earnest worrier | surprise: "eh?! Lady Tsunade!" | fear: frets aloud | joy: relieved smile | grief: worries for Tsunade | carries Tonton; fusses over wounds',
  'Might Guy':
    'endless enthusiasm | surprise: loud delight | fear: none; a challenge | joy: a nice-guy pose and thumbs-up | grief: tears and a vow | the springtime of youth; challenges Kakashi to anything; delighted to see you, then confused about the criminals',
  'Anko Mitarashi':
    'wild, teasing | surprise: a grin and a thrown kunai | fear: the curse mark aches; she hides it | joy: dango | grief: rage at Orochimaru | licks blood off a kunai; eats dango; flirts aggressively',
  'Kurenai Yuhi':
    'calm, protective | surprise: composed, eyes narrow | fear: guards her students | joy: warm smile | grief: quiet strength (after Asuma) | protects her team; genjutsu first',
  'Asuma Sarutobi':
    'easygoing, principled | surprise: cigarette nearly drops | fear: steps forward | joy: a loose laugh | grief: smokes harder | always smoking; plays shogi with Shikamaru',
  'Yamato':
    'dutiful, polite | surprise: blinks, formal | fear: follows orders | joy: mild smile | grief: quiet | the scary stare when crossed; your old unit comrade (Tenzō), quietly sympathetic',
  'Shikaku Nara':
    'drawling strategist | surprise: a slow "well, now" | fear: a plan | joy: dry humour | grief: quiet | three moves ahead; shogi; teases his son',
  'Inoichi Yamanaka':
    'calm, perceptive | surprise: studies you | fear: steady | joy: a gentle father | grief: measured | reads minds for a living; notices lies',
  'Choza Akimichi':
    'big-hearted | surprise: a booming laugh | fear: shields others | joy: feeds people | grief: openly | warm and booming; calls people by fond names',
  'Tsume Inuzuka':
    'wild, blunt mother wolf | surprise: sniffs, then a bark of a laugh | fear: anger | joy: rough affection | grief: fierce | "Does Hana know?"; knows you by smell; teases Hana about you since the night in the kennels',
  'Hiashi Hyuga':
    'stern, formal | surprise: a cold silence | fear: none shown | joy: rarely | grief: for his twin, hidden | formal; the Byakugan sees the drain',
  'Hanabi Hyuga': 'serious, proud child | surprise: blunt questions | fear: hides it | joy: small and proud | habits: trains hard; Byakugan',
  'Ibiki Morino':
    'cold, methodical | surprise: none | fear: none | joy: a dry grin at a good answer | grief: none shown | interrogates without seeming to; knows where every mind breaks',
  'Genma Shiranui': 'cool, laid-back | surprise: the senbon shifts | fear: steady | joy: a smirk | habits: chews a senbon, casual drawl',
  'Gekko Hayate': 'quiet, sickly | surprise: a cough | fear: steady | joy: faint | habits: coughs between sentences; hand on his sword',
  'Kotetsu Hagane': 'lazy, easygoing | surprise: "huh?" | fear: calls for backup | joy: banter | habits: jokes with Izumo; gate duty',
  'Izumo Kamizuki': 'calm, dutiful | surprise: level | fear: steady | joy: polite | habits: steadies Kotetsu',
  'Homura Mitokado': 'rigid, cautious | surprise: disapproval | fear: for the village | joy: none shown | habits: speaks for the council',
  'Koharu Utatane': 'shrewd, hard | surprise: a sharp look | fear: quiet calculation | joy: none shown | habits: clipped reproof',
  'Teuchi': 'kind cook | surprise: drops the ladle | fear: worries for customers | joy: free extra noodles | grief: quiet | habits: proud of his broth',
  'Ayame': 'sunny | surprise: bright "oh!" | fear: hides behind the counter | joy: welcoming | habits: remembers regulars’ orders',
  'Ebisu': 'prim, pompous | surprise: glasses flash | fear: lectures | joy: self-satisfied | habits: by the book; nosebleeds near pretty women',
  'Raido Namiashi': 'steady guard | surprise: dry | fear: steady | joy: brief | habits: few words',
  'Aoba Yamashiro': 'cool show-off | surprise: smooth | fear: steady | joy: pleased with himself | habits: sunglasses, crows',
  'Yūgao Uzuki': 'quiet and loyal | surprise: silence | fear: steady | joy: faint | grief: withdrawn (after Hayate) | habits: knew Itachi in ANBU; few words',
  'Mizuki': 'smooth, envious | surprise: smile slips | fear: cruelty | joy: smug | habits: friendly mask, sneers when it drops',
  'Kizashi Haruno': 'jokey, warm | surprise: a pun | fear: protective | joy: laughs at his own jokes | habits: bad puns, bickers with Mebuki',
  'Mebuki Haruno': 'strict, caring | surprise: sharp | fear: scolds | joy: brief | habits: scolds her husband',
  'Torune Aburame': 'hollowed by Root | surprise: none | fear: none | joy: none | habits: loyal to Danzō; quietly proud of Shino',
  'Fū Yamanaka': 'emptied by Root | surprise: none | fear: none | joy: none | habits: polite and flat; a sensor, he feels the strange chakra and reports it',

  // --- The dead the story looks back on
  'Shisui Uchiha': 'warm, easy | surprise: a laugh | fear: calm resolve | joy: a big grin | habits: teases Itachi, talks of peace',
  'Minato Namikaze': 'gentle genius | surprise: calm interest | fear: quiet speed | joy: a kind smile | habits: humble, scratches his head',
  'Kushina Uzumaki': 'fiery and loving | surprise: loud | fear: furious | joy: loud joy | habits: "dattebane"; hair rises when angry',
  'Fugaku Uchiha': 'stern | surprise: grave silence | fear: pride | joy: rare | habits: terse, disappointed in sons',
  'Mikoto Uchiha': 'kind, perceptive | surprise: soft | fear: calm | joy: warm | habits: mothers everyone',
  'Hazuki Uchiha': 'warm, wry | surprise: a teasing laugh | fear: quiet unease | joy: teases you and Izumi | grief: hides it in chores | habits: plain-spoken, feeds you',
  'Rin Nohara': 'caring, brave | surprise: soft | fear: steady | joy: encouraging | habits: heals first',
  'Hashirama Senju': 'big-hearted | surprise: a huge laugh | fear: none; serious | joy: laughs | grief: sulks dramatically | habits: sulks when scolded',
  'Tobirama Senju': 'cold, pragmatic | surprise: sharp analysis | fear: none | joy: none shown | habits: lectures; a sensor who distrusts the Uchiha',
  'Dan Katō': 'idealist | surprise: soft | fear: steady | joy: earnest | habits: talks of protecting people',
  'Hizashi Hyuga': 'controlled | surprise: quiet | fear: quiet | joy: rare | habits: resents the main house, loves his brother',
  'Kagami Uchiha': 'calm, earnest | surprise: calm | fear: steady | joy: gentle | habits: loyal to clan and village',
  'Izuna Uchiha': 'sharp, suspicious | surprise: suspicious | fear: for his brother | joy: rare | habits: distrusts the Senju',
  'Yashiro Uchiha': 'hard-line | surprise: accusation | fear: anger | joy: none | habits: cold, accusing',
  'Inabi Uchiha': 'arrogant | surprise: sneer | fear: bluster | joy: none | habits: sneering about clan pride',
  'Tekka Uchiha': 'hot-headed | surprise: a threat | fear: anger | joy: none | habits: follows Yashiro',
  'Mito Uzumaki': 'serene | surprise: calm | fear: calm | joy: gentle | habits: dignified; speaks of love answering hate',
  'Yashamaru': 'gentle mask | surprise: soft | fear: soft | joy: kind | habits: kind words that hide the order',
  'Pakura': 'proud, cutting | surprise: calm | fear: none | joy: a teacher’s pride | habits: bitter at betrayal',
  'Mū': 'eerily polite | surprise: courteous | fear: none | joy: none | habits: invisible, measured',
  'Kinkaku': 'proud, easily insulted | surprise: offended | fear: rage | joy: mocking | habits: loves his brother',
  'Ginkaku': 'sneering | surprise: sneer | fear: panics without his brother | joy: gloating | habits: praises deceit',
  'Fuguki Suikazan': 'self-righteous | surprise: lecture | fear: anger | joy: smug | habits: preaches secrecy',
  'Mangetsu Hōzuki': 'modest, composed | surprise: calm | fear: calm | joy: quiet | habits: few words',
  'Jinpachi Munashi': 'coarse | surprise: gloating | fear: none | joy: blasts | habits: bickers with Kushimaru',
  'Kushimaru Kuriarare': 'gleeful killer | surprise: cackle | fear: none | joy: cackling | habits: mocking',
  'Jinin Akebino': 'boastful | surprise: blunt | fear: none | joy: boasting | habits: all offence',
  'Ameyuri Ringo': 'playful, merciless | surprise: delighted | fear: none | joy: hungry grin | habits: calls a worthy opponent her "meal"',
  'Yahiko': 'bright idealist | surprise: confident | fear: steady | joy: warm grin | habits: talks of peace',

  // --- Orochimaru's people
  'Orochimaru':
    'patient collector | surprise: delight, never shock | fear: none shown | joy: a soft laugh, tongue over his lips | grief: none | covets anything rare: your eyes, your chakra, Thousand Souls; "kukuku"; calls people "interesting"',
  'Kabuto Yakushi':
    'polite mask | surprise: pushes up his glasses | fear: calculates | joy: a thin smile | grief: none shown | courteous and mild, quietly mocking; files away every detail for Orochimaru',
  'Karin':
    'sharp-tongued, guarded, sentimental | surprise: snaps | fear: hides behind someone strong | joy: flustered, then cross about it | grief: quiet, alone | pushes up her glasses; a sensor who knows your chakra while she stays near it; calls people idiots',
  'Suigetsu Hozuki': 'cheeky, lazy | surprise: a toothy grin | fear: melts into water | joy: mocking | habits: drinks water constantly, talks about swords',
  'Jugo': 'gentle, afraid of himself | surprise: soft | fear: of his own urges | joy: quiet; birds land on him | habits: talks to birds',
  'Kimimaro': 'serene, absolute | surprise: none | fear: none | joy: devotion | habits: courteous, coughs (illness)',
  'Tayuya': 'vicious, foul-mouthed | surprise: a curse | fear: a louder curse | joy: cruel | habits: swears constantly, insults teammates',
  'Sakon': 'smug sadist | surprise: mocking | fear: none | joy: cruelty | habits: argues with his twin',
  'Ukon': 'snide, lazy | surprise: snide | fear: none | joy: cruel | habits: lives in his brother’s body',
  'Jirobo': 'mannered then crude | surprise: polite | fear: anger | joy: eats | habits: hates being called fat',
  'Kidomaru': 'gamer | surprise: "fun!" | fear: none | joy: playing | habits: treats fights as games',
  'Dosu Kinuta': 'watchful, cold | surprise: calm | fear: calculates | joy: none | habits: polite',
  'Zaku Abumi': 'cocky | surprise: insult | fear: bluster | joy: boasting | habits: brags about his air tubes',
  'Kin Tsuchi': 'overconfident | surprise: taunt | fear: taunts more | joy: drawn-out fights | habits: bells on senbon',

  // --- The Akatsuki
  'Kisame Hoshigaki':
    'jovial killer, loyal partner | surprise: a toothy chuckle | fear: rarely; excitement | joy: a shark’s grin | grief: buried | jokes about sharks and fish; sizes up chakra (a sensor) and is amused or wary that Samehada wants yours',
  'Kakuzu':
    'greedy, short-tempered | surprise: appraises it | fear: none; anger | joy: counting money | grief: none | prices everything, bounties first; threatens to kill partners who waste his time; "time is money"',
  'Hidan':
    'loud zealot | surprise: swears | fear: never; he can’t die | joy: pain, his own and others’ | grief: none | mocks everything; prays to Jashin; foul-mouthed; complains about Kakuzu',
  'Deidara':
    'arrogant artist | surprise: offended | fear: anger | joy: an explosion | grief: none | ends sentences with "un" or "hm"; "art is an explosion!"; hates the Sharingan',
  'Sasori': 'cold, impatient | surprise: irritation | fear: none | joy: none shown | habits: hates waiting, sees people as puppets',
  'Konan': 'calm, distant | surprise: a faint look | fear: shields Nagato | joy: rare | grief: quiet | paper flowers; few words; devoted to Pain',
  'Pain':
    'cold god | surprise: calculation | fear: none | joy: none | grief: buried | calculates your use and price; speaks in absolutes ("feel pain"); six bodies see all',
  'Tobi':
    'two faces | surprise: in the act, a big silly yelp; underneath, cold attention | fear: in the act, mock panic | joy: in the act, cheering | grief: hidden | the playful Tobi act: talks in third person, "Tobi is a good boy!", flails, whines; the cold voice under it watches your eyes',
  'Zetsu': 'two voices | surprise: the white half chatters, the black half notes it | fear: sinks into the ground | joy: the white half giggles | habits: reports everything he sees; argues with himself',
  'Jūzō Biwa': 'quiet, deadly | surprise: a grunt | fear: none | joy: rare | habits: few words; partners with Itachi',

  // --- The Sand
  'Gaara': 'flat and dangerous, learning to care | surprise: stillness, then a question | fear: sand moves on its own | joy: a small surprise at being cared for | grief: quiet | habits: speaks of his mother (the sand); asks about love and bonds',
  'Temari': 'tough, bossy | surprise: snaps her fan | fear: fights harder | joy: a smirk | grief: protective of her brothers | habits: calls people crybabies',
  'Kankuro': 'cocky, protective | surprise: taunts | fear: hides behind a puppet | joy: smug | grief: protective | habits: face paint, puppets, quick taunts',
  'Chiyo': 'crotchety, cunning | surprise: sarcastic | fear: none | joy: cackle | grief: for Sasori | habits: complains about the young',
  'Ebizō': 'calm old man | surprise: thoughtful | fear: steady | joy: kind | habits: calms his sister',
  'Rasa': 'cold leader | surprise: none | fear: none | joy: none | habits: sees people as weapons',
  'Baki': 'curt, military | surprise: none | fear: orders | joy: none | habits: discipline first',

  // --- The Mist
  'Zabuza Momochi': 'brutal, cold | surprise: a grim laugh | fear: none | joy: none shown | grief: hidden, for Haku | habits: bandaged mouth, menacing talk',
  'Haku': 'gentle, sorrowful | surprise: soft | fear: for Zabuza | joy: quiet | habits: polite; lives to serve Zabuza',
  'Yagura': 'cold child-faced Kage | surprise: none | fear: none | joy: none | habits: flat, detached',
  'Mei Terumi': 'sweet and deadly | surprise: a teasing laugh | fear: calm | joy: flirting | grief: hidden | habits: anything that sounds like "marriage" makes her murderously calm',
  'Ao': 'suspicious veteran | surprise: lectures | fear: suspicion | joy: rare | habits: old-fashioned; his stolen Byakugan sees the drain',
  'Chojuro': 'timid, brave | surprise: apologises | fear: stammers but stays | joy: shy | habits: "s-sorry"; adjusts his glasses',
  'Utakata': 'aloof, melancholy | surprise: indifferent | fear: none shown | joy: bubbles | habits: blows bubbles, distrusts teachers',
  'Raiga Kurosuki': 'tormented, cruel | surprise: funeral talk | fear: none | joy: a "funeral" | grief: for Ranmaru only | habits: offers to hold funerals for the living',

  // --- The Cloud
  'Killer Bee': 'carefree rapper | surprise: a rhyme | fear: none | joy: raps | grief: for his brother | habits: raps in bad rhymes ("fool ya"), writes lyrics in a notebook',
  'A': 'hot-tempered | surprise: shouts | fear: rage | joy: loud | grief: punches walls | habits: shouts "Bee!", breaks furniture',
  'Darui': 'lazy and lethal | surprise: "huh, dull" | fear: steady | joy: lazy smile | habits: finds everything "so dull"',
  'Yugito Nii': 'composed, proud | surprise: calm | fear: duty | joy: rare | habits: formal',
  'Omoi': 'anxious overthinker | surprise: a spiral of worst cases | fear: louder spiral | joy: relief | habits: lollipop, imagines disasters aloud',
  'Karui': 'hot-headed | surprise: punches | fear: punches harder | joy: loud | habits: hits Omoi',
  'Samui': 'cool and unimpressed | surprise: "hm" | fear: calm | joy: barely | habits: short flat sentences',
  'Mabui': 'calm, efficient | surprise: crisp | fear: steady | joy: brief | habits: professional',
  'C': 'serious analyst | surprise: explains it | fear: analyses | joy: rare | habits: a sensor; feels the strange chakra and names its size, not its source',
  'Atsui': 'loud | surprise: "hot!" | fear: shouts | joy: shouts | habits: says "hot" constantly',

  // --- The Stone
  'Onoki': 'cranky old Kage | surprise: grumbles | fear: complains | joy: grudging | habits: complains about his back',
  'Kurotsuchi': 'bold, sarcastic | surprise: teasing | fear: frank | joy: teasing | habits: loyal to her grandfather',
  'Kitsuchi': 'grave, proud | surprise: firm | fear: commands | joy: rare | habits: family temper',
  'Akatsuchi': 'jovial | surprise: a grin | fear: calm | joy: grinning | habits: cheerful and loud',
  'Roshi': 'grizzled loner | surprise: gruff | fear: weary | joy: rare | habits: lava and steam',
  'Han': 'silent, steady | surprise: steam hisses | fear: none | joy: rare | habits: few words, muffled by his mask',

  // --- The rest of the world
  'Fū': 'cheerful and lonely | surprise: delighted | fear: brave | joy: wants to be friends | habits: wants a hundred friends',
  'Hanzō': 'paranoid tyrant | surprise: suspicion | fear: paranoia | joy: none | habits: cold',
  'Chiriku': 'serene monk | surprise: calm | fear: prayer | joy: gentle | habits: prayerful',
  'Mifune': 'honourable | surprise: measured | fear: none | joy: rare | habits: formal, neutral',
  'Tazuna': 'grumbling drinker | surprise: grumbles | fear: drinks | joy: grateful | habits: sake bottle',
  'Inari': 'sullen, then brave | surprise: sullen | fear: cries | joy: sincere | habits: "heroes don’t exist" until they do',
  'Madara Uchiha': 'proud warrior | surprise: amused | fear: none | joy: a worthy fight | grief: for Izuna | habits: theatrical, old-fashioned; respects only strength',
  'Kaguya Ōtsutsuki': 'regal, cold | surprise: contempt | fear: none | joy: possession | grief: for her sons | habits: speaks of all chakra as hers',
  'Toneri Ōtsutsuki': 'lonely, formal | surprise: detached | fear: calm | joy: about Hinata | habits: soft and formal',

  // --- Summons and beasts
  'Fukasaku': 'cranky wise toad | surprise: croaks | fear: steady | joy: pleased | habits: calls people "boy", scolds',
  'Shima': 'motherly, bossy | surprise: scolds | fear: scolds | joy: feeds people bugs | habits: bickers with Fukasaku',
  'Gamabunta': 'yakuza boss toad | surprise: rough | fear: none | joy: respects strength | habits: pipe, threats',
  'Manda': 'arrogant snake | surprise: contempt | fear: none | joy: sacrifices | habits: hissing threats',
  'Katsuyu': 'gentle slug | surprise: polite | fear: calm | joy: humble | habits: very polite, honorifics',
  'Pakkun': 'grumpy ninken | surprise: dry | fear: steady | joy: dry | habits: tired old man voice; knows you by smell',
  'Akamaru': 'loyal ninken | surprise: barks | fear: whines at strong chakra and hides in Kiba’s jacket (Part I) | joy: barks, licks | habits: knows you by smell; Kiba translates',
  'Nine-Tails': 'hate and contempt | surprise: a growl | fear: none | joy: mocking | habits: mocks humans, calls Naruto a brat',
  'Shukaku': 'crazed | surprise: cackling | fear: none | joy: blood | habits: crude cackling',
  'Matatabi': 'calm, polite | surprise: gentle | fear: calm | joy: courteous | habits: polite',
  'Isobu': 'shy | surprise: quiet | fear: timid | joy: quiet | habits: short words',
  'Son Gokū': 'proud | surprise: boastful | fear: none | joy: gruff | habits: insists on his full name',
  'Kokuō': 'dignified | surprise: formal | fear: none | joy: reserved | habits: spare words',
  'Saiken': 'kind, bubbly | surprise: warm | fear: none | joy: bubbly | habits: cheerful',
  'Chōmei': 'upbeat | surprise: chirpy | fear: none | joy: calls itself lucky | habits: bright',
  'Gyūki': 'wise, dry | surprise: deep | fear: none | joy: dry humour | habits: puts up with Bee’s raps',

  // --- Children born after the story begins
  'Boruto Uzumaki': 'loud, cheeky child | surprise: points and shouts | fear: hides it | joy: shows off',
  'Sarada Uchiha': 'serious, curious child | surprise: earnest questions | fear: brave | joy: about her father',
  'Himawari Uzumaki': 'sweet child | surprise: wide-eyed | fear: holds a hand | joy: giggles',
  'Shikadai Nara': 'lazy, sharp child | surprise: a sigh | fear: thinks | joy: lazy smile',
  'Inojin Yamanaka': 'prim, too honest child | surprise: blunt remark | fear: quiet | joy: draws',
  'Chōchō Akimichi': 'bold, food-loving child | surprise: loud | fear: bluster | joy: snacks',
  'Metal Lee': 'shy, eager child | surprise: stiff and formal | fear: freezes in front of people | joy: keen',
  'Mirai Sarutobi': 'sociable toddler, then determined | surprise: questions | fear: brave | joy: nicknames for everyone',
};

/**
 * Temperaments for people outside the cast: original characters and the
 * nameless (a ferryman, a guard, a crowd). Chosen by id so the same person
 * keeps theirs.
 */
export const TEMPERAMENTS: string[] = [
  'hot-tempered: flares fast and cools fast; surprise comes out as anger',
  'timid: goes small and quiet, stammers, looks for the door',
  'jovial: jokes through nerves, laughs too loud when scared',
  'stoic: barely moves; surprise shows only in a pause or a tight jaw',
  'nosy and chatty: asks question after question, can’t keep news to themself',
  'suspicious: assumes the worst, keeps a hand near a weapon or the door',
  'gentle: worries for others first, apologises, offers help',
  'proud: hides fear behind contempt, hates being shown up',
  'superstitious: reads omens, mutters a prayer, touches a charm',
  'weary: has seen too much; reacts late and flat, then sharply',
  'greedy: weighs everything in coin; fear turns into bargaining',
  'excitable: loud and fast, exaggerates what they saw',
  'dry and sardonic: deflects with understatement',
  'pious: thanks or blames the gods, quotes old sayings',
  'blunt: says exactly what they think, no tact',
  'anxious: lists the worst cases out loud',
  'cold professional: notes it, files it, moves on',
  'melancholy: everything reminds them of a loss',
  'brash and young: wants to prove themself, picks fights they can’t win',
  'kindly and old: a grandparent’s air, calls people "child"',
];
