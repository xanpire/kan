// Names Kan knows. The narrator and the UI only ever call someone by a name
// Kan has actually learned: strangers are described by how they look until
// they give their name, someone else says it, a letter or document shows it,
// or Kan recognises them because they are famous. People with more than one
// identity (Tobi, Pain, Tenzo) are shown by the best one he knows, and
// everyone in the world calls them by the name *they* know.
//
// Data (who Kan knows at the start, identities, fame, labels) is in nameData.ts.

import { dateSortValue, entityAge } from './calendar';
import { milestoneKnown, resolveEntity } from './entities';
import { FAME, IDENTITIES, KNOWN_AT_START, LABELS, NAME_PARTS } from './nameData';
import type {
  AppDatabase,
  CalendarDate,
  EntityRecord,
  FameLevel,
  Identity,
  IdentityKind,
  NameHow,
  NameKnowledge,
  NamePart,
  NameParts,
  TurnDiff,
} from './types';

export const NAMES_VERSION = 1;

const PRIORITY: Record<IdentityKind, number> = { true: 3, claimed: 2, persona: 1 };
const HISTORY_CAP = 12;

const lower = (value: string) => value.trim().toLowerCase();

function isKan(entity: Pick<EntityRecord, 'name'>) {
  return lower(entity.name) === 'kan';
}

// ---------------------------------------------------------------------------
// Milestones

/** Whether a milestone has happened in the world ("start": always). */
export function happened(db: AppDatabase, milestoneId: string | undefined) {
  if (!milestoneId || milestoneId === 'start') return true;

  return Boolean(db.state.canonProgress?.completed?.includes(milestoneId));
}

/**
 * Whether a milestone has reached Kan: its news, or he was part of it (a beat
 * he lived is heard as "witnessed"). A personal beat that closed without him
 * taught him nothing.
 */
export function kanKnowsOf(db: AppDatabase, milestoneId: string | undefined) {
  if (!milestoneId || milestoneId === 'start') return true;

  return milestoneKnown(db, milestoneId);
}

// ---------------------------------------------------------------------------
// Name parts and identities

/** How a name splits: given, family, and the whole name shown once both are known. */
export function namePartsOf(entity: Pick<EntityRecord, 'name' | 'nameParts'>): NameParts {
  if (entity.nameParts) return entity.nameParts;

  const known = NAME_PARTS[entity.name];

  if (known) return known;

  const words = entity.name.trim().split(/\s+/).filter(Boolean);

  return words.length === 2 ? { given: words[0], family: words[1] } : { given: entity.name.trim() };
}

function fullNameOf(entity: Pick<EntityRecord, 'name' | 'nameParts'>) {
  return namePartsOf(entity).full ?? entity.name;
}

export function identitiesOf(entity: Pick<EntityRecord, 'name' | 'identities'>): Identity[] {
  return entity.identities ?? IDENTITIES[entity.name] ?? [];
}

/** People shown by identity rather than by name parts (Tobi, Pain, Tenzo). */
function hasIdentities(entity: Pick<EntityRecord, 'name' | 'identities'>) {
  return identitiesOf(entity).length > 1;
}

function knowsIdentity(entity: EntityRecord, identity: Identity) {
  if (entity.known === undefined) {
    // Older saves and story-introduced people: the names already on their record.
    return [entity.name, ...entity.aliases].some((name) => lower(name) === lower(identity.name));
  }

  return (entity.known.identities ?? []).some((name) => lower(name) === lower(identity.name));
}

function bestIdentity(identities: Identity[]) {
  return [...identities].sort((a, b) => PRIORITY[b.kind] - PRIORITY[a.kind])[0];
}

/** The name an identity reads as: a claimed one changes once its rename has happened (Masked Madara). */
function identityName(identity: Identity, renamedNow: boolean) {
  return identity.renamed && renamedNow && identity.kind !== 'true' ? identity.renamed.name : identity.name;
}

// ---------------------------------------------------------------------------
// What Kan knows

/** Kan knows at least one of their names. */
export function kanKnowsName(entity: EntityRecord) {
  if (isKan(entity) || entity.unnamed) return isKan(entity);
  if (entity.known === undefined) return true;
  if (hasIdentities(entity)) return identitiesOf(entity).some((identity) => knowsIdentity(entity, identity));

  return Boolean(entity.known.given || entity.known.family);
}

/** Kan knows their whole name (both parts, or their highest identity). */
function kanKnowsFully(entity: EntityRecord) {
  if (isKan(entity)) return true;
  if (entity.unnamed) return false;
  if (entity.known === undefined) return true;

  if (hasIdentities(entity)) {
    const truth = identitiesOf(entity).find((identity) => identity.kind === 'true');

    return truth ? knowsIdentity(entity, truth) : identitiesOf(entity).every((identity) => knowsIdentity(entity, identity));
  }

  const parts = namePartsOf(entity);

  return Boolean((!parts.given || entity.known.given) && (!parts.family || entity.known.family));
}

