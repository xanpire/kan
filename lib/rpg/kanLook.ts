// How Kan looks, in one place (audit 11c): his eyes and hair for every
// prompt that describes him (narrator card, portraits, scene images,
// flashbacks), his age now, how he looks at this moment, and which of his
// two outfits he is actually wearing.

import { calculateAge, dateSortValue } from './calendar';
import { isScratchedProtector } from './inventory';
import { EYES_ACTIVE_FACT, isKanEyesFact, kanEyes, kanEyesLine } from './kanEyes';
import type { AppDatabase, EntityRecord, KanEyes } from './types';

/** "soaked, Sharingan active, bloodied" without the Sharingan part while his eyes are off. */
export function withoutEyes(look: string, eyes: KanEyes): string {
  if (!look || eyes !== 'off') return look;
  return look
    .split(/\s*[;,]\s*|\.\s+/)
    .filter((part) => part && !EYES_ACTIVE_FACT.test(part) && !/\b(sharingan|mangeky[oō]|tomoe)\b/i.test(part))
    .join(', ');
}

/** Decided by Xan: Kan's eyes are brown (the Sharingan and Mangekyō override it while active). */
export const KAN_EYES = 'brown eyes';
export const KAN_HAIR = 'black spiky hair';
/** Hair and eyes together, for prompts: "black spiky hair and brown eyes". */
export const KAN_HAIR_AND_EYES = `${KAN_HAIR} and ${KAN_EYES}`;

/**
 * Decided by Xan (14 Nov 2026): almost a Roman nose. The face sheet has it
 * right, but nothing named it, so outside a clean profile the image model
 * fell back to a small, inward-curving anime nose.
 */
export const KAN_NOSE =
  'a long Roman nose: a high bridge with a gentle outward arch, subtle and not hooked, and a tip that points forward; never a small, upturned or inward-curving anime nose';
/** For short descriptions (the narrator card). */
export const KAN_NOSE_SHORT = 'a long, gently arched Roman nose';

/** Decided by Xan (14 Nov 2026): Kan wears boots, never sandals, in every era. */
export const KAN_BOOTS = 'black boots';

/**
 * His two outfits in words (decided 14 Nov 2026). Before the Akatsuki his
 * Leaf protector is worn at the waist on the cloth belt, plate on his left
 * (the knot is on his right), never on his forehead. With the cloak: bare
 * chest under it, the same trousers and boots, no protector anywhere.
 */
export const KAN_BLACK_OUTFIT =
  'a plain black high-collared shinobi top, black cloth wraps on his forearms (never white), a black cloth belt knotted on his right hip with his Hidden Leaf protector worn on it, the metal plate at his left hip (never on his forehead), loose black trousers and black boots';
export const KAN_AKATSUKI_OUTFIT =
  'the Akatsuki cloak (black with red clouds, high collar) with long, wide sleeves reaching his wrists, over a bare chest; his black cloth wraps (never white) show only at the wrists and hands; the same loose black trousers and black boots; no Leaf protector anywhere on him';
/** Image models default to shinobi sandals: said once, as the only negative. */
export const KAN_NO_SANDALS = 'Kan wears boots, never sandals.';

/** His base look on the narrator card (new stories; old saves are migrated). */
export const KAN_APPEARANCE = `Lean teenage shinobi with ${KAN_HAIR}, watchful ${KAN_EYES} and ${KAN_NOSE_SHORT}, wearing a plain black high-collared shinobi top with black cloth wraps on his forearms (never white), a cloth belt with his Leaf protector's plate at his left hip, black trousers and ${KAN_BOOTS}. No ANBU gear.`;

/**
 * Old saves said "dark watchful eyes", had no nose, and described the outfit
 * without the belt and boots: brought up to the current look.
 */
