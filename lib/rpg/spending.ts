// What this story has cost on OpenRouter (audit 10). The Debug log keeps only
// 30 turns, so each story keeps its own running totals in the save.
//
// Costs often arrive after the call (looked up from OpenRouter seconds later),
// sometimes after the turn's last save. So they collect here per story and are
// folded into the save on its next commit (`foldSpending`). The totals only
// ever grow: undo, retry and restoring a snapshot never take spending back,
// because the money was spent.

import type { AppDatabase, Spending } from './types';

export const NO_SPENDING: Spending = { total: 0, turns: 0, images: 0, since: 0 };

const pending = new Map<string, Spending>();
const listeners = new Set<() => void>();
let version = 0;

function bump() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeSpending(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function spendingVersion() {
  return version;
}

/** Notes a known cost against a story. `kind` counts narrator turns and images. */
export function noteSpend(slotId: string, cost: number | null | undefined, kind: 'turn' | 'image' | 'other') {
  const amount = typeof cost === 'number' && Number.isFinite(cost) && cost > 0 ? cost : 0;
  if (!slotId || (amount === 0 && kind === 'other')) return;

  const current = pending.get(slotId) ?? { ...NO_SPENDING, since: Date.now() };
  pending.set(slotId, {
    total: current.total + amount,
    turns: current.turns + (kind === 'turn' ? 1 : 0),
    images: current.images + (kind === 'image' ? 1 : 0),
    since: current.since,
  });
  bump();
}

export function pendingSpending(slotId: string): Spending | null {
  return pending.get(slotId) ?? null;
}

/** The larger of two running totals (both only grow, so the larger is newer). */
function newer(a: Spending | undefined, b: Spending | undefined): Spending | undefined {
  if (!a) return b;
  if (!b) return a;
  return b.total > a.total || (b.total === a.total && b.turns + b.images > a.turns + a.images) ? b : a;
}

function add(base: Spending | undefined, extra: Spending | null): Spending | undefined {
  if (!extra) return base;
  if (!base) return { ...extra };
  return {
    total: base.total + extra.total,
    turns: base.turns + extra.turns,
    images: base.images + extra.images,
    since: base.since || extra.since,
  };
}

/**
 * The save about to be written, with the story's spending carried forward from
 * the copy in memory (a snapshot or an older copy never lowers it) and any
 * costs that arrived since folded in.
 */
export function foldSpending(next: AppDatabase, previous: AppDatabase | null | undefined): AppDatabase {
  const slotId = next.meta.slotId;
  const carried = newer(previous?.meta.slotId === slotId ? previous.spending : undefined, next.spending);
  const extra = pending.get(slotId) ?? null;
  const spending = add(carried, extra);

  if (extra) {
    pending.delete(slotId);
    bump();
  }

  return spending === next.spending ? next : { ...next, spending };
}

/** What Settings shows: the saved totals plus anything not saved yet. */
export function storySpending(db: AppDatabase): Spending {
  return add(db.spending, pendingSpending(db.meta.slotId)) ?? NO_SPENDING;
}

/** "$0.19" or "$0.0042": two decimals from a cent up, otherwise enough to read. */
export function formatDollars(amount: number) {
  if (amount >= 0.01) return `$${amount.toFixed(2)}`;
  if (amount <= 0) return '$0.00';
  return `$${amount.toFixed(4)}`;
}

/** "$0.19 so far · about $0.012 a turn · 15 turns, 1 painting" */
export function spendingLine(spending: Spending) {
  if (spending.total <= 0 && spending.turns === 0) return null;

  const parts = [`${formatDollars(spending.total)} so far`];
  if (spending.turns > 0) parts.push(`about ${formatDollars(spending.total / spending.turns)} a turn`);
  const counts = [`${spending.turns} ${spending.turns === 1 ? 'turn' : 'turns'}`];
  if (spending.images > 0) counts.push(`${spending.images} ${spending.images === 1 ? 'painting' : 'paintings'}`);
  parts.push(counts.join(', '));
  return parts.join(' · ');
}

/** Test hook. */
export function resetPendingSpending() {
  pending.clear();
  bump();
}
