import { characterFaceOf, latestCharacterPortrait } from './characterPortrait';
import { resolveEntity } from './entities';
import { displayName } from './names';
import { mentionsEntity } from './characterRefs';
import { localizePlaceNames } from './glossary';
import { completeChat, type CallUsage } from '../openrouter';
import { KAN_HAIR_AND_EYES, kanAgeLine, kanAgeNow, kanOutfit, kanRightNow, type KanOutfit } from './kanLook';
import type { PlannedReference } from './referencePlan';
import { flashbackImageNote, kanAgeAt, latestReplyIsFlashback } from './flashbacks';
import { entityAge, timeOfDayOf } from './calendar';
import {
  canonArtDirection,
  chipDirection,
  impactFrameAllowed,
  isScaleShot,
  jutsuLines,
  jutsuOnScreen,
  lightLine,
  lightNow,
  lookTags,
  recentShots,
  sceneMoment,
  shotTypeOf,
  type ShotChip,
  type ShotType,
} from './imageDirection';
import { CONDITION_INFO } from './weather';
import { placeLookOf } from './placeLooks';
import type { AppDatabase, EntityRecord } from './types';
import { REANIMATED_LOOK, isReanimated } from './deaths';

/** At most one earlier scene is sent, for rendering style only (#4). */
const RECENT_IMAGE_LIMIT = 1;

/** People in the scene: 5 normally, up to 10 for an ensemble shot. */
export const SCENE_CAST_LIMIT = 5;
export const ENSEMBLE_CAST_LIMIT = 10;

function sceneCast(db: AppDatabase, limit = SCENE_CAST_LIMIT): string[] {
  const fromState = (db.state.sceneCast ?? []).filter(
    (name) => name.toLowerCase() !== 'kan'
  );

  if (fromState.length > 0) {
    return fromState.slice(0, limit);
  }

  const latestAssistant = [...db.rawLog]
    .reverse()
    .find((message) => message.kind === 'story' && message.role === 'assistant');
  const text = `${latestAssistant?.content ?? ''} ${db.state.scene}`;

  return db.entities
    .filter(
      (entity) =>
        entity.type === 'character' &&
        entity.name.toLowerCase() !== 'kan' &&
        mentionsEntity(text, entity)
    )
    .slice(0, limit)
    .map((entity) => entity.name);
}

/** Most people sent as references in one scene image (more for an ensemble). */
export const SCENE_CHARACTER_LIMIT = 3;

import { isCanonCharacter } from './canonPeople';

export { isCanonCharacter };

/**
 * How many people can get their own reference slot: what the model takes,
 * minus Kan's face and outfit.
 */
export function personReferenceSlots(maxReferences: number, withOutfit = true) {
  return Math.max(0, maxReferences - 1 - (withOutfit ? 1 : 0));
}

/**
 * People named in the image's ACTION who have a face reference or a painted
 * portrait, in the order the ACTION names them. Their face reference wins
 * over a portrait. Images are still stored references (img:...); load them
 * before sending.
 */
export function sceneCharacterReferences(
  db: AppDatabase,
  action: string,
  limit = SCENE_CHARACTER_LIMIT,
  /** Spend slots on original characters first: the model can't guess them (#6c). */
  originalsFirst = false
): Array<{ entity: EntityRecord; name: string; image: string; source: 'face' | 'portrait' }> {
  const found: Array<{ entity: EntityRecord; name: string; image: string; source: 'face' | 'portrait'; at: number }> = [];

  for (const entity of db.entities) {
    if (entity.type !== 'character' || entity.name.toLowerCase() === 'kan' || !mentionsEntity(action, entity)) {
      continue;
    }

    const face = characterFaceOf(db, entity.id);
    const portrait = face ? null : latestCharacterPortrait(db, entity.id);
    const image = face?.image ?? portrait?.image;

    if (!image) {
      continue;
    }

    const lower = action.toLowerCase();
    const at = Math.min(
      ...[entity.name, ...entity.aliases]
        .map((name) => lower.indexOf(name.toLowerCase()))
        .filter((index) => index >= 0),
      Number.MAX_SAFE_INTEGER
    );

    found.push({ entity, name: entity.name, image, source: face ? 'face' : 'portrait', at });
  }

  const rank = (entry: { entity: EntityRecord }) => (originalsFirst && isCanonCharacter(entry.entity) ? 1 : 0);

  return found
    .sort((a, b) => rank(a) - rank(b) || a.at - b.at)
    .slice(0, Math.max(0, limit))
    .sort((a, b) => a.at - b.at)
    .map(({ at: _at, ...rest }) => rest);
}