export function migrateKanEyes(appearance: string | undefined): string | undefined {
  if (!appearance) return appearance;
  let next = appearance.replace(/\bdark watchful eyes\b/i, `watchful ${KAN_EYES}`).replace(/\bblack hair\b/i, KAN_HAIR);
  if (!/\bnose\b/i.test(next)) next = next.replace(`watchful ${KAN_EYES}`, `watchful ${KAN_EYES} and ${KAN_NOSE_SHORT}`);
  if (/plain black high-collared shinobi outfit with bandage-wrapped forearms\./i.test(next)) {
    next = next.replace(
      /plain black high-collared shinobi outfit with bandage-wrapped forearms\./i,
      `plain black high-collared shinobi top with bandage-wrapped forearms, a cloth belt with his Leaf protector's plate at his left hip, black trousers and ${KAN_BOOTS}.`
    );
  }
  // Test run §5: uncoloured "bandages" were painted white.
  next = next.replace(/\bbandage-wrapped forearms\b/gi, 'black cloth wraps on his forearms (never white)');
  return next;
}

export function kanEntity(db: Pick<AppDatabase, 'entities'>): EntityRecord | undefined {
  return db.entities.find((entity) => entity.type === 'character' && entity.name.toLowerCase() === 'kan');
}

export function kanAgeNow(db: AppDatabase): number {
  return calculateAge(db.state.inStoryDate, db.state.player.birthday, db.state.player.birthYear);
}

/**
 * Kan at his age now, against the face sheet (drawn at about 13). The story
 * runs from 13 into his thirties, so the same face has to grow up.
 */
export function kanAgeLine(age: number): string {
  if (age <= 14) {
    return `Kan is ${age}: a boy, slight and not yet grown, exactly as the face sheet shows.`;
  }

  if (age <= 17) {
    return `Kan is ${age}: the same face, a little older, taller and leaner, a sharper jaw; a teenager, not a child.`;
  }

  if (age <= 22) {
    return `Kan is ${age}: the same face as a young man, older, taller and broader in the shoulders, a sharper jaw.`;
  }

  return `Kan is ${age}: the same face as a grown man in his ${age < 30 ? 'twenties' : 'thirties'}, full height, a hard sharp jaw, older eyes; a man, never a boy.`;
}

const CLOAK = /\b(akatsuki|red clouds?)\b/i;
const CLOAK_OFF =
  /\b(without|no|not|off|removed?|takes? off|took off|shed|folded|packed|stowed|hidden|tucked away|rolled up)\b[^.;,]{0,30}\b(akatsuki|cloak|red clouds?)\b|\b(akatsuki|cloak)\b[^.;,]{0,20}\b(off|folded|packed|stowed|put away|in (?:his|the) (?:pack|bag))\b/i;
