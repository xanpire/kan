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
import { CANON_MILESTONES, CANON_VERSION } from '../lib/rpg/canonData';
import { formatNewsOffer, newsOffer } from '../lib/rpg/newsDelivery';
import { applyStateStep } from '../lib/rpg/memoryJobs';
import type { AppDatabase } from '../lib/rpg/types';

const seed = () => normalizeDatabase(seedDatabase('slot_news', 'News story'));

/** A save where these milestones fired `daysAgo` days before today and nobody told Kan. */
function withFired(db: AppDatabase, fired: { id: string; daysAgo: number }[]): AppDatabase {
  const today = db.state.inStoryDate;
  const back = (days: number) => {
    const date = new Date(Date.UTC(today.year + 2000, today.month - 1, today.day - days));
    return { ...today, year: date.getUTCFullYear() - 2000, month: date.getUTCMonth() + 1, day: date.getUTCDate() };
  };

  return {
    ...db,
    events: [
      ...db.events,
      ...fired.map(({ id, daysAgo }) => ({
        id: `event_canon_${id}`,
        chapter: 1,
        scene: 'Canon event',
        inStoryDate: back(daysAgo),
        summary: id,
        importance: 3,
        tags: ['canon'],
        pinned: true,
        sourceLogId: null,
        createdAt: 1,
      })),
    ],
    state: {
      ...db.state,
      canonProgress: {
        version: CANON_VERSION,
        baselineDate: back(400),
        baselineTurn: 0,
        completed: fired.map((item) => item.id),
        active: [],
        engaged: [],
        heard: { anything: { from: 'x', date: back(1) } },
      },
    },
  } as AppDatabase;
}

const publicMinor = CANON_MILESTONES.filter(
  (milestone) => !milestone.major && !milestone.playerDriven && (milestone.knowledge ?? 'public') === 'public'
);
const publicMajor = CANON_MILESTONES.filter(
  (milestone) => milestone.major && !milestone.playerDriven && (milestone.knowledge ?? 'public') === 'public'
);

describe('news (audit 6.15)', () => {
  test('each offered item carries one line of what happened', () => {
    const major = publicMajor[0];
    const db = withFired(seed(), [{ id: major.id, daysAgo: 2 }]);
    const text = formatNewsOffer(newsOffer(db));
    expect(text).toContain(major.title);
    expect(text).toContain(major.description.slice(0, 40));
  });

  test('old minor news rides along in passing and is never overdue', () => {
    const [oldA, oldB] = publicMinor;
    const major = publicMajor[0];
    const db = withFired(seed(), [
      { id: oldA.id, daysAgo: 200 },
      { id: oldB.id, daysAgo: 150 },
      { id: major.id, daysAgo: 3 },
    ]);
    const offer = newsOffer(db)!;
    expect(offer.items.map((item) => item.milestoneId)).toEqual([major.id]);
    expect(offer.inPassing?.map((item) => item.milestoneId).sort()).toEqual([oldA.id, oldB.id].sort());
    const text = formatNewsOffer(offer);
    expect(text).toContain('smaller things you would have heard on any road');
    expect(text).not.toContain('OVERDUE');

    const turn = { turnLogId: 'log_x', userMessage: '*I listen.*', narration: 'The innkeeper tells you the news.' };
    const result = applyStateStep(db, { newsRelayed: [{ id: major.id, from: 'the innkeeper' }] }, turn, new Set());
    const heard = result.db.state.canonProgress?.heard ?? {};
    expect(heard[`event_canon_${oldA.id}`]?.from).toBe('in passing');
    expect(heard[`event_canon_${major.id}`]?.from).toBe('the innkeeper');
  });

  test('when only old minor news is left, it comes once, gently', () => {
    const [oldA] = publicMinor;
    const db = withFired(seed(), [{ id: oldA.id, daysAgo: 300 }]);
    const offer = newsOffer(db)!;
    expect(offer.items[0].milestoneId).toBe(oldA.id);
    expect(offer.items[0].urgency).toBe('fresh');
  });
});
