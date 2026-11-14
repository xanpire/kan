import { calculateAge } from './calendar';
import { KAN_AKATSUKI_OUTFIT, KAN_BLACK_OUTFIT, KAN_HAIR_AND_EYES, KAN_NOSE, kanOutfit } from './kanLook';
import { KAN_PROFILE_LABEL } from './image';
import { locationKindOf } from './encounters';
import { localizePlaceNames } from './glossary';
import type { PlannedReference } from './referencePlan';
import type {
  AppDatabase,
  PortraitExpression,
  PortraitRecord,
  PortraitSetting,
  PortraitSignature,
} from './types';

/**
 * A portrait only depends on a few coarse traits, so it goes stale when one of
 * them changes — not on every mood wording tweak.
 */
const EXPRESSION_RULES: Array<{ expression: PortraitExpression; keywords: string[] }> = [
  { expression: 'angry', keywords: ['angry', 'furious', 'rage', 'enraged', 'livid', 'hostile', 'vengeful', 'bitter'] },
  { expression: 'sad', keywords: ['grief', 'grieving', 'sad', 'mourning', 'heartbroken', 'sorrow', 'tearful', 'despair'] },
  { expression: 'tired', keywords: ['exhausted', 'tired', 'weary', 'drained', 'spent', 'numb', 'hollow', 'wounded', 'injured'] },
  { expression: 'warm', keywords: ['warm', 'happy', 'content', 'amused', 'relieved', 'fond', 'cheerful', 'hopeful', 'playful', 'gentle'] },
  { expression: 'grim', keywords: ['guarded', 'grim', 'cold', 'tense', 'wary', 'focused', 'determined', 'suspicious', 'alert', 'resolute'] },
];

export function expressionFromMood(mood: string): PortraitExpression {
  const lower = mood.toLowerCase();
  let best: { expression: PortraitExpression; index: number } | null = null;

  // The earliest matching word usually leads the mood ("numb, guarded, …").
  for (const rule of EXPRESSION_RULES) {
    for (const keyword of rule.keywords) {
      const index = lower.search(new RegExp(`\\b${keyword}`));

      if (index >= 0 && (!best || index < best.index)) {
        best = { expression: rule.expression, index };
      }
    }
  }

  return best?.expression ?? 'calm';
}

function settingOf(db: AppDatabase): PortraitSetting {
  switch (locationKindOf(db)) {
    case 'settlement':
      return 'village';
    case 'road':
      return 'road';
    case 'structure':
      return 'indoors';
    default:
      return 'wilds';
  }
}

/** Wearing the cloak now, not merely owning it (audit 11c; `kanOutfit`). */
export function wearsAkatsukiCloak(db: AppDatabase) {
  return kanOutfit(db).sheet === 'akatsuki';
}

export function portraitSignature(db: AppDatabase): PortraitSignature {
  return {
    age: calculateAge(db.state.inStoryDate, db.state.player.birthday, db.state.player.birthYear),
    outfit: wearsAkatsukiCloak(db) ? 'akatsuki' : 'black',
    expression: expressionFromMood(db.state.mood),
    setting: settingOf(db),
  };
}

const SETTING_LABEL: Record<PortraitSetting, string> = {
  village: 'a village',
  wilds: 'the wilds',
  road: 'on the road',
  indoors: 'indoors',
};

/** Why the latest portrait no longer matches Kan, or null if it still does. */
export function portraitStaleReason(
  latest: PortraitRecord | null,
  current: PortraitSignature
): string | null {
  if (!latest) {
    return 'No portrait yet';
  }

  const before = latest.signature;

  if (before.outfit !== current.outfit) {
    return current.outfit === 'akatsuki'
      ? 'Now wearing the Akatsuki cloak'
      : 'No longer in the Akatsuki cloak';
  }

  if (before.age !== current.age) {
    return `Turned ${current.age}`;
  }

  if (before.expression !== current.expression) {
    return `Looks ${current.expression} now`;
  }

  if (before.setting !== current.setting) {
    return current.setting === 'road' ? 'Now on the road' : `Now in ${SETTING_LABEL[current.setting]}`;
  }

  return null;
}

export function latestPortrait(db: AppDatabase): PortraitRecord | null {
  const portraits = db.portraits ?? [];
  return portraits.length > 0 ? portraits[portraits.length - 1] : null;
}

/** Short tag for the history strip: the outfit or age that sets it apart. */
export function portraitTag(portrait: PortraitRecord, index: number, all: PortraitRecord[]) {
  if (index === all.length - 1) {
    return 'NOW';
  }

  const next = all[index + 1];

  if (next && next.signature.age !== portrait.signature.age) {
    return String(portrait.signature.age);
  }

  return portrait.signature.outfit === 'akatsuki' ? 'CLOAK' : String(portrait.signature.age);
}

const EXPRESSION_TEXT: Record<PortraitExpression, string> = {
  calm: 'calm, composed, unreadable',
  grim: 'guarded and grim, jaw set, eyes sharp',
  angry: 'angry, brows drawn, a cold glare',
  tired: 'tired and hollow-eyed, shoulders heavy',
  warm: 'a rare softness, the hint of a smile',
  sad: 'grief held behind a steady face',
};

export function buildPortraitPrompt(
  db: AppDatabase,
  signature: PortraitSignature,
  references: PlannedReference[]
) {
  const outfit =
    signature.outfit === 'akatsuki'
      ? KAN_AKATSUKI_OUTFIT
      : `the plain black shinobi outfit, no Akatsuki cloak: ${KAN_BLACK_OUTFIT}`;
  const lines = [
    'Character portrait of Kan, a shinobi from the Naruto world. Dark cinematic anime illustration.',
    'Visual image only. No words, letters, numbers, captions, logos, watermarks or readable text anywhere.',
  ];

  references.forEach((reference, i) => {
    const n = i + 1;

    if (reference.kind === 'face') {
      lines.push(
        `Reference image ${n}: Kan's face sheet. Match his face exactly: ${KAN_HAIR_AND_EYES}, facial structure, hairline, and ${KAN_NOSE}.`
      );
    } else if (reference.kind === 'profile') {
      lines.push(`Reference image ${n}: ${KAN_PROFILE_LABEL}`);
    } else if (reference.kind === 'outfit') {
      lines.push(
        `Reference image ${n}: the outfit he wears now (${outfit}), shown without a person. Dress him in exactly this.`
      );
    } else if (reference.kind === 'previous') {
      lines.push(
        `Reference image ${n}: his previous portrait. Keep the same art style, framing and lighting, but update age, clothes, expression and background as described below.`
      );
    }
  });

  if (!references.some((reference) => reference.kind === 'face')) {
    lines.push(`Kan has ${KAN_HAIR_AND_EYES}, ${KAN_NOSE}, and a lean, guarded face.`);
  }

  lines.push(
    `Age: ${signature.age}. Draw him with the build and face of a ${signature.age}-year-old.`,
    `Expression: ${EXPRESSION_TEXT[signature.expression]}. Current mood: ${db.state.mood}.`,
    `Clothing: ${outfit}.`,
    `Background: softly blurred ${localizePlaceNames(db.state.location)}, ${SETTING_LABEL[signature.setting]}, at ${db.state.inStoryDate.hour}:${String(db.state.inStoryDate.minute).padStart(2, '0')}.`,
    'Framing: head and upper body, three-quarter view, centered, vertical portrait. Kan alone, no other people.',
    'Style: Naruto-inspired anime, gritty realism, moody lighting, red accents, high detail.',
    'Final reminder: no text or lettering in the image.'
  );

  return localizePlaceNames(lines.join('\n'));
}