const BLACK_OUTFIT = /\b(plain black|black shinobi|black high-collared|his black (?:outfit|clothes|gear))\b/i;
const OTHER_CLOTHES =
  /\b(disguis\w*|kimono|yukata|robe|robes|straw hat|travell?ing clothes|traveller'?s clothes|merchant|monk|civilian|peasant|farmer|poncho|rags|hooded|hood|mask|uniform|armou?r|flak jacket|vest|dressed as|wears? a|wearing a|in a [a-z]+ (?:coat|cloak))\b/i;

export type KanOutfit = {
  /** The reference sheet that matches what he wears, or null when it is something else. */
  sheet: 'akatsuki' | 'black' | null;
  /** What he wears in words, when it is neither sheet. */
  words?: string;
};

/**
 * What Kan is wearing now, not what he owns (audit 11c): his look of the
 * moment from the state tracker decides; with none, the cloak counts once he
 * has it. Only two outfits have sheets, so anything else goes in words.
 */
export function kanOutfit(db: AppDatabase): KanOutfit {
  const owns = db.state.inventory.some((item) => /akatsuki cloak/i.test(item));
  const look = kanEntity(db)?.currentLook?.trim() ?? '';

  if (look) {
    if (CLOAK.test(look) && !CLOAK_OFF.test(look)) return { sheet: 'akatsuki' };
    if (BLACK_OUTFIT.test(look)) return { sheet: 'black' };
    if (OTHER_CLOTHES.test(look)) return { sheet: null, words: look.slice(0, 200) };
    if (CLOAK_OFF.test(look)) return { sheet: 'black' };
  }

  return { sheet: owns ? 'akatsuki' : 'black' };
}

/**
 * What Kan has on right now, in words for the narrator's CURRENT STATE
 * (test run §8: "bare shins" while he wore trousers; a bare chest under the
 * cloak that the page never showed him change into).
 */
export function kanOutfitLine(db: AppDatabase): string {
  const outfit = kanOutfit(db);
  const wears =
    outfit.sheet === 'akatsuki'
      ? 'the Akatsuki cloak, closed, over a bare chest; loose black trousers and black boots; black cloth wraps at his wrists; his Leaf protector stowed out of sight'
      : outfit.sheet === 'black'
        ? "his plain black high-collared top, black cloth wraps on his forearms, a cloth belt with the Leaf protector's plate at his left hip, loose black trousers to the ankle and black boots"
        : outfit.words ?? 'his own clothes';
  return `Kan wears: ${wears}. Eyes: ${kanEyesLine(db)}.`;
}

/**
 * How Kan looks at this moment, for scene images: his look from the tracker
 * (soaked, bloodied, Sharingan active), his wounds and passing conditions,
 * and a scratched protector at his waist. Null when there is nothing to add.
 */
/** The scratched protector, as the image model and the check are told it (audit 11c.1). */
export const SCRATCHED_PROTECTOR_LINE =
  "Kan's Leaf protector, worn on his belt with the plate at his left hip: a deep horizontal scratch cut straight through the Leaf symbol (a rogue ninja's mark); never draw the plate whole, and never on his forehead.";

/** Where the protector is, for images and the check: at the waist before the cloak, out of sight after. */
export function kanProtectorPlace(db: AppDatabase): 'waist' | 'hidden' {
  return kanOutfit(db).sheet === 'akatsuki' ? 'hidden' : 'waist';
}

/** Kan carries a scratched forehead protector. */
export function kanProtectorScratched(db: Pick<AppDatabase, 'state'>) {
  return db.state.inventory.some(isScratchedProtector);
}

export function kanRightNow(db: AppDatabase, options: { protectorSaid?: boolean } = {}): string | null {
  const kan = kanEntity(db);
  const today = dateSortValue(db.state.inStoryDate);
  const bits: string[] = [];
  // A look of the moment that still says the Sharingan is on loses that part when it is off.
  const look = withoutEyes(kan?.currentLook?.trim() ?? '', kanEyes(db));

  if (look) bits.push(look.replace(/\.$/, ''));

  const conditions = db.facts
    .filter(
      (fact) =>
        fact.validTo === null &&
        (fact.type === 'injury' || fact.type === 'condition') &&
        (!fact.subjectEntityId || fact.subjectEntityId === kan?.id) &&
        (!fact.expiresAt || dateSortValue(fact.expiresAt) >= today) &&
        // His eyes come from the flag below, never from an old condition (test run §1).
        !isKanEyesFact(fact)
    )
    .slice(-4)
    // A condition's place is wherever it began, not here: only the state goes to the image (test run §9).
    .map((fact) =>
      (fact.type === 'condition' ? fact.text.replace(/\s+(?:on|at|atop|beside|by|near|under|beneath|inside) (?:the|a|this|that) [^,;.]+/gi, '') : fact.text)
        .trim()
        .replace(/\.$/, '')
    )
    .filter((text) => text && !bits.some((bit) => bit.toLowerCase().includes(text.toLowerCase())));

  bits.push(...conditions);
  // The eyes flag decides, every time: on, or brown with no Sharingan.
  bits.push(kanEyesLine(db));

  if (
    !options.protectorSaid &&
    kanProtectorScratched(db) &&
    kanProtectorPlace(db) === 'waist' &&
    !bits.some((bit) => /protector|headband/i.test(bit))
  ) {
    bits.push('the Leaf protector at his left hip has a deep scratch cut straight through the Leaf symbol');
  }

  // Whole conditions only, up to 400 characters (Session 4: "Your eyesight is .").
  const kept: string[] = [];
  for (const bit of bits) {
    if ([...kept, bit].join('; ').length > 400) break;
    kept.push(bit);
  }
  if (kept.length === 0) kept.push(bits[0].slice(0, 400).replace(/\s+\S*$/, ''));

  return `Kan right now: ${kept.join('; ')}. Show this on him.`;
}
