// Memories from each person's point of view (living-world Stage 3, section 12).
//
// Everyone in the room shares the same memory card. For the people who
// matter most (a major bond, a strong feeling either way, a companion), the
// chapter summary call also writes the memory as they would remember it:
// one line in their own voice, speaking to Kan as "you", limited to what
// they could see or hear. Only when the scene mattered to them; the model
// leaves the others out. No extra call: it rides on the summary.
//
// The bond screen shows their side under each shared memory, and the
// narrator gets each person's latest line on their character card, so they
// remember Kan the way they saw it.

import { dateSortValue } from './calendar';
import { isDeceased } from './deaths';
import type { AppDatabase, EntityRecord, EventRecord, RawLogEntry } from './types';

/** At most this many points of view per memory. */
export const POV_PER_MEMORY = 3;
const POV_MAX_CHARS = 260;

function isKan(entity: EntityRecord) {
  return entity.name.trim().toLowerCase() === 'kan' || entity.tags.includes('player');
}

/** The people in these story turns whose own memory of them is worth keeping. */
export function povCandidates(db: AppDatabase, messages: RawLogEntry[]): EntityRecord[] {
  const present = new Set(messages.flatMap((entry) => entry.sceneCastIds ?? []));

  return db.entities
    .filter((entity) => {
      if (!present.has(entity.id) || entity.type !== 'character' || isKan(entity) || isDeceased(entity)) return false;
      if (entity.tier === 'minor') return false;

      const bond = db.bonds.find((item) => item.entityId === entity.id);

      return Boolean(entity.companion || bond?.isMajor || (bond && Math.abs(bond.affinity) >= 5));
    })
    .sort((a, b) => {
      const weight = (entity: EntityRecord) => {
        const bond = db.bonds.find((item) => item.entityId === entity.id);

        return (bond?.isMajor ? 20 : 0) + Math.abs(bond?.affinity ?? 0) + (entity.companion ? 5 : 0);
      };

      return weight(b) - weight(a);
    })
    .slice(0, POV_PER_MEMORY);
}

/** The extra instruction for the summary call, or '' when nobody qualifies. */
export function povInstruction(candidates: EntityRecord[], nameOf: (entity: EntityRecord) => string = (entity) => entity.name): string {
  if (candidates.length === 0) return '';

  // The names Kan knows, so a memory's text never carries a name he never learned (audit 6b.2).
  return [
    `POINTS OF VIEW: ${candidates.map(nameOf).join(', ')} ${candidates.length === 1 ? 'was' : 'were'} there.`,
    'After SUMMARY, add a POV: section with one line for each of them the scene truly mattered to, as they will remember it: in their own voice and manner, speaking to you (Kan) as "you", only what they could see or hear (never your thoughts), under 35 words. Leave out anyone it did not matter to; if it mattered to none, leave POV: out.',
    'POV:',
    '- Name: line',
  ].join('\n');
}

/** Reads "- Name: line" rows from a POV section. */
export function parsePovLines(section: string | undefined): { name: string; text: string }[] {
  if (!section) return [];

  return section
    .split('\n')
    .map((line) => line.replace(/^\s*[-*•]\s*/, '').trim())
    .map((line) => {
      const match = /^\**([^:*]{2,60})\**\s*:\s*(.+)$/.exec(line);

      return match ? { name: match[1].trim(), text: match[2].trim().replace(/^["“]|["”]$/g, '') } : null;
    })
    .filter((item): item is { name: string; text: string } => Boolean(item && item.text.length >= 8 && !/^(none|n\/a)\.?$/i.test(item.text)))
    .slice(0, POV_PER_MEMORY);
}

/** Matches the lines to the candidates by name (or first name); anyone else is dropped. */
export function resolvePovs(
  candidates: EntityRecord[],
  lines: { name: string; text: string }[],
  nameOf: (entity: EntityRecord) => string = (entity) => entity.name
): { entityId: string; text: string }[] {
  const found: { entityId: string; text: string }[] = [];

  for (const line of lines) {
    const key = line.name.toLowerCase();
    const entity = candidates.find(
      (person) =>
        nameOf(person).toLowerCase() === key ||
        person.name.toLowerCase() === key ||
        person.aliases.some((alias) => alias.toLowerCase() === key) ||
        person.name.toLowerCase().split(' ')[0] === key.split(' ')[0]
    );

    if (entity && !found.some((item) => item.entityId === entity.id)) {
      found.push({ entityId: entity.id, text: line.text.slice(0, POV_MAX_CHARS) });
    }
  }

  return found;
}

/** Their own side of a memory, if they have one. */
export function povOf(event: EventRecord, entityId: string): string | null {
  return event.povs?.find((item) => item.entityId === entityId)?.text ?? null;
}

/** How this person last remembered a moment with Kan (for their character card). */
export function latestPov(db: AppDatabase, entityId: string): string | null {
  const events = db.events
    .filter((event) => event.povs?.some((item) => item.entityId === entityId))
    .sort((a, b) => dateSortValue(b.inStoryDate) - dateSortValue(a.inStoryDate));

  return events[0] ? povOf(events[0], entityId) : null;
}
