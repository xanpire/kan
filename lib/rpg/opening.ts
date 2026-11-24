// The first night (section 17, the "false order" opening).
//
// Until v1.25.9 the narrator's briefing for the opening rode on the opening
// memory (`narratorNote` on a pinned event), so it reached the narrator only
// when that memory was recalled. In Session 3 it was gone by the third turn:
// Itachi attacked instead of defending, said "forgive me" and nothing else,
// and neither the truth nor the Sharingan came. This block is sent every
// turn until the night's beats have happened, and says which are still to come.

import { secondsBetween } from './calendar';
import { kanKnowsDeath } from './deaths';
import { LORE_FLAGS } from './lore';
import { canonLoreById, kanVersion } from './loreList';
import type { AppDatabase, CalendarDate } from './types';

/** Dawn after the massacre: the Leaf finds the district, and counts you among the missing. */
export const FIRST_DAWN: CalendarDate = { year: 13, month: 10, day: 2, hour: 6, minute: 0 };

function falseOrder(db: AppDatabase) {
  return db.state.opening === 'false-order';
}

/** Still the night of the massacre: the Leaf has not found the district yet. */
export function firstNight(db: AppDatabase): boolean {
  return falseOrder(db) && secondsBetween(db.state.inStoryDate, FIRST_DAWN) > 0;
}

function knowsDead(db: AppDatabase, name: string) {
  const entity = db.entities.find((item) => item.name === name);
  return Boolean(entity && kanKnowsDeath(db, entity));
}

/** What the first scene still owes the player. */
export function openingBeats(db: AppDatabase) {
  const massacre = canonLoreById('uchiha-massacre');
  return {
    deathsTold: knowsDead(db, 'Izumi Uchiha') && knowsDead(db, 'Hazuki Uchiha'),
    sharingan: LORE_FLAGS.hasSharingan(db),
    truthTold: massacre ? kanVersion(db, massacre) === 'truth' : true,
  };
}

/** The block is sent while it is still that night, or while Itachi still owes you a beat of it. */
export function openingActive(db: AppDatabase): boolean {
  if (!falseOrder(db)) return false;
  if (db.state.canonProgress?.completed.includes('kan-joins-akatsuki')) return false;
  const beats = openingBeats(db);
  return firstNight(db) || !beats.deathsTold || !beats.truthTold;
}

export function formatOpeningBlock(db: AppDatabase): string {
  if (!openingActive(db)) return '';

  const beats = openingBeats(db);
  const night = firstNight(db);
  const steps: string[] = [];

  if (!beats.deathsTold) {
    steps.push(
      'First he stops you ("Don’t go to the village"). When you ask why or try to pass, he says it in plain words, without being asked twice: the clan is dead by his hand, your cousin Izumi and your aunt Hazuki with it. Nothing about how anyone died unless you ask; if you ask about Hazuki, one honest detail in his own words, never a stock line.'
    );
  }

  if (!beats.sharingan) {
    steps.push(
      'Your Sharingan wakes, from rage and grief: in the middle of the fight if you fight him, otherwise at the moment their names land. Give it through your body (heat behind the eyes, the rain slowing to separate drops, his movements suddenly readable) and through him: he sees the tomoe turn in your eyes and says so. Tomoe only, never the Mangekyō.'
    );
  }

  if (!beats.truthTold) {
    steps.push(
      'He tells you why, all of it, as facts, in his own flat quiet voice, over one or two replies, between blows if you are still fighting: the clan was planning a coup; the Leaf’s elders ordered the clan’s death, Danzō pressing hardest; a coup would have meant civil war, and the other villages would have come for a Leaf at war with itself; he chose the village and one life, Sasuke, whom he spared. He does not excuse himself or ask you to understand. The truth is how he convinces you to come.'
    );
  }

  steps.push(
    'His offer, once: come with him. There is an organization, the Akatsuki; he means to join it and watch it from inside, and he wants you beside him. The Leaf will count you among tonight’s dead, and Danzō would have you in Root or in a grave: there is nowhere to go back to. Then it is your answer; he does not repeat himself or drag you.'
  );

  const lines = [
    night
      ? 'THE FIRST NIGHT (narrator only: this is the scene the whole story stands on; play every step, never skip or summarise one)'
      : 'WHAT ITACHI STILL OWES YOU (narrator only: left over from the first night; it comes at the first quiet moment, when you ask, or when your anger demands it)',
    night
      ? 'Tonight Itachi killed the Uchiha clan. The ANBU order he gave you was false, written to get you out of the village first: he used your trust in him. He has waited for you on the road back, rain on him and blood under it. Nobody in the Leaf knows yet; by dawn the district is found.'
      : '',
    'Itachi tonight: he never excuses himself, never pleads and never says "forgive me", but he answers. What you ask, he tells you, plainly and in few words; silence and "I cannot say" are not answers he gives you about tonight. Only Shisui’s death stays out of it: that he keeps for another day.',
    'If you attack him: he does not want this fight and does not fight back. He blocks, turns blows aside, slips away, holds or pins you; he draws no weapon on you, never strikes to hurt, and he speaks while he does it. In fight mode his "next move" is a guard, a hold, a step, or what he says next. You cannot beat him tonight and he cannot die here; the fight ends when you stop, or when he has you held and you have heard him.',
    'Still to happen, in this order, at most one step in each reply, each given room:',
    ...steps.map((step, index) => `${index + 1}. ${step}`),
  ];

  return lines.filter(Boolean).join('\n');
}

/** Kan's rank as it is right now: still the Leaf's ANBU until the first dawn. */
export function kanRankNow(db: AppDatabase): string {
  const completed = db.state.canonProgress?.completed ?? [];

  if (completed.includes('kan-accepted-akatsuki')) return 'Akatsuki · missing-nin';
  if (completed.includes('kan-joins-akatsuki')) return 'Akatsuki, on trial · missing-nin';
  if (firstNight(db) && !LORE_FLAGS.knowsIzumiDead(db)) return 'Hidden Leaf ANBU';
  // Session 3: after that night, and until the cloak, he is not a listed
  // deserter: the Leaf counts him among the massacre's dead.
  if (falseOrder(db) && /missing-nin/i.test(db.state.player.rank || '')) return 'Former Hidden Leaf ANBU';

  return db.state.player.rank || db.state.player.role;
}
