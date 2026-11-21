// Section 9 of claude/before-variety-ideas.md (Xan, 14 Nov 2026): the built-in
// jutsu list. Canon jutsu the narrator can look up: every signature jutsu of
// the cast, the Academy basics, the common jutsu of each nature, clan
// secrets, kekkei genkai, forbidden jutsu and dōjutsu powers, plus Kan's own.
// Anime-only jutsu are in when a canon character uses them; filler-arc
// villains' jutsu are not. Nothing from the Boruto era.
//
// Narrator only (jutsuList.ts sends a few each turn). Never shown as a list
// in the UI.
//
// Users are cast names exactly as the save spells them. "Name>milestone"
// means they have it only once that milestone's window has opened;
// "Name>from<until" also drops them once `until` is completed (a sword that
// changes hands, a beast taken out).

export type JutsuRank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S' | 'Forbidden' | '—';

export type JutsuType =
  | 'ninjutsu'
  | 'taijutsu'
  | 'genjutsu'
  | 'fuinjutsu'
  | 'kenjutsu'
  | 'dojutsu'
  | 'senjutsu'
  | 'medical'
  | 'summoning'
  | 'puppetry'
  | 'barrier'
  | 'weapon';

/** How it can be learned. */
export type JutsuLearning =
  /** Anyone with the nature and the skill. */
  | 'open'
  /** Only from someone who knows it (or a scroll). */
  | 'taught'
  /** A clan secret, taught inside the clan. */
  | 'clan'
  /** Needs a bloodline or a body: never learnable by watching. */
  | 'kekkei-genkai'
  /** One person's own creation or gift; nobody else has it. */
  | 'unique';

/**
 * How well its name is known. common: every shinobi knows it by name.
 * famous: known by name across the shinobi world. known: known by name in its
 * home village or clan (`home`). rare: few have heard of it. secret: almost
 * nobody alive knows it exists.
 */
export type JutsuFame = 'common' | 'famous' | 'known' | 'rare' | 'secret';

export type CanonJutsu = {
  id: string;
  /** The English name the story uses. */
  name: string;
  japanese: string;
  /** Other names it goes by (and spellings the story may use). */
  aliases?: string[];
  rank: JutsuRank;
  natures: string[];
  type: JutsuType;
  users: string[];
  /** Chakra cost in words. */
  cost: string;
  learned: JutsuLearning;
  /** What it takes: a nature, a dōjutsu, a contract, a body. */
  needs?: string;
  effect: string;
  look: string;
  fame: JutsuFame;
  /** Where `known` fame holds: a village or clan. */
  home?: string;
  /** The milestone whose window opening brings it into existence. */
  firstExists?: string;
  /** Kan's own: sent only once he has it on his list. */
  kan?: boolean;
};

type Opts = Partial<Pick<CanonJutsu, 'aliases' | 'needs' | 'home' | 'firstExists' | 'kan'>>;

const J = (
  id: string,
  name: string,
  japanese: string,
  rank: JutsuRank,
  natures: string[],
  type: JutsuType,
  users: string[],
  cost: string,
  learned: JutsuLearning,
  fame: JutsuFame,
  effect: string,
  look: string,
  opts: Opts = {}
): CanonJutsu => ({ id, name, japanese, rank, natures, type, users, cost, learned, fame, effect, look, ...opts });

// People named often below.
const ITACHI = 'Itachi Uchiha';
const SASUKE = 'Sasuke Uchiha';
const NARUTO = 'Naruto Uzumaki';
const KAKASHI = 'Kakashi Hatake';
const SAKURA = 'Sakura Haruno';
const TOBI = 'Tobi';
const MADARA = 'Madara Uchiha';

