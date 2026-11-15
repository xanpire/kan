// Era accuracy (section 1 of claude/before-variety-ideas.md, Xan, 15 Nov 2026).
//
// The cast seed (canonCast.ts) writes each person's role as of year 13, and
// nothing moved it afterwards: Gaara stayed "One-Tail jinchuriki" as
// Kazekage, Tsunade never became Hokage on her card. Both the bond screen and
// the narrator's character card read `entity.role`, so here each person gets
// the role canon gives them from each milestone on.
//
// A stage's `from` is a milestone id ('start' = the story's first night).
// A role is only moved while it is still the seed text or one of these
// stages: anything the story itself wrote (the tracker's character updates,
// a promotion from lives.ts) is what Kan saw, and stays. Old saves catch up
// on load (db.ts), new milestones as they fire (canon.ts).

import { CANON_CAST } from './canonCast';
import type { AppDatabase } from './types';

export type RoleStage = { from: string; role: string };

/** Keep the important part first: the narrator's card cuts a role at 40 characters. */
export const ROLE_STAGES: Record<string, RoleStage[]> = {
  // --- The Kage and the Leaf's leaders
  'Tsunade Senju': [
    { from: 'tsunade-hokage', role: 'Fifth Hokage · Legendary Sannin' },
    { from: 'pain-assault', role: 'Fifth Hokage · in a coma since Pain’s assault' },
    { from: 'tsunade-wakes', role: 'Fifth Hokage · Legendary Sannin' },
    { from: 'kakashi-hokage', role: 'Former Fifth Hokage · Legendary Sannin' },
  ],
  'Danzo Shimura': [{ from: 'danzo-hokage', role: 'Hokage candidate · head of Root' }],
  'Kakashi Hatake': [
    // Still in ANBU on the massacre night; Hiruzen takes him out days later.
    { from: 'start', role: 'Leaf ANBU captain · Team Ro' },
    { from: 'izumi-funeral', role: 'Leaf jonin · former ANBU' },
    { from: 'team-7-formed', role: 'Leaf jonin · Team 7’s sensei' },
    { from: 'naruto-returns', role: 'Leaf jonin · leads Team Kakashi' },
    { from: 'kakashi-elected', role: 'Hokage-elect · Leaf jonin' },
    { from: 'kakashi-hokage', role: 'Sixth Hokage' },
  ],
  Gaara: [
    { from: 'gaara-kage', role: 'Fifth Kazekage · One-Tail jinchuriki' },
    { from: 'gaara-captured', role: 'Fifth Kazekage' },
  ],
  'Mei Terumi': [{ from: 'mei-mizukage', role: 'Fifth Mizukage' }],
  Pain: [{ from: 'pain-civil-war', role: 'Akatsuki leader · ruler of the Rain' }],

  // --- The Akatsuki and its leavers
  Orochimaru: [
    // He leaves the Akatsuki only at 15/6 (orochimaru-betrayal).
    { from: 'start', role: 'Legendary Sannin · Akatsuki member' },
    { from: 'orochimaru-betrayal', role: 'Legendary Sannin · missing-nin' },
    { from: 'otogakure-grows', role: 'Legendary Sannin · lord of the Sound' },
    { from: 'sasuke-absorbs-orochimaru', role: 'Legendary Sannin · absorbed by Sasuke' },
    { from: 'hokage-edo', role: 'Legendary Sannin · back from inside Sasuke' },
  ],
  'Kisame Hoshigaki': [{ from: 'kisame-joins', role: 'Akatsuki · Itachi’s partner · Mist swordsman' }],
  Deidara: [
    { from: 'deidara-recruited', role: 'Akatsuki · explosives artist' },
    { from: 'tobi-joins-akatsuki', role: 'Akatsuki · explosives artist · Tobi’s partner' },
  ],
  Hidan: [{ from: 'roster-completes', role: 'Akatsuki · Jashinist · Kakuzu’s partner' }],
  'Zabuza Momochi': [
    // Haku is already with him, so he is already on the run (seed's Haku role).
    { from: 'start', role: 'Mist missing-nin · one of the Seven Swordsmen' },
  ],

  // --- Sasuke and his team
  'Sasuke Uchiha': [
    { from: 'team-7-formed', role: 'Leaf genin · Team 7 · Itachi’s brother' },
    { from: 'sasuke-defects', role: 'Missing-nin · Orochimaru’s student' },
    { from: 'sasuke-absorbs-orochimaru', role: 'Missing-nin · leader of Hebi' },
    { from: 'taka-formed', role: 'Missing-nin · leader of Taka' },
    { from: 'sasuke-trial', role: 'Pardoned · a wanderer' },
  ],
  Karin: [
    { from: 'sasuke-trains', role: 'Uzumaki sensor · Orochimaru’s warden' },
    { from: 'sasuke-absorbs-orochimaru', role: 'Uzumaki sensor · Hebi' },
    { from: 'taka-formed', role: 'Uzumaki sensor · Taka' },
    { from: 'sasuke-rampage', role: 'Uzumaki sensor · the Leaf’s prisoner' },
  ],
  'Suigetsu Hozuki': [
    { from: 'sasuke-absorbs-orochimaru', role: 'Hōzuki clan · Hebi' },
    { from: 'taka-formed', role: 'Hōzuki clan · Taka' },
  ],
  Jugo: [
    { from: 'sasuke-absorbs-orochimaru', role: 'Source of the curse mark · Hebi' },
    { from: 'taka-formed', role: 'Source of the curse mark · Taka' },
  ],

  // --- The Rookies and their senseis
  'Naruto Uzumaki': [
    { from: 'start', role: 'Leaf orphan · Academy student · jinchuriki' },
    { from: 'team-7-formed', role: 'Leaf genin · Team 7 · Nine-Tails jinchuriki' },
    { from: 'naruto-trains', role: 'Leaf genin · Jiraiya’s student · jinchuriki' },
    { from: 'naruto-returns', role: 'Leaf genin · Team Kakashi · jinchuriki' },
    { from: 'pain-assault', role: 'Hero of the Hidden Leaf · jinchuriki' },
    { from: 'naruto-hokage', role: 'Seventh Hokage' },
  ],
  'Sakura Haruno': [
    { from: 'start', role: 'Leaf Academy student' },
    { from: 'team-7-formed', role: 'Leaf genin · Team 7' },
    { from: 'sakura-apprentice', role: 'Leaf genin · Tsunade’s apprentice' },
    { from: 'naruto-returns', role: 'Leaf chunin · medic · Tsunade’s apprentice' },
  ],
  'Ino Yamanaka': [
    { from: 'team-7-formed', role: 'Yamanaka clan heir · genin · Team 10' },
    { from: 'naruto-returns', role: 'Yamanaka clan heir · chunin · Team 10' },
  ],
  'Choji Akimichi': [
    { from: 'team-7-formed', role: 'Akimichi clan heir · genin · Team 10' },
    { from: 'naruto-returns', role: 'Akimichi clan heir · chunin · Team 10' },
  ],
  'Shikamaru Nara': [
    { from: 'team-7-formed', role: 'Nara clan strategist · genin · Team 10' },
    { from: 'shikamaru-chunin', role: 'Nara clan strategist · chunin · Team 10' },
  ],
  'Hinata Hyuga': [
    { from: 'team-7-formed', role: 'Hyuga heiress · genin · Team 8' },
    { from: 'naruto-returns', role: 'Hyuga heiress · chunin · Team 8' },
  ],
  'Kiba Inuzuka': [
    { from: 'team-7-formed', role: 'Leaf genin · Team 8 · Hana’s brother' },
    { from: 'naruto-returns', role: 'Leaf chunin · Team 8 · Hana’s brother' },
  ],
  'Shino Aburame': [
    { from: 'team-7-formed', role: 'Aburame clan · genin · Team 8' },
    { from: 'naruto-returns', role: 'Aburame clan · chunin · Team 8' },
  ],
  // Team Guy graduates a year before Team 7: the milestone nearest 16/8.
  'Neji Hyuga': [
    { from: 'otogakure-grows', role: 'Hyuga branch prodigy · genin · Team Guy' },
    { from: 'naruto-returns', role: 'Hyuga branch prodigy · jonin · Team Guy' },
  ],
  'Rock Lee': [
    { from: 'otogakure-grows', role: 'Leaf genin · Team Guy · taijutsu specialist' },
    { from: 'naruto-returns', role: 'Leaf chunin · Team Guy · taijutsu specialist' },
  ],
  Tenten: [
    { from: 'otogakure-grows', role: 'Leaf genin · Team Guy · weapons specialist' },
    { from: 'naruto-returns', role: 'Leaf chunin · Team Guy · weapons specialist' },
  ],
  'Might Guy': [{ from: 'otogakure-grows', role: 'Leaf jonin · Team Guy’s sensei · taijutsu' }],
  'Kurenai Yuhi': [{ from: 'team-7-formed', role: 'Leaf jonin · Team 8’s sensei · genjutsu' }],
  'Asuma Sarutobi': [{ from: 'team-7-formed', role: 'Leaf jonin · Team 10’s sensei · the Third’s son' }],
  Sai: [
    { from: 'sai-root-test', role: 'Root operative' },
    { from: 'sai-yamato', role: 'Root operative · Team Kakashi' },
  ],
  Yamato: [{ from: 'sai-yamato', role: 'Leaf ANBU · Team Kakashi’s captain · Wood Style' }],
  Mizuki: [{ from: 'mizuki-incident', role: 'Former Academy instructor · imprisoned' }],

  // --- The Sand
  Temari: [{ from: 'gaara-kage', role: 'Sand jonin · the Kazekage’s sister' }],
  Kankuro: [{ from: 'gaara-kage', role: 'Sand jonin puppeteer · the Kazekage’s brother' }],

  // --- Orochimaru's people, before there is a Sound (16/8)
  Tayuya: [{ from: 'start', role: 'Orochimaru’s guard' }, { from: 'otogakure-grows', role: 'Sound Four · Orochimaru’s guard' }],
  Jirobo: [{ from: 'start', role: 'Orochimaru’s guard' }, { from: 'otogakure-grows', role: 'Sound Four · Orochimaru’s guard' }],
  Kidomaru: [{ from: 'start', role: 'Orochimaru’s guard' }, { from: 'otogakure-grows', role: 'Sound Four · Orochimaru’s guard' }],
  Sakon: [{ from: 'start', role: 'Orochimaru’s guard · Ukon’s twin' }, { from: 'otogakure-grows', role: 'Sound Four leader · Ukon’s twin' }],
  Ukon: [{ from: 'start', role: 'Orochimaru’s guard · Sakon’s twin' }, { from: 'otogakure-grows', role: 'Sound Four · Sakon’s twin' }],
  'Dosu Kinuta': [
    { from: 'start', role: 'One of Orochimaru’s young followers' },
    { from: 'otogakure-grows', role: 'Sound genin · leads a three-man cell' },
    { from: 'chunin-exams', role: 'Sound genin · leader of the three sent to test Sasuke' },
  ],
  'Zaku Abumi': [
    { from: 'start', role: 'Orochimaru’s young follower · air tubes in his arms' },
    { from: 'otogakure-grows', role: 'Sound genin · air tubes built into his arms' },
  ],
  'Kin Tsuchi': [
    { from: 'start', role: 'Orochimaru’s young follower · senbon with bells' },
    { from: 'otogakure-grows', role: 'Sound kunoichi · senbon with bells' },
  ],
};

