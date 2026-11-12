import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ChevronDown, ChevronRight, Pin, X } from 'lucide-react-native';

import { AppButton } from '@/components/AppButton';
import { EmptyRow, FilterPills, ListCard, ListRow, SectionLabel } from '@/components/List';
import { ReputationCard } from '@/components/kan/ReputationCard';
import { ScrapbookView } from '@/components/kan/ScrapbookView';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { formatClock, formatDayMonth } from '@/lib/rpg/calendar';
import { companionsOf } from '@/lib/rpg/companions';
import { grudgeKnown } from '@/lib/rpg/disclosure';
import { useGame } from '@/lib/rpg/game';
import { localizePlaceNames } from '@/lib/rpg/glossary';
import { alwaysKept, isPinnedItem } from '@/lib/rpg/inventory';
import { chapterDates, kanConditions, memoryTitle, storyTimeline, type TimelineChapter, type TimelineEntry } from '@/lib/rpg/journal';
import { letterArchive, type ArchivedLetter } from '@/lib/rpg/letters';
import { formatChange, formatRyo, purseFeel, purseOf } from '@/lib/rpg/money';
import { displayName } from '@/lib/rpg/names';
import { AUDIENCE_NAME, knownEpithets } from '@/lib/rpg/renown';
import type { AppDatabase, ThreadRecord } from '@/lib/rpg/types';
import { titleAndBody } from '@/lib/rpg/util';
import { todayNotes } from '@/lib/rpg/yearly';

// Three views, not six (audit 11a): Now, Story (one timeline of what
// happened) and Keepsakes (letters and the scrapbook).
type JournalView = 'now' | 'story' | 'keepsakes';

const VIEWS: { value: JournalView; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'story', label: 'Story' },
  { value: 'keepsakes', label: 'Keepsakes' },
];

// Kept here too: the bond screen imports them from this file.
export { memoryTitle, titleAndBody };

/** Items shown before "N more things". */
const SHORT_CARRY = 6;

/** A row that shows a title and two lines, and the whole text when tapped. */
function OpenableRow({ title, body, meta, tint }: { title: string; body: string | null; meta?: string | null; tint?: boolean }) {
  const [open, setOpen] = useState(false);
  const long = Boolean(body && body.length > 90);

  return (
    <View style={tint ? styles.memoryRow : undefined}>
      <ListRow
        accessibilityState={long ? { expanded: open } : undefined}
        body={body}
        bodyLines={open ? undefined : 2}
        meta={meta}
        onPress={long ? () => setOpen((value) => !value) : undefined}
        title={title}
      />
    </View>
  );
}

function ThreadRows({ threads }: { threads: ThreadRecord[] }) {
  return (
    <ListCard>
      {threads.map((thread) => (
        <OpenableRow body={thread.description || null} key={thread.id} meta={`Since ${formatDayMonth(thread.openedAt)}`} title={thread.title} />
      ))}
    </ListCard>
  );
}

function hiddenGrudge(db: AppDatabase, thread: ThreadRecord) {
  if (thread.type !== 'grudge') return false;

  const ids = new Set(thread.participantIds ?? []);
  const bond = db.bonds.find(
    (item) => item.grudge && (ids.has(item.entityId) || thread.participants?.includes(item.characterName))
  );

  return !bond || !grudgeKnown(bond.grudge);
}

