# Replay fixtures (audit 11d)

Each `*.json` here is a `ReplayFixture` (`lib/rpg/replay.ts`): the save just
before a few real turns, and those turns as they were played (Kan's input,
the narration, the tracker's raw Core and World replies).

Make one in the app: Settings → Debug → **Export this session as a test**
(up to the last 5 turns, the reach of undo). Drop the file in this folder.
`scripts/replay.test.ts` replays every fixture through the real state step
and fails on any rule the replay breaks that the starting save didn't
already break. Every bug hit in play becomes a fixture, so it cannot return.
