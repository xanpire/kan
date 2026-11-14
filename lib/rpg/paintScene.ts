// Painting a scene image, start to finish: the director frames it, the
// references are planned (with cast sheets for big scenes), the image is
// made (one or two takes), and the swapped-roles check runs and retries
// once. Also the quick retouch. The Story screen only shows the results.

import type { PaintStage } from './storyMarkers';
import { generateImage, type ImageModelCaps } from '../openrouter';
import { packPeopleReferences } from './castSheet';
import { recordDebugImage, recordDebugSideCall } from './debug';
import {
  buildRetouchPrompt,
  buildSceneImagePrompt,
  collectRecentSceneImages,
  fallbackImageAction,
  personReferenceSlots,
  viewAtReply,
  sceneCharacterReferences,
  usePreviousForStyle,
  writeImageAction,
  ENSEMBLE_CAST_LIMIT,
  SCENE_CAST_LIMIT,
} from './image';
import { checkSceneImage, imageCheckEnabled, sharperActorRule, type ImageCheck, checkWantsRepaint } from './imageCheck';
import { wantsEnsemble, type ShotChip } from './imageDirection';
import { loadImage, toDataUri } from './imageStore';
import { kanOutfit } from './kanLook';
import { placeKeyOf, placeLookOf } from './placeLooks';
import { wearsAkatsukiCloak } from './portrait';
import { faceDroppedWarning, loadKanReferenceImages, planReferences, type PlannedReference } from './referenceImages';
import type { AppDatabase, SceneImageMeta } from './types';

export type PaintedTake = { dataUri: string; meta: SceneImageMeta };

function recordCheck(turnId: string, apiKey: string, check: ImageCheck | null) {
  if (check) {
    recordDebugSideCall(turnId, { kind: 'imageCheck', model: check.model, usage: check.usage, apiKey });
  }
}