/** The short description for someone Kan cannot name yet. */
export function labelOf(db: AppDatabase, entity: EntityRecord): string {
  return entity.known?.label ?? (entity.unnamed ? entity.name : makeLabel(db, entity));
}

/**
 * The one name everything shows: the best identity Kan knows, else the parts
 * of the name he has heard in canon order (given only: "Karin"; both:
 * "Karin Uzumaki"; family only: "Uzumaki"), else his description of them.
 */
export function displayName(db: AppDatabase, entity: EntityRecord | null | undefined): string {
  if (!entity) return 'someone';
  if (entity.type !== 'character' || isKan(entity)) return entity.name;
  if (entity.unnamed) return labelOf(db, entity);

  const identities = identitiesOf(entity);

  if (identities.length > 1) {
    const known = identities.filter((identity) => knowsIdentity(entity, identity));

    if (known.length === 0) return labelOf(db, entity);

    const best = bestIdentity(known);

    return identityName(best, Boolean(best.renamed && kanKnowsOf(db, best.renamed.after)));
  }

  if (entity.known === undefined) return entity.name;

  const parts = namePartsOf(entity);
  const given = entity.known.given && parts.given;
  const family = entity.known.family && parts.family;

  if (given && (family || !parts.family)) return family ? fullNameOf(entity) : parts.given!;
  if (given) return parts.given!;
  if (family) return parts.family!;

  return labelOf(db, entity);
}

/** Looks up a person by id and returns their display name. */
export function displayNameOf(db: AppDatabase, entityId: string | null | undefined, fallback = 'someone') {
  const entity = entityId ? db.entities.find((item) => item.id === entityId) : undefined;

  return entity ? displayName(db, entity) : fallback;
}

/** Other names Kan has learned for them, for "Also known as". */
export function alsoKnownAs(db: AppDatabase, entity: EntityRecord): string[] {
  if (entity.type !== 'character' || isKan(entity)) return [];

  const shown = lower(displayName(db, entity));
  const names = new Set<string>();

  for (const identity of identitiesOf(entity)) {
    if (identitiesOf(entity).length > 1 && knowsIdentity(entity, identity)) {
      names.add(identity.name);
      if (identity.renamed && kanKnowsOf(db, identity.renamed.after)) names.add(identity.renamed.name);
    }
  }

  for (const item of entity.known?.history ?? []) {
    if (item.part === 'identity' || item.part === 'full') names.add(item.name);
  }

  // Older saves and story people: the aliases they already had are names Kan knew.
  if (entity.known === undefined && !entity.unnamed && !hasIdentities(entity)) {
    for (const alias of entity.aliases.slice(0, 4)) names.add(alias);
  }

  // "Kakashi" and "Hatake Kakashi" are only the shown name again; "Copy Ninja Kakashi" is another.
  const shownWords = new Set(shown.split(/\s+/));
  const sameName = (name: string) => lower(name).split(/\s+/).every((word) => shownWords.has(word));

  return [...names].filter((name) => name.trim().length > 0 && !sameName(name)).slice(0, 6);
}

/** Every name the player may search by: only names Kan knows, never a hidden one. */
export function searchableNames(db: AppDatabase, entity: EntityRecord): string[] {
  const label = !kanKnowsName(entity) ? [labelOf(db, entity)] : [];

  return [displayName(db, entity), ...alsoKnownAs(db, entity), ...label];
}

/**
 * For the narrator's lists (bonds, the dead, elsewhere, companions): the name
 * Kan knows, or his description with the truth marked as narrator-only.
 */
export function narratorName(db: AppDatabase, entity: EntityRecord): string {
  const shown = displayName(db, entity);

  if (isKan(entity) || entity.unnamed || kanKnowsName(entity)) return shown;

  return `${shown} [Kan doesn't know their name; narrator only: ${entity.name}]`;
}

// ---------------------------------------------------------------------------
// Labels

function nounFor(db: AppDatabase, entity: EntityRecord) {
  const age = entityAge(db.state.inStoryDate, entity);

  if (entity.gender === 'female') {
    if (age !== undefined && age < 16) return 'girl';
    if (age !== undefined && age >= 60) return 'old woman';
    if (age !== undefined && age < 22) return 'young woman';
    return 'woman';
  }

  if (entity.gender === 'male') {
    if (age !== undefined && age < 16) return 'boy';
    if (age !== undefined && age >= 60) return 'old man';
    if (age !== undefined && age < 22) return 'young man';
    return 'man';
  }

  return 'stranger';
}

