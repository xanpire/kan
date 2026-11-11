// Who is dead. A death is recorded on the person's own record, so the
// narrator, the state tracker and the bonds screen all see it every turn —
// not only as a fact that may or may not make the 10-fact cut.
//
// Two ways someone dies during play:
// - a canon milestone fires (canonData `deaths`), stamped with the milestone's
//   event, so Kan only "knows" once that news reaches him or he was there;
// - the state tracker reports `deaths` (someone dies on screen, or Kan sees
//   the body or is told), which Kan knows at once.
//
// What Kan knows matters: the bonds screen never shows a death before the
// story has told him, so it cannot spoil news that is still on its way.

import { CANON_MILESTONES } from './canonData';
import type { AppDatabase, CalendarDate, EntityRecord } from './types';

/** Tag left by markAlive, so loading a save never kills them again. */
const REVIVED_TAG = 'revived';

export type DeathMark = {
  date?: CalendarDate;
  cause?: string;
  /** Kan saw it or was told. */
  known?: boolean;
  /** The canon event that killed them; Kan knows once this news is heard. */
  canonEventId?: string;
};

/** Dead, whether or not Kan knows it yet. */
export function isDeceased(entity: Pick<EntityRecord, 'deceased' | 'status'>): boolean {
  return Boolean(entity.deceased) || entity.status === 'Deceased';
}

/** Dead, and the story has let Kan know. */
export function kanKnowsDeath(db: AppDatabase, entity: EntityRecord): boolean {
  if (!isDeceased(entity)) {
    return false;
  }

  const death = entity.deceased;

  if (!death) {
    // Seeded as deceased with no record (old saves): treat as known.
    return true;
  }

  if (death.known) {
    return true;
  }

  return Boolean(death.canonEventId && db.state.canonProgress?.heard?.[death.canonEventId]);
}

export function markDeceased(db: AppDatabase, entityId: string, mark: DeathMark): AppDatabase {
  const index = db.entities.findIndex((entity) => entity.id === entityId);

  if (index === -1) {
    return db;
  }

  const entity = db.entities[index];

  if (entity.type !== 'character' || entity.name.toLowerCase() === 'kan') {
    return db;
  }

  const previous = entity.deceased;
  const cause = mark.cause?.trim().slice(0, 120);
  const deceased = {
    date: previous?.date ?? mark.date ?? db.state.inStoryDate,
    ...(previous?.cause || cause ? { cause: previous?.cause || cause } : {}),
    known: Boolean(previous?.known || mark.known),
    ...(previous?.canonEventId || mark.canonEventId
      ? { canonEventId: previous?.canonEventId ?? mark.canonEventId }
      : {}),
  };

  if (
    previous &&
    previous.known === deceased.known &&
    previous.canonEventId === deceased.canonEventId &&
    previous.cause === deceased.cause
  ) {
    return db;
  }

  const entities = [...db.entities];
  entities[index] = { ...entity, deceased };

  return { ...db, entities };
}

/**
 * Canon deaths, by exact name or alias only (hidden spoiler names included,
 * since this is the app's own canon data) — so "Inoichi Yamanaka" can never land on Ino and "Shikaku
 * Nara" never on Shikamaru. People the save does not have are skipped.
 */
/** Every name a person goes by in the app's own data, identities included (Nagato, Obito). */
function identityNames(entity: EntityRecord): string[] {
  // Never a name someone else owns (the masked man's claimed "Madara Uchiha").
  const identities = (entity.identities ?? []).filter((identity) => identity.alias !== false);

  return [
    entity.name,
    ...entity.aliases,
    ...identities.map((identity) => identity.name),
    ...identities.map((identity) => identity.name.split(/\s+/)[0]),
    ...(entity.hiddenAliases ?? []).map((alias) => alias.name),
  ];
}

export function markDeathsByName(db: AppDatabase, names: string[], mark: DeathMark): AppDatabase {
  let next = db;

  for (const name of names) {
    const wanted = name.trim().toLowerCase();
    const entity = next.entities.find(
      (item) =>
        item.type === 'character' &&
        // Canon data, not story text: an identity Kan hasn't learned still
        // finds its person ("Nagato" is Pain), without revealing it anywhere.
        identityNames(item).some((candidate) => candidate.trim().toLowerCase() === wanted)
    );

    if (entity) {
      next = markDeceased(next, entity.id, mark);
    }
  }

  return next;
}

/** A genuine return to life (or a death recorded by mistake). */
export function markAlive(db: AppDatabase, entityId: string): AppDatabase {
  const index = db.entities.findIndex((entity) => entity.id === entityId);

  if (index === -1 || !isDeceased(db.entities[index])) {
    return db;
  }

  const { deceased: _dropped, ...rest } = db.entities[index];
  const entities = [...db.entities];
  entities[index] = {
    ...rest,
    status: rest.status === 'Deceased' ? 'Alive' : rest.status,
    tags: rest.tags.includes(REVIVED_TAG) ? rest.tags : [...rest.tags, REVIVED_TAG],
  };

  return { ...db, entities };
}

/**
 * Brings older saves up to date when they load:
 * - canon milestones that already fired mark their dead (Jiraiya died in
 *   your save before deaths were recorded, so he is marked now);
 * - people who started out "Deceased" get a death record. If a milestone
 *   names them (Izumi and her funeral) Kan knows once that news is heard;
 *   otherwise he already knows.
 * Safe to run on every load: nothing changes once the records exist.
 */
