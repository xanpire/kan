import { describe, expect, mock, test } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

import { normalizeDatabase } from '../lib/rpg/db';
import { seedDatabase } from '../lib/rpg/seed';
import { appendStoryMessage } from '../lib/rpg/log';
import { applySummaryJob, isJobValid, latestSaga } from '../lib/rpg/memoryJobs';
import { buildNarrationPrompt, buildSceneSummaryPrompt } from '../lib/rpg/prompt';
import type { AppDatabase, MemoryJob, SummaryRecord } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_saga', 'Saga story'));
const job = (kind: MemoryJob['kind'], summaryIds: string[]): MemoryJob => ({
  id: `job_${kind}_${summaryIds.join('_')}`,
  kind,
  status: 'queued',
  turnLogId: 'log_x',
  summaryIds,
  attempts: 0,
  createdAt: 1,
});
const chapter = (db: AppDatabase, id: string, n: number): SummaryRecord => ({
  id,
  level: 'chapter',
  chapter: n,
  range: { fromEventId: '', toEventId: '', from: db.state.inStoryDate, to: db.state.inStoryDate },
  text: `Chapter ${n} happened.`,
  tokenCount: 4,
  eventIds: [],
  createdAt: n,
});

describe('the rolling saga (audit 6.5)', () => {
  test('an arc that lands is folded into the saga, and STORY SO FAR shows it first', () => {
    let db = seed();
    const chapters = [chapter(db, 'c1', 1), chapter(db, 'c2', 2), chapter(db, 'c3', 3)];
    const arcJob = job('arc', ['c1', 'c2', 'c3']);
    db = { ...db, summaries: [...db.summaries, ...chapters], memoryJobs: [arcJob] };

    const arcDone = applySummaryJob(db, arcJob, { text: 'You fled the Leaf with Itachi.', title: 'The flight' })!;
    const sagaJob = arcDone.db.memoryJobs!.find((item) => item.kind === 'saga')!;
    expect(sagaJob).toBeDefined();
    expect(arcDone.followUpIds).toContain(sagaJob.id);
    expect(isJobValid(arcDone.db, sagaJob)).toBe(true);

    const sagaDone = applySummaryJob(arcDone.db, sagaJob, { text: 'Year 13: you fled the Leaf with Itachi and joined the Akatsuki.' })!;
    expect(latestSaga(sagaDone.db)?.text).toContain('joined the Akatsuki');
    const text = buildNarrationPrompt(sagaDone.db, '*I wait.*').messages[0].content;
    const story = text.split('STORY SO FAR')[1];
    expect(story.indexOf('The whole story')).toBeLessThan(story.indexOf('Latest arc'));
  });

  test('year summaries are no longer made', () => {
    expect(isJobValid(seed(), job('year', ['a']))).toBe(false);
  });

  test('the scene summariser sees when and where, and the end of each reply', () => {
    let db = seed();
    const ending = 'AND THEN HE IS GONE.';
    db = appendStoryMessage(db, 'assistant', `${'The rain keeps falling. '.repeat(120)}${ending}`, 'm', 0, 0);
    const prompt = buildSceneSummaryPrompt(db, db.rawLog.slice(-1));
    const user = prompt.messages[1].content;
    expect(user).toContain('WHEN AND WHERE');
    expect(user).toContain(ending);
  });
});