const LOOK_WORDS = new Set([
  'hair', 'eyes', 'eye', 'mask', 'scar', 'scars', 'cloak', 'tattoo', 'tattoos', 'markings', 'beard', 'goatee', 'glasses',
  'headband', 'robe', 'robes', 'armor', 'armour', 'sword', 'gourd', 'fan', 'bandages', 'braid', 'braids', 'bun', 'ponytail',
  'horns', 'teeth', 'skin', 'piercings', 'hood', 'staff', 'pipe', 'scythe', 'cleaver', 'umbrella', 'kimono', 'apron',
]);
const STOP_WORDS = new Set(['with', 'a', 'an', 'the', 'and', 'in', 'of', 'his', 'her', 'their', 'over', 'under', 'on', 'wearing', 'usually']);

/** "Athletic girl with tousled brown hair, …" → "the girl with tousled brown hair". */
function makeLabel(db: AppDatabase, entity: EntityRecord): string {
  const fixed = LABELS[entity.name];

  if (fixed) return fixed;

  const noun = nounFor(db, entity);
  const words = (entity.appearance ?? '').split(/[.;]/)[0].split(/\s+/).filter(Boolean);
  const at = words.findIndex((word) => LOOK_WORDS.has(word.toLowerCase().replace(/[^a-z]/g, '')));

  if (at === -1) return `the ${noun}`;

  const phrase: string[] = [words[at].replace(/[^\p{L}-]/gu, '')];

  for (let index = at - 1; index >= 0 && phrase.length < 4; index -= 1) {
    const word = words[index];
    const bare = word.toLowerCase().replace(/[^\p{L}-]/gu, '');

    // Stop at a clause break, a joining word, or a name ("the puppet Hiruko").
    if (!bare || /[,:()]$/.test(word) || STOP_WORDS.has(bare) || /^\p{Lu}/u.test(word) && index > 0) break;
    phrase.unshift(bare);
  }

  return `the ${noun} with ${phrase.join(' ').toLowerCase()}`;
}

function placeWord(location: string) {
  return location.replace(/\s*\(.*\)$/, '').split(/[,·—-]/)[0].trim();
}

/** A label nobody else on the bonds list has: a detail is added if two would match. */
export function uniqueLabel(db: AppDatabase, entity: EntityRecord, label: string): string {
  const taken = new Set(
    db.entities
      .filter((item) => item.id !== entity.id && item.type === 'character' && !kanKnowsName(item) && item.met !== false)
      .map((item) => lower(labelOf(db, item)))
  );

  if (!taken.has(lower(label))) return label;

  const place = placeWord(db.state.location ?? '');
  const withPlace = place ? `${label} (${place})` : label;

  if (!taken.has(lower(withPlace))) return withPlace;

  for (let index = 2; index < 20; index += 1) {
    const numbered = `${label} (${index})`;
    if (!taken.has(lower(numbered))) return numbered;
  }

  return label;
}

/** Gives everyone present whom Kan cannot name a stable, unique label. */
export function ensureLabels(db: AppDatabase, ids: Iterable<string>): AppDatabase {
  const wanted = new Set(ids);
  let next = db;

  for (const entity of db.entities) {
    if (!wanted.has(entity.id) || entity.type !== 'character' || isKan(entity) || kanKnowsName(entity) || entity.known?.label) {
      continue;
    }

    const current = next.entities.find((item) => item.id === entity.id)!;
    const label = uniqueLabel(next, current, labelOf(next, current));
    next = withEntity(next, { ...current, known: { ...(current.known ?? {}), label } });
  }

  return next;
}

// ---------------------------------------------------------------------------
// Fame

export function fameOf(db: AppDatabase, entity: EntityRecord): FameLevel {
  const steps = FAME[entity.name];

  if (!steps || steps.length === 0) return 'unknown';

  let level: FameLevel = 'unknown';

  for (const step of steps) {
    if (happened(db, step.from)) level = step.level;
  }

  return level;
}

// ---------------------------------------------------------------------------
// Learning names

function withEntity(db: AppDatabase, entity: EntityRecord): AppDatabase {
  return { ...db, entities: db.entities.map((item) => (item.id === entity.id ? entity : item)) };
}

function findIdentity(entity: EntityRecord, name: string): Identity | undefined {
  const wanted = lower(name);
  const identities = identitiesOf(entity);

  return (
    identities.find((identity) => lower(identity.name) === wanted || (identity.renamed && lower(identity.renamed.name) === wanted)) ??
    identities.find((identity) => identity.name.split(/\s+/).some((word) => lower(word) === wanted)) ??
    identities.find((identity) => wanted.split(/\s+/).some((word) => word.length > 2 && lower(identity.name).includes(word)))
  );
}