export function collectRecentSceneImages(db: AppDatabase) {
  return db.rawLog
    .filter((message) => message.kind === 'story' && message.role === 'assistant' && message.image)
    .slice(-RECENT_IMAGE_LIMIT)
    .map((message) => message.image as string)
    .reverse();
}

/** The shot type of the newest scene image, to decide whether it can guide style. */
export function lastShotType(db: AppDatabase): ShotType | null {
  const last = [...db.rawLog]
    .reverse()
    .find((message) => message.kind === 'story' && message.role === 'assistant' && message.image);
  const meta = last?.imageMeta;

  return (meta?.shotType as ShotType | undefined) ?? shotTypeOf(meta?.shot);
}

/**
 * The previous image is only a style guide when it was framed the same way:
 * a different shot type would pull the new image toward the old composition.
 */
export function usePreviousForStyle(db: AppDatabase, shotType: ShotType | null) {
  const last = lastShotType(db);
  return !shotType || !last || last === shotType;
}

function tailOf(text: string, maxLength: number) {
  if (!text || text.length <= maxLength) {
    return text;
  }

  return `…${text.slice(-maxLength).trimStart()}`;
}

function latestStoryReply(db: AppDatabase) {
  return [...db.rawLog]
    .reverse()
    .find((message) => message.kind === 'story' && message.role === 'assistant');
}

function latestPlayerAction(db: AppDatabase, beforeId?: string) {
  const log = db.rawLog;
  const end = beforeId ? log.findIndex((message) => message.id === beforeId) : log.length;

  for (let i = (end < 0 ? log.length : end) - 1; i >= 0; i -= 1) {
    const message = log[i];

    if (message.kind === 'story' && message.role === 'user' && message.content.trim()) {
      return message.content.trim();
    }
  }

  return '';
}

