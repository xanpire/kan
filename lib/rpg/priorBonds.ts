// Where a bond starts for someone who knew Kan before the story (section 12 of
// claude/before-variety-ideas.md). Without this, Kakashi, Kan's ANBU captain
// for a whole year, met again in the story got the same blank "Newly met",
// stranger bond as a ferryman. Notes are second person and hold only what
// Kan knows. Used the first time a bond is made for them; nothing here changes
// a bond that already exists.

import type { BondRecord, RelationshipStage } from './types';

export type PriorBond = {
  /** How they felt about Kan before the story. */
  theirs: number;
  /** How Kan felt about them. */
  yours: number;
  status: string;
  relationship: RelationshipStage;
  note: string;
  yourNote: string;
};

export const PRIOR_BONDS: Record<string, PriorBond> = {
  'Kakashi Hatake': {
    theirs: 3,
    yours: 3,
    status: 'Your old ANBU captain',
    relationship: 'acquaintance',
    note: 'He was your ANBU captain in Team Ro for your whole year there; he trusted you in the field.',
    yourNote: 'You served under him in Team Ro.',
  },
  Yamato: {
    theirs: 3,
    yours: 3,
    status: 'Old Team Ro comrade',
    relationship: 'acquaintance',
    note: 'Your comrade in Team Ro for your whole year in ANBU.',
    yourNote: 'You served beside him in Team Ro.',
  },
  'Might Guy': {
    theirs: 3,
    yours: 2,
    status: 'Taught you some taijutsu',
    relationship: 'acquaintance',
    note: 'He gave you some taijutsu sessions and spars and caught you opening the first Gates on your own; you were never close.',
    yourNote: 'He helped your taijutsu and taught you the first Gates.',
  },
  'Kiba Inuzuka': {
    theirs: 2,
    yours: 1,
    status: 'Hana’s little brother',
    relationship: 'acquaintance',
    note: 'He knew you as Hana’s teammate who came around the Inuzuka compound.',
    yourNote: 'Hana’s loud little brother.',
  },
  'Tsume Inuzuka': {
    theirs: 2,
    yours: 1,
    status: 'Hana’s mother',
    relationship: 'acquaintance',
    note: 'She knew you as Hana’s teammate and teases Hana about you.',
    yourNote: 'Hana’s mother, the Inuzuka clan head.',
  },
  'Sasuke Uchiha': {
    theirs: 6,
    yours: 6,
    status: 'Itachi’s little brother',
    relationship: 'close',
    note: 'He looked up to you almost like another big brother.',
    yourNote: 'You were almost another big brother to him.',
  },
  'Hiruzen Sarutobi': {
    theirs: 3,
    yours: 2,
    status: 'The Third Hokage',
    relationship: 'acquaintance',
    note: 'Your Hokage while you served in ANBU.',
    yourNote: 'Your Hokage while you served in ANBU.',
  },
};

/** The fields a new bond starts with for someone who knew Kan, or null. */
export function priorBondFor(
  name: string
): Pick<BondRecord, 'affinity' | 'status' | 'note' | 'relationship' | 'theirFeelings' | 'yourFeelings'> | null {
  const prior = PRIOR_BONDS[name];
  if (!prior) return null;

  return {
    affinity: prior.theirs,
    status: prior.status,
    note: prior.note,
    relationship: prior.relationship,
    theirFeelings: { affinity: prior.theirs, note: prior.note },
    yourFeelings: { affinity: prior.yours, note: prior.yourNote },
  };
}