/** Everything Kan knows of them, made explicit (an older record with no `known` knows its name). */
function explicitKnowledge(entity: EntityRecord): NameKnowledge {
  if (entity.known) return entity.known;

  if (hasIdentities(entity)) {
    return { identities: identitiesOf(entity).filter((identity) => knowsIdentity(entity, identity)).map((identity) => identity.name) };
  }

  return entity.unnamed ? {} : { given: true, family: true };
}

/**
 * Kan learns a name: a part of it, the whole of it, or one of their
 * identities. A stranger the story never named takes the name. Silent: no
 * notice, as in life.
 */
export function learnName(
  db: AppDatabase,
  entityId: string,
  learned: { name: string; part?: NamePart; how: NameHow }
): AppDatabase {
  const entity = db.entities.find((item) => item.id === entityId);
  const name = learned.name.trim().replace(/^["“”']+|["“”']+$/g, '');

  if (!entity || entity.type !== 'character' || isKan(entity) || !name) return db;

  const date = db.state.inStoryDate;
  const knowledge = explicitKnowledge(entity);
  const record = (part: NamePart) =>
    [...(knowledge.history ?? []).filter((item) => !(lower(item.name) === lower(name) && item.part === part)), { name, part, how: learned.how, date }].slice(-HISTORY_CAP);

  // A stranger with only a label: the name they gave becomes theirs.
  if (entity.unnamed) {
    const words = name.split(/\s+/).filter(Boolean);
    const parts: NameParts = words.length === 2 ? { given: words[0], family: words[1] } : { given: name };
    const renamed: EntityRecord = {
      ...entity,
      name,
      nameParts: parts,
      unnamed: undefined,
      known: { label: labelOf(db, entity), given: true, family: words.length === 2, history: record(words.length === 2 ? 'full' : 'given') },
    };
    delete renamed.unnamed;

    const oldName = lower(entity.name);

    return {
      ...withEntity(db, renamed),
      bonds: db.bonds.map((bond) => (bond.entityId === entity.id ? { ...bond, characterName: name } : bond)),
      state: {
        ...db.state,
        sceneCast: (db.state.sceneCast ?? []).map((item) => (lower(item) === oldName ? name : item)),
      },
    };
  }

  if (hasIdentities(entity)) {
    const identity = findIdentity(entity, name);

    if (!identity) return db;

    const identities = knowledge.identities ?? [];

    if (identities.some((item) => lower(item) === lower(identity.name))) return db;

    let next = withEntity(db, { ...entity, known: { ...knowledge, identities: [...identities, identity.name], history: record('identity') } });

    // Learned, the name now finds them in story text ("Obito Uchiha" and "Obito").
    if (identity.alias !== false) {
      next = addAlias(next, entity.id, identity.name);
      const first = identity.name.split(/\s+/)[0];
      if (first !== identity.name && owners(next, first) <= 1) next = addAlias(next, entity.id, first);
    }

    return next;
  }

  const parts = namePartsOf(entity);
  const wanted = lower(name);
  const full = lower(fullNameOf(entity));
  const words = wanted.split(/\s+/);
  let given = Boolean(knowledge.given);
  let family = Boolean(knowledge.family);
  let part: NamePart | null = null;

  // The whole name ("Karin Uzumaki"), never just a record named by its given name ("Karin").
  const whole = parts.family ? wanted === full || (words.includes(lower(parts.given ?? '')) && words.includes(lower(parts.family))) : wanted === full;

  if (whole) {
    given = true;
    family = true;
    part = 'full';
  } else if (parts.given && (wanted === lower(parts.given) || words.includes(lower(parts.given)))) {
    given = true;
    part = 'given';
  } else if (parts.family && (wanted === lower(parts.family) || words.includes(lower(parts.family)))) {
    family = true;
    part = 'family';
  } else if (entity.aliases.some((alias) => lower(alias) === wanted)) {
    // Another name they go by ("Copy Ninja Kakashi"): it carries the given name with it.
    given = true;
    part = 'full';
  }

  if (!part || (given === Boolean(knowledge.given) && family === Boolean(knowledge.family))) return db;

  return withEntity(db, { ...entity, known: { ...knowledge, given, family, history: record(part) } });
}

function addAlias(db: AppDatabase, entityId: string, name: string | null): AppDatabase {
  if (!name) return db;

  const entity = db.entities.find((item) => item.id === entityId)!;

  if ([entity.name, ...entity.aliases].some((item) => lower(item) === lower(name))) return db;

  return withEntity(db, { ...entity, aliases: [...entity.aliases, name].slice(0, 12) });
}

/** The state tracker's names_learned for this turn. */
export function applyNamesLearned(db: AppDatabase, learned: TurnDiff['namesLearned']): AppDatabase {
  let next = db;

  for (const item of learned ?? []) {
    // A stranger added this turn is found by the label they were added under.
    const id = item.entityId ?? resolveEntity(next, item.character)?.id;

    if (id) next = learnName(next, id, item);
  }

  return next;
}

/**
 * Identities that reach Kan through the canon timeline (the mask breaking,
 * the truth behind Pain), and names others learned because Kan or someone
 * in the scene told them.
 */
export function learnFromCanon(db: AppDatabase): AppDatabase {
  let next = db;

  for (const entity of db.entities) {
    if (entity.type !== 'character' || !hasIdentities(entity)) continue;

    for (const identity of identitiesOf(entity)) {
      if (identity.learnedWith?.some((id) => kanKnowsOf(db, id))) {
        next = learnName(next, entity.id, { name: identity.name, part: 'identity', how: 'news' });
      }
    }
  }

  return next;
}

/** Someone in the scene learned another identity of a person (Kan told Deidara who Tobi really is). */
export function applyNamesTold(db: AppDatabase, told: TurnDiff['namesTold']): AppDatabase {
  let next = db;

  for (const item of told ?? []) {
    const entity = item.entityId ? next.entities.find((entry) => entry.id === item.entityId) : undefined;

    if (!entity || !hasIdentities(entity)) continue;

    const identity = findIdentity(entity, item.name);
    const toldTo = item.toldTo.filter((id) => id !== entity.id);

    if (!identity || toldTo.length === 0) continue;

    const identities = identitiesOf(entity).map((current) =>
      current === identity
        ? { ...current, knownBy: [...(current.knownBy ?? []), { who: toldTo, on: next.state.inStoryDate }] }
        : current
    );
    const names = toldTo.map((id) => next.entities.find((entry) => entry.id === id)).filter(Boolean).map((person) => displayName(next, person));

    next = withEntity(next, { ...entity, identities });
    next = {
      ...next,
      facts: [
        ...next.facts,
        {
          id: `fact_names_${entity.id}_${dateSortValue(next.state.inStoryDate)}_${identity.name.replace(/\W+/g, '')}`,
          subjectEntityId: entity.id,
          type: 'secret',
          text: `${names.join(' and ')} learned that ${displayName(next, entity)} is ${identity.name}.`,
          whoKnows: toldTo,
          validFrom: next.state.inStoryDate,
          validTo: null,
          confidence: 'confirmed',
          sourceEventId: null,
        },
      ],
    };
  }

  return next;
}

/** Someone famous whose look gives them away is known on sight. */
export function recogniseOnSight(db: AppDatabase, ids: Iterable<string>): AppDatabase {
  let next = db;

  for (const id of ids) {
    const entity = next.entities.find((item) => item.id === id);

    if (!entity || entity.type !== 'character' || kanKnowsFully(entity) || fameOf(next, entity) !== 'sight') continue;

    const identity = hasIdentities(entity)
      ? bestIdentity(identitiesOf(entity).filter((item) => item.kind === 'true' || happened(next, item.publicFrom ?? '-')))
      : undefined;

    next = learnName(next, entity.id, { name: identity?.name ?? fullNameOf(entity), part: identity ? 'identity' : 'full', how: 'recognised' });
  }

  return next;
}

// ---------------------------------------------------------------------------
// Safety nets: names spoken aloud, and names that leak into narration

const QUOTED = /"([^"\n]{1,600})"|“([^”\n]{1,600})”/g;

