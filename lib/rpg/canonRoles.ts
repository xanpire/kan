// Canon protects itself (audit 6.19, decided by Xan). Anyone with a canon
// role still ahead of them cannot die early: the engine refuses the death,
// and their card tells the narrator they must get out of this scene alive.
// Anyone whose canon role is finished, and every original character, can die
// normally. Canon is never rewritten around an early death.
//
// Who a milestone needs: its own `needs` list when it has one, otherwise the
// canon people it names (title and description) plus the people it kills,
// leaving out anyone canon has already killed by then. The safety net (an old
// save where someone needed is dead anyway) reads only the key actors: the
// people the title names and the people it kills.

import { CANON_CAST } from './canonCast';
import { CANON_MILESTONES, type CanonMilestone } from './canonData';
import { isDeceased } from './deaths';
import type { AppDatabase, EntityRecord } from './types';

const SEEDED_CANON = ['Itachi Uchiha', 'Hana Inuzuka', 'Izumi Uchiha', 'Suzume'];

type Matcher = { name: string; pattern: RegExp };

let matchers: Matcher[] | null = null;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Full names, plus a first name that only one canon person has. */
function castMatchers(): Matcher[] {
  if (matchers) {
    return matchers;
  }

  const names = [...new Set([...CANON_CAST.map((entry) => entry.name), ...SEEDED_CANON])];
  const firstCounts = new Map<string, number>();

  for (const name of names) {
    const first = name.split(' ')[0];
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
  }

  matchers = names.map((name) => {
    const first = name.split(' ')[0];
    const forms = [name];

    if (first !== name && first.length >= 3 && firstCounts.get(first) === 1) {
      forms.push(first);
    }

    // Case-sensitive, whole words: "Pain" the man, not "in pain".
    return { name, pattern: new RegExp(`(?<![\\p{L}])(?:${forms.map(escape).join('|')})(?![\\p{L}])`, 'u') };
  });

  return matchers;
}

function namedIn(text: string): string[] {
  return castMatchers()
    .filter((matcher) => matcher.pattern.test(text))
    .map((matcher) => matcher.name);
}

type Roles = { needs: Map<string, string[]>; keyActors: Map<string, string[]> };

let roles: Roles | null = null;

function buildRoles(): Roles {
  if (roles) {
    return roles;
  }

  const needs = new Map<string, string[]>();
  const keyActors = new Map<string, string[]>();
  const deadByCanon = new Set<string>();

  for (const milestone of CANON_MILESTONES) {
    const alive = (name: string) => !deadByCanon.has(name);
    const deaths = milestone.deaths ?? [];
    const named = milestone.needs ?? namedIn(`${milestone.title}\n${milestone.description}`);

    needs.set(milestone.id, [...new Set([...named, ...deaths])].filter(alive));
    keyActors.set(
      milestone.id,
      [...new Set([...(milestone.needs ?? namedIn(milestone.title)), ...deaths])].filter(alive)
    );

    for (const name of deaths) {
      deadByCanon.add(name);
    }
  }

  roles = { needs, keyActors };
  return roles;
}

/** Who must be alive for this milestone to happen as written. */
export function milestoneNeeds(milestone: CanonMilestone): string[] {
  return buildRoles().needs.get(milestone.id) ?? [];
}

/** The people the milestone is about (its title and its deaths): the safety net reads these. */
export function milestoneKeyActors(milestone: CanonMilestone): string[] {
  return buildRoles().keyActors.get(milestone.id) ?? [];
}

const sameName = (entity: Pick<EntityRecord, 'name' | 'aliases'>, name: string) => {
  const lower = name.toLowerCase();
  return entity.name.toLowerCase() === lower || (entity.aliases ?? []).some((alias) => alias.toLowerCase() === lower);
};

/**
 * The next canon moment this person is still needed for, or null when their
 * canon role is over (or they never had one). Kan never has one.
 */
export function canonRoleAhead(db: AppDatabase, entity: Pick<EntityRecord, 'name' | 'aliases'>): CanonMilestone | null {
  if (entity.name.toLowerCase() === 'kan') {
    return null;
  }

  const progress = db.state.canonProgress;
  const completed = new Set(progress?.completed ?? []);
  const today = db.state.inStoryDate;
  const todayKey = today.year * 10000 + today.month * 100 + (today.day ?? 1);

  for (const milestone of CANON_MILESTONES) {
    if (completed.has(milestone.id)) {
      continue;
    }

    // A personal beat whose window has closed is no longer ahead.
    if (milestone.playerDriven && milestone.to) {
      const closes = milestone.to.year * 10000 + milestone.to.month * 100 + (milestone.to.day ?? 31);

      if (closes < todayKey) {
        continue;
      }
    }

    if (milestoneNeeds(milestone).some((name) => sameName(entity, name))) {
      return milestone;
    }
  }

  return null;
}

/**
 * The safety net: a key actor of this milestone is dead in this save (an old
 * save from before the guard, or a death by the player's own hand). The
 * milestone is then skipped, never fired as written.
 */
export function missingKeyActor(db: AppDatabase, milestone: CanonMilestone): string | null {
  for (const name of milestoneKeyActors(milestone)) {
    // The people it kills may be dead already only if they died some other way.
    const entity = db.entities.find((item) => sameName(item, name));

    if (entity && isDeceased(entity) && !(milestone.deaths ?? []).includes(name)) {
      return name;
    }
  }

  return null;
}

/** The line on the narrator's card for someone canon still needs. */
export function canonSurvivalLine(milestone: CanonMilestone) {
  return `[CANON: cannot die here; still needed for "${milestone.title}". If this scene would kill them, they get out alive: they escape, are pulled out, use a substitution, or are rescued.]`;
}
