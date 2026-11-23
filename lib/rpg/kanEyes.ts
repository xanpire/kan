// Kan's eyes, tracked as one flag (test run 23 Nov 2026, §1): the tracker
// saved "your Sharingan is active" as condition facts with no lifetime and
// never ended them, so the narrator and the images kept a Sharingan he had
// turned off. The eyes now live in `state.player.eyes`, set by the tracker's
// `kan_eyes` and by Kan's own words, and nothing else describes them.

import type { AbilityRecord, AppDatabase, FactRecord, KanEyes } from './types';

export const KAN_EYE_STATES = ['off', 'sharingan', 'mangekyo', 'eternal'] as const;

const EYES = /\b(sharingan|mangeky[oō]|dōjutsu|dojutsu|(?:my|his|your) eyes?)\b/i;
const OFF =
  /\b(deactivat\w*|turns? off|turned off|turning off|switch(?:es|ed)? off|shuts? off|let(?:s|ting)? (?:the |my |his |your )?(?:sharingan|mangeky[oō]|eyes?|red|tomoe)[^.!?]{0,20}\b(?:fade|die|go|bleed (?:away|out)|sink|dim)|(?:fade|fades|faded|fading|dims?|dimmed|sinks?|sank|bleeds? (?:away|out)) (?:back )?(?:to (?:brown|black|normal))|releas\w* (?:the |my |his |your )?(?:sharingan|mangeky[oō])|dismiss\w* (?:the |my |his |your )?(?:sharingan|mangeky[oō])|(?:sharingan|mangeky[oō]) (?:off|away|down)|cut (?:the )?(?:chakra|flow) to (?:my|his|your) eyes|eyes? (?:go|went|turn|turned|return|returned) (?:back )?(?:to )?(?:brown|normal|dark))/i;
const ON =
  /\b(activat\w*|turns? on|turned on|switch(?:es|ed)? on|flares?|flared|flaring|ignites?|ignited|awaken\w*|blaz\w*|spin(?:s|ning)? up|(?:let|lets|letting) (?:the )?(?:sharingan|mangeky[oō]|red) (?:bleed|bloom|come|rise|surface)|channel\w* chakra (?:in)?to (?:my|his|your) eyes|eyes? (?:bleed|bleeds|bled|turn|turns|turned|flash|flashes|flashed) (?:to )?(?:red|crimson))/i;

function hasAbility(db: Pick<AppDatabase, 'state'>, pattern: RegExp) {
  return (db.state.player.abilities ?? []).some((ability: AbilityRecord) => pattern.test(ability.name));
}

/** The eyes Kan uses when he turns on his Mangekyō: the Eternal once he has it. */
function mangekyoOf(db: Pick<AppDatabase, 'state'>): KanEyes {
  return hasAbility(db, /eternal/i) ? 'eternal' : 'mangekyo';
}

/** Kan's eyes now; old saves and new stories start off (brown). */
export function kanEyes(db: Pick<AppDatabase, 'state'>): KanEyes {
  return db.state.player.eyes ?? 'off';
}

/**
 * What Kan's own words do to his eyes: "I let the Sharingan fade" turns them
 * off, "I activate my Sharingan" turns them on. Null when the input doesn't
 * touch them. Quoted speech doesn't count ("Don't make me activate it").
 */
export function eyesFromInput(db: Pick<AppDatabase, 'state'>, input: string): KanEyes | null {
  const acts = input.replace(/"[^"]*"|“[^”]*”/g, ' ');
  if (!EYES.test(acts) && !/\b(tomoe|red eyes)\b/i.test(acts)) return null;

  // Split into clauses, so "activate, then let it fade" ends off.
  let result: KanEyes | null = null;
  let named = false;
  for (const clause of acts.split(/(?<=[.!?;])\s+|,\s*(?:then|and then)\s+|\bthen\b/i)) {
    const mentions = EYES.test(clause) || /\b(tomoe|red)\b/i.test(clause);
    // "…then let it fade": "it" is the eyes named a clause earlier.
    const pronounOff = named && /\b(let(?:s|ting)? (?:it|them) (?:fade|die|go|dim)|(?:turn|switch|shut)(?:s|ed)? (?:it|them) off|releas\w* (?:it|them))\b/i.test(clause);
    named = named || mentions;
    if (pronounOff) {
      result = 'off';
      continue;
    }
    if (!mentions) continue;
    if (OFF.test(clause)) {
      result = 'off';
    } else if (ON.test(clause) && hasAbility(db, /sharingan/i)) {
      // Only eyes he has: before the Sharingan wakes, his words can't light it.
      result = /\bmangeky[oō]\b/i.test(clause) && hasAbility(db, /mangeky/i) ? mangekyoOf(db) : 'sharingan';
    }
  }

  return result;
}

