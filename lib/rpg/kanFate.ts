/**
 * Whether Kan can die (audit 8, decided by Xan for now). He has not chosen
 * when or whether Kan dies, so until he does, Kan is never killed: he can
 * lose, be hurt, captured or saved at a price instead. This is the one place
 * to change it: the narrator's rule and the state step's guard both read it.
 */
export const KAN_CAN_DIE = false;

/** The narrator's CORE line about Kan's fate ('' once Kan can die). */
export const KAN_FATE_RULE = KAN_CAN_DIE
  ? ''
  : "- Kan can lose, be badly hurt, captured, crippled for a while, or saved at a price, and those outcomes are real and lasting; he is never killed. Canon power levels still hold: a fight he cannot win ends in one of those outcomes, not in a win.";

/** A reported death of Kan himself is refused while Kan cannot die. */
export function refusesKanDeath(entity: { name: string } | null | undefined) {
  return !KAN_CAN_DIE && entity?.name.trim().toLowerCase() === 'kan';
}