function quotedSpans(text: string) {
  return [...text.matchAll(QUOTED)].map((match) => match[1] ?? match[2] ?? '');
}

function withoutQuotes(text: string) {
  return text.replace(QUOTED, ' ');
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A capitalised, whole-word name in the text ("Tobi", not "Sarutobi"; "Guy", not "the guy"). */
function namesInText(text: string, name: string) {
  const trimmed = name.trim();

  if (trimmed.length < 2 || !/^\p{Lu}/u.test(trimmed)) return false;

  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(trimmed)}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text);
}

/** How many people in the save go by this name (a shared name is left to the tracker). */
function owners(db: AppDatabase, name: string) {
  const wanted = lower(name);

  return db.entities.filter(
    (entity) =>
      entity.type === 'character' &&
      ([entity.name, ...entity.aliases, namePartsOf(entity).given ?? ''].some((item) => lower(item) === wanted) ||
        identitiesOf(entity).some((identity) => lower(identity.name) === wanted || identity.name.split(/\s+/).some((word) => lower(word) === wanted)))
  ).length;
}

/** The names of theirs Kan does not know yet, each with how learning it would count. */
function unknownNames(entity: EntityRecord): { name: string; part: NamePart }[] {
  if (entity.type !== 'character' || isKan(entity) || entity.unnamed || entity.known === undefined) return [];

  if (hasIdentities(entity)) {
    return identitiesOf(entity)
      .filter((identity) => !knowsIdentity(entity, identity) && identity.alias !== false)
      .flatMap((identity) => {
        const first = identity.name.split(/\s+/)[0];
        return [{ name: identity.name, part: 'identity' as const }, ...(first !== identity.name ? [{ name: first, part: 'identity' as const }] : [])];
      });
  }

  const parts = namePartsOf(entity);
  const out: { name: string; part: NamePart }[] = [];

  if (!kanKnowsFully(entity)) out.push({ name: fullNameOf(entity), part: 'full' });
  if (parts.given && !entity.known.given) out.push({ name: parts.given, part: 'given' });

  return out;
}