/** Paints the latest reply. Two takes when asked; each comes back with its record. */
export async function paintScene({
  apiKey,
  db,
  caps,
  chip,
  takes = 1,
  onWarning,
  onStage,
  replyId,
}: {
  apiKey: string;
  db: AppDatabase;
  caps: ImageModelCaps;
  /** An older reply to paint (audit 11c); the latest when left out. */
  replyId?: string;
  chip?: ShotChip;
  takes?: 1 | 2;
  onWarning?: (message: string) => void;
  /** Where the painting is, for the Story screen (audit 11b). */
  onStage?: (stage: PaintStage) => void;
}): Promise<{ turnId: string; takes: PaintedTake[] }> {
  // Everything below reads the story as it stood at that reply.
  db = replyId ? viewAtReply(db, replyId) : db;
  const latestAssistant = [...db.rawLog]
    .reverse()
    .find((message) => message.kind === 'story' && message.role === 'assistant');

  if (!latestAssistant) {
    throw new Error('Start the story first — there’s nothing to paint yet.');
  }

  const turnId = latestAssistant.id;
  onStage?.('framing');
  const recentRefs = collectRecentSceneImages(db);
  // How this place looked the first time it was painted (audit 11c).
  const placeKey = latestAssistant.flashback ? null : placeKeyOf(db);
  const placeRecord = placeKey ? placeLookOf(db) : null;
  const placeRef = placeRecord?.image && !recentRefs.includes(placeRecord.image) ? placeRecord.image : null;
  const [written, recentLoaded, kanRefs, placeLoaded] = await Promise.all([
    writeImageAction(apiKey, db, undefined, { chip }, (model, error) =>
      recordDebugSideCall(turnId, { kind: 'imageAction', model, usage: null, apiKey, error })
    ),
    Promise.all(recentRefs.map((ref) => loadImage(ref))),
    loadKanReferenceImages(wearsAkatsukiCloak(db)),
    placeRef ? loadImage(placeRef) : Promise.resolve(null),
  ]);

  if (written) {
    recordDebugSideCall(turnId, { kind: 'imageAction', model: written.model, usage: written.usage, apiKey });
  }

  const action = written?.action ?? fallbackImageAction(db);
  const shot = written?.shot;
  const shotType = written?.shotType ?? null;
  const ensemble = wantsEnsemble(chip, shotType);
  // A memory: Kan is a child there, so his present outfits stay out. Neither
  // do they when he wears something else (a disguise): it goes in words.
  const inMemory = Boolean(latestAssistant.flashback);
  const sheets = !inMemory && kanOutfit(db).sheet !== null;

  // People named in the action with a face reference or a portrait; original
  // characters first, since the model already knows the canon cast.
  const sceneRefs = sceneCharacterReferences(db, action, ensemble ? ENSEMBLE_CAST_LIMIT : SCENE_CAST_LIMIT, true);
  const loaded = await Promise.all(
    sceneRefs.map(async (person) => ({
      name: person.name,
      uri: (await loadImage(person.image)) ?? '',
      source: person.source,
      ref: person.image,
    }))
  );
  const people = await packPeopleReferences(loaded, personReferenceSlots(caps.maxReferences, sheets));

  // Which stored image each sent reference came from, for the image's record.
  const refOf = new Map<string, string>();
  loaded.forEach((person) => person.uri && refOf.set(person.uri, person.ref));
  recentLoaded.forEach((uri, index) => uri && refOf.set(uri, recentRefs[index]));
  if (placeLoaded && placeRef) refOf.set(placeLoaded, placeRef);
  // The last image guides rendering style only when it was framed the same way.
  const recentImages = usePreviousForStyle(db, shotType)
    ? recentLoaded.filter((uri): uri is string => Boolean(uri))
    : [];

  const plan = planReferences(
    [
      { kind: 'face', uri: kanRefs.face },
      ...(sheets ? [{ kind: 'outfit' as const, uri: kanRefs.outfit }] : []),
      ...people,
      ...(placeLoaded ? [{ kind: 'place' as const, uri: placeLoaded, name: db.state.location }] : []),
      ...recentImages.map((uri) => ({ kind: 'previous' as const, uri })),
      ...(sheets ? [{ kind: 'alternate' as const, uri: kanRefs.alternate }] : []),
    ],
    caps.maxReferences
  );

  if (plan.faceDropped) {
    onWarning?.(faceDroppedWarning(plan.faceDropped, caps.modelId));
  }

  const placeLook = placeRecord?.look ?? written?.place;
  const prompt = buildSceneImagePrompt(db, plan.references, action, { shot, shotType, ...(placeLook ? { placeLook } : {}) });
  const inputReferences = plan.references.map((reference) => reference.uri);

  const makeOne = async (text: string) => {
    onStage?.('painting');
    const startedAt = Date.now();
    const result = await generateImage({ apiKey, caps, prompt: text, inputReferences });
    recordDebugImage(turnId, 'image', caps.modelId, result.cost, Date.now() - startedAt);
    return result.dataUri;
  };

  const metaFor = (text: string, mightBeOff: boolean): SceneImageMeta => ({
    prompt: text,
    action,
    ...(written?.caption ? { caption: written.caption } : {}),
    ...(shot ? { shot } : {}),
    ...(shotType ? { shotType } : {}),
    ...(mightBeOff ? { mightBeOff: true } : {}),
    references: plan.references.map((reference) => referenceRecord(reference, refOf)),
    model: caps.modelId,
    createdAt: Date.now(),
    ...(placeKey ? { place: { key: placeKey, name: db.state.location, ...(placeLook ? { look: placeLook } : {}) } } : {}),
    // A repaint keeps the old image one step back, as a retouch does.
    ...(latestAssistant.image ? { previous: latestAssistant.image } : {}),
  });

  const check = imageCheckEnabled(db);
  const checkFailed = (model: string, error: string) =>
    recordDebugSideCall(turnId, { kind: 'imageCheck', model, usage: null, apiKey, error });

  if (takes === 2) {
    const images = await Promise.all([makeOne(prompt), makeOne(prompt)]);
    if (check) onStage?.('checking');
    const checks = check
      ? await Promise.all(images.map((image) => checkSceneImage(apiKey, db, image, action, undefined, checkFailed)))
      : [null, null];
    checks.forEach((result) => recordCheck(turnId, apiKey, result));

    return {
      turnId,
      takes: images.map((image, index) => ({
        dataUri: image,
        meta: metaFor(prompt, Boolean(checks[index] && (checkWantsRepaint(checks[index]) || checks[index]!.extraPeople))),
      })),
    };
  }

  const first = await makeOne(prompt);

  if (!check) {
    return { turnId, takes: [{ dataUri: first, meta: metaFor(prompt, false) }] };
  }

  const firstCheck = await (onStage?.('checking'), checkSceneImage(apiKey, db, first, action, undefined, checkFailed));
  recordCheck(turnId, apiKey, firstCheck);

  // Only reversed roles, or a scratched protector drawn whole, are worth a
  // second image (once); extra people are flagged.
  if (!checkWantsRepaint(firstCheck)) {
    return {
      turnId,
      takes: [{ dataUri: first, meta: metaFor(prompt, Boolean(firstCheck?.extraPeople)) }],
    };
  }

  const retryPrompt = `${prompt}\n${sharperActorRule(action, firstCheck!)}`;

  try {
    const second = await makeOne(retryPrompt);
    const secondCheck = await (onStage?.('checking'), checkSceneImage(apiKey, db, second, action, undefined, checkFailed));
    recordCheck(turnId, apiKey, secondCheck);

    if (!checkWantsRepaint(secondCheck)) {
      return {
        turnId,
        takes: [{ dataUri: second, meta: metaFor(retryPrompt, Boolean(secondCheck?.extraPeople)) }],
      };
    }

    // Both wrong: keep the one with fewer problems, flagged.
    const keepSecond = !secondCheck!.extraPeople && firstCheck!.extraPeople;
    return {
      turnId,
      takes: [
        keepSecond
          ? { dataUri: second, meta: metaFor(retryPrompt, true) }
          : { dataUri: first, meta: metaFor(prompt, true) },
      ],
    };
  } catch {
    return { turnId, takes: [{ dataUri: first, meta: metaFor(prompt, true) }] };
  }
}