/** What you carry, with your purse, and hand edits (add, remove, pin). */
function CarryCard({ db }: { db: AppDatabase }) {
  const { editInventory } = useGame();
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [purseOpen, setPurseOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const purse = purseOf(db);
  const pins = db.state.pinnedItems ?? [];
  const items = db.state.inventory;
  const shown = showAll || editing ? items : items.slice(0, SHORT_CARRY);
  const history = [...purse.history].reverse().slice(0, 4);

  const add = () => {
    if (!draft.trim()) return;
    void editInventory({ add: draft });
    setDraft('');
  };

  return (
    <>
      <SectionLabel>What you carry</SectionLabel>
      <ListCard>
        <ListRow
          accessibilityState={{ expanded: purseOpen }}
          meta={purse.estimatedStart ? 'About what you had on you' : purseFeel(purse.ryo)}
          onPress={() => setPurseOpen((value) => !value)}
          title="Purse"
          trailing={<Text style={styles.total}>{formatRyo(purse.ryo)}</Text>}
        />
        {purseOpen
          ? history.length === 0
            ? [<ListRow body="Nothing spent or earned yet." key="none" />]
            : history.map((entry, index) => (
                <ListRow
                  key={`${index}-${entry.reason}`}
                  meta={formatDayMonth(entry.date)}
                  title={entry.reason}
                  trailing={
                    <Text style={[styles.change, entry.change < 0 ? styles.spent : styles.earned]}>
                      {formatChange(entry.change)}
                    </Text>
                  }
                />
              ))
          : null}
        {items.length === 0 ? <ListRow body="Nothing on you." /> : null}
        {shown.map((item, index) => {
          const kept = alwaysKept(item);
          const pinned = isPinnedItem(item, pins);

          return (
            <ListRow
              key={`${index}-${item}`}
              meta={!editing && pinned ? (kept ? 'Always with you' : 'Pinned') : null}
              title={item}
              trailing={
                editing ? (
                  <View style={styles.itemTools}>
                    {kept ? (
                      <Text style={type.rowMeta}>Always kept</Text>
                    ) : (
                      <>
                        <Pressable
                          accessibilityLabel={pinned ? `Unpin ${item}` : `Pin ${item}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: pinned }}
                          onPress={() => void editInventory({ pin: item })}
                          style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
                        >
                          <Pin color={pinned ? colors.accentTint : colors.textMuted} fill={pinned ? colors.accentTint : 'transparent'} size={16} strokeWidth={2} />
                        </Pressable>
                        <Pressable
                          accessibilityLabel={`Remove ${item}`}
                          accessibilityRole="button"
                          onPress={() => void editInventory({ remove: item })}
                          style={({ pressed }) => [styles.tool, pressed && styles.pressed]}
                        >
                          <X color={colors.textMuted} size={17} strokeWidth={2} />
                        </Pressable>
                      </>
                    )}
                  </View>
                ) : null
              }
            />
          );
        })}
        {editing ? (
          <View style={styles.addRow}>
            <TextInput
              accessibilityLabel="Add something you carry"
              maxLength={80}
              onChangeText={setDraft}
              onSubmitEditing={add}
              placeholder="Add something you carry"
              placeholderTextColor={colors.textDim}
              returnKeyType="done"
              style={styles.addInput}
              value={draft}
            />
            <AppButton compact disabled={!draft.trim()} label="Add" onPress={add} />
          </View>
        ) : null}
        <View style={styles.cardFoot}>
          {!editing && items.length > SHORT_CARRY ? (
            <Pressable accessibilityRole="button" onPress={() => setShowAll((value) => !value)} style={styles.footButton}>
              <Text style={styles.footLabel}>{showAll ? 'Show less' : `${items.length - SHORT_CARRY} more`}</Text>
            </Pressable>
          ) : (
            <View />
          )}
          <Pressable
            accessibilityLabel={editing ? 'Done editing what you carry' : 'Edit what you carry'}
            accessibilityRole="button"
            onPress={() => setEditing((value) => !value)}
            style={styles.footButton}
          >
            <Text style={styles.footLabelStrong}>{editing ? 'Done' : 'Edit'}</Text>
          </Pressable>
        </View>
      </ListCard>
    </>
  );
}

function NowView({ db }: { db: AppDatabase }) {
  // A grudge stays off the page until they have acted on it.
  const open = db.threads.filter((thread) => thread.status === 'open' && !hiddenGrudge(db, thread));
  const missions = open.filter((thread) => thread.type === 'quest');
  const goals = open.filter((thread) => thread.type === 'goal');
  const other = open.filter((thread) => thread.type !== 'quest' && thread.type !== 'goal');
  // Birthdays, anniversaries and festivals on today's date, as far as you know.
  const today = todayNotes(db);
  const withYou = companionsOf(db);
  const conditions = kanConditions(db);
  const names = knownEpithets(db);
  const chapter = `Chapter ${db.state.chapter}${db.state.chapterTitle ? `: ${db.state.chapterTitle}` : ''}`;

  return (
    <>
      <ListCard>
        <ListRow
          meta={`${formatClock(db.state.inStoryDate)}, ${formatDayMonth(db.state.inStoryDate)} · ${chapter}`}
          title={localizePlaceNames(db.state.location)}
        />
        {withYou.map((entity) => (
          <ListRow key={entity.id} meta="With you" title={displayName(db, entity)} />
        ))}
        {today.length > 0 ? <ListRow body={today.join(' · ')} bodyLines={2} title="Today" /> : null}
      </ListCard>

      <CarryCard db={db} />

      <SectionLabel>Your condition</SectionLabel>
      {conditions.length > 0 ? (
        <ListCard>
          {conditions.map((item) => (
            <ListRow key={item.id} meta={item.lasts} title={item.text} />
          ))}
        </ListCard>
      ) : (
        <EmptyRow title="Nothing slowing you down" />
      )}

      <ReputationCard db={db} first={false} />
      {names.length > 0 ? (
        <ListCard>
          {names.map(({ audience, epithet }) => (
            <ListRow
              key={audience}
              meta={`What they call you · ${AUDIENCE_NAME[audience].charAt(0).toUpperCase()}${AUDIENCE_NAME[audience].slice(1)}`}
              title={`“${epithet.name}”`}
            />
          ))}
        </ListCard>
      ) : null}

      <SectionLabel>Missions</SectionLabel>
      {missions.length > 0 ? <ThreadRows threads={missions} /> : <EmptyRow title="No missions. For now." />}

      <SectionLabel>Goals</SectionLabel>
      {goals.length > 0 ? <ThreadRows threads={goals} /> : <EmptyRow title="Nothing you’ll admit to" />}

      {other.length > 0 ? (
        <>
          <SectionLabel>Unanswered</SectionLabel>
          <ThreadRows threads={other} />
        </>
      ) : null}
    </>
  );
}

function EntryRow({ entry }: { entry: TimelineEntry }) {
  return (
    <OpenableRow
      body={entry.body}
      meta={entry.kind === 'news' ? `${entry.meta} · news` : entry.meta}
      tint={entry.kind === 'flashback'}
      title={entry.title}
    />
  );
}

function ChapterCard({ chapter, startOpen }: { chapter: TimelineChapter; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const count = chapter.entries.length;

  return (
    <ListCard>
      <Pressable
        accessibilityLabel={`Chapter ${chapter.chapter}: ${chapter.title}`}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.chapterHead, pressed && styles.pressed]}
      >
        <View style={styles.chapterText}>
          <Text style={type.rowMeta}>
            Chapter {chapter.chapter}
            {chapterDates(chapter) ? ` · ${chapterDates(chapter)}` : ''}
          </Text>
          <Text style={styles.chapterTitle}>{chapter.title}</Text>
          {!open ? <Text style={type.rowMeta}>{count === 0 ? 'Nothing kept yet' : count === 1 ? '1 moment' : `${count} moments`}</Text> : null}
        </View>
        {open ? (
          <ChevronDown color={colors.textDim} size={18} strokeWidth={2} />
        ) : (
          <ChevronRight color={colors.textDim} size={18} strokeWidth={2} />
        )}
      </Pressable>
      {open
        ? count === 0
          ? [<ListRow body="The moments that matter in this chapter are kept here." key="empty" />]
          : chapter.entries.map((entry) => <EntryRow entry={entry} key={entry.id} />)
        : null}
    </ListCard>
  );
}

function StoryView({ db }: { db: AppDatabase }) {
  const chapters = useMemo(() => storyTimeline(db), [db]);

  return (
    <>
      <SectionLabel>Your story so far</SectionLabel>
      {chapters.map((chapter) => (
        <ChapterCard chapter={chapter} key={chapter.chapter} startOpen={chapter.current} />
      ))}
    </>
  );
}

function LetterRow({ letter }: { letter: ArchivedLetter }) {
  const [open, setOpen] = useState(false);
  const words = letter.text?.trim() || null;
  const when = letter.direction === 'to-kan' ? letter.deliveredOn ?? letter.arrivesOn : letter.sentOn;

  return (
    <ListRow
      accessibilityLabel={open ? `Fold the letter: ${letter.label}` : `Read the letter: ${letter.label}`}
      body={words ? (open ? words : words.split('\n')[0]) : letter.gist ?? 'Only the gist of this one was kept.'}
      bodyLines={open ? undefined : 2}
      meta={`${formatDayMonth(when)}, year ${when.year}${letter.gist && words ? ` · ${letter.gist}` : ''}`}
      onPress={words ? () => setOpen((value) => !value) : undefined}
      title={letter.label}
    />
  );
}

function KeepsakesView({ db }: { db: AppDatabase }) {
  const letters = useMemo(() => letterArchive(db), [db]);
  const kept = letters.filter((letter) => letter.status === 'unsent');
  const rest = letters.filter((letter) => letter.status !== 'unsent');

  return (
    <>
      <SectionLabel>Letters</SectionLabel>
      {rest.length === 0 ? (
        <EmptyRow
          body="Letters you write and the ones that find you are kept here, word for word."
          title="No letters yet"
        />
      ) : (
        <ListCard>
          {rest.map((letter) => (
            <LetterRow key={letter.id} letter={letter} />
          ))}
        </ListCard>
      )}

      {kept.length > 0 ? (
        <>
          <SectionLabel>Never sent</SectionLabel>
          <ListCard>
            {kept.map((letter) => (
              <LetterRow key={letter.id} letter={letter} />
            ))}
          </ListCard>
        </>
      ) : null}

      <ScrapbookView db={db} />
    </>
  );
}

export function JournalSection() {
  const { db } = useGame();
  const [view, setView] = useState<JournalView>('now');

  if (!db) {
    return null;
  }

  return (
    <View style={styles.section}>
      <FilterPills onChange={setView} options={VIEWS} value={view} />
      {view === 'now' ? <NowView db={db} /> : null}
      {view === 'story' ? <StoryView db={db} /> : null}
      {view === 'keepsakes' ? <KeepsakesView db={db} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.65,
  },
  memoryRow: {
    backgroundColor: colors.memoryTint,
  },
  total: {
    fontFamily: fonts.extrabold,
    fontSize: 17,
    color: colors.text,
  },
  change: {
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  spent: {
    color: colors.textMuted,
  },
  earned: {
    color: colors.success,
  },
  itemTools: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tool: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  addInput: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  cardFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  footButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  footLabel: {
    ...type.rowMeta,
    color: colors.textMuted,
  },
  footLabelStrong: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textSoft,
  },
  chapterHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 60,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  chapterText: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  chapterTitle: {
    fontFamily: fonts.bold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.text,
  },
});
