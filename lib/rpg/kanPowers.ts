// Kan's own powers, decided by Xan on 14 Nov 2026 (claude/before-variety-ideas.md
// sections 5, 6 and 10): his level as a fighter, his three vultures, his
// Mangekyō and Eternal Mangekyō, and Gyre. The narrator gets the lines for
// what Kan has now; the Kan screen lists the vultures.

import type { AppDatabase } from './types';

function hasAbility(db: Pick<AppDatabase, 'state'>, pattern: RegExp) {
  return (db.state.player.abilities ?? []).some((ability) => pattern.test(ability.name));
}

export function kanHasMangekyo(db: Pick<AppDatabase, 'state'>) {
  return hasAbility(db, /mangeky/i);
}

export function kanHasEternal(db: Pick<AppDatabase, 'state'>) {
  return hasAbility(db, /eternal/i);
}

/** A Wind nature taken with Thousand Souls: what Gyre needs. */
export function kanHasStolenWind(db: Pick<AppDatabase, 'state'>) {
  return (db.state.player.natures ?? []).some((item) => item.source === 'thousand-souls' && /wind/i.test(item.nature));
}

// ---------------------------------------------------------------------------
// As a fighter (section 10)

export const KAN_FIGHTER_LINE =
  'As a fighter (fixed): very talented, about Itachi’s equal even without the Sharingan; a master of taijutsu, better than Itachi at it, in his own style, with Uzumaki stamina; enormous Uzumaki chakra reserves even before Thousand Souls, so heavy-chakra jutsu (Shadow Clones, Majestic Destroyer Flame, Earth Flow Rampart, the Adamantine Sealing Chains) are within reach. No tantō, no kenjutsu. He can open the Eight Gates (Front and Reverse Lotus) as an option, never pushed by the story, the body paying after; never the eighth. Judge his fights at this level.';

// ---------------------------------------------------------------------------
// The vultures (section 6)

export type KanVulture = { name: string; meaning: string; role: string; line: string };

export const KAN_VULTURES: KanVulture[] = [
  {
    name: 'Okuri',
    meaning: 'sending off',
    role: 'The courier',
    line: 'Carries your letters and brings news back, at flying speed.',
  },
  {
    name: 'Hōmuri',
    meaning: 'burial',
    role: 'The scout',
    line: 'Flies ahead, circles over what you should see, and comes back to lead you there.',
  },
  {
    name: 'Tomurai',
    meaning: 'mourning',
    role: 'The watcher',
    line: 'Stays near you, guards your camps and warns of anyone coming; the one that sits on your shoulder.',
  },
];

/** How they look, for the narrator and images. */
export const KAN_VULTURE_LOOK =
  'bearded vultures coloured like the real bird except that what a wild one has rust-orange (head, crown, neck, chest, belly, feathered legs) is blood red, almost blood-soaked; dark slate-black back, wings and long wedge tail with fine pale streaks, a black mask through the eye, a black beard under the bill, a pale patch above the mask, a red ring around the eye. Red and black, never all red.';

export const KAN_VULTURES_LINE = `Kan's vultures (fixed): like Itachi's crows, no summoning contract and not ordinary birds, but part of Kan, made of his chakra; ${KAN_VULTURE_LOOK} He spawns them whenever and wherever he wants (night, rain and terrain don't matter); they never die: one destroyed is remade from his chakra, the only cost. They cannot talk: they show what they mean by where they fly, what they bring and how they behave. Three have names: Okuri the courier (carries his letters, brings news back at flying speed), Hōmuri the scout (flies ahead, circles over what he should see, leads him there; he does not see through its eyes) and Tomurai the watcher (stays near him, guards camps, warns of anyone approaching, sits on his shoulder). A nameless flock makes up his Vulture Clone, Vulture Flight and any circling birds. Hardly anyone in the Leaf has seen them (he never had a reason to use them there); Itachi has and knows they are his. Origin: in his ANBU year he kept three dying young vultures alive on his own chakra until it was what they were made of.`;