function referenceRecord(reference: PlannedReference, refOf: Map<string, string>) {
  const name = reference.kind === 'cast' ? reference.names?.join(', ') : reference.name;

  return {
    kind: reference.kind,
    ...(name ? { name: String(name) } : {}),
    ...(refOf.get(reference.uri) ? { ref: refOf.get(reference.uri) } : {}),
  };
}

/**
 * The quick retouch (#12): edits an existing scene image with a short tweak
 * instead of painting a new one. Sends the image and Kan's face.
 */
export async function retouchSceneImage({
  apiKey,
  db,
  caps,
  logId,
  image,
  tweak,
}: {
  apiKey: string;
  db: AppDatabase;
  caps: ImageModelCaps;
  logId: string;
  /** The image as shown (a data URI or a blob: URL). */
  image: string;
  tweak: string;
}): Promise<PaintedTake> {
  if (caps.maxReferences === 0) {
    throw new Error(`${caps.modelId} can’t take an image to edit. Pick a reference-capable image model in Settings.`);
  }

  const entry = db.rawLog.find((item) => item.id === logId);
  const kanRefs = await loadKanReferenceImages(wearsAkatsukiCloak(db));
  // What the viewer shows may be a blob: URL; the model needs the image itself.
  const editImage = await toDataUri(image);
  const plan = planReferences(
    [
      { kind: 'edit', uri: editImage },
      { kind: 'face', uri: kanRefs.face },
    ],
    caps.maxReferences
  );
  const prompt = buildRetouchPrompt(tweak, plan.references);
  const startedAt = Date.now();
  const result = await generateImage({
    apiKey,
    caps,
    prompt,
    inputReferences: plan.references.map((reference) => reference.uri),
  });
  recordDebugImage(logId, 'image', caps.modelId, result.cost, Date.now() - startedAt);

  const old = entry?.imageMeta;

  return {
    dataUri: result.dataUri,
    meta: {
      ...(old ?? { action: '', references: [] }),
      prompt,
      tweak: tweak.trim().slice(0, 200),
      ...(entry?.image ? { previous: entry.image } : {}),
      mightBeOff: undefined,
      model: caps.modelId,
      createdAt: Date.now(),
    },
  };
}
