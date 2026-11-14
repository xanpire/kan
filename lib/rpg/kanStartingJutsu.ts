// Kan's starting jutsu (decided by Xan, 14 Nov 2026; section 10 of
// claude/before-variety-ideas.md): a young ANBU about Itachi's level, a master
// of taijutsu, Fire and Earth, enormous Uzumaki reserves, sealing from his
// father's scrolls, his vultures. No tantō, no Sharingan yet.

export type StartingJutsu = {
  name: string;
  chakraNature: string;
  effect: string;
  visual: string;
  description: string;
  tags: string[];
};

const j = (
  name: string,
  chakraNature: string,
  effect: string,
  visual: string,
  tags: string[],
  description = effect
): StartingJutsu => ({ name, chakraNature, effect, visual, description, tags: [...tags, 'kan'] });

export const KAN_STARTING_JUTSU: StartingJutsu[] = [
  // His taijutsu replaces the plain "Shinobi taijutsu" of older saves.
  j(
    'Taijutsu (your own style)',
    'Physical',
    'Master-level close combat in a style you built from watching others: better than Itachi’s, made for silent takedowns, precise strikes and quick escapes, and Uzumaki stamina lets you keep going long after others tire.',
    'Fast, economical movements with almost no sound; you close distance low and end exchanges in one or two blows.',
    ['taijutsu', 'signature'],
    'Your own taijutsu, master level.'
  ),
  j('Leaf Whirlwind', 'Physical', 'A spinning high-and-low kick combination of the Leaf’s taijutsu.', 'A blur of a spin, one heel high and one sweep low.', ['taijutsu']),
  j(
    'Eight Gates',
    'Physical',
    'Opening the first Gates, as Guy taught you, for a burst of speed and strength, with the Front Lotus and Reverse Lotus. An option, never a habit: the body pays after (torn muscles, exhaustion). Never the eighth.',
    'Your skin flushes red, veins stand out, and the ground cracks where you push off.',
    ['taijutsu', 'forbidden'],
    'The Eight Gates, with the Front and Reverse Lotus.'
  ),
  // Basics
  j('Transformation', 'None', 'Take on another person’s or thing’s appearance.', 'A puff of smoke and someone else stands there.', ['basic']),
  j('Substitution', 'None', 'Swap your body with a nearby object at the moment of a hit.', 'A log or a cloak takes the blow where you stood.', ['basic']),
  j('Body Flicker', 'None', 'Mastered: short-range high-speed movement that looks like vanishing.', 'You are simply somewhere else, a swirl of leaves or rain where you were.', ['basic']),
  j('Chakra control', 'None', 'Tree-walking and water-walking, second nature to you.', 'You stand on a wall or on moving water as if on stone.', ['basic']),
  j(
    'Shadow Clone',
    'None',
    'Real clones that share your chakra and send back what they learn when they vanish. Cheap for you with Uzumaki reserves.',
    'Copies of you step out of a puff of smoke, solid enough to bleed.',
    ['basic']
  ),
  // Weapons
  j('Shuriken and kunai', 'Physical', 'Thrown weapons with ANBU precision, including wire work.', 'Steel flashes in the dark, wires glinting between trees.', ['weapons']),
  j('Shadow Shuriken', 'Physical', 'A second shuriken hidden in the shadow of the first.', 'One star becomes two at the last instant.', ['weapons']),
  // Fire
  j('Great Fireball', 'Fire', 'The Uchiha rite of passage: a great ball of fire from the mouth.', 'A roaring sphere of orange fire lighting the night.', ['ninjutsu']),
  j('Phoenix Flower', 'Fire', 'Many small fireballs, often hiding shuriken inside them.', 'A spray of fist-sized fires curving through the air.', ['ninjutsu']),
  j('Fire Dragon Flame Bullet', 'Fire', 'A dragon-shaped stream of fire.', 'A long dragon of flame twisting toward its target.', ['ninjutsu']),
  j(
    'Majestic Destroyer Flame',
    'Fire',
    'Madara’s wall of fire: a vast sea of flame. Few have the chakra for it; you do.',
    'A wall of fire hundreds of metres wide rolls over the land.',
    ['ninjutsu']
  ),
  // Earth
  j('Earth Wall', 'Earth', 'A wall of earth raised from the ground for cover.', 'Rock heaves up in front of you.', ['ninjutsu']),
  j('Headhunter', 'Earth', 'Move through the ground and drag an enemy down into it up to the neck.', 'A hand closes on an ankle from the soil.', ['ninjutsu']),
  j('Earth Dragon Bullet', 'Earth', 'A dragon of earth that spits mud bullets.', 'A mud dragon rises and fires clods hard as stone.', ['ninjutsu']),
  j('Earth Flow Rampart', 'Earth', 'A huge rampart of earth, heavy on chakra.', 'A wall of rock the size of a fortress rises from the ground.', ['ninjutsu']),
  j('Hiding in Rock', 'Earth', 'Merge into stone to hide.', 'You sink into the rock face and are gone.', ['ninjutsu']),
  // Uzumaki
  j(
    'Adamantine Sealing Chains',
    'Yin-Yang',
    'Kushina’s chakra chains, rare even among the Uzumaki: they bind, block and seal. They came out on their own around ten; you have shown them to almost no one, and anyone who knew Kushina reacts.',
    'Golden chains of chakra burst from your back and wrap whatever you aim them at.',
    ['fuinjutsu', 'uzumaki', 'secret']
  ),
  j('Sensing barrier', 'None', 'An Uzumaki barrier that warns you when someone crosses it.', 'A faint seal drawn around a camp; you feel the moment it is crossed.', ['fuinjutsu', 'barrier']),
  j(
    'Sealing',
    'None',
    'Your father’s sealing: storage scrolls, explosive tags, binding seals, and a seal that locks a jutsu or object away.',
    'Ink lines crawl across paper or skin and close like a lock.',
    ['fuinjutsu', 'uzumaki']
  ),
  // Genjutsu
  j('Genjutsu Release', 'None', 'Break a genjutsu by disrupting your own chakra.', 'A sharp breath, and the false world cracks.', ['genjutsu']),
  j('Hell Viewing', 'Yin', 'Show a target their worst fear.', 'Leaves swirl, and their face goes white.', ['genjutsu']),
  // His own
  j(
    'Vulture Clone',
    'None',
    'Your version of Itachi’s crow clone: the clone, or the body that takes the hit, bursts into blood-red vultures.',
    'Where you stood, a flock of red-and-black vultures explodes upward.',
    ['original', 'signature', 'vultures']
  ),
  j(
    'Vulture Flight',
    'None',
    'Your body breaks apart into vultures that scatter and fly off, then gather somewhere else, fuse and rebuild you there. Costs chakra; birds struck down on the way are remade.',
    'You come apart into vultures; somewhere else they spiral down and become you again.',
    ['original', 'signature', 'vultures']
  ),
  j(
    'Your vultures',
    'None',
    'Okuri the courier, Hōmuri the scout and Tomurai the watcher, with a nameless flock beside them: spawned from your chakra anywhere, any time, never truly dead.',
    'Bearded vultures, slate-black backs and wings, blood red where a wild one is rust-orange.',
    ['original', 'signature', 'vultures']
  ),
];