/**
 * Backup for the tracker: a present person's own, unshared name said aloud in
 * the narration's dialogue counts as heard.
 */
export function learnFromDialogue(db: AppDatabase, narration: string, presentIds: Iterable<string>): AppDatabase {
  const spoken = quotedSpans(narration).join('\n');

  if (!spoken) return db;

  let next = db;

  for (const id of presentIds) {
    const entity = next.entities.find((item) => item.id === id);

    if (!entity) continue;

    for (const candidate of unknownNames(entity)) {
      if (owners(next, candidate.name) === 1 && namesInText(spoken, candidate.name)) {
        next = learnName(next, entity.id, { ...candidate, how: 'overheard' });
      }
    }
  }

  return next;
}

/** Names the narration used outside dialogue that Kan could not know: for the Debug panel. */
export function nameLeaks(db: AppDatabase, narration: string): string[] {
  const prose = withoutQuotes(narration);
  const known = new Set(
    db.entities.filter((entity) => entity.type === 'character').flatMap((entity) => [lower(displayName(db, entity)), ...alsoKnownAs(db, entity).map(lower)])
  );
  const leaks: string[] = [];

  for (const entity of db.entities) {
    for (const candidate of unknownNames(entity)) {
      if (known.has(lower(candidate.name)) || !namesInText(prose, candidate.name)) continue;

      leaks.push(`${candidate.name} (Kan knows them as ${displayName(db, entity)})`);
      break;
    }
  }

  return leaks.slice(0, 8);
}

/**
 * Replaces names the narration used outside dialogue that Kan doesn't know
 * yet with the label he does know (audit 6b.2), keeping quotes untouched and
 * a capital at the start of a sentence. Returns the new text and what changed.
 */
