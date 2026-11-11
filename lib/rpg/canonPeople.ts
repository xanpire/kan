// Who is a canon character: the canon cast plus the canon people the save
// starts with (seed.ts). Built lazily, on first use, so importing this from
// the entity code never runs into an import cycle at load time.

import { CANON_CAST } from './canonCast';
import type { EntityRecord } from './types';

const SEEDED_CANON = ['Itachi Uchiha', 'Hana Inuzuka', 'Izumi Uchiha', 'Suzume'];

let names: Set<string> | null = null;

/** Whether this is a canon character (by their real name). Kan is not. */
export function isCanonCharacter(entity: Pick<EntityRecord, 'name'>) {
  names ??= new Set([...CANON_CAST.map((entry) => entry.name), ...SEEDED_CANON].map((name) => name.toLowerCase()));
  return names.has(entity.name.toLowerCase());
}