export const CANON_JUTSU: CanonJutsu[] = [
  // ------------------------------------------------------------------
  // Academy basics and universal techniques
  J('clone', 'Clone Jutsu', 'Bunshin no Jutsu', 'E', [], 'ninjutsu', [NARUTO, SASUKE, SAKURA, 'Iruka Umino', 'Mizuki'], 'trivial', 'open', 'common',
    'Illusory copies with no substance; they vanish when touched. An Academy graduation test.', 'Flat copies that flicker and cast no shadow.', { aliases: ['Bunshin'] }),
  J('transformation', 'Transformation Jutsu', 'Henge no Jutsu', 'E', [], 'ninjutsu', [NARUTO, 'Iruka Umino', 'Konohamaru Sarutobi', 'Kisame Hoshigaki'], 'trivial', 'open', 'common',
    'Take on another person’s or thing’s appearance; a hard blow or a sensor can break it.', 'A puff of white smoke and someone else stands there.', { aliases: ['Henge'] }),
  J('substitution', 'Substitution Jutsu', 'Kawarimi no Jutsu', 'E', [], 'ninjutsu', [KAKASHI, NARUTO, SASUKE, ITACHI], 'trivial', 'open', 'common',
    'Swap your body with a nearby object at the moment of a hit.', 'A log, a cloak or a rock takes the blow where the body stood.', { aliases: ['Kawarimi', 'Replacement Technique'] }),
  J('body-flicker', 'Body Flicker Technique', 'Shunshin no Jutsu', 'D', [], 'ninjutsu', ['Shisui Uchiha', ITACHI, KAKASHI, 'Gekko Hayate', 'Might Guy'], 'low', 'open', 'common',
    'High-speed short-range movement that looks like vanishing. Shisui was so good at it he was called “Shisui of the Body Flicker”.', 'A swirl of leaves, smoke or water where someone stood.', { aliases: ['Shunshin', 'Body Flicker'] }),
  J('rope-escape', 'Rope Escape Technique', 'Nawanuke no Jutsu', 'E', [], 'ninjutsu', [NARUTO, 'Iruka Umino'], 'trivial', 'open', 'common',
    'Slip out of ropes and simple bindings.', 'The rope sags around nothing.', { aliases: ['Nawanuke'] }),
  J('genjutsu-release', 'Genjutsu Release', 'Kai', 'D', [], 'genjutsu', [KAKASHI, SAKURA, 'Kurenai Yuhi', 'Shikamaru Nara'], 'low', 'open', 'common',
    'Break a genjutsu by disrupting your own chakra flow, or someone else’s with a touch. Useless against a strong Sharingan genjutsu.', 'A sharp breath, a hand sign, and the false world cracks.', {}),
  J('shadow-clone', 'Shadow Clone Technique', 'Kage Bunshin no Jutsu', 'B', [], 'ninjutsu', ['Tobirama Senju', NARUTO + '>mizuki-incident', KAKASHI, ITACHI, 'Jiraiya'], 'moderate (splits the user’s chakra evenly)', 'taught', 'famous',
    'Tobirama’s creation: real, solid clones that share the user’s chakra and send back what they learned when they vanish; their exhaustion comes back too. Dangerous for anyone without large reserves.', 'Copies step out of white smoke, solid enough to bleed, and burst into smoke when struck.', { aliases: ['Kage Bunshin', 'Shadow Clone Jutsu', 'Shadow Clones'] }),
  J('multi-shadow-clone', 'Multi Shadow Clone Technique', 'Tajū Kage Bunshin no Jutsu', 'Forbidden', [], 'ninjutsu', [NARUTO + '>mizuki-incident', 'Tobirama Senju'], 'huge (only an Uzumaki or a jinchūriki can afford it)', 'taught', 'known',
    'Hundreds or thousands of shadow clones at once; written in the Scroll of Seals and forbidden because it can kill by chakra exhaustion.', 'A clearing suddenly packed edge to edge with the same person.', { aliases: ['Tajū Kage Bunshin', 'Multiple Shadow Clone Jutsu'], home: 'leaf' }),
  J('sexy-technique', 'Sexy Technique', 'Oiroke no Jutsu', 'E', [], 'ninjutsu', [NARUTO + '>mizuki-incident', 'Konohamaru Sarutobi>team-7-formed'], 'trivial', 'unique', 'known',
    'Naruto’s prank transformation into a naked young woman wrapped in smoke. It floors perverts, the Third Hokage included.', 'A cloud of smoke with a blonde girl winking inside it.', { aliases: ['Harem Technique', 'Oiroke'], home: 'leaf' }),
  J('summoning', 'Summoning Technique', 'Kuchiyose no Jutsu', 'C', [], 'summoning', ['Jiraiya', 'Orochimaru', 'Tsunade Senju', KAKASHI, NARUTO + '>chunin-exams', SASUKE + '>sasuke-absorbs-orochimaru', 'Temari', 'Hanzō', 'Hiruzen Sarutobi'], 'moderate to huge, by the size of what comes', 'open', 'common',
    'Calls an animal one has a blood contract with: blood, the hand signs, a palm on the ground.', 'A seal spreads from the palm and a cloud of smoke bursts up with the animal inside.', { aliases: ['Kuchiyose'], needs: 'a signed contract and blood' }),
  J('shadow-shuriken', 'Shadow Shuriken', 'Kage Shuriken no Jutsu', 'C', [], 'weapon', [SASUKE, ITACHI, 'Tenten'], 'trivial', 'open', 'common',
    'A second shuriken hidden in the shadow of the first.', 'One star becomes two at the last instant.', { aliases: ['Kage Shuriken'] }),
  J('shuriken-shadow-clone', 'Shuriken Shadow Clone Technique', 'Shuriken Kage Bunshin no Jutsu', 'A', [], 'ninjutsu', ['Hiruzen Sarutobi'], 'moderate', 'taught', 'known',
    'One thrown shuriken multiplies into hundreds of real ones.', 'A single star blossoms into a storm of steel.', { aliases: ['Shuriken Kage Bunshin'], home: 'leaf' }),
  J('thousand-years-of-death', 'Thousand Years of Death', 'Sennen Goroshi', 'E', [], 'taijutsu', [KAKASHI, NARUTO + '>naruto-returns'], 'none', 'open', 'known',
    'The “Leaf’s secret finger technique”: a two-handed jab to the backside. Humiliating, not deadly.', 'Two fingers, a tiger seal, and someone launched into the air.', { aliases: ['Konoha Secret Finger Technique'], home: 'leaf' }),
  J('chakra-scalpel', 'Chakra Scalpel', 'Chakura no Mesu', 'B', [], 'medical', ['Kabuto Yakushi', 'Tsunade Senju', 'Shizune', SAKURA + '>naruto-returns'], 'low', 'taught', 'known',
    'A thin blade of chakra from the hand that cuts muscle and tendon under the skin without breaking it.', 'A faint blue edge around two fingers; the skin is unmarked, the arm goes limp.', { aliases: ['Chakra Scalpels'], needs: 'medical training and fine control', home: 'medical-nin' }),
  J('mystical-palm', 'Mystical Palm Technique', 'Shōsen Jutsu', 'A', [], 'medical', ['Tsunade Senju', 'Shizune', 'Kabuto Yakushi', 'Rin Nohara', SAKURA + '>sakura-apprentice', 'Ino Yamanaka>naruto-returns'], 'moderate', 'taught', 'common',
    'The basic medical-nin healing technique: chakra from the palms speeds the body’s own repair.', 'Soft green light over a wound, closing it slowly.', { aliases: ['Healing Palm', 'Shōsen'], needs: 'medical training and precise control' }),
  J('poison-mist', 'Poison Mist', 'Dokugiri', 'B', [], 'ninjutsu', ['Shizune'], 'low', 'taught', 'rare',
    'A cloud of poison blown from the mouth over a wide area.', 'A purple haze that spreads too fast to outrun.'),

  // ------------------------------------------------------------------
  // Tsunade, Sakura and the medical arts
  J('chakra-strength', 'Chakra-Enhanced Strength', 'Kairiki', 'A', [], 'taijutsu', ['Tsunade Senju', SAKURA + '>naruto-returns'], 'low to moderate', 'taught', 'famous',
    'Chakra gathered and released in a fist or heel at the moment of impact: monstrous strength that cracks the ground.', 'A single punch and the earth splits in a crater.', { aliases: ['Monstrous Strength', 'Cherry Blossom Impact', 'Heavenly Foot of Pain', 'Ōka Shōten', 'Tsūtenkyaku'], needs: 'perfect chakra control' }),
  J('strength-of-a-hundred', 'Strength of a Hundred Seal', 'Byakugō no In', 'S', [], 'medical', ['Tsunade Senju', 'Mito Uzumaki', SAKURA + '>ten-tails'], 'chakra stored for years', 'taught', 'known',
    'Chakra stored in the forehead over years. Released, it heals the user and fuels Creation Rebirth: the body regenerates any wound; it shortens the life.', 'A purple diamond on the forehead; black lines spread across the skin.', { aliases: ['Byakugō', 'Creation Rebirth', 'Sōzō Saisei', 'Hundred Healings'], home: 'leaf' }),

  // ------------------------------------------------------------------
  // Fire
  J('great-fireball', 'Fire Style: Great Fireball Technique', 'Katon: Gōkakyū no Jutsu', 'C', ['Fire'], 'ninjutsu', [SASUKE, ITACHI, 'Shisui Uchiha', 'Fugaku Uchiha', MADARA, TOBI, KAKASHI, 'Izuna Uchiha'], 'moderate', 'open', 'known',
    'A great ball of fire breathed from the mouth; the Uchiha’s rite of passage into adulthood.', 'A roaring orange sphere that lights the whole night.', { aliases: ['Great Fireball', 'Fireball Jutsu', 'Gōkakyū'], needs: 'Fire', home: 'uchiha' }),
  J('phoenix-flower', 'Fire Style: Phoenix Sage Fire Technique', 'Katon: Hōsenka no Jutsu', 'C', ['Fire'], 'ninjutsu', [SASUKE, ITACHI], 'low', 'open', 'known',
    'Many small guided fireballs, often hiding shuriken inside.', 'A spray of fist-sized fires curving through the air.', { aliases: ['Phoenix Flower', 'Phoenix Flower Jutsu', 'Hōsenka'], needs: 'Fire', home: 'uchiha' }),
  J('dragon-flame', 'Fire Style: Dragon Flame Technique', 'Katon: Ryūka no Jutsu', 'B', ['Fire'], 'ninjutsu', [SASUKE + '>land-of-waves'], 'moderate', 'open', 'rare',
    'Fire sent along a wire or a line straight into an opponent already caught.', 'Flame racing down a taut wire like a fuse.', { aliases: ['Dragon Flame Jutsu', 'Ryūka'], needs: 'Fire' }),
  J('fire-dragon-bullet', 'Fire Style: Fire Dragon Flame Bullet', 'Katon: Karyū Endan', 'B', ['Fire'], 'ninjutsu', ['Hiruzen Sarutobi', 'Jiraiya'], 'moderate', 'open', 'known',
    'A dragon-shaped stream of fire, often fed by another jutsu.', 'A long dragon of flame twisting toward its target.', { aliases: ['Fire Dragon Flame Bullet', 'Karyū Endan'], needs: 'Fire', home: 'leaf' }),
  J('toad-oil-flame', 'Fire Style: Toad Oil Flame Bullet', 'Katon: Gamayu Endan', 'B', ['Fire'], 'summoning', ['Jiraiya', 'Gamabunta'], 'high', 'unique', 'known',
    'Jiraiya’s fire set to oil sprayed by a toad: a river of burning oil.', 'Black oil hosed from a giant toad’s mouth and ignited into a wall of flame.', { aliases: ['Toad Oil Flame Bullet'], needs: 'the toad contract', home: 'leaf' }),
  J('great-dragon-fire', 'Fire Style: Great Dragon Fire Technique', 'Katon: Gōryūka no Jutsu', 'B', ['Fire'], 'ninjutsu', [SASUKE + '>itachi-vs-sasuke'], 'moderate', 'open', 'rare',
    'Dragon heads of fire launched into the sky, heating the air into storm clouds (Sasuke’s set-up for Kirin).', 'Fire dragons climbing into a darkening sky.', { aliases: ['Great Dragon Fire', 'Gōryūka'], needs: 'Fire' }),
  J('ash-pile-burning', 'Fire Style: Ash Pile Burning', 'Katon: Haisekishō', 'B', ['Fire'], 'ninjutsu', ['Asuma Sarutobi'], 'moderate', 'open', 'rare',
    'Burning ash breathed over an area, ignited with the click of the teeth.', 'A grey cloud that flashes into fire all at once.', { aliases: ['Burning Ash', 'Haisekishō'], needs: 'Fire' }),
  J('majestic-destroyer-flame', 'Fire Style: Majestic Destroyer Flame', 'Katon: Gōka Mekkyaku', 'A', ['Fire'], 'ninjutsu', [MADARA], 'huge', 'open', 'known',
    'Madara’s sea of fire, hundreds of metres wide. Few alive have the chakra to cast it.', 'A wall of fire rolls over the land as far as the eye goes.', { aliases: ['Majestic Destroyer Flame', 'Gōka Mekkyaku'], needs: 'Fire and enormous reserves', home: 'uchiha' }),
  J('majestic-demolisher', 'Fire Style: Majestic Demolisher Flame', 'Katon: Gōka Messhitsu', 'S', ['Fire'], 'ninjutsu', [MADARA + '>madara-revived'], 'extreme', 'open', 'rare',
    'A still larger fire than the Destroyer Flame, one that needs a whole water-release corps to stop.', 'The horizon itself catches fire.', { aliases: ['Majestic Demolisher Flame', 'Gōka Messhitsu'], needs: 'Fire and enormous reserves' }),

  // ------------------------------------------------------------------
  // Water
  J('water-dragon', 'Water Style: Water Dragon Bullet', 'Suiton: Suiryūdan no Jutsu', 'B', ['Water'], 'ninjutsu', ['Zabuza Momochi', KAKASHI, 'Kisame Hoshigaki', 'Tobirama Senju'], 'moderate (44 hand signs)', 'open', 'common',
    'A dragon of water that slams into its target; easier near a large body of water.', 'A serpent of water rearing out of a lake.', { aliases: ['Water Dragon Bullet', 'Water Dragon Jutsu', 'Suiryūdan'], needs: 'Water' }),
  J('water-prison', 'Water Style: Water Prison Technique', 'Suiton: Suirō no Jutsu', 'C', ['Water'], 'ninjutsu', ['Zabuza Momochi', 'Kisame Hoshigaki'], 'low', 'open', 'known',
    'A sphere of heavy water that traps someone; the user must keep a hand inside it.', 'A person floating inside a ball of water, held fast.', { aliases: ['Water Prison', 'Suirō'], needs: 'Water', home: 'mist' }),
  J('water-clone', 'Water Clone Technique', 'Mizu Bunshin no Jutsu', 'C', ['Water'], 'ninjutsu', ['Zabuza Momochi', 'Kisame Hoshigaki', KAKASHI], 'low', 'open', 'known',
    'Clones of water with a tenth of the user’s strength, bound to stay near.', 'A double that bursts into a splash when cut.', { aliases: ['Water Clone', 'Mizu Bunshin'], needs: 'Water', home: 'mist' }),
  J('hidden-mist', 'Hidden Mist Technique', 'Kirigakure no Jutsu', 'D', ['Water'], 'ninjutsu', ['Zabuza Momochi', 'Kisame Hoshigaki', 'Mei Terumi', 'Haku'], 'low', 'open', 'known',
    'A thick mist that blinds everyone but the user; the Mist’s silent killers work inside it.', 'White fog rolling in until a hand vanishes at arm’s length.', { aliases: ['Hidden Mist', 'Kirigakure'], needs: 'Water', home: 'mist' }),
  J('silent-killing', 'Silent Killing', 'Muon Satsujin', 'A', [], 'kenjutsu', ['Zabuza Momochi'], 'none', 'taught', 'known',
    'Killing by sound and memory inside the mist, unseen and unheard. Zabuza’s specialty.', 'Nothing at all, then a blade out of the white.', { home: 'mist' }),
  J('great-waterfall', 'Water Style: Great Waterfall Technique', 'Suiton: Daibakufu no Jutsu', 'A', ['Water'], 'ninjutsu', [KAKASHI, 'Zabuza Momochi'], 'high', 'open', 'rare',
    'A huge torrent of water that floods the field and crushes everything in it.', 'A waterfall pouring out of nowhere and sweeping the trees away.', { aliases: ['Great Waterfall', 'Daibakufu'], needs: 'Water' }),
  J('water-wall', 'Water Style: Water Formation Wall', 'Suiton: Suijinheki', 'B', ['Water'], 'ninjutsu', [KAKASHI, 'Tobirama Senju', 'Kisame Hoshigaki'], 'moderate', 'open', 'common',
    'A spinning wall of water spat out around the user as a shield.', 'A dome of water rising around a crouched figure.', { aliases: ['Water Wall', 'Suijinheki'], needs: 'Water' }),
  J('water-severing-wave', 'Water Style: Water Severing Wave', 'Suiton: Suidanha', 'A', ['Water'], 'ninjutsu', ['Tobirama Senju'], 'moderate', 'open', 'rare',
    'A thin, high-pressure jet of water that cuts like a blade.', 'A hair-fine line of water slicing a boulder in half.', { aliases: ['Water Severing Wave', 'Suidanha'], needs: 'Water' }),
  J('shark-bomb', 'Water Style: Water Shark Bomb', 'Suiton: Suikōdan no Jutsu', 'B', ['Water'], 'ninjutsu', ['Kisame Hoshigaki'], 'moderate', 'open', 'known',
    'A shark of water launched at the target.', 'A water shark leaping with its jaws open.', { aliases: ['Shark Bomb', 'Suikōdan', 'Great Shark Missile'], needs: 'Water', home: 'mist' }),
  J('exploding-water-shockwave', 'Water Style: Exploding Water Shockwave', 'Suiton: Bakusui Shōha', 'A', ['Water'], 'ninjutsu', ['Kisame Hoshigaki'], 'huge (Kisame’s tailed-beast reserves)', 'open', 'rare',
    'A flood vomited out that turns dry land into a lake to fight in.', 'Water pouring from a mouth until the field is a sea.', { aliases: ['Exploding Water Colliding Wave', 'Bakusui Shōha'], needs: 'Water and huge reserves' }),
  J('thousand-feeding-sharks', 'Water Style: Thousand Feeding Sharks', 'Suiton: Senshokuzame', 'A', ['Water'], 'ninjutsu', ['Kisame Hoshigaki'], 'high', 'unique', 'rare',
    'A thousand water sharks loosed from a flood at once.', 'The water boils with fins.', { aliases: ['Thousand Feeding Sharks', 'Senshokuzame'], needs: 'Water' }),
  J('shark-dome', 'Water Style: Water Prison Shark Dance', 'Suiton: Suirō Samekui no Jutsu', 'S', ['Water'], 'ninjutsu', ['Kisame Hoshigaki'], 'high', 'unique', 'rare',
    'A great dome of water with Kisame and his sharks inside; anyone caught is drained of chakra and drowned.', 'A hill of water with dark shapes circling inside.', { aliases: ['Shark Dance', 'Water Prison Shark Dance'], needs: 'Water' }),
  J('hydrification', 'Hydrification Technique', 'Suika no Jutsu', 'B', ['Water'], 'ninjutsu', ['Suigetsu Hozuki', 'Mangetsu Hōzuki'], 'low', 'clan', 'rare',
    'The Hōzuki clan’s body turns to water: blows pass through, and parts can be swollen or reshaped. Lightning ruins it; he dries out.', 'An arm turns to water and flows back into shape.', { aliases: ['Hōzuki hydrification'], needs: 'the Hōzuki body', home: 'mist' }),
  J('water-gun', 'Water Gun Technique', 'Teppōdama', 'C', ['Water'], 'ninjutsu', ['Suigetsu Hozuki'], 'low', 'open', 'rare',
    'A bullet of water flicked from the fingers, hard as a stone.', 'A pistol shape with the fingers and a crack like a shot.', { aliases: ['Water Gun'], needs: 'Water' }),

  // ------------------------------------------------------------------
  // Wind
  J('great-breakthrough', 'Wind Style: Great Breakthrough', 'Fūton: Daitoppa', 'C', ['Wind'], 'ninjutsu', ['Orochimaru'], 'low', 'open', 'common',
    'A huge gust of wind blown out to blast everything away.', 'Trees bending flat, dust and leaves torn loose.', { aliases: ['Great Breakthrough', 'Daitoppa'], needs: 'Wind' }),
  J('cutting-whirlwind', 'Wind Style: Cutting Whirlwind', 'Fūton: Kamaitachi no Jutsu', 'B', ['Wind'], 'ninjutsu', ['Temari'], 'moderate', 'open', 'known',
    'Blades of wind from Temari’s giant fan; the bigger the fan swing, the wider the cut.', 'A sweep of the fan and a howling gale full of invisible blades.', { aliases: ['Wind Scythe', 'Sickle Weasel Technique', 'Kamaitachi'], needs: 'Wind and a war fan', home: 'sand' }),
  J('summoning-blade-dance', 'Summoning: Blade Dance', 'Kuchiyose: Kirikiri Mai', 'B', ['Wind'], 'summoning', ['Temari'], 'moderate', 'unique', 'known',
    'Temari summons Kamatari, a one-eyed weasel with a sickle, riding a whirlwind that cuts everything in its path.', 'A small weasel in a tornado of blades.', { aliases: ['Blade Dance'], home: 'sand' }),
  J('vacuum-bullets', 'Wind Style: Vacuum Bullets', 'Fūton: Shinkūgyoku', 'B', ['Wind'], 'ninjutsu', ['Danzo Shimura'], 'moderate', 'open', 'rare',
    'Bullets of compressed air spat from the mouth in a spread.', 'Puffs that punch holes through wood.', { aliases: ['Vacuum Sphere', 'Vacuum Blast', 'Shinkūgyoku', 'Shinkūha'], needs: 'Wind' }),
  J('vacuum-great-sphere', 'Wind Style: Vacuum Great Sphere', 'Fūton: Shinkū Taigyoku', 'A', ['Wind'], 'ninjutsu', ['Danzo Shimura'], 'high', 'taught', 'secret',
    'One huge sphere of compressed wind.', 'The air ripples in a single great punch.', { aliases: ['Vacuum Great Sphere'], needs: 'Wind' }),
  J('pressure-damage', 'Wind Style: Pressure Damage', 'Fūton: Atsugai', 'A', ['Wind'], 'ninjutsu', ['Kakuzu'], 'high', 'open', 'rare',
    'A compressed storm of wind from one of Kakuzu’s masks that flattens an area.', 'A wind mask opens its mouth and the ground is scoured bare.', { aliases: ['Pressure Damage', 'Atsugai'], needs: 'Wind' }),
  J('flying-swallow', 'Wind Style: Flying Swallow', 'Fūton: Hien', 'B', ['Wind'], 'ninjutsu', ['Asuma Sarutobi'], 'low', 'open', 'rare',
    'Wind chakra flowed into a blade to lengthen and sharpen it far past its edge.', 'Asuma’s trench knives with a blue wind edge reaching past the steel.', { aliases: ['Flying Swallow', 'Chakra Blades', 'Hien'], needs: 'Wind' }),
  J('wind-sword', 'Wind Sword', 'Kaze no Yaiba', 'A', ['Wind'], 'ninjutsu', ['Baki'], 'moderate', 'taught', 'rare',
    'An invisible blade of wind that cuts from a distance; Baki killed Hayate with it.', 'A gesture of two fingers, and a cut opens across a chest.', { home: 'sand' }),
  J('wind-rasengan', 'Wind Style: Rasenshuriken', 'Fūton: Rasenshuriken', 'S', ['Wind'], 'ninjutsu', [NARUTO + '>hidan-kakuzu'], 'high', 'unique', 'famous',
    'Naruto’s Rasengan finished with Wind: a whirling shuriken-shaped Rasengan that shreds its target at the level of the cells. Before Sage Mode it can’t be thrown and damages his own arm; with Sage Mode or Kurama it can be thrown.', 'A screaming blue-white disc with a ball at its heart; where it lands, a dome of a million wind blades.', { aliases: ['Rasenshuriken', 'Rasen Shuriken', 'Sage Art: Rasenshuriken'], needs: 'the Rasengan and Wind' }),

  // ------------------------------------------------------------------
  // Lightning
  J('chidori', 'Chidori', 'Chidori', 'A', ['Lightning'], 'ninjutsu', [KAKASHI, SASUKE + '>chunin-exams'], 'high (a few a day)', 'taught', 'famous',
    'Kakashi’s only original jutsu: Lightning gathered in one hand and driven through a target at full speed. The tunnel vision at that speed needs a Sharingan to use well. Kakashi’s refined version, Lightning Blade, once cut lightning in two.', 'A hand of crackling blue-white lightning that chirps like a thousand birds.', { aliases: ['Lightning Blade', 'Raikiri', 'One Thousand Birds'], needs: 'Lightning' }),
  J('chidori-variants', 'Chidori Current', 'Chidori Nagashi', 'A', ['Lightning'], 'ninjutsu', [SASUKE + '>sasuke-rescue'], 'moderate', 'unique', 'rare',
    'Sasuke’s own variations: lightning flowed through his whole body (Chidori Current) to stun anyone touching him, and the Chidori shaped into a spear, senbon or a blade along his sword.', 'Lightning running over his skin; a sword glowing white.', { aliases: ['Chidori Nagashi', 'Chidori Sharp Spear', 'Chidori Senbon', 'Chidori Katana'], needs: 'the Chidori' }),
  J('kirin', 'Kirin', 'Kirin', 'S', ['Lightning'], 'ninjutsu', [SASUKE + '>itachi-vs-sasuke'], 'low (nature supplies the power)', 'unique', 'secret',
    'Sasuke brings real lightning down from storm clouds he heated with fire: unavoidable, over in an instant.', 'A beast of lightning falling from the sky, a white flash, a crater.', { needs: 'Lightning and storm clouds' }),
  J('lightning-hound', 'Lightning Style: Lightning Beast Running', 'Raiton: Raijū Hashiri no Jutsu', 'A', ['Lightning'], 'ninjutsu', [KAKASHI + '>naruto-returns'], 'high', 'unique', 'rare',
    'A hound of lightning that runs down its target.', 'A crackling dog leaping from Kakashi’s hand.', { aliases: ['Lightning Hound', 'Lightning Beast Running'], needs: 'Lightning' }),
  J('purple-lightning', 'Purple Lightning', 'Shiden', 'A', ['Lightning'], 'ninjutsu', [KAKASHI + '>kakashi-hokage'], 'moderate', 'unique', 'rare',
    'Kakashi’s replacement for the Chidori once he lost the Sharingan.', 'Lightning tinted violet around his hand.', { aliases: ['Shiden'], needs: 'Lightning' }),
  J('lightning-armor', 'Lightning Release Chakra Mode', 'Raiton no Yoroi', 'S', ['Lightning'], 'ninjutsu', ['A'], 'high', 'taught', 'known',
    'The Raikage’s armour of lightning: it speeds the nerves and makes the body nearly untouchable.', 'Lightning sheeting off the body, hair standing up.', { aliases: ['Lightning Armor', 'Lightning Release Armour'], needs: 'Lightning', home: 'cloud' }),
  J('lariat', 'Lariat', 'Rariatto', 'A', ['Lightning'], 'taijutsu', ['A', 'Killer Bee'], 'moderate', 'taught', 'known',
    'A clothesline at lightning speed. A and Bee together: the Double Lariat.', 'A forearm like a falling tree.', { aliases: ['Double Lariat', 'Liger Bomb', 'Lightning Release: Lariat'], home: 'cloud' }),
  J('black-panther', 'Lightning Style: Black Panther', 'Raiton: Kuro Pansā', 'A', ['Lightning'], 'ninjutsu', ['Darui'], 'moderate', 'unique', 'rare',
    'Black lightning shaped into a panther.', 'A black cat of lightning loping at the enemy.', { aliases: ['Black Panther'], needs: 'Lightning', home: 'cloud' }),
  J('laser-circus', 'Storm Release: Laser Circus', 'Ranton: Rēzā Sākasu', 'A', ['Storm'], 'ninjutsu', ['Darui'], 'high', 'kekkei-genkai', 'rare',
    'Storm Release, Water and Lightning together: many beams of light that bend and chase their targets.', 'A fan of bright beams curving through the air.', { aliases: ['Laser Circus', 'Storm Release'], needs: 'Storm Release (Water + Lightning)', home: 'cloud' }),
  J('false-darkness', 'Lightning Style: False Darkness', 'Raiton: Gian', 'A', ['Lightning'], 'ninjutsu', ['Kakuzu'], 'high', 'open', 'rare',
    'A spear of lightning from one of Kakuzu’s masks that can pierce several people.', 'A black-white bolt lancing out of a mask.', { aliases: ['False Darkness', 'Gian'], needs: 'Lightning' }),

  // ------------------------------------------------------------------
  // Earth
  J('earth-wall', 'Earth Style: Earth Wall', 'Doton: Doryūheki', 'B', ['Earth'], 'ninjutsu', [KAKASHI, 'Jiraiya', 'Yamato'], 'moderate', 'open', 'common',
    'A wall of earth spat or raised up for cover.', 'Rock heaving up in front of someone.', { aliases: ['Earth Wall', 'Mud Wall', 'Doryūheki'], needs: 'Earth' }),
  J('headhunter', 'Earth Style: Headhunter Technique', 'Doton: Shinjū Zanshu no Jutsu', 'D', ['Earth'], 'ninjutsu', [KAKASHI], 'low', 'open', 'common',
    'Move through the ground and drag an enemy down into it to the neck.', 'A hand closes on an ankle from the soil; only a head is left above ground.', { aliases: ['Headhunter', 'Double Suicide Decapitation'], needs: 'Earth' }),
  J('earth-dragon', 'Earth Style: Earth Dragon Bullet', 'Doton: Doryūdan', 'B', ['Earth'], 'ninjutsu', ['Jiraiya', 'Tobirama Senju'], 'moderate', 'open', 'common',
    'A dragon of earth that spits mud bullets; often paired with fire.', 'A mud dragon rising and firing clods hard as stone.', { aliases: ['Earth Dragon Bullet', 'Doryūdan'], needs: 'Earth' }),
  J('earth-rampart', 'Earth Style: Earth Flow Rampart', 'Doton: Doryū Jōheki', 'A', ['Earth'], 'ninjutsu', ['Onoki', 'Kitsuchi', 'Hiruzen Sarutobi'], 'high', 'open', 'known',
    'A rampart of earth the size of a fortress wall.', 'A ridge of rock rising out of open ground.', { aliases: ['Earth Flow Rampart', 'Earth Release Rampart', 'Doryū Jōheki'], needs: 'Earth', home: 'stone' }),
  J('hiding-in-rock', 'Earth Style: Hiding in Rock Technique', 'Doton: Iwagakure no Jutsu', 'C', ['Earth'], 'ninjutsu', ['Mū', 'Kitsuchi'], 'low', 'open', 'known',
    'Merge into rock to hide or travel through it.', 'Someone sinking into a cliff face like water.', { aliases: ['Hiding in Rock', 'Iwagakure'], needs: 'Earth', home: 'stone' }),
  J('swamp-of-the-underworld', 'Earth Style: Swamp of the Underworld', 'Doton: Yomi Numa', 'A', ['Earth'], 'ninjutsu', ['Jiraiya'], 'high', 'open', 'rare',
    'The ground under the enemy turns to a bottomless swamp.', 'A huge snake sinking into black mud.', { aliases: ['Swamp of the Underworld', 'Yomi Numa'], needs: 'Earth' }),
  J('weight-rock', 'Earth Style: Light and Added Weight Rock', 'Doton: Keijūgan / Kajūgan', 'B', ['Earth'], 'ninjutsu', ['Onoki', 'Kurotsuchi', 'Akatsuchi'], 'moderate', 'taught', 'known',
    'The Tsuchikage’s weight jutsu: make yourself or anything light enough to fly, or so heavy it is pinned to the ground.', 'A mountain lifted on an old man’s fingertips; a man crushed flat by his own weight.', { aliases: ['Light Weight Rock', 'Added Weight Rock', 'Keijūgan', 'Kajūgan'], needs: 'Earth', home: 'stone' }),
  J('rock-golem', 'Earth Style: Rock Golem', 'Doton: Gōremu no Jutsu', 'B', ['Earth'], 'ninjutsu', ['Akatsuchi', 'Onoki'], 'moderate', 'open', 'known',
    'A giant golem of rock that fights for its maker.', 'A hulking stone man pulling itself out of the ground.', { aliases: ['Golem', 'Rock Golem'], needs: 'Earth', home: 'stone' }),
  J('earth-spear', 'Earth Style: Earth Spear', 'Doton: Domu', 'B', ['Earth'], 'ninjutsu', ['Kakuzu'], 'moderate', 'open', 'rare',
    'Hardens the body like stone against blows, at the cost of speed. Lightning cuts through it.', 'Skin gone dark grey; a blade snaps against it.', { aliases: ['Earth Spear', 'Domu'], needs: 'Earth' }),
  J('earth-dome-prison', 'Earth Style: Barrier: Earth Dome Prison', 'Doton: Kekkai: Doromu', 'B', ['Earth'], 'barrier', ['Jirobo'], 'moderate', 'unique', 'rare',
    'A dome of rock over the enemies that drains their chakra through its walls into Jirobo.', 'Four men trapped in a stone dome, sweating, weaker by the minute.', { aliases: ['Earth Dome Prison'], needs: 'Earth' }),
  J('dust-release', 'Dust Release: Detachment of the Primitive World', 'Jinton: Genkai Hakuri no Jutsu', 'S', ['Dust'], 'ninjutsu', ['Onoki', 'Mū'], 'high', 'kekkei-genkai', 'famous',
    'Earth, Fire and Wind at once: a translucent shape that erases whatever it touches down to the atoms. The Tsuchikage’s pride.', 'A white cube or cone, then nothing where the target stood.', { aliases: ['Dust Release', 'Particle Style', 'Jinton', 'Detachment of the Primitive World'], needs: 'Dust Release (a kekkei tōta: Earth + Fire + Wind)', home: 'stone' }),
  J('transparency', 'Transparency Technique', 'Toton no Jutsu', 'A', [], 'ninjutsu', ['Mū'], 'moderate', 'unique', 'rare',
    'The Second Tsuchikage’s invisibility: no scent, no sound, no chakra a sensor can find.', 'Nothing to see; the ground dents where he walks.', { aliases: ['Transparency'], home: 'stone' }),

  // ------------------------------------------------------------------
  // Advanced and kekkei genkai natures
  J('lava-release-mei', 'Lava Style: Melting Apparition', 'Yōton: Yōkai no Jutsu', 'A', ['Lava'], 'ninjutsu', ['Mei Terumi'], 'high', 'kekkei-genkai', 'known',
    'Mei’s acid lava spat out in a flood that melts rock and flesh.', 'A glowing orange gush that eats through stone.', { aliases: ['Lava Release', 'Melting Apparition'], needs: 'Lava Release (Fire + Earth)', home: 'mist' }),
  J('boil-release-mei', 'Boil Style: Skilled Mist Technique', 'Futton: Kōmu no Jutsu', 'A', ['Boil'], 'ninjutsu', ['Mei Terumi'], 'moderate', 'kekkei-genkai', 'known',
    'An acid mist that melts anything it settles on; its strength can be tuned.', 'A pale mist, and skin beginning to smoke.', { aliases: ['Boil Release', 'Skilled Mist', 'Solid Fog'], needs: 'Boil Release (Fire + Water)', home: 'mist' }),
  J('quicklime', 'Lava Style: Quicklime Congealing', 'Yōton: Sekkaigyō no Jutsu', 'A', ['Lava'], 'ninjutsu', ['Kurotsuchi'], 'moderate', 'kekkei-genkai', 'rare',
    'Quicklime spat out that sets solid as soon as water touches it.', 'Grey paste hardening around a body into stone.', { aliases: ['Quicklime Congealing'], needs: 'Lava Release', home: 'stone' }),
  J('lava-chakra-mode', 'Lava Release Chakra Mode', 'Yōton Chakura Mōdo', 'S', ['Lava'], 'ninjutsu', ['Roshi', 'Son Gokū'], 'high', 'kekkei-genkai', 'rare',
    'Roshi, host of the Four-Tails, coats himself in molten lava from the beast’s chakra.', 'A man glowing orange from the inside, rock melting under his feet.', { aliases: ['Lava Release Armour'], needs: 'Lava Release and the Four-Tails', home: 'stone' }),
  J('boil-armor', 'Boil Release: Unrivalled Strength', 'Futton: Kōkō no Jutsu', 'S', ['Boil'], 'ninjutsu', ['Han', 'Kokuō'], 'high', 'kekkei-genkai', 'rare',
    'Han, host of the Five-Tails, vents boiling steam through his armour to power monstrous blows.', 'Steam screaming from vents in red armour.', { aliases: ['Steam armour', 'Steam Release'], needs: 'Boil Release and the Five-Tails', home: 'stone' }),
  // Added v1.25.12: the anime's Crystal Release (Guren), the Second Mizukage's clam, Kabuto's teammates.
  J('crystal-release', 'Crystal Release', 'Shōton', 'A', ['Crystal'], 'ninjutsu', ['Guren'], 'moderate', 'kekkei-genkai', 'rare',
    'Guren turns moisture and matter into pink crystal: blades, shuriken, walls, a dome that seals a man inside, and slow crystal that creeps over a body and locks it. Anime only.', 'Hexagonal pink crystal spreading over the ground with a ringing sound.', { aliases: ['Crystal Style', 'Crystal Pillar Prison', 'Crystal Release: Hexagonal Crystal'], needs: 'Crystal Release (a bloodline)' }),
  J('steam-imp', 'Steam Imp', 'Jōkimeikō', 'S', ['Water'], 'ninjutsu', ['Gengetsu Hōzuki'], 'high', 'unique', 'rare',
    'The Second Mizukage’s giant clam breathes a mirage of himself, and a steam imp that swells and explodes when struck; he fights from inside the illusion.', 'A huge clam on the ground breathing out a shimmering double.', { aliases: ['Clam mirage', 'Hōzuki clam'], needs: 'the clam and Gengetsu’s training', home: 'mist' }),
  J('chakra-absorption-palm', 'Chakra Absorption Palm', 'Chakra Kyūin', 'B', [], 'ninjutsu', ['Yoroi Akadō'], 'low', 'taught', 'rare',
    'Yoroi’s palms drain chakra from whoever he grips; the longer the hold, the weaker the victim.', 'A hand clamped on a head, the victim sagging.', { aliases: ['Yoroi’s drain'] }),
  J('soft-physique', 'Soft Physique Modification', 'Nan Kaizō', 'B', [], 'ninjutsu', ['Misumi Tsurugi'], 'low', 'taught', 'rare',
    'Misumi dislocates and softens his joints to stretch and coil around an enemy like a snake, crushing until something breaks.', 'Arms lengthening and wrapping round a body twice.', { aliases: ['Misumi’s coil'] }),
  J('ice-mirrors', 'Secret Technique: Demonic Mirroring Ice Crystals', 'Hijutsu: Makyō Hyōshō', 'A', ['Ice'], 'ninjutsu', ['Haku'], 'high', 'kekkei-genkai', 'rare',
    'A dome of ice mirrors around the target; Haku moves between them faster than the eye and strikes from all sides with senbon.', 'A ring of mirrors, a masked face in every one.', { aliases: ['Ice Mirrors', 'Demonic Ice Mirrors', 'Makyō Hyōshō'], needs: 'Ice Release (Water + Wind)', home: 'mist' }),
  J('thousand-needles', 'Secret Technique: A Thousand Needles of Death', 'Hijutsu: Sensatsu Suishō', 'B', ['Ice'], 'ninjutsu', ['Haku'], 'moderate', 'kekkei-genkai', 'rare',
    'Water turned to a thousand ice needles that close on a target from every side.', 'Splashed water freezing into a ring of needles.', { aliases: ['Thousand Needles of Death'], needs: 'Ice Release', home: 'mist' }),

  // ------------------------------------------------------------------
  // Wood
  J('deep-forest-emergence', 'Wood Style: Deep Forest Emergence', 'Mokuton: Jukai Kōtan', 'S', ['Wood'], 'ninjutsu', ['Hashirama Senju', MADARA + '>madara-revived'], 'huge', 'kekkei-genkai', 'famous',
    'Hashirama’s forest: a whole forest erupts out of the ground to crush and bind an army.', 'Trees bursting up in seconds, swallowing a valley.', { aliases: ['Deep Forest Emergence', 'Wood Release', 'Mokuton'], needs: 'Wood Release (Hashirama’s cells)' }),
  J('wood-dragon', 'Wood Style: Wood Dragon Technique', 'Mokuton: Mokuryū no Jutsu', 'S', ['Wood'], 'ninjutsu', ['Hashirama Senju', 'Yamato>war-begins'], 'huge', 'kekkei-genkai', 'known',
    'A dragon of wood that binds and drains even a tailed beast’s chakra.', 'A wooden dragon coiling around a beast and squeezing.', { aliases: ['Wood Dragon'], needs: 'Wood Release', home: 'leaf' }),
  J('wood-golem', 'Wood Style: Wood Golem', 'Mokuton: Mokujin no Jutsu', 'S', ['Wood'], 'ninjutsu', ['Hashirama Senju', MADARA + '>madara-revived'], 'huge', 'kekkei-genkai', 'known',
    'A giant wooden warrior; Hashirama’s answer to the Nine-Tails.', 'A wooden titan with a face like a temple guardian.', { aliases: ['Wood Golem', 'Wooden Golem', 'Mokujin'], needs: 'Wood Release', home: 'leaf' }),
  J('true-thousand-hands', 'Sage Art: True Several Thousand Hands', 'Senpō: Shinsūsenju', 'S', ['Wood'], 'senjutsu', ['Hashirama Senju>hokage-edo'], 'extreme', 'unique', 'famous',
    'Hashirama’s Sage Mode masterpiece: a Buddha of wood a mountain high with thousands of fists.', 'A colossal statue rising behind the clouds, its arms raining down.', { aliases: ['True Several Thousand Hands', 'Shinsūsenju'], needs: 'Wood Release and Sage Mode', home: 'leaf' }),
  J('four-pillar-prison', 'Wood Style: Four Pillar Prison', 'Mokuton: Shichūrō no Jutsu', 'A', ['Wood'], 'ninjutsu', ['Yamato', 'Hashirama Senju'], 'moderate', 'kekkei-genkai', 'known',
    'A cage of thick wooden pillars around the target. Yamato also builds houses and bridges in a minute (Four Pillar House).', 'Wooden bars slamming shut from the earth.', { aliases: ['Four Pillar Prison', 'Four Pillar House', 'Wood Clone'], needs: 'Wood Release', home: 'leaf' }),
  J('hokage-style-restraint', 'Hokage-Style Restraint', 'Mokuton: Kakuan Nitten Suishu', 'A', ['Wood'], 'ninjutsu', ['Yamato', 'Hashirama Senju'], 'moderate', 'kekkei-genkai', 'rare',
    'Wood that suppresses a tailed beast’s chakra in its host; the necklace and the First’s gift help.', 'Wooden pillars locking a raging host in place.', { aliases: ['Hashirama’s restraint'], needs: 'Wood Release', home: 'leaf' }),

  // ------------------------------------------------------------------
  // Leaf clans
  J('shadow-possession', 'Shadow Possession Technique', 'Kagemane no Jutsu', 'C', ['Yin'], 'ninjutsu', ['Shikamaru Nara', 'Shikaku Nara'], 'moderate (grows with time held)', 'clan', 'known',
    'The Nara stretch their shadow to join another’s; the caught one must copy every move.', 'A shadow sliding across the ground like spilled ink and locking onto another’s.', { aliases: ['Shadow Imitation', 'Kagemane', 'Shadow Paralysis'], needs: 'the Nara clan’s teaching', home: 'leaf' }),
  J('shadow-neck-bind', 'Shadow Neck Binding', 'Kage Kubi Shibari no Jutsu', 'B', ['Yin'], 'ninjutsu', ['Shikamaru Nara', 'Shikaku Nara'], 'high', 'clan', 'known',
    'A shadow hand that climbs a caught body to the throat and strangles.', 'Black fingers crawling up a body toward the neck.', { aliases: ['Shadow Strangle', 'Shadow Neck Bind'], home: 'leaf' }),
  J('shadow-sewing', 'Shadow Sewing Technique', 'Kage Nui no Jutsu', 'B', ['Yin'], 'ninjutsu', ['Shikamaru Nara>naruto-returns', 'Shikaku Nara'], 'high', 'clan', 'rare',
    'Shadow threads that pierce and stitch through a target.', 'Needles of shadow shooting up from the ground.', { aliases: ['Shadow Stitching', 'Kage Nui'], home: 'leaf' }),
  J('mind-transfer', 'Mind Body Switch Technique', 'Shintenshin no Jutsu', 'B', ['Yin'], 'ninjutsu', ['Ino Yamanaka', 'Inoichi Yamanaka', 'Fū Yamanaka'], 'moderate', 'clan', 'known',
    'The Yamanaka send their mind into another’s body and control it; their own body lies empty, and harm to the host reaches them.', 'A hand sign like a window; the target stiffens, then speaks with another’s voice.', { aliases: ['Mind Transfer', 'Shintenshin'], home: 'leaf' }),
  J('mind-transmission', 'Mind Transmission', 'Shinden Shin', 'B', ['Yin'], 'ninjutsu', ['Inoichi Yamanaka', 'Ino Yamanaka>war-begins'], 'moderate', 'clan', 'rare',
    'The Yamanaka link many minds so they can speak without words across a battlefield; Inoichi also reads memories.', 'A hand on a skull; eyes going distant.', { aliases: ['Mind Reading', 'Mind Link'], home: 'leaf' }),
  J('expansion', 'Expansion Technique', 'Baika no Jutsu', 'C', [], 'ninjutsu', ['Choji Akimichi', 'Choza Akimichi'], 'moderate (burns calories)', 'clan', 'known',
    'The Akimichi grow their body, or a part of it, to giant size.', 'A fist the size of a cart; a boy suddenly as wide as a house.', { aliases: ['Multi-Size Technique', 'Baika', 'Super Multi-Size'], home: 'leaf' }),
  J('human-boulder', 'Human Bullet Tank', 'Nikudan Sensha', 'C', [], 'taijutsu', ['Choji Akimichi', 'Choza Akimichi'], 'moderate', 'clan', 'known',
    'Expanded into a ball and rolling at high speed, crushing everything.', 'A spinning ball of a man ploughing a trench through the forest.', { aliases: ['Human Boulder', 'Meat Tank', 'Nikudan Sensha'], home: 'leaf' }),
  J('butterfly-mode', 'Butterfly Chōji Mode', 'Chō Mōdo', 'S', [], 'ninjutsu', ['Choji Akimichi>pain-assault', 'Choza Akimichi'], 'huge (the red pill burns the body’s fat)', 'clan', 'rare',
    'The Akimichi’s three pills; the red one turns calories into chakra wings of a butterfly and enormous strength, at a deadly cost.', 'Glowing butterfly wings of chakra on a suddenly thin body.', { aliases: ['Butterfly Mode', 'Three Coloured Pills', 'Butterfly Bullet Bombing'], home: 'leaf' }),
  J('fang-over-fang', 'Fang Over Fang', 'Gatsūga', 'C', [], 'taijutsu', ['Kiba Inuzuka', 'Akamaru', 'Tsume Inuzuka', 'Hana Inuzuka'], 'moderate', 'clan', 'known',
    'An Inuzuka and their ninken spinning like twin drills into the enemy.', 'Two grey tornadoes tearing up the ground.', { aliases: ['Passing Fang', 'Gatsūga', 'Tsūga'], needs: 'a ninken partner', home: 'leaf' }),
  J('man-beast-clone', 'Man Beast Clone', 'Jūjin Bunshin', 'C', [], 'ninjutsu', ['Kiba Inuzuka', 'Akamaru', 'Tsume Inuzuka', 'Hana Inuzuka'], 'low', 'clan', 'known',
    'The ninken turns into a copy of its master; with Four Legs (Shikyaku) the master turns feral, fast and clawed.', 'Two identical wild boys, fangs out.', { aliases: ['Beast Human Clone', 'Four Legs Technique', 'Shikyaku'], home: 'leaf' }),
  J('parasitic-insects', 'Parasitic Destruction Insects', 'Kikaichū', 'B', [], 'ninjutsu', ['Shino Aburame', 'Torune Aburame', 'Shibi Aburame'], 'low', 'clan', 'known',
    'The Aburame host insects in their bodies that eat chakra, track, swarm and form clones. Torune’s nano-sized insects poison by touch.', 'A black buzzing cloud pouring out of sleeves.', { aliases: ['Kikaichū', 'Insect Clone', 'Bug Clone', 'Secret Technique: Insect Jar'], needs: 'the Aburame body', home: 'leaf' }),
  J('gentle-fist', 'Gentle Fist', 'Jūken', 'B', [], 'taijutsu', ['Neji Hyuga', 'Hinata Hyuga', 'Hiashi Hyuga', 'Hanabi Hyuga', 'Hizashi Hyuga'], 'low', 'clan', 'known',
    'The Hyūga strike the chakra network inside the body; a light touch damages organs and closes chakra points. Needs the Byakugan to see the points.', 'Open-palm strikes that barely seem to land; the target coughs blood.', { aliases: ['Jūken', 'Gentle Fist Style'], needs: 'the Byakugan', home: 'leaf' }),
  J('sixty-four-palms', 'Eight Trigrams Sixty-Four Palms', 'Hakke Rokujūyon Shō', 'A', [], 'taijutsu', ['Neji Hyuga', 'Hiashi Hyuga', 'Hinata Hyuga'], 'moderate', 'clan', 'known',
    'Sixty-four strikes in a burst that close the target’s chakra points, leaving them unable to mould chakra. Hinata’s guarding version is the Protection of the Eight Trigrams Sixty-Four Palms.', 'A trigram drawn on the ground, then hands moving too fast to count.', { aliases: ['Sixty-Four Palms', '64 Palms', 'Hakke Rokujūyon Shō', 'Protection of the Eight Trigrams'], needs: 'the Byakugan', home: 'leaf' }),
  J('rotation', 'Eight Trigrams Palm Rotation', 'Hakkeshō Kaiten', 'A', [], 'taijutsu', ['Neji Hyuga', 'Hiashi Hyuga'], 'moderate', 'clan', 'known',
    'Chakra released from every point of the body while spinning: a perfect dome-shaped defence. A main-house secret Neji learned alone.', 'A spinning blue dome; kunai bouncing off it.', { aliases: ['Palm Rotation', 'Kaiten', 'Heavenly Spin'], needs: 'the Byakugan', home: 'leaf' }),
  J('air-palm', 'Eight Trigrams Vacuum Palm', 'Hakke Kūshō', 'B', [], 'taijutsu', ['Neji Hyuga', 'Hiashi Hyuga', 'Hinata Hyuga>war-begins'], 'low', 'clan', 'rare',
    'A palm strike that hits from a distance with a blast of chakra.', 'A thrust palm and someone thrown back metres away.', { aliases: ['Air Palm', 'Vacuum Palm'], home: 'leaf' }),
  J('twin-lion-fists', 'Gentle Step Twin Lion Fists', 'Jūho Sōshiken', 'A', [], 'taijutsu', ['Hinata Hyuga>pain-assault'], 'moderate', 'unique', 'rare',
    'Hinata’s own: her chakra shaped into two lion heads around her fists.', 'Two blue lions roaring around small hands.', { aliases: ['Twin Lion Fists'], needs: 'the Byakugan', home: 'leaf' }),
  J('leaf-whirlwind', 'Leaf Whirlwind', 'Konoha Senpū', 'D', [], 'taijutsu', ['Rock Lee', 'Might Guy'], 'none', 'open', 'known',
    'A spinning combination of high and low kicks.', 'A blur of a spin, one heel high and one sweep low.', { aliases: ['Leaf Hurricane', 'Konoha Senpū', 'Leaf Rising Wind'], home: 'leaf' }),
  J('dynamic-entry', 'Dynamic Entry', 'Dainamikku Entorī', 'E', [], 'taijutsu', ['Might Guy', 'Rock Lee'], 'none', 'open', 'known',
    'Guy’s flying kick into a fight, preferably in someone’s face.', 'A green blur and a foot.', { home: 'leaf' }),
  J('drunken-fist', 'Drunken Fist', 'Suiken', 'D', [], 'taijutsu', ['Rock Lee'], 'none', 'open', 'rare',
    'Lee drunk on a sip of sake fights in an unpredictable, unstoppable style he remembers nothing of.', 'Swaying, hiccupping, and impossible to hit.', { home: 'leaf' }),
  J('lion-combo', 'Lion Combo', 'Shishi Rendan', 'B', [], 'taijutsu', [SASUKE + '>chunin-exams'], 'none', 'unique', 'rare',
    'Sasuke’s combination copied from Lee’s Shadow of the Dancing Leaf: kick them skyward, follow them up, smash them down.', 'A body spinning in the air and slammed into the stone.', { aliases: ['Lion’s Barrage', 'Shishi Rendan'], home: 'leaf' }),
  J('naruto-barrage', 'Uzumaki Barrage', 'Uzumaki Naruto Rendan', 'C', [], 'taijutsu', [NARUTO], 'low', 'unique', 'rare',
    'Shadow clones kicking the enemy up into the air and down again, shouting U-ZU-MA-KI.', 'Four orange boys and one heel drop.', { aliases: ['Naruto Uzumaki Barrage', 'Uzumaki Naruto Rendan'], home: 'leaf' }),
  J('twin-rising-dragons', 'Twin Rising Dragons', 'Sōshōryū', 'B', [], 'weapon', ['Tenten'], 'low', 'unique', 'rare',
    'Two scrolls spiralling up like dragons, and a rain of every weapon inside them.', 'Two paper serpents in the air, steel pouring from them.', { aliases: ['Rising Twin Dragons', 'Sōshōryū'], home: 'leaf' }),
  J('crescent-moon-dance', 'Dance of the Crescent Moon', 'Mikazuki no Mai', 'B', [], 'kenjutsu', ['Gekko Hayate'], 'low', 'taught', 'rare',
    'Three bodies (two of them shadow clones) striking with the sword at once in the moonlight.', 'Three swords coming from three sides under a crescent moon.', { home: 'leaf' }),
  J('tree-binding', 'Demonic Illusion: Tree Binding Death', 'Magen: Jubaku Satsu', 'A', ['Yin'], 'genjutsu', ['Kurenai Yuhi'], 'moderate', 'taught', 'known',
    'Kurenai’s genjutsu: the victim feels a tree grow around them and hold them fast while she strikes for real.', 'Branches curling around a body that isn’t moving at all.', { aliases: ['Tree Binding Death', 'Jubaku Satsu'], home: 'leaf' }),
  J('hell-viewing', 'Demonic Illusion: Hell Viewing Technique', 'Magen: Narakumi no Jutsu', 'D', ['Yin'], 'genjutsu', [KAKASHI], 'low', 'open', 'common',
    'Shows the target their worst fear.', 'Leaves swirl, and their face goes white.', { aliases: ['Hell Viewing', 'Narakumi'] }),
  J('temple-of-nirvana', 'Temple of Nirvana Technique', 'Nehan Shōja no Jutsu', 'A', ['Yin'], 'genjutsu', ['Kabuto Yakushi'], 'moderate', 'open', 'rare',
    'A wide genjutsu of falling feathers that puts everyone who doesn’t dispel it to sleep.', 'White feathers drifting down over a stadium and the crowd slumping.', { aliases: ['Temple of Nirvana'] }),
  J('ninken-summoning', 'Summoning: Earth Style: Tracking Fang', 'Kuchiyose: Doton: Tsuiga no Jutsu', 'B', ['Earth'], 'summoning', [KAKASHI, 'Pakkun'], 'moderate', 'unique', 'known',
    'Kakashi’s eight ninken burst from the ground, following his blood scent on his kunai, and pin the enemy.', 'Dogs erupting out of the soil and clamping on arms and legs.', { aliases: ['Tracking Fang', 'Kakashi’s dogs', 'Kakashi’s ninken'], home: 'leaf' }),

  // ------------------------------------------------------------------
  // The Eight Gates
  J('eight-gates', 'Eight Inner Gates', 'Hachimon Tonkō', 'Forbidden', [], 'taijutsu', ['Might Guy', 'Rock Lee'], 'the body pays: torn muscles, exhaustion; the eighth gate kills', 'taught', 'known',
    'Opening the body’s limiters one by one for strength and speed far past normal: the Gate of Opening, Healing, Life, Pain, Limit, View, Wonder and Death.', 'Skin flushing red, then green steam as the Gates open; the ground craters where they push off.', { aliases: ['Eight Gates', 'Hachimon'], home: 'leaf' }),
  J('primary-lotus', 'Front Lotus', 'Omote Renge', 'B', [], 'taijutsu', ['Rock Lee', 'Might Guy'], 'the first gate', 'taught', 'known',
    'Kick them high, wrap them in bandages and spin them head-first into the ground.', 'A spinning drill of two bodies hitting the earth.', { aliases: ['Primary Lotus', 'Omote Renge'], home: 'leaf' }),
  J('hidden-lotus', 'Reverse Lotus', 'Ura Renge', 'A', [], 'taijutsu', ['Rock Lee', 'Might Guy'], 'three to five gates', 'taught', 'known',
    'A barrage of blows in the air at the speed of the opened gates, then a final strike.', 'A body bouncing through the air, struck from every side by one blur.', { aliases: ['Hidden Lotus', 'Ura Renge'], home: 'leaf' }),
  J('morning-peacock', 'Morning Peacock', 'Asa Kujaku', 'A', [], 'taijutsu', ['Might Guy', 'Rock Lee>war-begins'], 'the sixth gate', 'taught', 'rare',
    'Punches so fast the air catches fire, fanning out like a peacock’s tail.', 'A fan of fiery fists blooming outwards.', { aliases: ['Asa Kujaku'], home: 'leaf' }),
  J('daytime-tiger', 'Daytime Tiger', 'Hirudora', 'S', [], 'taijutsu', ['Might Guy'], 'the seventh gate', 'taught', 'rare',
    'A single compressed blast of air from one punch, in the shape of a tiger.', 'A tiger of air roaring out of one fist and blowing the water away.', { aliases: ['Hirudora', 'Afternoon Tiger'], home: 'leaf' }),
  J('night-guy', 'Night Guy', 'Yagai', 'Forbidden', [], 'taijutsu', ['Might Guy>gai-night-guy'], 'the eighth gate: death', 'taught', 'secret',
    'The Gate of Death: Evening Elephant’s strikes and then Night Guy, a kick that bends space. It breaks Madara and burns the body to ash.', 'Blood-red steam like a dragon; time seems to stop.', { aliases: ['Evening Elephant', 'Sekizō', 'Eight Gates Released Formation'], home: 'leaf' }),

  // ------------------------------------------------------------------
  // Dōjutsu: Sharingan, Mangekyō, Rinnegan, Byakugan
  J('sharingan', 'Sharingan', 'Sharingan', '—', [], 'dojutsu', [ITACHI, SASUKE + '>land-of-waves', KAKASHI, 'Shisui Uchiha', 'Fugaku Uchiha', MADARA, TOBI, 'Danzo Shimura', 'Izuna Uchiha', 'Kagami Uchiha'], 'a steady drain (heavy for a non-Uchiha like Kakashi)', 'kekkei-genkai', 'common',
    'The Uchiha’s eyes: they read movement, see chakra by colour, copy jutsu on sight, and cast genjutsu through a look. One to three tomoe.', 'Red irises with black tomoe turning.', { aliases: ['Copy Wheel Eye', 'the Sharingan'], needs: 'Uchiha blood (or an implanted eye)' }),
  J('sharingan-genjutsu', 'Sharingan Genjutsu', 'Magen: Kyōten Chiten', 'B', ['Yin'], 'genjutsu', [ITACHI, 'Shisui Uchiha', MADARA, TOBI, SASUKE + '>sasuke-rescue'], 'low', 'kekkei-genkai', 'known',
    'Genjutsu cast through eye contact: hypnosis, paralysis, or a mirror turning someone’s own genjutsu back on them.', 'Turning tomoe, then a body that stops dead.', { aliases: ['Sharingan hypnosis', 'Mirror Heaven and Earth Change'], needs: 'the Sharingan', home: 'uchiha' }),
  J('mangekyo', 'Mangekyō Sharingan', 'Mangekyō Sharingan', '—', [], 'dojutsu', [ITACHI, 'Shisui Uchiha', TOBI, MADARA, KAKASHI, SASUKE + '>masked-man-truth'], 'huge; every use drives the eyes toward blindness', 'kekkei-genkai', 'known',
    'Awakened by the death of someone close; each pair has its own powers and pattern. Using it ruins the sight unless one takes a sibling’s eyes (the Eternal).', 'The tomoe merge into a pattern unique to the person.', { aliases: ['Mangekyo', 'Kaleidoscope Sharingan'], needs: 'the Sharingan and a great loss', home: 'uchiha' }),
  J('eternal-mangekyo', 'Eternal Mangekyō Sharingan', 'Eien no Mangekyō Sharingan', '—', [], 'dojutsu', [MADARA, SASUKE + '>sasuke-itachi-eyes'], 'none of the blindness', 'kekkei-genkai', 'secret',
    'A Mangekyō fused with a blood relative’s: the blindness ends and the powers grow.', 'Two patterns overlaid into one.', { aliases: ['Eternal Mangekyo'], home: 'uchiha' }),
  J('tsukuyomi', 'Tsukuyomi', 'Tsukuyomi', 'S', ['Yin'], 'genjutsu', [ITACHI], 'huge', 'kekkei-genkai', 'known',
    'Itachi’s left eye: a genjutsu where he controls time itself; three days of torture pass in an instant.', 'The world turns red and black under a red moon; the victim is crucified.', { needs: 'Itachi’s Mangekyō', home: 'uchiha' }),
  J('amaterasu', 'Amaterasu', 'Amaterasu', 'S', ['Fire'], 'dojutsu', [ITACHI, SASUKE + '>masked-man-truth'], 'huge; the eye bleeds', 'kekkei-genkai', 'known',
    'Black flames that burn whatever the eye focuses on and do not go out for seven days and nights. Sasuke can shape them (Blaze Release: Kagutsuchi).', 'Black fire appearing on a target with no source; blood from the eye.', { aliases: ['black flames', 'Blaze Release', 'Kagutsuchi'], needs: 'a Mangekyō with Amaterasu', home: 'uchiha' }),
  J('susanoo', 'Susanoo', 'Susanoo', 'S', [], 'dojutsu', [ITACHI, MADARA, SASUKE + '>kage-summit', 'Shisui Uchiha', KAKASHI + '>kaguya-awakens', TOBI], 'huge; each stage costs more', 'kekkei-genkai', 'known',
    'Needs both Mangekyō eyes: a giant warrior of chakra around the user, from ribs and an arm to a full armoured giant; with the Eternal, the Perfect Susanoo the size of a mountain.', 'A spectral skeleton, then a warrior, glowing around a figure.', { aliases: ['Susano’o', 'Perfect Susanoo'], needs: 'both Mangekyō', home: 'uchiha' }),
  J('itachi-susanoo', 'Totsuka Blade and Yata Mirror', 'Totsuka no Tsurugi / Yata no Kagami', 'S', [], 'dojutsu', [ITACHI], 'with Itachi’s Susanoo', 'unique', 'secret',
    'Itachi’s Susanoo holds two spiritual treasures: the Totsuka Blade seals whatever it pierces into an eternal dream; the Yata Mirror turns aside any attack. Together they make him nearly invincible.', 'A red-orange warrior with a gourd-born sword of liquid and a gleaming shield.', { aliases: ['Totsuka Sword', 'Sword of Totsuka', 'Yata Mirror'], needs: 'Itachi’s Susanoo' }),
  J('kamui', 'Kamui', 'Kamui', 'S', [], 'dojutsu', [TOBI, KAKASHI + '>gaara-captured'], 'high', 'kekkei-genkai', 'secret',
    'Obito’s eyes share one dimension. The right (the masked man) makes his body pass through anything and warps himself; the left (Kakashi) warps away anything he looks at from a distance.', 'Space twisting into a spiral and swallowing what it centres on.', { aliases: ['Kamui dimension', 'intangibility'], needs: 'Obito’s Mangekyō' }),
  J('kotoamatsukami', 'Kotoamatsukami', 'Kotoamatsukami', 'S', ['Yin'], 'genjutsu', ['Shisui Uchiha', 'Danzo Shimura'], 'one use in about ten years (Hashirama’s cells shorten it)', 'unique', 'secret',
    'Shisui’s eye: a genjutsu that changes someone’s will without them ever knowing. Danzō took the right eye; Itachi carries the left in a crow.', 'Nothing seen at all: someone simply decides differently.', { aliases: ['Shisui’s eye'], needs: 'Shisui’s eyes' }),
  J('izanagi', 'Izanagi', 'Izanagi', 'Forbidden', [], 'genjutsu', ['Danzo Shimura', TOBI, MADARA], 'one Sharingan goes blind with each use', 'kekkei-genkai', 'secret',
    'The forbidden Uchiha genjutsu cast on reality: for a short time, the user decides whether what happened to them is real. Death undone, one eye lost.', 'A wound that was never there; an eye closing for good.', { needs: 'the Sharingan', home: 'uchiha' }),
  J('izanami', 'Izanami', 'Izanami', 'Forbidden', [], 'genjutsu', [ITACHI], 'one Sharingan goes blind', 'kekkei-genkai', 'secret',
    'The counter to Izanagi: it traps the target in a loop of the same moment until they accept the truth of what they did.', 'The same moment repeating, over and over.', { needs: 'the Sharingan', home: 'uchiha' }),
  J('crow-clone', 'Crow Clone', 'Karasu Bunshin', 'A', [], 'ninjutsu', [ITACHI], 'moderate', 'unique', 'rare',
    'Itachi’s clone, or the body that takes a hit, bursts into crows.', 'A flock of black crows exploding where Itachi stood.', { aliases: ['Crow Genjutsu', 'Itachi’s crows'] }),
  J('byakugan', 'Byakugan', 'Byakugan', '—', [], 'dojutsu', ['Neji Hyuga', 'Hinata Hyuga', 'Hiashi Hyuga', 'Hanabi Hyuga', 'Hizashi Hyuga', 'Ao'], 'low', 'kekkei-genkai', 'common',
    'The Hyūga’s eyes: near-360° sight through walls for kilometres, and the chakra network inside a body. One blind spot behind the neck.', 'Pale eyes with veins standing out around them.', { aliases: ['the Byakugan', 'All-Seeing White Eye'], needs: 'Hyūga blood (or a stolen eye, like Ao’s)' }),
  J('rinnegan', 'Rinnegan', 'Rinnegan', '—', [], 'dojutsu', ['Pain', MADARA + '>madara-revived', TOBI + '>konan-falls', SASUKE + '>madara-betrayal'], 'huge', 'kekkei-genkai', 'famous',
    'The legendary eye of the Sage of Six Paths, thought a myth: all six paths of power, every nature, and the Outer Path.', 'Purple irises in rings, like ripples.', { aliases: ['the Rinnegan', 'Samsara Eye'], needs: 'Uchiha and Senju chakra together' }),
  J('six-paths-of-pain', 'Six Paths of Pain', 'Pein Rikudō', 'S', [], 'dojutsu', ['Pain'], 'huge (Nagato wastes away)', 'unique', 'secret',
    'Nagato’s six bodies, each with one path: Deva (push and pull), Asura (weapons), Human (rips out souls and reads them), Animal (summons), Preta (absorbs chakra and jutsu), Naraka (revives the others). They share one sight.', 'Six orange-haired figures with Rinnegan eyes, piercings and black rods.', { aliases: ['Pain’s six paths', 'Preta Path', 'Human Path', 'Animal Path', 'Asura Path', 'Naraka Path', 'Deva Path'], needs: 'the Rinnegan' }),
  J('shinra-tensei', 'Almighty Push', 'Shinra Tensei', 'S', [], 'dojutsu', ['Pain', MADARA + '>madara-betrayal'], 'high; a few seconds’ wait between uses', 'kekkei-genkai', 'secret',
    'A force that repels everything around the user. At full strength it levelled the Hidden Leaf.', 'A shock that throws everything away from one still figure; at its greatest, a crater where a village was.', { aliases: ['Shinra Tensei', 'Almighty Push'], needs: 'the Rinnegan' }),
  J('bansho-tenin', 'Universal Pull', 'Banshō Ten’in', 'S', [], 'dojutsu', ['Pain'], 'high', 'kekkei-genkai', 'secret',
    'Pulls a target toward the user.', 'A body yanked through the air as if on a rope.', { aliases: ['Banshō Ten’in', 'Universal Pull'], needs: 'the Rinnegan' }),
  J('chibaku-tensei', 'Planetary Devastation', 'Chibaku Tensei', 'S', [], 'dojutsu', ['Pain', NARUTO + '>kaguya-awakens', SASUKE + '>kaguya-awakens'], 'extreme', 'kekkei-genkai', 'secret',
    'A black sphere in the sky that pulls in the earth around a target into a great rock prison. The Sage once made the moon this way.', 'A dark core rising and rock tearing up into it.', { aliases: ['Chibaku Tensei', 'Planetary Devastation'], needs: 'the Rinnegan' }),
  J('rinne-tensei', 'Samsara of Heavenly Life', 'Gedō: Rinne Tensei no Jutsu', 'S', [], 'dojutsu', ['Pain>pain-assault', TOBI + '>konan-falls'], 'the user’s life', 'kekkei-genkai', 'secret',
    'The Outer Path’s jutsu that brings the dead back to life; it costs the user’s own.', 'The great statue’s head rising; souls flying back into bodies.', { aliases: ['Outer Path: Samsara of Heavenly Life', 'Rinne Tensei'], needs: 'the Rinnegan' }),
  J('limbo', 'Limbo: Border Jail', 'Rinbo: Hengoku', 'S', [], 'dojutsu', [MADARA + '>madara-betrayal'], 'high', 'unique', 'secret',
    'Madara’s invisible shadows in another dimension that strike at the same time as him.', 'Blows from nowhere; only a sage can sense them.', { aliases: ['Limbo', 'Rinbo'] }),
  J('amenotejikara', 'Amenotejikara', 'Amenotejikara', 'S', [], 'dojutsu', [SASUKE + '>madara-betrayal'], 'moderate', 'unique', 'secret',
    'Sasuke’s Rinnegan swaps the places of things in range.', 'Someone suddenly where a rock was.' ),
  J('indra-arrow', 'Indra’s Arrow', 'Indora no Ya', 'S', ['Lightning'], 'dojutsu', [SASUKE + '>valleys-end'], 'extreme', 'unique', 'secret',
    'Sasuke’s greatest Chidori, fired from a Susanoo bow with the tailed beasts’ chakra.', 'A purple Susanoo drawing a bow of lightning.', { needs: 'the Rinnegan and the Eternal' }),
  J('truth-seeking-balls', 'Truth-Seeking Balls', 'Gudōdama', 'S', [], 'ninjutsu', [TOBI + '>obito-jinchuriki', MADARA + '>madara-betrayal', NARUTO + '>madara-betrayal'], 'extreme', 'kekkei-genkai', 'secret',
    'Black orbs of all five natures plus Yin and Yang that obliterate what they touch and can be shaped into shields or staffs. Only senjutsu stops them.', 'Floating black orbs behind the user.', { aliases: ['Truth Seeking Orbs', 'Gudōdama'], needs: 'the Ten-Tails or the Six Paths Sage’s power' }),
  J('infinite-tsukuyomi', 'Infinite Tsukuyomi', 'Mugen Tsukuyomi', 'S', ['Yin'], 'genjutsu', [TOBI, MADARA + '>madara-revived'], 'the Ten-Tails and the moon', 'unique', 'secret',
    'The Eye of the Moon Plan: a genjutsu reflected off the moon on everyone alive, binding them in dreams. Hidden as the Akatsuki’s true purpose.', 'A red moon with a Rinnegan pattern; every person still, eyes open.', { aliases: ['Eye of the Moon Plan', 'Mugen Tsukuyomi'] }),
  J('six-paths-sage', 'Six Paths Sage Mode', 'Rikudō Senjutsu', 'S', [], 'senjutsu', [NARUTO + '>madara-betrayal'], 'immense', 'unique', 'secret',
    'Hagoromo’s gift to Naruto: a cloak of golden chakra, the black staff and orbs, flight, healing, and tailed beasts’ chakra at hand.', 'A glowing gold cloak with a ring of black orbs behind his back.', { aliases: ['Six Paths Senjutsu', 'Sage of Six Paths mode'] }),
  J('planetary-rasengan', 'Planetary Rasengan', 'Wakusei Rasengan', 'S', ['Wind'], 'ninjutsu', [NARUTO + '>madara-betrayal'], 'high', 'unique', 'secret',
    'A Rasengan with three smaller Rasengan orbiting it.', 'A ball of light with three moons circling it.' ),
  J('kaguya-powers', 'Kaguya’s Dimensions and Bones', 'Amenominaka / Kōtsuzui', 'S', [], 'dojutsu', ['Kaguya Ōtsutsuki>kaguya-awakens'], 'without limit', 'unique', 'secret',
    'The Rabbit Goddess moves everyone between her own worlds (lava, ice, desert, acid, gravity) and fires All-Killing Ash Bones that turn to ash whatever they pierce.', 'A white-haired woman, a third eye opening, the world changing around everyone.', { aliases: ['All-Killing Ash Bones', 'Amenominaka', 'Yomotsu Hirasaka'] }),

  // ------------------------------------------------------------------
  // Rasengan and the toads
  J('rasengan', 'Rasengan', 'Rasengan', 'A', [], 'ninjutsu', ['Minato Namikaze', 'Jiraiya', KAKASHI, NARUTO + '>tsunade-hokage', 'Konohamaru Sarutobi>pain-assault'], 'moderate', 'taught', 'famous',
    'The Fourth Hokage’s creation: a perfect sphere of spinning chakra held in the palm that grinds into its target. Shape transformation only, no nature.', 'A blue-white ball in a palm, then a spiral crater.', { aliases: ['Spiralling Sphere', 'Spiraling Sphere'], needs: 'perfect shape control (a shadow clone helps)' }),
  J('big-ball-rasengan', 'Big Ball Rasengan', 'Ōdama Rasengan', 'A', [], 'ninjutsu', ['Jiraiya', NARUTO + '>naruto-returns'], 'high', 'taught', 'rare',
    'A Rasengan several times the size of the user.', 'A sphere taller than a man.', { aliases: ['Giant Rasengan', 'Ōdama Rasengan'], needs: 'the Rasengan' }),
  J('sage-mode', 'Sage Mode', 'Senjutsu', 'S', [], 'senjutsu', ['Jiraiya', NARUTO + '>naruto-sage-training', 'Fukasaku', 'Shima', 'Hashirama Senju', 'Kabuto Yakushi>war-begins', 'Jugo'], 'natural energy, not one’s own chakra', 'taught', 'known',
    'Natural energy mixed with chakra: strength, speed, toughness, sensing, and blows that hit past the fist (Frog Kata). Taken wrong, it turns a person to stone.', 'Orange pigment around the eyes and toad-like pupils; Jiraiya’s nose swells and warts grow.', { aliases: ['Toad Sage Mode', 'Frog Kata', 'Kawazu Kumite', 'senjutsu', 'Sage Art'], needs: 'Mount Myōboku’s teaching (or Ryūchi Cave’s, or Jūgo’s clan)', home: 'toads' }),
  J('frog-song', 'Sage Art: Demonic Illusion: Toad Confrontation Chant', 'Senpō: Magen: Gamarinshō', 'S', ['Yin'], 'genjutsu', ['Fukasaku', 'Shima', 'Jiraiya'], 'moderate', 'unique', 'secret',
    'The two Great Sage Toads sing a genjutsu that holds the victim in place before a wooden stake strikes.', 'Two toads croaking on a man’s shoulders; the enemy frozen in a toad-headed vision.', { aliases: ['Frog Song', 'Gamarinshō'], home: 'toads' }),
  J('needle-jizo', 'Ninja Art: Needle Jizō', 'Ninpō: Hari Jizō', 'B', [], 'ninjutsu', ['Jiraiya'], 'low', 'unique', 'rare',
    'Jiraiya’s hair grows and hardens into a shell of needles around him.', 'A white hedgehog of hair spikes.', { aliases: ['Needle Jizō', 'Hari Jizō'] }),
  J('toad-mouth-trap', 'Summoning: Toad Mouth Bind', 'Kuchiyose: Gamaguchi Shibari', 'A', [], 'summoning', ['Jiraiya'], 'high', 'unique', 'rare',
    'Summons the gullet of a giant toad from Mount Myōboku around the enemy.', 'The room turns to pink flesh and the walls close in.', { aliases: ['Toad Mouth Trap', 'Toad’s stomach'] }),
  J('nine-tails-chakra', 'Nine-Tails Chakra Cloak', 'Kyūbi Chakura', 'S', [], 'ninjutsu', [NARUTO + '>mizuki-incident'], 'the beast’s chakra; it burns the host', 'kekkei-genkai', 'known',
    'Red chakra leaking from the sealed Nine-Tails: claws, a cloak, tails as it goes deeper (one to four, then the beast’s skeleton). It heals Naruto and harms him.', 'Red bubbling chakra and fox-like tails around a snarling boy.', { aliases: ['Fox cloak', 'Nine-Tails cloak', 'jinchūriki cloak'], needs: 'being the Nine-Tails’ host', home: 'leaf' }),
  J('kurama-mode', 'Kurama Chakra Mode', 'Kyūbi Chakura Mōdo', 'S', [], 'ninjutsu', [NARUTO + '>kurama-mastered'], 'huge, shared freely', 'unique', 'secret',
    'Once Naruto and Kurama work together: a golden cloak of the fox’s chakra, a giant fox shroud, and the Tailed Beast Ball.', 'A glowing gold-orange body with black markings, then a fox of light around him.', { aliases: ['Nine-Tails Chakra Mode', 'Kurama Mode', 'Tailed Beast Mode'] }),
  J('tailed-beast-ball', 'Tailed Beast Ball', 'Bijūdama', 'S', [], 'ninjutsu', ['Killer Bee', 'Gyūki', 'Nine-Tails', 'Shukaku', 'Matatabi', 'Isobu', 'Son Gokū', 'Kokuō', 'Saiken', 'Chōmei', NARUTO + '>kurama-mastered'], 'huge', 'kekkei-genkai', 'known',
    'Positive and negative chakra crushed into a black sphere in a tailed beast’s mouth, then fired: it can wipe out a mountain.', 'A black-purple orb swallowed, then a blast that splits the horizon.', { aliases: ['Bijūdama', 'Tailed Beast Bomb'], needs: 'a tailed beast or full control of one' }),
  J('jinchuriki-transformation', 'Tailed Beast Transformation', 'Bijū-ka', 'S', [], 'ninjutsu', ['Killer Bee', 'Gaara<gaara-captured', 'Yugito Nii', 'Yagura', 'Roshi', 'Han', 'Utakata', 'Fū'], 'the beast’s chakra', 'kekkei-genkai', 'known',
    'A host turning fully into their tailed beast, in control or not.', 'A body swelling and splitting into a giant beast.', { aliases: ['full tailed beast form', 'jinchūriki form'], needs: 'being a host' }),

  // ------------------------------------------------------------------
  // Sealing and barriers
  J('flying-thunder-god', 'Flying Thunder God Technique', 'Hiraishin no Jutsu', 'S', [], 'ninjutsu', ['Minato Namikaze', 'Tobirama Senju'], 'moderate', 'taught', 'famous',
    'Instant travel to any place marked with the user’s seal formula: Minato’s three-pronged kunai made him the Yellow Flash.', 'A yellow flash, and he is behind you.', { aliases: ['Flying Raijin', 'Hiraishin', 'Yellow Flash'], needs: 'the seal formula', home: 'leaf' }),
  J('reaper-death-seal', 'Reaper Death Seal', 'Shiki Fūjin', 'Forbidden', [], 'fuinjutsu', ['Minato Namikaze', 'Hiruzen Sarutobi'], 'the user’s soul', 'taught', 'known',
    'Summons the Death God to rip a soul out and seal it in his belly, the caster’s soul with it.', 'A ghostly god with a knife in its teeth, its hand through a man’s chest.', { aliases: ['Dead Demon Consuming Seal', 'Shiki Fūjin'], home: 'uzumaki' }),
  J('eight-trigrams-seal', 'Eight Trigrams Sealing Style', 'Hakke no Fūin Shiki', 'S', [], 'fuinjutsu', ['Minato Namikaze'], 'with the Reaper Death Seal', 'unique', 'secret',
    'The seal on Naruto’s belly: it holds the Nine-Tails and slowly lets its chakra into him.', 'A spiral seal around a navel, visible when chakra is moulded.', { aliases: ['Naruto’s seal', 'Eight Trigrams Seal'], home: 'leaf' }),
  J('five-elements-seal', 'Five Elements Seal', 'Gogyō Fūin', 'A', [], 'fuinjutsu', ['Orochimaru', 'Jiraiya'], 'moderate', 'taught', 'rare',
    'A seal of five fingertips that disrupts chakra; Jiraiya removes it with the Five Elements Unseal.', 'Five flaming fingertips slammed into a stomach.', { aliases: ['Five Pronged Seal', 'Five Elements Unseal', 'Gogyō Kaiin'] }),
  J('curse-mark', 'Curse Mark', 'Juin', 'S', [], 'fuinjutsu', ['Orochimaru', 'Anko Mitarashi', SASUKE + '>chunin-exams', 'Kimimaro', 'Jugo', 'Tayuya', 'Sakon', 'Jirobo', 'Kidomaru'], 'the bearer’s body and mind', 'unique', 'known',
    'Orochimaru’s bite seal made from Jūgo’s enzyme: natural energy floods the bearer for great power (two stages), at the cost of their body; most die of it. Heaven and Earth marks.', 'Black flame-like marks spreading over skin; in the second stage grey skin and hands like wings.', { aliases: ['Curse Seal', 'Cursed Seal of Heaven', 'Cursed Seal of Earth', 'Cursed Mark'] }),
  J('evil-sealing', 'Evil Sealing Method', 'Fūja Hōin', 'A', [], 'fuinjutsu', [KAKASHI], 'high', 'taught', 'rare',
    'A circle of seals written in blood that holds back a curse mark.', 'Kanji on the floor crawling up a body and closing on a shoulder.', { aliases: ['Seal of Evil', 'Fūja Hōin'] }),
  J('adamantine-chains', 'Adamantine Sealing Chains', 'Kongō Fūsa', 'S', ['Yin-Yang'], 'fuinjutsu', ['Kushina Uzumaki', 'Mito Uzumaki'], 'high', 'kekkei-genkai', 'rare',
    'Chains of chakra from the body, rare even among the Uzumaki: they bind even a tailed beast, block, and seal.', 'Golden chains of chakra bursting from the back.', { aliases: ['Adamantine Chains', 'chakra chains', 'Kongō Fūsa'], needs: 'special Uzumaki chakra', home: 'uzumaki' }),
  J('four-violet-flames', 'Four Violet Flames Formation', 'Shishienjin', 'B', [], 'barrier', ['Tayuya', 'Sakon', 'Jirobo', 'Kidomaru'], 'four users', 'taught', 'rare',
    'The Sound Four’s purple barrier that burns whoever touches it; they held the Third Hokage inside it.', 'A purple cube of flame over a rooftop.', { aliases: ['Four Violet Flames', 'purple barrier'] }),
  J('four-red-yang', 'Four Red Yang Formation', 'Shisekiyōjin', 'S', [], 'barrier', ['Hashirama Senju>hokage-edo', 'Tobirama Senju>hokage-edo', 'Hiruzen Sarutobi>hokage-edo', 'Minato Namikaze>hokage-edo'], 'four Kage', 'taught', 'secret',
    'The four reanimated Hokage’s red barrier that held the Ten-Tails.', 'A red cube large enough to cage a mountain-sized beast.', { aliases: ['Four Red Yang'] }),
  J('tongue-seal', 'Curse Seal: Tongue Annihilation', 'Zekka Konzetsu no Juin', 'A', [], 'fuinjutsu', ['Danzo Shimura'], 'low', 'unique', 'secret',
    'Root’s silencing seal on its members’ tongues: anyone who tries to speak of Danzō or Root is paralysed.', 'A black seal on a tongue.', { aliases: ['Root’s tongue seal', 'Root curse seal'], home: 'root' }),
  J('reverse-four-symbols', 'Reverse Four Symbols Sealing', 'Ura Shishō Fūinjutsu', 'S', [], 'fuinjutsu', ['Danzo Shimura'], 'the user’s life', 'unique', 'secret',
    'A seal on Danzō’s body that, when he dies, drags everything near him into his corpse.', 'Black lines unravelling from a dying man and swallowing the space around him.' ),

  // ------------------------------------------------------------------
  // Orochimaru, Kabuto and the Sound
  J('edo-tensei', 'Summoning: Impure World Reincarnation', 'Kuchiyose: Edo Tensei', 'Forbidden', [], 'summoning', ['Tobirama Senju', 'Orochimaru', 'Kabuto Yakushi>kabuto-pact'], 'a living sacrifice per soul', 'taught', 'known',
    'Tobirama’s forbidden jutsu: calls a dead soul back into a living sacrifice, with their old body and jutsu, immortal and bound to the caster’s will.', 'Coffins rising from the ground; the dead stepping out with cracked grey skin and black eyes.', { aliases: ['Edo Tensei', 'Reanimation Jutsu', 'Impure World Resurrection'], needs: 'the dead person’s DNA and a sacrifice', home: 'leaf' }),
  J('living-corpse', 'Living Corpse Reincarnation', 'Fushi Tensei', 'Forbidden', [], 'ninjutsu', ['Orochimaru'], 'a new body every three years', 'unique', 'known',
    'Orochimaru’s path to immortality: his soul moves into a new body, every few years. He wants Itachi’s, then Sasuke’s.', 'A pale face peeled off to show another underneath.', { aliases: ['Fushi Tensei', 'body transfer'] }),
  J('snake-hands', 'Hidden Shadow Snake Hands', 'Sen’ei Jashu', 'B', [], 'ninjutsu', ['Orochimaru', 'Anko Mitarashi', SASUKE + '>sasuke-rescue'], 'low', 'taught', 'known',
    'Snakes shooting out of the sleeves to bite or bind.', 'Snakes whipping out of a sleeve faster than an arm could.', { aliases: ['Striking Shadow Snakes', 'Sen’ei Jashu', 'Many Hidden Shadow Snake Hands'] }),
  J('kusanagi', 'Sword of Kusanagi', 'Kusanagi no Tsurugi', '—', [], 'weapon', ['Orochimaru', SASUKE + '>sasuke-trains'], 'none', 'unique', 'known',
    'Orochimaru’s blade, drawn from his throat, that can stretch and cut almost anything. Sasuke carries a Kusanagi sword of his own later.', 'A blade sliding out of a snake’s mouth.', { aliases: ['Kusanagi', 'Grass Cutter'] }),
  J('eight-branches', 'Eight Branches Technique', 'Yamata no Jutsu', 'S', [], 'ninjutsu', ['Orochimaru'], 'huge', 'unique', 'secret',
    'Orochimaru’s true form: a giant eight-headed white serpent.', 'Eight white snake heads rearing out of a cave.', { aliases: ['Yamata no Orochi'] }),
  J('rashomon', 'Summoning: Rashōmon', 'Kuchiyose: Rashōmon', 'A', [], 'summoning', ['Orochimaru'], 'high', 'unique', 'rare',
    'Giant demon-faced gates summoned as a shield; the strongest is triple-layered.', 'A huge iron gate with an ogre’s face rising out of the ground.' ),
  J('snake-summoning', 'Summoning: Snakes', 'Kuchiyose: Hebi', 'C', [], 'summoning', ['Orochimaru', 'Anko Mitarashi', 'Kabuto Yakushi', SASUKE + '>sasuke-absorbs-orochimaru', 'Manda'], 'by size: Manda is huge and demands sacrifices', 'open', 'known',
    'The snake contract of Ryūchi Cave; the great snake Manda serves only the strong.', 'A purple serpent the size of a hill.', { aliases: ['Manda', 'snake contract'], needs: 'the snake contract' }),
  J('toad-summoning', 'Summoning: Toads', 'Kuchiyose: Gama', 'C', [], 'summoning', ['Jiraiya', 'Minato Namikaze', NARUTO + '>chunin-exams', 'Gamabunta'], 'by size', 'open', 'known',
    'Mount Myōboku’s toads: Gamabunta the chief, Gamakichi, Gamatatsu and the elders.', 'A giant red toad with a pipe and a sword.', { aliases: ['Gamabunta', 'toad contract'], needs: 'the toad contract' }),
  J('slug-summoning', 'Summoning: Katsuyu', 'Kuchiyose: Katsuyu', 'C', [], 'summoning', ['Tsunade Senju', 'Katsuyu', SAKURA + '>war-begins'], 'by size', 'open', 'known',
    'Shikkotsu Forest’s great slug, who splits into tiny slugs to heal many at once.', 'A huge white-and-blue slug.', { aliases: ['Katsuyu', 'slug contract'], needs: 'the slug contract' }),
  J('dead-soul', 'Dead Soul Technique', 'Shikon no Jutsu', 'B', [], 'ninjutsu', ['Kabuto Yakushi'], 'moderate', 'unique', 'rare',
    'Kabuto restarts a fresh corpse’s heart and controls it like a puppet.', 'A dead man rising with empty eyes.' ),
  J('kabuto-sage', 'Kabuto’s Sage Mode (White Snake)', 'Hakuja Sennin Mōdo', 'S', [], 'senjutsu', ['Kabuto Yakushi>war-begins'], 'natural energy', 'unique', 'secret',
    'Kabuto, grafted with Orochimaru’s cells and the cave’s senjutsu, becomes a white dragon-snake sage.', 'Scales, horns and a snake’s tail; a hood of serpents.', { aliases: ['Sage Mode Kabuto'] }),
  J('shikotsumyaku', 'Dead Bone Pulse', 'Shikotsumyaku', 'S', [], 'taijutsu', ['Kimimaro'], 'the body (his illness)', 'kekkei-genkai', 'rare',
    'The Kaguya clan’s bone control: bones grown and fired as weapons, harder than steel. Dances of the Camellia, Larch, Willow, Clematis and the Seedling Fern.', 'Bones bursting through skin as spears and blades; a forest of bone spikes.', { aliases: ['Dance of the Camellia', 'Dance of the Larch', 'Dance of the Seedling Fern', 'bone techniques'], needs: 'the Kaguya clan’s body' }),
  J('jugo-transformation', 'Sage Transformation', 'Senninka', 'A', [], 'senjutsu', ['Jugo'], 'none (natural energy he absorbs)', 'kekkei-genkai', 'rare',
    'Jūgo’s body takes in natural energy and transforms into weapons and armour; his clan’s madness comes with it.', 'Arms swelling into jet thrusters and maces, skin going grey.', { aliases: ['Jūgo’s curse'], needs: 'Jūgo’s clan’s body' }),
  J('demon-flute', 'Demonic Flute: Phantom Sound Chains', 'Mateki: Gen’yō Muchū', 'B', ['Yin'], 'genjutsu', ['Tayuya'], 'moderate', 'unique', 'rare',
    'Tayuya’s flute casts genjutsu by sound and commands her three summoned Doki giants.', 'A flute tune and three bandaged ogres moving to it.', { aliases: ['Doki', 'Tayuya’s flute'] }),
  J('spider-web', 'Spider Sticky Gold', 'Kumo Nenkin', 'B', [], 'ninjutsu', ['Kidomaru'], 'low', 'unique', 'rare',
    'Kidomaru spits spider silk that hardens into gold-like metal for weapons, webs and arrows.', 'A six-armed boy drawing a golden bow.', { aliases: ['Spider Bind', 'Spider War Bow'] }),
  J('parasitic-demon', 'Parasitic Demon Destruction', 'Kisei Kikai', 'B', [], 'ninjutsu', ['Sakon', 'Ukon'], 'low', 'kekkei-genkai', 'rare',
    'Sakon and Ukon share one body and can enter another’s, eating it from the cells.', 'A face pushing out of someone else’s shoulder.', { aliases: ['Combination Transformation'] }),
  J('sound-arm', 'Melody Arm', 'Kyōmeisen', 'C', [], 'ninjutsu', ['Dosu Kinuta'], 'low', 'unique', 'rare',
    'Dosu’s arm amplifies sound into the inner ear: one blow and balance and hearing go.', 'A punch that misses, and the target vomits.', { aliases: ['Resonating Echo Drill'] }),
  J('air-cutter', 'Decapitating Airwaves', 'Zankūha', 'C', ['Wind'], 'ninjutsu', ['Zaku Abumi'], 'low', 'unique', 'rare',
    'Tubes in Zaku’s palms fire ultrasonic air.', 'A blast from two open palms that throws trees down.', { aliases: ['Slicing Sound Wave', 'Zankūha'] }),
  J('karin-sensing', 'Mind’s Eye of Kagura', 'Kagura Shingan', 'A', [], 'ninjutsu', ['Karin'], 'none', 'unique', 'rare',
    'Karin’s sensing: chakra felt from kilometres away, its feel and mood, and who it belongs to.', 'Karin pushing up her glasses, eyes closed.', { aliases: ['Karin’s sensing', 'Kagura Shingan'] }),
  J('karin-healing', 'Healing Bite', 'Karin no Kamu', '—', [], 'medical', ['Karin'], 'her own chakra', 'kekkei-genkai', 'rare',
    'Anyone who bites Karin takes her Uzumaki chakra and heals; it leaves bite scars over her arms.', 'Teeth in a scarred forearm, a wound closing.', { aliases: ['Karin’s bite'], needs: 'Karin’s Uzumaki body' }),

  // ------------------------------------------------------------------
  // The Akatsuki
  J('clay', 'Explosive Clay', 'Kibaku Nendo', 'S', ['Earth', 'Lightning'], 'ninjutsu', ['Deidara'], 'moderate', 'kekkei-genkai', 'known',
    'Deidara’s Explosion Release: clay chewed by mouths in his palms, shaped into birds, spiders and dragons, and blown up. C1 small bombs, C2 the dragon, C3 a giant bomb. Lightning is his weakness.', 'Small white figures that fly or crawl, and a shouted “Katsu!”.', { aliases: ['Explosion Release', 'C1', 'C2', 'C3', 'Deidara’s art'], needs: 'Explosion Release (Earth + Lightning) and the hand-mouths (Stone’s forbidden technique)', home: 'stone' }),
  J('c4', 'C4 Karura', 'C4 Karura', 'S', ['Earth', 'Lightning'], 'ninjutsu', ['Deidara>gaara-captured'], 'high', 'unique', 'secret',
    'A giant Deidara that bursts into a cloud of microscopic bombs; breathed in, they blow up the body from inside. Only seen as dust by a Sharingan.', 'A huge figure dissolving into a faint haze; then people crumbling into dust.', { aliases: ['C4'] }),
  J('c0', 'C0', 'Shī Zero', 'S', ['Earth', 'Lightning'], 'ninjutsu', ['Deidara'], 'his life', 'unique', 'secret',
    'Deidara turns himself into a bomb that wipes out ten kilometres: his final art.', 'Stitches torn open on his chest; a mouth swallowing clay; a white sphere.', { aliases: ['Ultimate Art'] }),
  J('earth-grudge', 'Earth Grudge Fear', 'Jiongu', 'Forbidden', ['Earth'], 'ninjutsu', ['Kakuzu'], 'low; the hearts do the work', 'unique', 'secret',
    'The Waterfall’s forbidden jutsu: Kakuzu’s body is held together by black threads and he takes others’ hearts to live: five hearts, five natures, each in a mask on his back.', 'Black threads writhing out of stitched skin; masked creatures tearing loose from his back.', { aliases: ['Jiongu', 'Kakuzu’s hearts', 'Kakuzu’s threads'], home: 'waterfall' }),
  J('jashin-ritual', 'Jashin’s Ritual', 'Shiji Hyōketsu', '—', [], 'ninjutsu', ['Hidan'], 'his blood', 'unique', 'known',
    'Hidan draws Jashin’s symbol in blood, tastes his enemy’s blood, and links their bodies: wounds to his body reach them. He cannot die.', 'Skin turning black with white bone lines; a triangle in a circle drawn in blood.', { aliases: ['Death Ruling Possession Blood', 'Jashin curse', 'Hidan’s ritual'], home: 'jashin' }),
  J('paper-person', 'Paper Person of God', 'Kami no Shisha no Jutsu', 'S', [], 'ninjutsu', ['Konan'], 'moderate', 'unique', 'known',
    'Konan becomes paper: wings, blades, spears and shields of folded sheets, and paper butterflies for scouting.', 'A woman dissolving into a whirl of white paper; angel wings of paper.', { aliases: ['Dance of the Shikigami', 'Shikigami no Mai', 'paper angel'], home: 'rain' }),
  J('paper-ocean', 'Paper Ocean of Six Hundred Billion Tags', 'Kami no Shisha', 'S', [], 'ninjutsu', ['Konan>konan-falls'], 'enormous (prepared for years)', 'unique', 'secret',
    'Konan’s trap for the masked man: a lake parted by six hundred billion explosive tags going off for ten minutes.', 'A lake split down the middle, walls of paper on both sides.' ),
  J('zetsu', 'Zetsu’s Mimicry and Spores', 'Hōshi no Jutsu', 'B', [], 'ninjutsu', ['Zetsu'], 'low', 'unique', 'secret',
    'Zetsu merges into trees and earth, spies unseen, splits into white and black halves, and clones itself on others as spores that eat their chakra.', 'A plant-like face sliding out of a tree trunk.', { aliases: ['White Zetsu', 'Black Zetsu', 'Spore Technique'] }),
  J('samehada', 'Samehada', 'Samehada', '—', [], 'weapon', ['Kisame Hoshigaki<kisame-dies', 'Killer Bee>kisame-dies', 'Fuguki Suikazan'], 'none; it eats chakra', 'unique', 'known',
    'The living sword of the Seven Swordsmen: its scales shave flesh and eat chakra, and it chooses its wielder. Kisame can fuse with it into a shark-man.', 'A bandaged great sword that opens a mouth of teeth.', { aliases: ['Shark Skin'], home: 'mist' }),
  J('akatsuki-sealing', 'Nine Phantom Dragons Seal', 'Fūjutsu: Genryū Kyū Fūjin', 'S', [], 'fuinjutsu', ['Pain', 'Konan', TOBI, 'Zetsu', 'Kakuzu', 'Hidan', 'Deidara', 'Sasori', 'Kisame Hoshigaki', ITACHI], 'three days of the whole Akatsuki', 'unique', 'secret',
    'The Akatsuki’s sealing of a tailed beast into the Demonic Statue of the Outer Path: projections stand on the statue’s fingers for three days; the host dies.', 'A giant statue with nine closed eyes, ghostly figures on its fingers, dragons of chakra pouring from a body.', { aliases: ['Demonic Statue', 'Phantom Dragons Nine Consuming Seals', 'tailed beast sealing'] }),

  // ------------------------------------------------------------------
  // The Sand
  J('puppet-technique', 'Puppet Technique', 'Kugutsu no Jutsu', 'C', [], 'puppetry', ['Sasori', 'Kankuro', 'Chiyo'], 'low', 'taught', 'known',
    'Chakra threads from the fingertips that move puppets armed with blades, poison and hidden weapons.', 'Faint blue threads to a jointed wooden figure.', { aliases: ['Puppetry', 'Chakra Threads', 'Kugutsu'], home: 'sand' }),
  J('kankuro-puppets', 'Kankurō’s Puppets', 'Karasu / Kuroari / Sanshōuo', 'B', [], 'puppetry', ['Kankuro'], 'low', 'unique', 'known',
    'Crow (blades and poison), Black Ant (a body to trap someone in), Salamander (a shield); later Sasori’s own body as a puppet.', 'A many-armed wooden doll with a grin.', { aliases: ['Black Ant'], home: 'sand' }),
  J('human-puppet', 'Human Puppet', 'Hitokugutsu', 'Forbidden', [], 'puppetry', ['Sasori'], 'low', 'unique', 'secret',
    'Sasori’s forbidden art: puppets made from people that keep their jutsu; he made himself one too. His prize is the Third Kazekage with his Iron Sand.', 'A dead Kage’s body opened up full of weapons; black iron sand spreading in spikes.', { aliases: ['Third Kazekage puppet', 'Iron Sand', 'Satetsu'], home: 'sand' }),
  J('hundred-puppets', 'Red Secret Technique: Performance of a Hundred Puppets', 'Akahigi: Hyakki no Sōen', 'S', [], 'puppetry', ['Sasori'], 'moderate', 'unique', 'secret',
    'A hundred puppets at once, the art that took a country.', 'A sky full of puppets, each with a blade.', { aliases: ['Hundred Puppets'], home: 'sand' }),
  J('ten-puppets', 'White Secret Technique: Ten Puppets Collection', 'Shirohigi: Jikkimon Chikamatsu no Shū', 'S', [], 'puppetry', ['Chiyo'], 'moderate', 'unique', 'rare',
    'Chiyo’s first puppets, the Chikamatsu ten, made by Monzaemon.', 'Ten puppets in a ring around an old woman.', { aliases: ['Ten Puppets'], home: 'sand' }),
  J('kisho-tensei', 'One’s Own Life Reincarnation', 'Kishō Tensei', 'Forbidden', [], 'ninjutsu', ['Chiyo'], 'the user’s life', 'unique', 'secret',
    'Chiyo’s jutsu made for Sasori’s puppets: it gives the user’s life to bring the dead back.', 'Hands on a body, green light, an old woman fading.', { home: 'sand' }),
  J('sand-coffin', 'Sand Coffin and Sand Burial', 'Sabaku Kyū / Sabaku Sōsō', 'A', ['Wind', 'Earth'], 'ninjutsu', ['Gaara'], 'moderate', 'kekkei-genkai', 'known',
    'Sand wraps the enemy, then crushes: “Sand Burial.”', 'A fist closing; sand squeezing, blood spraying out of it.', { aliases: ['Sand Coffin', 'Sand Burial', 'Desert Coffin'], needs: 'Gaara’s sand', home: 'sand' }),
  J('shield-of-sand', 'Shield of Sand', 'Suna no Tate', 'A', [], 'ninjutsu', ['Gaara'], 'none (automatic)', 'unique', 'known',
    'Sand that moves on its own to stop any attack; for years Shukaku and his mother’s love moved it. Armour of Sand coats his body as a second layer.', 'A wall of sand catching a fist before it lands.', { aliases: ['Absolute Defence', 'Armour of Sand', 'Suna no Yoroi'], home: 'sand' }),
  J('shukaku-possession', 'Playing Possum Technique', 'Tanuki Neiri no Jutsu', 'S', ['Wind'], 'ninjutsu', ['Gaara<gaara-captured', 'Shukaku'], 'huge', 'unique', 'known',
    'Gaara falls asleep and lets Shukaku take the body: the full sand beast with Wind Style: Drilling Air Bullet.', 'A giant sand tanuki with the boy asleep on its forehead.', { aliases: ['Shukaku’s release', 'Feigning Sleep Technique'], home: 'sand' }),
  J('gold-dust', 'Gold Dust', 'Sakin', 'S', [], 'ninjutsu', ['Rasa'], 'high', 'unique', 'known',
    'The Fourth Kazekage’s gold dust: heavy, cutting, magnetic; it made the Sand rich and then poor.', 'A heavy golden wave.', { aliases: ['Sakin', 'Rasa’s gold'], home: 'sand' }),

  // ------------------------------------------------------------------
  // The Mist and the Seven Swords
  J('kubikiribocho', 'Kubikiribōchō', 'Kubikiribōchō', '—', [], 'weapon', ['Zabuza Momochi<land-of-waves', 'Suigetsu Hozuki>taka-formed', 'Mangetsu Hōzuki'], 'none', 'unique', 'famous',
    'The Executioner’s Blade: a great cleaver that rebuilds itself from the iron in the blood of those it cuts.', 'A huge blade with a hole near the tip, sized to take a head.', { aliases: ['Executioner’s Blade', 'Decapitating Carving Knife'], home: 'mist' }),
  J('hiramekarei', 'Hiramekarei', 'Hiramekarei', '—', [], 'weapon', ['Chojuro', 'Mangetsu Hōzuki'], 'stores the user’s chakra', 'unique', 'famous',
    'A twin-hilted sword that stores chakra and shapes it into blades and hammers.', 'Two hilts, bandages flying off a broad blade glowing blue.', { home: 'mist' }),
  J('kiba-blades', 'Kiba Blades', 'Kiba (the Fangs)', '—', ['Lightning'], 'weapon', ['Ameyuri Ringo'], 'lightning', 'unique', 'famous',
    'The Fangs: twin swords charged with lightning, the sharpest of the Seven.', 'Two short swords crackling with white sparks.', { aliases: ['the Fangs of the Mist', 'Kiba swords'], home: 'mist' }),
  J('nuibari', 'Nuibari', 'Nuibari', '—', [], 'weapon', ['Kushimaru Kuriarare'], 'none', 'unique', 'famous',
    'The Sewing Needle: a long thin blade with a wire that sews people together.', 'Bodies strung on a wire like beads.', { aliases: ['Sewing Needle'], home: 'mist' }),
  J('shibuki', 'Shibuki', 'Shibuki', '—', [], 'weapon', ['Jinpachi Munashi'], 'none', 'unique', 'famous',
    'The Blastsword: a blade wrapped in explosive tags.', 'A sword flashing into explosions on every swing.', { aliases: ['Blastsword'], home: 'mist' }),
  J('kabutowari', 'Kabutowari', 'Kabutowari', '—', [], 'weapon', ['Jinin Akebino'], 'none', 'unique', 'famous',
    'The Helmet Splitter: an axe and a hammer joined by a chain; nothing defends against it.', 'A hammer driving an axe through a shield.', { aliases: ['Helmet Splitter'], home: 'mist' }),
  J('six-tails-bubbles', 'Bubble Technique', 'Hōmatsu no Jutsu', 'A', ['Water'], 'ninjutsu', ['Utakata', 'Saiken'], 'low', 'unique', 'rare',
    'Utakata’s bubbles blown through a pipe, explosive or acidic, from the Six-Tails.', 'A drift of soap bubbles that pop into fire.', { aliases: ['Utakata’s bubbles'], home: 'mist' }),

  // ------------------------------------------------------------------
  // The Cloud, the Stone and others
  J('eight-swords', 'Eight Swords Style', 'Hachibi Kenpō', 'A', [], 'kenjutsu', ['Killer Bee'], 'none', 'unique', 'known',
    'Bee’s seven swords held in hands, armpits, neck and mouth, swung to his own rap rhythm.', 'Seven blades held everywhere, a man dancing.', { aliases: ['Acrobat Style', 'Bee’s swords'], home: 'cloud' }),
  J('six-paths-tools', 'Treasured Tools of the Sage of Six Paths', 'Rikudō Hōgu', 'S', [], 'weapon', ['Kinkaku>war-begins', 'Ginkaku>war-begins'], 'huge; only the Gold and Silver Brothers can use them easily', 'unique', 'rare',
    'The gourd (seals whoever answers to their name), the rope, the fan of the five natures, the Seven-Star sword, the pitcher.', 'A red gourd opening, a body pulled inside.', { aliases: ['Benihisago', 'Bashōsen', 'Kōkinjō', 'Shichiseiken', 'Gold and Silver Brothers’ tools'], home: 'cloud' }),
  J('ibuse', 'Summoning: Ibuse', 'Kuchiyose: Ibuse', 'S', [], 'summoning', ['Hanzō'], 'high', 'unique', 'known',
    'Hanzō’s poison salamander; the poison sac in Hanzō’s own body makes him dangerous to strike.', 'A huge black salamander breathing purple poison.', { aliases: ['Hanzō’s salamander', 'Hanzō of the Salamander'], home: 'rain' }),
  J('mifune-iai', 'Iai: Samurai Sabre Technique', 'Iai', 'A', [], 'kenjutsu', ['Mifune'], 'none (chakra in the blade)', 'unique', 'known',
    'The samurai’s quick-draw; Mifune draws and sheathes before an eye can follow.', 'A click of a sheath and a cut already made.', { aliases: ['Iai', 'Samurai Sabre'], home: 'iron' }),
  J('chakra-blades', 'Chakra Flow', 'Chakura Nagashi', 'B', [], 'kenjutsu', ['Asuma Sarutobi', SASUKE + '>sasuke-rescue', 'Mifune', 'Darui'], 'low', 'open', 'common',
    'Flowing one’s nature chakra into a blade to make it cut or shock far better.', 'Steel glowing with the colour of a nature.', { aliases: ['Chakra Flow', 'Chakra Nagashi'] }),

  // ------------------------------------------------------------------
  // Madara and the masked man
  J('tengai-shinsei', 'Tengai Shinsei', 'Tengai Shinsei', 'S', [], 'ninjutsu', [MADARA + '>madara-revived'], 'huge', 'unique', 'secret',
    'Madara brings meteors down on the battlefield, and a second one behind the first.', 'A falling mountain darkening the sky.', { aliases: ['Meteorite', 'Heavenly Bodies Bringing Down'] }),
  J('gunbai', 'Uchiha Return', 'Uchiha Gaeshi', 'S', [], 'weapon', [MADARA + '>madara-revived', TOBI + '>war-begins'], 'moderate', 'unique', 'rare',
    'Madara’s war fan absorbs and turns back an attack.', 'A huge round fan with a chain, flames spat back from it.', { aliases: ['Madara’s fan', 'Gunbai'] }),
  J('masked-man-warp', 'Masked Man’s Teleport', 'Kamui (jikūkan idō)', 'S', [], 'ninjutsu', [TOBI], 'moderate', 'unique', 'secret',
    'The masked man is gone through a swirl in space and reappears anywhere he has been; only his right eye shows in the mask hole.', 'A swirl around the mask’s eye hole and he is gone.', { aliases: ['the masked man’s swirl'] }),

  // ------------------------------------------------------------------
  // Others in the Leaf
  J('super-beast-drawing', 'Super Beast Imitating Drawing', 'Chōjū Giga', 'B', [], 'ninjutsu', ['Sai'], 'low', 'unique', 'rare',
    'Sai’s ink drawings come alive: mice, snakes, lions, great birds he rides.', 'A brush flicking across a scroll; black ink lions leaping off the paper.', { aliases: ['Ink Beasts', 'Sai’s ink'], home: 'root' }),
  J('monkey-king', 'Summoning: Monkey King Enma', 'Kuchiyose: Enma', 'S', [], 'summoning', ['Hiruzen Sarutobi'], 'high', 'unique', 'known',
    'Enma, the Monkey King, who becomes an adamantine staff for the Third Hokage.', 'A monkey in armour turning into a black staff.', { aliases: ['Enma', 'Adamantine Staff'], home: 'leaf' }),
  J('kakashi-copy', 'Copy Ninja’s Sharingan Copy', 'Kopī Ninja', '—', [], 'dojutsu', [KAKASHI], 'his eye drains him', 'unique', 'famous',
    'Kakashi of the Sharingan, the Copy Ninja: said to have copied a thousand jutsu with Obito’s eye.', 'His headband pushed up over a scarred left eye.', { aliases: ['Copy Ninja', 'Kakashi of the Sharingan', 'Friend-Killer Kakashi'] }),
];