export function scrubNameLeaks(db: AppDatabase, narration: string): { text: string; replaced: string[] } {
  const known = new Set(
    db.entities.filter((entity) => entity.type === 'character').flatMap((entity) => [lower(displayName(db, entity)), ...alsoKnownAs(db, entity).map(lower)])
  );
  const swaps: { name: string; label: string }[] = [];

  for (const entity of db.entities) {
    for (const candidate of unknownNames(entity)) {
      if (known.has(lower(candidate.name)) || !namesInText(withoutQuotes(narration), candidate.name)) continue;

      swaps.push({ name: candidate.name.trim(), label: displayName(db, entity) });
    }
  }

  if (swaps.length === 0) return { text: narration, replaced: [] };

  // Longest names first, so "Obito Uchiha" goes before "Obito".
  swaps.sort((a, b) => b.name.length - a.name.length);
  const replaced: string[] = [];
  // Only the parts outside quotation marks change.
  const pieces: { text: string; quoted: boolean }[] = [];
  let cursor = 0;

  for (const match of narration.matchAll(new RegExp(QUOTED.source, 'g'))) {
    const start = match.index ?? 0;
    if (start > cursor) pieces.push({ text: narration.slice(cursor, start), quoted: false });
    pieces.push({ text: match[0], quoted: true });
    cursor = start + match[0].length;
  }

  if (cursor < narration.length) pieces.push({ text: narration.slice(cursor), quoted: false });

  let soFar = '';
  const text = pieces
    .map((piece) => {
      if (piece.quoted) {
        soFar += piece.text;
        return piece.text;
      }

      let out = piece.text;

      for (const swap of swaps) {
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(swap.name)}(?=$|[^\\p{L}\\p{N}])`, 'gu');
        out = out.replace(pattern, (_whole, lead: string, offset: number, all: string) => {
          const before = soFar + all.slice(0, offset) + lead;
          const sentenceStart = /(^\s*|[.!?]["'”’)]*\s+|\n\s*)$/.test(before);
          const label = sentenceStart ? swap.label.charAt(0).toUpperCase() + swap.label.slice(1) : swap.label;
          if (!replaced.includes(swap.name)) replaced.push(swap.name);
          return `${lead}${label}`;
        });
      }

      soFar += out;
      return out;
    })
    .join('');

  return { text, replaced };
}

// ---------------------------------------------------------------------------
// Who calls them what

function matchesViewer(who: string, viewer: EntityRecord) {
  return who === viewer.id || lower(who) === lower(viewer.name);
}

/** The identities a viewer knows them by right now, with notes. */
function identitiesKnownBy(db: AppDatabase, entity: EntityRecord, viewer: EntityRecord) {
  const now = dateSortValue(db.state.inStoryDate);
  const out: { identity: Identity; playsAlong?: boolean; note?: string }[] = [];

  for (const identity of identitiesOf(entity)) {
    if (!happened(db, identity.existsFrom)) continue;

    if (isKan(viewer)) {
      if (knowsIdentity(entity, identity)) out.push({ identity });
      continue;
    }

    if (identity.publicFrom && happened(db, identity.publicFrom)) {
      out.push({ identity });
      continue;
    }

    const entry = (identity.knownBy ?? []).find(
      (knower) =>
        knower.who.some((who) => matchesViewer(who, viewer)) &&
        happened(db, knower.from) &&
        (!knower.on || dateSortValue(knower.on) <= now)
    );

    if (entry) out.push({ identity, playsAlong: entry.playsAlong, note: entry.note });
  }

  return out;
}

/** What one person in the world calls them ("Tobi" for Deidara, "Madara" for Itachi). */
export function nameKnownBy(db: AppDatabase, entity: EntityRecord, viewer: EntityRecord): string | null {
  if (isKan(viewer)) return kanKnowsName(entity) ? displayName(db, entity) : null;
  if (!hasIdentities(entity)) return entity.name;

  const known = identitiesKnownBy(db, entity, viewer);
  const usable = known.filter((item) => !item.playsAlong);
  const best = bestIdentity((usable.length > 0 ? usable : known).map((item) => item.identity));

  return best ? identityName(best, Boolean(best.renamed && happened(db, best.renamed.after))) : null;
}

const VOICES: Record<string, Partial<Record<IdentityKind, string>>> = {
  Tobi: {
    persona:
      'as Tobi: high, cheerful and clumsy; talks about himself in the third person ("Tobi is a good boy!"); acts cowardly and silly; pesters Deidara, who treats him like an annoying pet',
    claimed: 'as Madara: low, cold and controlled; above everyone',
  },
};

/**
 * For the narrator: the identity a person is using right now and what each
 * person present knows them as. Only for people with more than one identity.
 */
export function identityLine(db: AppDatabase, entity: EntityRecord, presentIds: string[]): string {
  const identities = identitiesOf(entity);

  // One name, one secret (Kabuto the spy).
  if (identities.length === 1 && identities[0].note) {
    const knowers = (identities[0].knownBy ?? []).filter((knower) => happened(db, knower.from)).flatMap((knower) => knower.who);

    return `  Truth (narrator only): ${identities[0].note}${knowers.length > 0 ? `; only ${knowers.join(', ')} know` : ''}.`;
  }

  if (!hasIdentities(entity)) return '';

  const truth = identities.find((identity) => identity.kind === 'true');
  const claimed = identities.find((identity) => identity.kind === 'claimed');
  const persona = identities.find((identity) => identity.kind === 'persona' && happened(db, identity.existsFrom));
  const kan = db.entities.find(isKan);
  const viewers = [
    ...(kan ? [kan] : []),
    ...presentIds.map((id) => db.entities.find((item) => item.id === id)).filter((item): item is EntityRecord => Boolean(item) && item!.id !== entity.id && !isKan(item!)),
  ];

  const views = viewers.map((viewer) => {
    const known = identitiesKnownBy(db, entity, viewer);
    const name = nameKnownBy(db, entity, viewer);
    const along = known.find((item) => item.playsAlong);
    const note = known.find((item) => item.note)?.note;
    const who = isKan(viewer) ? 'Kan' : displayName(db, viewer);

    return {
      viewer,
      best: bestIdentity(known.filter((item) => !item.playsAlong).map((item) => item.identity)),
      text: along
        ? `${who}: knows the truth (${along.identity.name}) but plays along${name ? ` and calls him ${name}` : ''}`
        : `${who}: ${name ? `knows him as ${name}` : 'does not know who he is'}${note ? ` (${note})` : ''}`,
    };
  });

  // The act holds whenever someone who only knows the persona is there.
  const truthPublic = truth?.publicFrom && happened(db, truth.publicFrom);
  const inUse = truthPublic
    ? truth!
    : persona && views.some((view) => !isKan(view.viewer) && view.best?.kind === 'persona')
      ? persona
      : claimed && (happened(db, claimed.publicFrom) || views.some((view) => view.best?.kind === 'claimed' || view.best?.kind === 'true'))
        ? claimed
        : (persona ?? claimed ?? truth!);
  const voices = VOICES[entity.name];
  const voice = voices?.[inUse.kind];
  const kanKnowsMask = Boolean(persona && claimed && kan && knowsIdentity(entity, claimed));

  const truthText = truth
    ? `truly ${truth.name}${truth.note ? `, ${truth.note}` : ''}${claimed ? `; claims to be ${claimed.name}` : ''}${persona ? `; plays "${persona.name}"` : ''}`
    : identities.map((identity) => identity.name).join(' / ');

  return [
    `  Truth (narrator only): ${truthText}.`,
    `  Going by "${identityName(inUse, Boolean(inUse.renamed && happened(db, inUse.renamed.after)))}" in this scene${voice ? `, ${voice}` : ''}.${
      voices && persona && claimed ? ' He switches in an instant: Tobi whenever anyone who only knows Tobi is there, Madara when alone with someone who knows him as Madara; the act sometimes slips into his serious side as a joke.' : ''
    }${kanKnowsMask ? ' Kan knows the act is a mask and may be expected to play along; keeping or breaking that silence has consequences.' : ''}`,
    `  Who knows him as what: ${views.map((view) => view.text).join('; ')}.`,
  ].join('\n');
}

/**
 * For CHARACTERS IN SCENE: how Kan knows them, and what the narrator may
 * call them.
 */
export function kanKnowsLine(db: AppDatabase, entity: EntityRecord): string {
  if (isKan(entity)) return '';

  if (!kanKnowsName(entity)) {
    const fame = fameOf(db, entity);

    return `Kan doesn't know their name: call them "${labelOf(db, entity)}" every time until he learns it${
      fame === 'heard' ? `; he has heard the name ${entity.name} but doesn't know the face (only an introduction or a clear sign tells him)` : ''
    }`;
  }

  if (!kanKnowsFully(entity) && !hasIdentities(entity)) {
    return `Kan knows them only as ${displayName(db, entity)} (narrator only: ${fullNameOf(entity)})`;
  }

  return `Kan knows them as ${displayName(db, entity)}`;
}

// ---------------------------------------------------------------------------
// Setup and older saves

function startKnowledge(name: string): NameKnowledge | undefined {
  const start = KNOWN_AT_START[name];

  if (start === true) return undefined;
  if (Array.isArray(start)) return { given: true, family: true, identities: [...start] };

  return {};
}

/** What a canon cast member starts with: known by name, or nothing but a label. */
export function castKnowledge(name: string): NameKnowledge | undefined {
  return startKnowledge(name);
}

/**
 * Load-time setup. Every save gets identities and name parts for the people
 * who need them, and the old spoiler-name lists become identities. A save
 * from before names were tracked keeps every name for everyone Kan already
 * met; the people he has not met start from what he knew at the beginning.
 */
export function ensureNames(db: AppDatabase): AppDatabase {
  const legacy = (db.state.namesVersion ?? 0) < NAMES_VERSION;

  const entities = db.entities.map((entity) => {
    if (entity.type !== 'character') return entity;

    let next = entity;
    const data = IDENTITIES[entity.name];

    if (!next.identities && data) {
      next = { ...next, identities: data.map((identity) => ({ ...identity, knownBy: identity.knownBy?.map((knower) => ({ ...knower, who: [...knower.who] })) })) };
    }

    if (next.hiddenAliases) {
      // The spoiler names now live as identities: a revealed one was moved
      // into aliases already, which knowsIdentity reads.
      const { hiddenAliases: _dropped, ...rest } = next;
      next = rest;
    }

    if (legacy && next.known === undefined && !isKan(next)) {
      if (next.met === false) {
        next = { ...next, known: startKnowledge(next.name) };
        if (next.known === undefined) delete next.known;
      } else if (hasIdentities(next)) {
        next = { ...next, known: explicitKnowledge(next) };
      }
    }

    return next;
  });

  const next = { ...db, entities, state: { ...db.state, namesVersion: NAMES_VERSION } };

  return legacy ? learnFromCanon(next) : next;
}

/** Everyone Kan learned about in the scene and through the world this turn. */
export function applyNameStep(
  db: AppDatabase,
  input: { learned?: TurnDiff['namesLearned']; told?: TurnDiff['namesTold']; narration: string; presentIds: string[] }
): AppDatabase {
  let next = applyNamesLearned(db, input.learned);
  next = applyNamesTold(next, input.told);
  next = recogniseOnSight(next, input.presentIds);
  next = learnFromDialogue(next, input.narration, input.presentIds);
  next = learnFromCanon(next);
  next = ensureLabels(next, input.presentIds);

  return next;
}

export type { CalendarDate };
