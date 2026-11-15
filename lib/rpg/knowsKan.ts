// Section 12 of claude/before-variety-ideas.md (Xan, 14 Nov 2026): people who
// know Kan through connections. For each, what they know of him from before
// the story, what they believe now, and their first reaction the first time
// they see him in the story. Sent to the narrator as `KNEW YOU:` on their card
// in CHARACTERS IN SCENE, only while they are really here. Narrator only:
// nothing here reaches the UI.

import { happened } from './names';
import { leafThinksDead } from './renown';
import type { AppDatabase, EntityRecord } from './types';

type Phase = {
  /** From this milestone on (it has happened). */
  from?: string;
  /** Until this milestone (it has not happened yet). */
  until?: string;
  /** What they know of you from before the story, and how they see you now. */
  knows: string;
  /** Their first reaction, the first time they see you in the story. */
  first: string;
};

type Belief = 'truth' | 'danzo' | 'leaf' | 'own';

type KnowsEntry = {
  /** Where their belief about your fate comes from. */
  belief: Belief;
  phases: Phase[];
};

export const KNOWS_KAN: Record<string, KnowsEntry> = {
  'Hiruzen Sarutobi': {
    belief: 'truth',
    phases: [
      {
        knows: 'knew you as a gifted young ANBU; Itachi told him you are alive and left with him, and he keeps the file ("missing, presumed dead") as cover',
        first: 'relief he does not show in front of anyone; asks nothing where others can hear. He may tell people he trusts or who need to know, never Sasuke, never Danzō, nobody whose canon actions it would change; the secret dies with him unless he passes it on',
      },
    ],
  },
  'Danzo Shimura': {
    belief: 'danzo',
    phases: [
      {
        knows: 'knew of you as an Uchiha in ANBU worth watching; knows only that your body was never found, never that you left with Itachi; wants you found, then in Root or dead',
        first: 'no surprise shown; he weighs you as an asset, then makes an offer or gives an order to take you',
      },
    ],
  },
  'Kakashi Hatake': {
    belief: 'leaf',
    phases: [
      {
        knows: 'your ANBU captain for your whole year (Team Ro, your bat mask); he was relieved of ANBU a few days after the massacre',
        first: 'measures you before anything else, hand near his kunai and his eye on your Sharingan; dry, careful, and he reports it to the Hokage afterwards',
      },
    ],
  },
  'Yamato': {
    belief: 'leaf',
    phases: [
      {
        knows: 'Tenzō, your unit comrade in Team Ro for your whole ANBU year; you know him as Tenzō until you hear the name Yamato',
        first: 'quietly sympathetic and glad you are alive, but he follows orders; if the orders say bring you in, he tries',
      },
    ],
  },
  'Might Guy': {
    belief: 'leaf',
    phases: [
      {
        knows: 'gave you some taijutsu sessions and spars, caught you opening the first Gates on your own and made you promise never to go past what he showed you; you were never close',
        first: 'loud delight that you are alive; then confusion if you are with criminals (Itachi, the Akatsuki cloak), and he wants an explanation, by challenge if he has to',
      },
    ],
  },
  'Kiba Inuzuka': {
    belief: 'leaf',
    phases: [
      {
        knows: 'knew you as Hana’s teammate who came around the Inuzuka compound; knows you by scent',
        first: 'he smells you before he sees you; loud disbelief, then anger on Hana’s behalf (where were you, does she know); Akamaru knows you first',
      },
    ],
  },
  'Tsume Inuzuka': {
    belief: 'leaf',
    phases: [
      {
        knows: 'knew you as Hana’s teammate; has teased Hana about you since the night you spent in the kennels with her; knows you by scent',
        first: 'blunt and protective: her first question is whether Hana knows',
      },
    ],
  },
  'Sasuke Uchiha': {
    belief: 'own',
    phases: [
      {
        until: 'itachi-vs-sasuke',
        knows: 'you were almost another big brother to him, something like Shisui; you vanished the night of the massacre and he believes you died with the clan',
        first: 'shock first; if you are with Itachi or wear the cloak, it is another betrayal and his hatred takes you in too; alone, he demands where you were that night and whether you knew. His canon path does not change',
      },
      {
        from: 'itachi-vs-sasuke',
        until: 'masked-man-truth',
        knows: 'you were almost another big brother to him; Itachi is dead by his hand and he still believes the massacre story',
        first: 'cold shock; you stood beside the man he just killed, and he wants to know why. His canon path does not change',
      },
      {
        from: 'masked-man-truth',
        knows: 'you were almost another big brother to him; he knows the truth about the massacre now, so you are either one more person who knew and said nothing, or the one person he can talk to about Itachi (let what you do decide)',
        first: 'a long, hard look; then anger at everything you never told him, or the one question he cannot ask anyone else. His canon path does not change',
      },
    ],
  },
};

function phaseNow(db: AppDatabase, entry: KnowsEntry): Phase | null {
  const phases = entry.phases.filter(
    (phase) => (!phase.from || happened(db, phase.from)) && (!phase.until || !happened(db, phase.until))
  );

  return phases[phases.length - 1] ?? null;
}

function beliefLine(db: AppDatabase, belief: Belief): string {
  if (belief === 'truth' || belief === 'own') return '';

  const dead = leafThinksDead(db);

  if (belief === 'danzo') {
    return dead ? '' : 'He knows now that you are alive, and wants you more.';
  }

  return dead
    ? 'Believes, like the Leaf, that you went missing the night of the massacre and are probably dead.'
    : 'Has heard the Leaf’s word that you are alive and in its bingo book.';
}

/**
 * The KNEW YOU line for someone in the scene who knew Kan before the story:
 * what they know and believe, and, the first time they see him in the story
 * (still unmet), how they react. Null for anyone else.
 */
export function knowsKanLine(db: AppDatabase, entity: Pick<EntityRecord, 'name' | 'met'>): string | null {
  const entry = KNOWS_KAN[entity.name];
  if (!entry) return null;

  const phase = phaseNow(db, entry);
  if (!phase) return null;

  const belief = beliefLine(db, entry.belief);
  const first =
    entity.met === false
      ? ` FIRST TIME THEY SEE YOU IN THE STORY: ${phase.first}.`
      : '';

  return `KNEW YOU: ${phase.knows}.${belief ? ` ${belief}` : ''}${first}`;
}