/** Kan's own, kept apart: sent only when he has them (jutsuList.ts). */
export const KAN_JUTSU: CanonJutsu[] = [
  J('thousand-souls', 'Thousand Souls', 'Senjū no Tamashii', 'Forbidden', [], 'fuinjutsu', ['Kan'], 'none: it feeds him; the toll is on his body until perfected', 'unique', 'secret',
    'Your own forbidden jutsu, grown from your father’s unfinished chakra-drawing seal: it drains a target’s chakra into you, grows your reserve for good and takes their chakra nature. Never jutsu or kekkei genkai abilities beyond the nature. Perfected after about ten uses.', 'A seal flaring on your forearm; the target greying as their chakra pours into you.', { kan: true }),
  J('sky-burial', 'Sky Burial', 'Chōsō', 'S', ['Yin'], 'genjutsu', ['Kan'], 'huge; wears the eyes toward blindness', 'unique', 'secret',
    'Your left Mangekyō: held eye contact lays the target out on a mountain where your vultures land and eat, and their chakra flows into you.', 'Blood-red vultures landing in a ring.', { kan: true, aliases: ['Chōsō'] }),
  J('okuribi', 'Okuribi', 'Okuribi', 'S', ['Fire'], 'dojutsu', ['Kan'], 'huge; the right eye bleeds', 'unique', 'secret',
    'Your right Mangekyō: a black-red flame that burns chakra, not flesh, until you put it out.', 'Black-red fire on a jutsu in flight, eating it to nothing.', { kan: true }),
  J('kan-susanoo', 'Your Susanoo', 'Susanoo', 'S', [], 'dojutsu', ['Kan'], 'huge', 'kekkei-genkai', 'secret',
    'Blood red and built like your vultures: ribs and a talon-fingered arm, then a skeleton with a hooked-bill skull, then an armoured warrior (vulture helm, a feather mantle that wraps into a shield, talon sickles). Perfect, winged and mountain-tall, only with the Eternal.', 'A blood-red skeleton with a hooked vulture bill rising around you, chakra feathers layering into armour.', { kan: true, aliases: ['Susanoo', 'Kan’s Susanoo'] }),
  J('long-dream', 'The Long Dream', 'Nagayume', 'S', ['Yin'], 'genjutsu', ['Kan'], 'huge', 'unique', 'secret',
    'Inherited from Izumi with the Eternal: the target lives a whole happy life in a single moment, the ordinary life Izumi dreamed of; on waking they have lost it.', 'Eyes going soft and far away; a quiet house, a garden, a whole life in one breath.', { kan: true }),
  J('gyre', 'Gyre', 'Senkai', 'A', ['Wind'], 'ninjutsu', ['Kan'], 'moderate', 'unique', 'secret',
    'Thrown or fired attacks caught in a spiral around you, circling like vultures on a thermal, then sent back.', 'Kunai and fire circling you, then flying back the way they came.', { kan: true, aliases: ['Senkai'] }),
  J('vulture-clone', 'Vulture Clone', 'Hagetaka Bunshin', 'A', [], 'ninjutsu', ['Kan'], 'moderate', 'unique', 'secret',
    'Your version of Itachi’s crow clone: the clone, or the body that takes the hit, bursts into blood-red vultures.', 'A flock of red-and-black vultures exploding upward.', { kan: true }),
  J('vulture-flight', 'Vulture Flight', 'Hagetaka Utsushi', 'A', [], 'ninjutsu', ['Kan'], 'moderate', 'unique', 'secret',
    'Your body comes apart into vultures that scatter, then gather elsewhere and rebuild you.', 'Vultures spiralling down and becoming you.', { kan: true }),
];

export const ALL_JUTSU: CanonJutsu[] = [...CANON_JUTSU, ...KAN_JUTSU];