function cleanProse(text: string) {
  return text
    .replace(/["“”]/g, ' ')
    .replace(/\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Used when the description call fails: the end of the reply, cleaned up. */
export function fallbackImageAction(db: AppDatabase) {
  const reply = latestStoryReply(db);
  return tailOf(cleanProse(reply?.content ?? db.state.scene), 700);
}

const IMAGE_ACTION_SYSTEM = `You are the director of one illustration of an interactive Naruto story, like an anime storyboard artist. The player character is Kan.

Read the narrator's latest reply and pick the single most dramatic INSTANT from it, normally the one at the END of the reply: a freeze frame, not a summary. Then write three lines.

ACTION: exactly who does what to whom at that instant, and where.
- One or two sentences, at most 45 words (up to 80 words for an ensemble shot, so you can place everyone), present tense, third person.
- The actor first, then the action, then the target. Keep the roles right; never swap who acts and who is acted on.
- Name people by name ("Kan", "Itachi"). Unnamed people get a short description ("a Stone ninja").
- Only people physically present in that moment. Include body positions, expressions at their peak, and any visible jutsu, weapon, or weather.
- No dialogue, sounds, thoughts, backstory, or text in the image.

SHOT: frame that instant like an anime key frame in a wide 16:9 frame. One line, in this order:
- shot type: extreme close-up | close-up | medium | full body | wide | extreme wide | aerial | ensemble | impact frame
- angle: worm's-eye | low angle | eye level | high angle | bird's-eye | over-the-shoulder | dutch tilt
- lens feel: wide-angle distortion | telephoto compression | shallow depth of field
- composition: where the subject sits (lower third, off-center, tiny in frame, filling the frame), and what fills the rest of the wide frame (open sky, smoke, flames, the jutsu, the landscape)
- focus: the ONE person who gets the sharpest light and the most space in the frame (usually Kan)
- emotion at its peak, shown physically (screaming with veins on the neck, tears streaking a bloodied face, eyes wide with Sharingan spinning)
- light and effects: the light given under "Light now" (never a sunset or a bright sky after dark, never sun under thick cloud), its colour, motion (wind-whipped hair and cloak, speed lines, debris, embers, dust, chakra glow)
Pick the shot that sells the moment:
- emotional peak: close-up or extreme close-up on a face
- jutsu or power: low angle or worm's-eye, the effect filling most of the frame
- the instant a blow lands, a shocking reveal: impact frame
- arrival, journey, calm: extreme wide, tiny figure, big landscape and sky
- aftermath or destruction: aerial or bird's-eye
- confrontation: over-the-shoulder, or two figures facing off across the frame
- a group together, a gathering, one against many: ensemble, with one of these layouts:
  - line-up: everyone facing the camera in a staggered V, the leader at the front, low angle, like an opening-credits shot
  - battle lines: Kan in the foreground seen from behind or over the shoulder, facing a row of opponents across the frame
  - circle: a high angle looking down on figures in a ring (an Akatsuki meeting: members as glowing ghostly projections standing on the fingers of the giant statue, faces lit from below)
  - depth layers: 1-2 sharp hero faces in front, the others in mid-ground, silhouettes or out-of-focus figures at the back
  - clash: two groups colliding mid-air, jutsu crossing between them
Avoid: eye-level medium shots of people standing, centered symmetrical framing, neutral faces, posing for the camera.

PLACE: how this location itself looks, so it can be painted the same way next time: landmarks, terrain, buildings, layout, at most 25 words; no people, no light, weather or time of day. If "This place looks like" is given below, keep to it and only add what is new.

CAPTION: the same moment for the player's scrapbook of photos of Kan's life. The player is Kan, so the caption calls Kan "you" and "your", never "Kan", "he" or "his": one sentence, at most 20 words, present tense, plain words ("You kneel at Izumi's grave and set down a white flower."). Call people only by the name you know them by (after "to you:"), or describe them.

Output exactly four lines and nothing else:
ACTION: <the action sentences>
SHOT: <the camera line>
PLACE: <the look of the place>
CAPTION: <the caption>`;

const LABELS = ['action', 'shot', 'place', 'caption'] as const;

/**
 * Splits the director's reply into the action, the camera line and the
 * caption. A reply without labels is all action (no shot, no caption).
 */
export function parseImageAction(text: string): { action: string; shot?: string; caption?: string; place?: string } {
  const found: Partial<Record<(typeof LABELS)[number], string>> = {};
  let rest = text;

  for (const label of ['shot', 'place', 'caption'] as const) {
    const match = new RegExp(`^\\s*\\**${label}\\**\\s*:\\s*(.+)$`, 'im').exec(rest);

    if (match) {
      found[label] = cleanProse(match[1]);
      rest = rest.replace(match[0], ' ');
    }
  }

  const caption = found.caption?.slice(0, 200);
  const shot = found.shot?.slice(0, 500);
  const place = found.place?.slice(0, 240);
  const action = cleanProse(rest).replace(/^action:\s*/i, '').slice(0, 700);

  return { action, ...(shot ? { shot } : {}), ...(caption ? { caption } : {}), ...(place ? { place } : {}) };
}

export type DirectorOptions = {
  /** A shot the player picked with a chip. */
  chip?: ShotChip;
};

export type DirectedImage = {
  action: string;
  shot?: string;
  shotType: ShotType | null;
  caption?: string;
  /** The director's one-line look of the location. */
  place?: string;
  usage: CallUsage;
  model: string;
};

/** People in the scene with their mood and how they look right now. */
function peopleNotes(db: AppDatabase, cast: string[]) {
  return cast
    .map((name) => {
      const entity = resolveEntity(db, name);
      const bits = [
        entity && isReanimated(entity) ? `reanimated by Edo Tensei: ${REANIMATED_LOOK}` : '',
        entity?.mood ? `mood: ${entity.mood}` : '',
        entity?.currentLook ? `looks: ${entity.currentLook}` : '',
      ]
        .filter(Boolean)
        .join('; ');

      return bits ? `${name} (${bits.slice(0, 160)})` : '';
    })
    .filter(Boolean);
}

/** What the director reads besides the reply: who, how they feel, light, jutsu, variety. */
export function directorContext(db: AppDatabase, options: DirectorOptions = {}): string | null {
  const reply = latestStoryReply(db);

  if (!reply?.content.trim()) {
    return null;
  }

  const cast = sceneCast(db, ENSEMBLE_CAST_LIMIT);
  const playerAction = latestPlayerAction(db, reply.id);
  // A reply inside a flashback: the memory's place and Kan at his age then.
  const memory = reply.flashback ? db.state.flashbacks?.active ?? null : null;
  const moment = sceneMoment(db, Boolean(reply.flashback));
  const sceneText = `${playerAction} ${reply.content}`;
  const jutsu = jutsuOnScreen(db, sceneText);
  const shots = recentShots(db);
  const forced = chipDirection(options.chip);
  const art = reply.flashback ? null : canonArtDirection(db);
  const notes = reply.flashback ? [] : peopleNotes(db, cast);

  return [
    memory || reply.flashback
      ? `This reply is a memory from Year ${reply.flashback!.date.year}: Kan is ${kanAgeAt(db, reply.flashback!.date)} years old in it.${memory ? ` Location: ${memory.place}.` : ''}`
      : `Location: ${db.state.location}.`,
    reply.flashback || !placeLookOf(db)?.look ? '' : `This place looks like: ${placeLookOf(db)!.look}`,
    reply.flashback ? '' : `Scene: ${db.state.scene}.`,
    reply.flashback ? '' : `Kan's clothes: ${outfitWords(kanOutfit(db))}. ${kanAgeLine(kanAgeNow(db))}`,
    reply.flashback ? '' : kanRightNow(db) ?? '',
    reply.flashback || !db.state.mood ? '' : `Kan's mood: ${db.state.mood}.`,
    reply.flashback
      ? ''
      : cast.length > 0 ? `Known people in the scene: ${cast.map((name) => {
          const entity = resolveEntity(db, name);
          const known = entity ? displayName(db, entity) : name;

          return known === name ? name : `${name} (to you: ${known})`;
        }).join(', ')}.` : 'Known people in the scene: none besides Kan.',
    notes.length > 0 ? `How they are: ${notes.join('; ')}.` : '',
    `Time and weather: ${timeOfDayOf(moment.date)}, ${String(moment.date.hour ?? 12).padStart(2, '0')}:${String(moment.date.minute ?? 0).padStart(2, '0')}; ${moment.weatherText ?? CONDITION_INFO[moment.condition].label}${moment.indoors ? ' (indoors)' : ''}.`,
    `Light now: ${lightNow(db, Boolean(reply.flashback))}.`,
    ...jutsu.map((record) => `Jutsu in this turn: ${record.name} looks like this: ${record.visual.trim()}`),
    art ? `ART DIRECTION for this moment in canon (a hint; still frame it around Kan and what he does): ${art}.` : '',
    reply.imageWorthy && !forced ? 'This is a key moment: go big.' : '',
    forced ? `The player asked for this shot: ${forced}. Use it.` : '',
    shots.length > 0
      ? `Recent images were framed: ${shots.map((shot) => `"${shot.slice(0, 90)}"`).join('; ')}. Don't repeat the same shot type and angle as last time unless the moment demands it.`
      : '',
    options.chip === 'impact' || impactFrameAllowed(db) ? '' : 'Do not use an impact frame this time (one was used recently).',
    playerAction ? `What Kan's player wrote this turn: ${tailOf(playerAction, 600)}` : '',
    '',
    'NARRATOR REPLY:',
    tailOf(reply.content.trim(), 4000),
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** A chip's shot type, to keep when the director answers with another. */
const CHIP_SHOT: Partial<Record<ShotChip, ShotType>> = {
  closeup: 'close-up',
  impact: 'impact frame',
  epic: 'extreme wide',
  ensemble: 'ensemble',
  aftermath: 'aerial',
};

/**
 * The director: writes the image's action, camera line and caption fresh
 * from the latest reply. Runs on the director model (the narrator model
 * unless Settings picks another) at a high temperature for varied framing,
 * and falls back to the cheap memory model. Returns null if both fail.
 */
export async function writeImageAction(
  apiKey: string,
  db: AppDatabase,
  signal?: AbortSignal,
  options: DirectorOptions = {},
  /** Why an attempt gave nothing, for the Debug log (audit 11c). */
  onFail?: (model: string, reason: string) => void
): Promise<DirectedImage | null> {
  const context = directorContext(db, options);

  if (!context) {
    return null;
  }

  const director = db.settings.imageDirectorModel?.trim() || db.settings.narrationModel;
  const cheap = db.settings.extractionModel || db.settings.summaryModel;
  const attempts = [
    { model: director, temperature: 0.75 },
    ...(cheap && cheap !== director ? [{ model: cheap, temperature: 0.5 }] : []),
  ];

  for (const attempt of attempts) {
    try {
      const result = await completeChat({
        apiKey,
        model: attempt.model,
        messages: [
          { role: 'system', content: IMAGE_ACTION_SYSTEM },
          { role: 'user', content: context },
        ],
        temperature: attempt.temperature,
        // Low reasoning and room to spare: a thinking model used to spend the
        // whole 900-token allowance thinking and return nothing (audit 11c).
        maxTokens: 1500,
        reasoning: { effort: 'low', exclude: true },
        signal,
      });
      const parsed = parseImageAction(result.text);

      if (!parsed.action) {
        onFail?.(attempt.model, 'empty answer');
        continue;
      }

      let shot = parsed.shot;
      let shotType = shotTypeOf(shot);
      const wanted = options.chip ? CHIP_SHOT[options.chip] : undefined;

      // A picked chip wins over the director's choice.
      if (wanted && shotType !== wanted) {
        shot = `${wanted}${shot ? `, ${shot}` : ''}`;
        shotType = wanted;
      }

      // Impact frames stay rare unless asked for.
      if (shotType === 'impact frame' && options.chip !== 'impact' && !impactFrameAllowed(db)) {
        shot = shot?.replace(/impact[- ]frame/i, 'close-up');
        shotType = 'close-up';
      }

      return {
        action: parsed.action,
        ...(shot ? { shot } : {}),
        shotType,
        ...(parsed.caption ? { caption: parsed.caption } : {}),
        ...(parsed.place ? { place: parsed.place } : {}),
        usage: result.usage,
        model: attempt.model,
      };
    } catch (error) {
      if (signal?.aborted) return null;
      onFail?.(attempt.model, error instanceof Error ? error.message.slice(0, 120) : 'failed');
    }
  }

  return null;
}

const KAN_LOOK = `Kan: a lean young shinobi with ${KAN_HAIR_AND_EYES}.`;

export type SceneStyle = 'fight' | 'quiet' | 'travel' | 'drama';

/**
 * The style opener follows the scene (audit 11c): every image used to be
 * styled as a fight, so quiet scenes came out tense.
 */
const STYLE_OPENERS: Record<SceneStyle, string> = {
  fight:
    'A dramatic widescreen anime key frame, like a still from a high-budget Naruto Shippuden fight episode: bold cel shading, clean line art, saturated colour with strong contrast, dynamic composition, film grain.',
  drama:
    'A cinematic widescreen anime key frame, like a still from a high-budget Naruto Shippuden episode: bold cel shading, clean line art, rich colour, a strong composition, film grain.',
  quiet:
    'A soft widescreen anime film still: gentle cel shading, clean delicate line art, natural muted colour, soft light, a feeling of stillness; the people at rest or close, nothing in motion that the moment does not need; film grain.',
  travel:
    'Widescreen painted anime background art, like an establishing shot of an anime film: a richly painted landscape with depth and atmospheric perspective, small figures in it with simple cel shading, film grain.',
};

/** Which opener fits: a fight, a quiet or emotional moment, the road, or anything else. */
export function sceneStyleOf(db: AppDatabase, shotType: ShotType | null, inMemory = false): SceneStyle {
  const mode = db.state.sceneMode;
  const beat = mode?.lastBeat;

  if (!inMemory && (mode?.current === 'fight' || beat === 'combat')) return 'fight';
  if (shotType === 'impact frame') return 'fight';
  if (beat === 'travel' || shotType === 'extreme wide' || (shotType === 'aerial' && beat !== 'action')) return 'travel';
  if (
    inMemory ||
    mode?.current === 'conversation' ||
    beat === 'exchange' ||
    beat === 'remark' ||
    beat === 'instruction' ||
    shotType === 'close-up' ||
    shotType === 'extreme close-up'
  ) {
    return 'quiet';
  }

  return 'drama';
}

function impactOpener(accent: string) {
  return `An anime impact frame: inverted, limited palette of black, white and ${accent}; rough expressive sketch lines; radial speed lines exploding from the point of impact; flat background.`;
}

const IDENTITY_ONLY =
  'Identity only: copy face, hair, eyes and clothing design. Ignore its pose, expression, framing, lighting and background. The expression comes from the ACTION and SHOT.';

/** What Kan wears, for the director. */
function outfitWords(outfit: KanOutfit) {
  if (outfit.sheet === 'akatsuki') return 'the Akatsuki cloak';
  if (outfit.sheet === 'black') return 'a plain black shinobi outfit';
  return outfit.words ?? 'his own clothes';
}

export type ScenePromptOptions = {
  shot?: string;
  shotType?: ShotType | null;
  /** The place's look: the remembered one, else the director's PLACE line. */
  placeLook?: string;
};

export function buildSceneImagePrompt(
  db: AppDatabase,
  references: PlannedReference[],
  action: string,
  options: ScenePromptOptions = {}
) {
  // A memory: Kan and everyone else at their age then, no present outfit.
  const memoryReply = latestReplyIsFlashback(db);
  const memoryNote = flashbackImageNote(db, memoryReply);
  const shotType = options.shotType ?? shotTypeOf(options.shot);
  const ensemble = shotType === 'ensemble';
  const cast = memoryNote ? [] : sceneCast(db, ensemble ? ENSEMBLE_CAST_LIMIT : SCENE_CAST_LIMIT);
  const outfit = kanOutfit(db);
  const cloak = outfit.sheet === 'akatsuki';
  const reply = latestStoryReply(db);
  const sceneText = `${action} ${options.shot ?? ''}`;
  const jutsu = jutsuOnScreen(db, `${sceneText} ${reply?.content ?? ''}`);
  const art = memoryNote ? null : canonArtDirection(db);
  const impact = shotType === 'impact frame';

  const currentOutfit = cloak
    ? 'the Akatsuki cloak'
    : 'the plain black shinobi outfit without the Akatsuki cloak';

  const alternateOutfit = cloak
    ? 'the plain black shinobi outfit without the Akatsuki cloak'
    : 'the Akatsuki cloak';

  const hasFace = references.some((reference) => reference.kind === 'face');
  const hasOutfit = references.some((reference) => reference.kind === 'outfit');
  const referenced = new Set(
    references.flatMap((reference) =>
      reference.kind === 'character' && reference.name ? [reference.name] : reference.kind === 'cast' ? reference.names ?? [] : []
    )
  );
  const date = memoryReply?.flashback?.date ?? db.state.inStoryDate;
  // Canon characters the model already knows, and anyone without a reference, get a look tag.
  const looks = lookTags(db, action, {
    exclude: new Set(
      db.entities
        .filter((entity) => referenced.has(entity.name) && !isCanonCharacter(entity))
        .map((entity) => entity.name)
    ),
    limit: ensemble ? 10 : 5,
    ageAt: (id) => {
      const entity = db.entities.find((item) => item.id === id);
      return entity ? entityAge(date, entity) : undefined;
    },
  });

  // 1. Frame and style first: image models weight the start most.
  const accentText = `${sceneText} ${jutsu.map((record) => record.visual).join(' ')}`;
  const accent = /\bamaterasu\b|black flame/i.test(accentText)
    ? 'violet'
    : /\b(chidori|lightning|raiton)\b/i.test(accentText)
      ? 'electric blue'
      : 'red';
  const lines = [
    impact ? impactOpener(accent) : STYLE_OPENERS[sceneStyleOf(db, shotType, Boolean(memoryReply))],
    'Visual image only: no words, letters, numbers, captions, subtitles, logos, watermarks, or readable text anywhere.',
  ];

  // 2. The camera, 3. the action.
  if (options.shot) {
    lines.push(`SHOT: ${options.shot}`);
  }

  // The light right after the camera: the clock and the weather decide it, and
  // the model weights early lines most (Session 1: a sunset painted after dark).
  // Not for impact frames: flat colour.
  if (!impact) {
    lines.push(lightLine(db, sceneText, Boolean(memoryReply)));
  }

  lines.push(`ACTION (depict this exactly): ${action}`);

  if (art) {
    lines.push(`ART DIRECTION: ${art}.`);
  }

  lines.push(...jutsuLines(jutsu));

  if (memoryNote) {
    lines.push(memoryNote);
  } else {
    lines.push(`Location: ${db.state.location}.`);
    const placeLook = options.placeLook ?? placeLookOf(db)?.look;
    if (placeLook) lines.push(`This place looks like: ${placeLook.replace(/\.$/, '')}.`);
  }

  // Kan's look.
  if (!hasFace) {
    lines.push(KAN_LOOK);
  }

  if (!memoryNote) {
    // His age now: the face sheet shows him at about 13 (audit 11c).
    lines.push(kanAgeLine(kanAgeNow(db)));

    if (outfit.sheet === null) {
      lines.push(`Kan's clothes right now: ${outfit.words}; neither of his usual outfits.`);
    } else if (!hasOutfit) {
      lines.push(
        cloak
          ? 'Kan wears the Akatsuki cloak: long black cloak with red clouds outlined in white, high collar.'
          : 'Kan wears a plain black shinobi outfit: fitted black top and pants, no Akatsuki cloak.'
      );
    } else {
      lines.push(`Kan currently wears ${currentOutfit}.`);
    }

    const now = kanRightNow(db);
    if (now) lines.push(now);
  }

  if (looks.length > 0) {
    lines.push(`How the others look: ${looks.join(' | ')}.`);
  }

  // 5. Reference labels, short, identity only.
  if (references.length > 0) {
    lines.push('Use the attached reference images as labelled below.');
  }

  references.forEach((reference, i) => {
    const n = i + 1;

    if (reference.kind === 'edit') {
      lines.push(`Reference image ${n}: the image to edit.`);
    } else if (reference.kind === 'face') {
      lines.push(
        `Reference image ${n}: Kan's face sheet (front, both profiles, back of head; no clothes). Match his face exactly: ${KAN_HAIR_AND_EYES}, facial structure, hairline. ${IDENTITY_ONLY}`
      );
    } else if (reference.kind === 'outfit') {
      lines.push(
        `Reference image ${n}: the clothes Kan currently wears (${currentOutfit}), front, side and back views with NO person. Dress Kan in exactly these clothes. ${IDENTITY_ONLY}`
      );
    } else if (reference.kind === 'alternate') {
      lines.push(
        `Reference image ${n}: the alternate outfit (${alternateOutfit}), views with NO person. Use only if the story explicitly changes his clothing.`
      );
    } else if (reference.kind === 'character') {
      const name = reference.name ?? 'this person';
      lines.push(
        reference.source === 'face'
          ? `Reference image ${n}: ${name}'s face, at ${memoryNote ? 'the age the memory note gives' : 'their current age'}, in this image's art style. ${IDENTITY_ONLY}`
          : `Reference image ${n}: a portrait of ${name}: their face, hair, colouring and usual clothing. ${IDENTITY_ONLY}`
      );
    } else if (reference.kind === 'place') {
      lines.push(
        `Reference image ${n}: this place${reference.name ? ` (${reference.name})` : ''} as it looked when Kan was here before. Keep its landmarks, buildings, terrain and layout. Ignore the people, the light, the weather and the camera in it; they belonged to another moment.`
      );
    } else if (reference.kind === 'cast') {
      const names = reference.names ?? [];
      lines.push(
        `Reference image ${n} is a cast sheet: left to right ${names.join(', ')}. Match each face to its name. The labels on the sheet are for you only; never draw them. ${IDENTITY_ONLY}`
      );
    } else {
      lines.push(
        `Reference image ${n}: a previous scene image, for rendering style and line quality only, not composition, camera or lighting. Ignore any characters or figures in it; they belonged to an older scene and must NOT appear now.`
      );
    }
  });

  if (hasFace) {
    lines.push(
      references.some((reference) => reference.kind === 'character' || reference.kind === 'cast')
        ? 'Kan\'s face sheet and outfit images are for Kan only; each other person\'s reference is for that person only, and never give one person another\'s face. Do not redesign Kan’s face or hairstyle.'
        : 'The reference images are for Kan\'s face and clothing only, and any other people in them must not appear. Do not redesign Kan’s face or hairstyle.'
    );
  }

  // 6. Rules, condensed at the end.
  lines.push(
    'ACTOR RULE: Kan performs the action unless the ACTION says someone else does. Any other person in the ACTION is the one being acted upon — a target, a captive, an ally. NEVER depict Kan as the victim of his own action. If the ACTION says Kan chokes someone, draw Kan choking the other person, never Kan holding his own throat.',
    isScaleShot(shotType)
      ? 'Only the people named in the ACTION may appear with recognisable faces. Unnamed extras described there are allowed, and so are tiny, distant, faceless figures, rooftops, smoke columns, a whole village or battlefield below. No other recognisable faces.'
      : 'Only the people named in the ACTION may appear. Unnamed extras explicitly described there (for example "a Stone ninja") are allowed. No other faces, no crowd, no bystanders.',
    cast.length > 0
      ? `Named people in this scene besides Kan: ${cast.join(', ')}.`
      : 'Named people in this scene besides Kan: none — any other person must come from the ACTION text itself.',
    ensemble
      ? 'Ensemble: keep every person distinct and readable; the focal person named in the SHOT gets the sharpest light and the most space.'
      : '',
    'Compose for the wide 16:9 frame: subjects off-center, the rest of the frame doing work (sky, landscape, effects).',
    'Final reminder: no text, lettering, captions, or watermarks in the image.',
  );

  return localizePlaceNames(lines.filter(Boolean).join('\n'));
}

/** A short edit of an existing image (#12): the image, plus Kan's face so it doesn't drift. */
export function buildRetouchPrompt(tweak: string, references: PlannedReference[]) {
  const lines = [
    `Edit this image: ${tweak.trim()}. Keep everything else the same: characters, faces, clothing, composition, style.`,
  ];

  references.forEach((reference, i) => {
    const n = i + 1;

    if (reference.kind === 'edit') {
      lines.push(`Reference image ${n}: the image to edit.`);
    } else if (reference.kind === 'face') {
      lines.push(`Reference image ${n}: Kan's face sheet. Keep his face exactly like this. ${IDENTITY_ONLY}`);
    }
  });

  lines.push('No text, lettering, captions, or watermarks in the image.');
  return lines.join('\n');
}
