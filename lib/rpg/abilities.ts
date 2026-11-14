// Kan's chakra natures and abilities (dōjutsu, Susanoo...), as the state
// reply reports them. Thousand Souls needs the list of natures to know what
// it has taken; the Kan tab shows both.

import { normalizeJutsuNature } from './jutsu';
import type { AbilityRecord, AppDatabase, NatureRecord, TurnDiff } from './types';

function sameName(a: string, b: string) {
  return a.trim().toLowerCase().replace(/ō/g, 'o') === b.trim().toLowerCase().replace(/ō/g, 'o');
}

/** Applies the turn's natures_gained and abilities_changed to Kan's sheet. */
export function applyAbilityChanges(db: AppDatabase, diff: TurnDiff): AppDatabase {
  const gained = diff.naturesGained ?? [];
  const changed = diff.abilitiesChanged ?? [];

  if (gained.length === 0 && changed.length === 0) {
    return db;
  }

  const now = db.state.inStoryDate;
  const natures: NatureRecord[] = [...(db.state.player.natures ?? [])];

  for (const item of gained) {
    const nature = normalizeJutsuNature(item.nature);

    if (!nature || nature === 'Unknown' || natures.some((known) => sameName(known.nature, nature))) {
      continue;
    }

    natures.push({
      nature,
      source: item.source,
      ...(item.from ? { from: item.from } : {}),
      acquiredOn: now,
    });
  }

  const abilities: AbilityRecord[] = [...(db.state.player.abilities ?? [])];

  for (const item of changed) {
    const name = item.name.trim();
    const stage = item.stage?.trim() || 'awakened';

    if (!name) continue;

    const index = abilities.findIndex((ability) => sameName(ability.name, name));

    if (index === -1) {
      abilities.push({ name, stage, acquiredOn: now, stageOn: now, history: [{ stage, date: now }] });
    } else if (!sameName(abilities[index].stage, stage)) {
      const current = abilities[index];
      abilities[index] = {
        ...current,
        stage,
        stageOn: now,
        history: [...(current.history ?? [{ stage: current.stage, date: current.stageOn }]), { stage, date: now }],
      };
    }
  }

  return { ...db, state: { ...db.state, player: { ...db.state.player, natures, abilities } } };
}

/**
 * Kan's own natures (decided 14 Nov 2026): Fire from his mother Erisa, Earth
 * from his father Banri. Any other comes only through Thousand Souls. Old
 * saves that never found them get both.
 */
export const KAN_INNATE_NATURES = ['Fire', 'Earth'] as const;

export function withInnateNatures(natures: NatureRecord[] | undefined, date: NatureRecord['acquiredOn']): NatureRecord[] {
  const list = (natures ?? []).filter((item) => item.source !== 'innate' || KAN_INNATE_NATURES.some((n) => sameName(n, item.nature)));
  const missing = KAN_INNATE_NATURES.filter((nature) => !list.some((item) => sameName(item.nature, nature)));
  return [...missing.map((nature) => ({ nature, source: 'innate' as const, acquiredOn: date })), ...list];
}

/** One line for the prompts: "Natures: Fire (innate); abilities: Sharingan (2 tomoe)". */
export function formatAbilities(db: AppDatabase): string {
  const natures = db.state.player.natures ?? [];
  const abilities = db.state.player.abilities ?? [];
  const natureText = natures.length
    ? natures.map((item) => `${item.nature} (${item.source === 'innate' ? 'innate' : `Thousand Souls${item.from ? `, from ${item.from}` : ''}`})`).join(', ')
    : 'none known yet';
  const abilityText = abilities.length ? abilities.map((item) => `${item.name} (${item.stage})`).join(', ') : 'none';

  return `Chakra natures: ${natureText}. Abilities: ${abilityText}.`;
}