export function normalizeDeaths(db: AppDatabase): AppDatabase {
  let next = db;
  const fired = new Set(next.events.map((event) => event.id));
  const canonDeathEvent = new Map<string, string>();

  for (const milestone of CANON_MILESTONES) {
    const eventId = `event_canon_${milestone.id}`;

    for (const name of milestone.deaths ?? []) {
      canonDeathEvent.set(name.toLowerCase(), eventId);
    }

    if (!milestone.deaths?.length || !fired.has(eventId)) {
      continue;
    }

    const event = next.events.find((item) => item.id === eventId);
    const living = {
      ...next,
      entities: next.entities.filter((entity) => !entity.tags?.includes(REVIVED_TAG)),
    };
    const marked = markDeathsByName(living, milestone.deaths, {
      date: event?.inStoryDate,
      canonEventId: eventId,
    });

    if (marked !== living) {
      const byId = new Map(marked.entities.map((entity) => [entity.id, entity]));
      next = { ...next, entities: next.entities.map((entity) => byId.get(entity.id) ?? entity) };
    }
  }

  const entities = next.entities.map((entity) => {
    if (entity.deceased || entity.status !== 'Deceased' || entity.type !== 'character') {
      return entity;
    }

    const eventId = identityNames(entity)
      .map((name) => canonDeathEvent.get(name.toLowerCase()))
      .find(Boolean);

    return {
      ...entity,
      deceased: eventId ? { known: false, canonEventId: eventId } : { known: true },
    };
  });

  return entities.some((entity, index) => entity !== next.entities[index]) ? { ...next, entities } : next;
}

/**
 * Once you know someone died, their bond says so ("Deceased · Teammate"),
 * instead of reading as if they were still alive. Before you know, nothing
 * changes, so the bonds screen never spoils a death.
 */
export function markKnownDeathsOnBonds(db: AppDatabase): AppDatabase {
  let changed = false;

  const bonds = db.bonds.map((bond) => {
    const entity = db.entities.find((item) => item.id === bond.entityId);

    if (!entity || !kanKnowsDeath(db, entity) || /^deceased\b/i.test(bond.status)) {
      return bond;
    }

    changed = true;
    return { ...bond, status: `Deceased · ${bond.status || 'Gone'}`.slice(0, 80) };
  });

  return changed ? { ...db, bonds } : db;
}

// ---------------------------------------------------------------------------
// The reanimated (audit 6.9): still dead, but here and able to act while
// Edo Tensei holds. They can be in the scene cast, share its memories and
// move a bond; they never become a companion or a romance.

/** The look an Edo Tensei body has, for cards and images. */
export const REANIMATED_LOOK = 'cracked, ash-grey skin like old paper, dark sclera';

/** Dead, and walking again through Edo Tensei right now. */
export function isReanimated(entity: Pick<EntityRecord, 'deceased' | 'status' | 'reanimated'>): boolean {
  return isDeceased(entity) && Boolean(entity.reanimated) && !entity.reanimated?.until;
}

/** Dead and not walking: the dead as most code means it. */
export function isGone(entity: Pick<EntityRecord, 'deceased' | 'status' | 'reanimated'>): boolean {
  return isDeceased(entity) && !isReanimated(entity);
}

function findByName(db: AppDatabase, name: string) {
  const wanted = name.trim().toLowerCase();
  return db.entities.find(
    (item) => item.type === 'character' && identityNames(item).some((candidate) => candidate.trim().toLowerCase() === wanted)
  );
}

/** Edo Tensei brings these dead back to act (a milestone, or the tracker's `reanimated`). */
export function markReanimated(db: AppDatabase, entityIds: string[], options: { by?: string; date?: CalendarDate } = {}): AppDatabase {
  const ids = new Set(entityIds);

  return {
    ...db,
    entities: db.entities.map((entity) =>
      ids.has(entity.id) && isDeceased(entity) && !isReanimated(entity)
        ? { ...entity, reanimated: { since: options.date ?? db.state.inStoryDate, ...(options.by ? { by: options.by } : {}) } }
        : entity
    ),
  };
}

/** The jutsu ends for these people (or for everyone it holds, by one caster): they pass on. */
export function markReleased(
  db: AppDatabase,
  select: { ids?: string[]; by?: string; all?: boolean; except?: string[] },
  date: CalendarDate = db.state.inStoryDate
): AppDatabase {
  const ids = new Set(select.ids ?? []);
  const except = new Set((select.except ?? []).map((name) => findByName(db, name)?.id).filter(Boolean) as string[]);

  return {
    ...db,
    entities: db.entities.map((entity) => {
      if (!isReanimated(entity) || except.has(entity.id)) return entity;
      const chosen = ids.has(entity.id) || select.all || (select.by && entity.reanimated?.by === select.by);
      return chosen ? { ...entity, reanimated: { ...entity.reanimated!, until: date } } : entity;
    }),
  };
}

/** For canon data, by name. */
export function reanimateByName(db: AppDatabase, names: string[], options: { by?: string; date?: CalendarDate }) {
  const ids = names.map((name) => findByName(db, name)?.id).filter((id): id is string => Boolean(id));
  return markReanimated(db, ids, options);
}
