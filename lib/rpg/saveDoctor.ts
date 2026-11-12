// The save doctor (audit 11d): safe repairs for what the invariant checker
// finds. Pure. Only repairs that cannot lose story: a pointer to something
// that no longer exists is dropped or cleared, the dead leave the scene, an
// undo snapshot that no longer lines up is dropped. Anything that needs a
// choice (two people sharing a name, a name leak in old prose) is left for
// the player and still shows in the check.

import { CANON_MILESTONES } from './canonData';
import { isDeceased, isReanimated } from './deaths';
import { resolveEntity } from './entities';
import { KAN_CAN_DIE } from './kanFate';
import type { AppDatabase } from './types';

const PERSONAL_BEATS = new Set(CANON_MILESTONES.filter((milestone) => milestone.playerDriven).map((milestone) => milestone.id));

export type Repair = { db: AppDatabase; repairs: string[] };

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

export function repairSave(db: AppDatabase): Repair {
  const repairs: string[] = [];
  const entityIds = new Set(db.entities.map((entity) => entity.id));
  const eventIds = new Set(db.events.map((event) => event.id));
  const logIds = new Set(db.rawLog.map((entry) => entry.id));
  let next: AppDatabase = db;

  // Bonds, memory links and fact subjects that point at nobody.
  const bonds = next.bonds.filter((bond) => entityIds.has(bond.entityId));
  if (bonds.length !== next.bonds.length) {
    repairs.push(`Dropped ${plural(next.bonds.length - bonds.length, 'bond')} to people who are no longer on record.`);
    next = { ...next, bonds };
  }

  const links = next.eventEntities.filter((link) => eventIds.has(link.eventId) && entityIds.has(link.entityId));
  if (links.length !== next.eventEntities.length) {
    repairs.push(`Dropped ${plural(next.eventEntities.length - links.length, 'memory link')} to missing people or memories.`);
    next = { ...next, eventEntities: links };
  }

  let factsFixed = 0;
  const facts = next.facts.map((fact) => {
    const whoKnows = fact.whoKnows.filter((id) => entityIds.has(id));
    const subjectEntityId = fact.subjectEntityId && !entityIds.has(fact.subjectEntityId) ? null : fact.subjectEntityId;
    if (whoKnows.length === fact.whoKnows.length && subjectEntityId === fact.subjectEntityId) return fact;
    factsFixed += 1;
    return { ...fact, whoKnows, subjectEntityId };
  });
  if (factsFixed > 0) {
    repairs.push(`Cleared missing people from ${plural(factsFixed, 'fact')}.`);
    next = { ...next, facts };
  }

  let threadsFixed = 0;
  const threads = next.threads.map((thread) => {
    if (!thread.participantIds) return thread;
    const participantIds = thread.participantIds.filter((id) => entityIds.has(id));
    if (participantIds.length === thread.participantIds.length) return thread;
    threadsFixed += 1;
    return { ...thread, participantIds };
  });
  if (threadsFixed > 0) {
    repairs.push(`Cleared missing people from ${plural(threadsFixed, 'thread')}.`);
    next = { ...next, threads };
  }

  const letters = next.state.post?.letters;
  if (letters?.some((letter) => letter.entityId && !entityIds.has(letter.entityId))) {
    let count = 0;
    const fixed = letters.map((letter) => {
      if (!letter.entityId || entityIds.has(letter.entityId)) return letter;
      count += 1;
      const { entityId: _gone, ...rest } = letter;
      return rest as typeof letter;
    });
    repairs.push(`Unlinked ${plural(count, 'letter')} from people no longer on record (the letters stay).`);
    next = { ...next, state: { ...next.state, post: { ...next.state.post!, letters: fixed } } };
  }

  // Memory jobs whose turn is gone; messages a job covers that are gone.
  const jobs = (next.memoryJobs ?? [])
    .filter((job) => logIds.has(job.turnLogId))
    .map((job) => (job.logIds ? { ...job, logIds: job.logIds.filter((id) => logIds.has(id)) } : job));
  if (jobs.length !== (next.memoryJobs ?? []).length) {
    repairs.push(`Dropped ${plural((next.memoryJobs ?? []).length - jobs.length, 'memory job')} for turns that are gone.`);
  }
  if (next.memoryJobs) next = { ...next, memoryJobs: jobs };

  // Undo snapshots that no longer line up with the log.
  const snapshots = next.snapshots.filter(
    (snapshot) =>
      snapshot.rawLogLength <= next.rawLog.length &&
      snapshot.rawLogTail.every((entry, index) => next.rawLog[snapshot.rawLogLength - snapshot.rawLogTail.length + index]?.id === entry.id)
  );
  if (snapshots.length !== next.snapshots.length) {
    repairs.push(`Dropped ${plural(next.snapshots.length - snapshots.length, 'undo step')} that no longer matched the story.`);
    next = { ...next, snapshots };
  }

  // The dead leave the scene and stop travelling with Kan.
  const cast = next.state.sceneCast ?? [];
  const keptCast = cast.filter((name) => {
    const entity = resolveEntity(next, name);
    return entity && !(isDeceased(entity) && !isReanimated(entity));
  });
  if (keptCast.length !== cast.length) {
    repairs.push(`Took ${plural(cast.length - keptCast.length, 'name')} out of the scene (dead, or nobody on record).`);
    next = { ...next, state: { ...next.state, sceneCast: keptCast } };
  }

  let companionsFixed = 0;
  const entities = next.entities.map((entity) => {
    let changed = entity;
    if (entity.companion && isDeceased(entity)) {
      companionsFixed += 1;
      const { companion: _gone, ...rest } = changed;
      changed = rest as typeof entity;
    }
    if (!KAN_CAN_DIE && entity.name.trim().toLowerCase() === 'kan' && (entity.deceased || entity.status === 'Deceased')) {
      repairs.push('Kan was marked dead; he is alive again.');
      const { deceased: _gone, ...rest } = changed;
      changed = { ...(rest as typeof entity), status: entity.status === 'Deceased' ? 'Missing-nin' : entity.status };
    }
    return changed;
  });
  if (companionsFixed > 0) repairs.push(`${plural(companionsFixed, 'dead companion')} no longer travelling with you.`);
  if (entities.some((entity, index) => entity !== next.entities[index])) next = { ...next, entities };

  // Money and canon.
  if ((next.state.purse?.ryo ?? 0) < 0) {
    repairs.push('The purse was below zero; set to 0.');
    next = { ...next, state: { ...next.state, purse: { ...next.state.purse!, ryo: 0 } } };
  }

  const progress = next.state.canonProgress;
  if (progress) {
    const done = new Set(progress.completed);
    const active = progress.active.filter((id) => !(done.has(id) && PERSONAL_BEATS.has(id)));
    if (active.length !== progress.active.length) {
      repairs.push(`Closed ${plural(progress.active.length - active.length, 'story beat')} that had already happened.`);
      next = { ...next, state: { ...next.state, canonProgress: { ...progress, active } } };
    }
  }

  return { db: next, repairs };
}