let seedRoles: Map<string, string> | null = null;

function seedRole(name: string) {
  seedRoles ??= new Map(CANON_CAST.map((entry) => [entry.name, entry.role]));
  return seedRoles.get(name);
}

/** The role canon gives this person now, or null when they have no stages (or none yet). */
export function eraRoleFor(name: string, completed: ReadonlySet<string>): string | null {
  const stages = ROLE_STAGES[name];
  if (!stages) return null;

  let role: string | null = seedRole(name) ?? null;

  for (const stage of stages) {
    if (stage.from === 'start' || completed.has(stage.from)) role = stage.role;
  }

  return role;
}

/** Every text this person's role has had from the seed or a stage: only those are moved. */
function stageTexts(name: string): Set<string> {
  const texts = new Set((ROLE_STAGES[name] ?? []).map((stage) => stage.role));
  const seeded = seedRole(name);
  if (seeded) texts.add(seeded);
  return texts;
}

/** Moves every seeded role to the one canon gives it today. Idempotent. */
export function syncEraRoles(db: AppDatabase): AppDatabase {
  const completed = new Set(db.state.canonProgress?.completed ?? []);
  let changed = false;

  const entities = db.entities.map((entity) => {
    if (entity.type !== 'character' || !ROLE_STAGES[entity.name]) return entity;

    const role = eraRoleFor(entity.name, completed);
    if (!role || entity.role === role) return entity;
    if (entity.role && !stageTexts(entity.name).has(entity.role)) return entity;

    changed = true;
    return { ...entity, role };
  });

  return changed ? { ...db, entities } : db;
}

/**
 * The role as it was on the story's first night, for flashbacks (always
 * before the story): a later stage would put a Hokage's hat on a year-11
 * Tsunade. A role the story wrote itself is kept.
 */
export function roleBeforeStory(entity: { name: string; role?: string }): string | undefined {
  if (!entity.role || !ROLE_STAGES[entity.name] || !stageTexts(entity.name).has(entity.role)) return entity.role;
  return eraRoleFor(entity.name, new Set()) ?? entity.role;
}