/** A Sharingan or Mangekyō being on, said as a passing condition. */
export const EYES_ACTIVE_FACT = /\b(sharingan|mangeky[oō])\b[^.]{0,60}\b(active|activated|on|blaz\w*|spin\w*|glow\w*|flar\w*|burn\w*|lit|crimson|red|open|awake)\b|\b(active|activated|blazing|spinning|glowing|flaring|crimson)\b[^.]{0,30}\b(sharingan|mangeky[oō])\b/i;

/** An awakening or a new tomoe: a milestone for the abilities list, never a condition. */
export const EYES_MILESTONE_FACT =
  /\b(sharingan|mangeky[oō])\b[^.]{0,80}\b(awaken\w*|matur\w*|reach\w*|gain\w*|grew|grown|(?:first|second|third|new) tomoe)\b|\b(awaken\w*|(?:first|second|third|new) tomoe)\b[^.]{0,80}\b(sharingan|mangeky[oō])\b/i;

/** "awakened its second tomoe" → "2 tomoe"; a Mangekyō awakening → "awakened". */
export function milestoneStage(text: string): { name: string; stage: string } | null {
  if (/\beternal\b/i.test(text)) return { name: 'Eternal Mangekyō Sharingan', stage: 'awakened' };
  if (/\bmangeky[oō]\b/i.test(text)) return { name: 'Mangekyō Sharingan', stage: 'awakened' };
  const count = text.match(/\b(first|one|1|single|second|two|2|third|three|3)\b[^.]{0,20}\btomoe\b|\btomoe\b[^.]{0,10}\b(one|two|three|1|2|3)\b/i);
  const word = (count?.[1] ?? count?.[2] ?? '').toLowerCase();
  const n = { first: 1, one: 1, '1': 1, single: 1, second: 2, two: 2, '2': 2, third: 3, three: 3, '3': 3 }[word];
  if (n) return { name: 'Sharingan', stage: `${n} tomoe` };
  if (/\bsharingan\b/i.test(text) && /\bawaken/i.test(text)) return { name: 'Sharingan', stage: '1 tomoe' };
  return null;
}

/** Whether a fact about Kan is really about his eyes (the flag or the abilities hold it instead). */
export function isKanEyesFact(fact: Pick<FactRecord, 'type' | 'text'>) {
  return fact.type === 'condition' && (EYES_ACTIVE_FACT.test(fact.text) || EYES_MILESTONE_FACT.test(fact.text));
}

/**
 * Sets Kan's eyes. Turning them off ends every active condition that still
 * says a Sharingan or Mangekyō is on (Kan's, or with no subject).
 */
export function setKanEyes(db: AppDatabase, eyes: KanEyes): AppDatabase {
  const kanId = db.entities.find((entity) => entity.name.toLowerCase() === 'kan')?.id ?? null;
  let facts = db.facts;

  if (eyes === 'off') {
    let changed = false;
    facts = db.facts.map((fact) => {
      if (
        fact.validTo === null &&
        fact.type === 'condition' &&
        (!fact.subjectEntityId || fact.subjectEntityId === kanId) &&
        EYES_ACTIVE_FACT.test(fact.text)
      ) {
        changed = true;
        return { ...fact, validTo: db.state.inStoryDate };
      }
      return fact;
    });
    if (!changed) facts = db.facts;
  }

  if (db.state.player.eyes === eyes && facts === db.facts) return db;

  return { ...db, facts, state: { ...db.state, player: { ...db.state.player, eyes } } };
}

/** Kan's eyes in words, for the narrator, the image director and the image prompt. */
export function kanEyesLine(db: Pick<AppDatabase, 'state'>): string {
  const eyes = kanEyes(db);
  const sharingan = (db.state.player.abilities ?? []).find((ability) => /^sharingan$/i.test(ability.name.trim()));
  const tomoe = sharingan?.stage && /tomoe/i.test(sharingan.stage) ? ` (${sharingan.stage})` : '';

  switch (eyes) {
    case 'sharingan':
      return `his Sharingan is active${tomoe}: red irises with black tomoe`;
    case 'mangekyo':
      return 'his Mangekyō Sharingan is active';
    case 'eternal':
      return 'his Eternal Mangekyō Sharingan is active';
    default:
      return 'brown eyes, no Sharingan (it is off)';
  }
}