// ---------------------------------------------------------------------------
// The eyes (section 5)

export const KAN_MANGEKYO_PATTERN =
  'black iris with a red pattern: a red ring around the pupil, three red vulture bills hooking inward from the ring toward a red pupil, three red spirals of half a turn each starting at the bills and easing out into a red rim; ring, spirals and rim the same thickness';

export const KAN_ETERNAL_PATTERN =
  'red iris with a black pattern: three black camellia petals reaching the rim, three black half-turn spirals easing into a black rim, a solid black centre holding three red vulture bills and a red pupil';

export const KAN_MANGEKYO_LINE = `Kan's Mangekyō (fixed): pattern: ${KAN_MANGEKYO_PATTERN}. Left eye: Sky Burial (Chōsō), a genjutsu needing held eye contact: the target lies out on a mountain, the circling blood-red vultures land, surround and eat them, and as they eat the target's chakra is consumed and flows into Kan; it drains a lot and, like Thousand Souls, permanently grows his reserve, but takes no chakra nature. Fused with Thousand Souls, anyone who can't break free is drained completely: whole reserve into Kan, their nature taken, and they die unless Kan stops it on purpose; a fused use counts toward Thousand Souls' ten uses. Right eye: Okuribi, a black-red flame that burns chakra, not flesh: it eats a jutsu in flight, a barrier, a chakra cloak, can put out Amaterasu; on a person it burns their chakra until they collapse empty; Kan gains nothing from it (the left eye feeds, the right only destroys); it burns until no chakra is left unless he puts it out; the right eye bleeds, and big targets (a Susanoo, a tailed beast's cloak) strain it badly. Susanoo: blood red; it starts as ribs and an arm and grows with use. Every use wears his eyes toward blindness.`;

export const KAN_ETERNAL_LINE = `Kan's Eternal Mangekyō (fixed): Izumi's eyes, his cousin's; pattern: ${KAN_ETERNAL_PATTERN}. No more blindness: his sight is back. Sky Burial works on any eye contact and catches two or three people at once; Okuribi can be shaped (a wall, a ring, diving vultures) as Sasuke shapes Amaterasu; Perfect Susanoo becomes possible. Third ability, inherited from Izumi: the Long Dream (Nagayume): the target lives a whole happy life in a single moment, the way Izumi died inside Itachi's genjutsu; nothing hurts, and on waking they have to live with having lost it. The life it shows is the one Izumi described to Kan on the roof on her twelfth birthday; let him recognise it, never spell it out.`;

export const GYRE_LINE =
  'Gyre (Senkai), Kan’s own jutsu, open to him now that he has Wind from Thousand Souls: anything thrown or fired at him is caught in a spiral around him, circles like vultures on a thermal, and is sent back. He has to work it out and practise it on the page before he can use it in a fight.';

/** Lines for the narrator's sheet, for what Kan has now. */
export function kanPowerLines(db: Pick<AppDatabase, 'state'>): string[] {
  return [
    KAN_FIGHTER_LINE,
    KAN_VULTURES_LINE,
    kanHasEternal(db) ? KAN_ETERNAL_LINE : kanHasMangekyo(db) ? KAN_MANGEKYO_LINE : '',
    kanHasStolenWind(db) ? GYRE_LINE : '',
  ].filter(Boolean);
}

/** Which of his eyes an image should show, when they are active in the scene. */
export function kanEyeReference(db: Pick<AppDatabase, 'state'>, sceneText: string): 'mangekyo' | 'eternal' | null {
  if (!kanHasMangekyo(db) && !kanHasEternal(db)) return null;
  if (!/\b(mangeky\w*|sky burial|ch[oō]s[oō]|okuribi|susanoo|long dream|nagayume)\b/i.test(sceneText)) return null;
  return kanHasEternal(db) ? 'eternal' : 'mangekyo';
}
