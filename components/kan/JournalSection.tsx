import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyRow, FilterPills, ListCard, ListRow, SectionLabel } from '@/components/List';
import { colors, spacing, type } from '@/constants/theme';
import { dateSortValue, formatClock, formatDayMonth } from '@/lib/rpg/calendar';
import { localizePlaceNames } from '@/lib/rpg/glossary';
import { useGame } from '@/lib/rpg/game';
import type { AppDatabase, EventRecord, ThreadRecord } from '@/lib/rpg/types';
import { shortTitle, titleAndBody } from '@/lib/rpg/util';
import { loreActive } from '@/lib/rpg/lore';
import { todayNotes } from '@/lib/rpg/yearly';
import { grudgeKnown } from '@/lib/rpg/disclosure';
import { letterArchive, type ArchivedLetter } from '@/lib/rpg/letters';
import { AUDIENCE_NAME, knownEpithets } from '@/lib/rpg/renown';
import { PurseCard } from '@/components/kan/PurseCard';
import { ScrapbookView } from '@/components/kan/ScrapbookView';
import { displayName, loreTitle, scrubNameLeaks } from '@/lib/rpg/names';
import { knownCanonPoint } from '@/lib/rpg/canon';

type JournalView = 'now' | 'recap' | 'world' | 'memories' | 'letters' | 'scrapbook';

const VIEWS: { value: JournalView; label: string }[] = [
  { value: 'now', label: 'Now' },
  { value: 'recap', label: 'Recap' },
  { value: 'world', label: 'World' },
  { value: 'memories', label: 'Memories' },
  { value: 'letters', label: 'Letters' },
  { value: 'scrapbook', label: 'Scrapbook' },
];

// Kept here too: the bond screen imports it from this file.
export { titleAndBody };

/** A memory's title and description: its own title, else one cut from its text. */
export function memoryTitle(event: EventRecord): { title: string; body: string | null } {
  if (event.title?.trim()) {
    return { title: event.title.trim(), body: event.summary.trim() || null };
  }

  return titleAndBody(event.summary);
}

function peopleIn(db: AppDatabase, eventId: string) {
  const ids = db.eventEntities
    .filter((link) => link.eventId === eventId)
    .map((link) => link.entityId);

  return db.entities
    .filter((entity) => ids.includes(entity.id) && entity.type === 'character' && entity.name !== 'Kan')
    .slice(0, 2)
    .map((entity) => displayName(db, entity));
}

function ThreadRows({ threads }: { threads: ThreadRecord[] }) {
  return (
    <ListCard>
      {threads.map((thread) => (
        <ListRow
          body={thread.description || null}
          bodyLines={3}
          key={thread.id}
          meta={`Opened ${formatDayMonth(thread.openedAt)}`}
          title={thread.title}
        />
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

function NowView({ db }: { db: AppDatabase }) {
  // A grudge stays off the page until they have acted on it.
  const open = db.threads.filter((thread) => thread.status === 'open' && !hiddenGrudge(db, thread));
  const missions = open.filter((thread) => thread.type === 'quest');
  const goals = open.filter((thread) => thread.type === 'goal');
  const other = open.filter((thread) => thread.type !== 'quest' && thread.type !== 'goal');
  // Birthdays, anniversaries and festivals on today's date, as far as you know.
  const today = todayNotes(db);

  return (
    <>
      <SectionLabel>Now</SectionLabel>
      <ListCard>
        <ListRow
          meta={`${formatClock(db.state.inStoryDate)}, ${formatDayMonth(db.state.inStoryDate)} · ${localizePlaceNames(db.state.location)}`}
          title={`Chapter ${db.state.chapter}${db.state.chapterTitle ? `: ${db.state.chapterTitle}` : ""} · ${db.state.scene}`}
        />
        {today.length > 0 ? <ListRow body={today.join(' · ')} bodyLines={3} title="Today" /> : null}
      </ListCard>

      <PurseCard db={db} />

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

type RecapEntry = { id: string; when: string; title: string; body: string | null };

function RecapView({ db }: { db: AppDatabase }) {
  const entries = useMemo<RecapEntry[]>(() => {
    if (db.summaries.length > 0) {
      return [...db.summaries]
        .filter(
          (summary, index, all) =>
            all.findIndex((other) => other.text.trim() === summary.text.trim()) === index
        )
        .sort((a, b) => dateSortValue(b.range.to) - dateSortValue(a.range.to))
        .slice(0, 16)
        .map((summary) => {
          const level = summary.level.charAt(0).toUpperCase() + summary.level.slice(1);
          const label = summary.chapter ? `${level} ${summary.chapter}` : level;
          const from = formatDayMonth(summary.range.from);
          const to = formatDayMonth(summary.range.to);

          return {
            id: summary.id,
            when: `${label} · ${from === to ? from : `${from} – ${to}`}, year ${summary.range.to.year}`,
            title: summary.title?.trim() || shortTitle(summary.text),
            body: summary.text,
          };
        });
    }

    return [...db.events]
      .filter((event) => !event.tags.includes('canon'))
      .sort((a, b) => dateSortValue(b.inStoryDate) - dateSortValue(a.inStoryDate))
      .slice(0, 20)
      .map((event) => {
        const { title, body } = memoryTitle(event);

        return {
          id: event.id,
          when: `Chapter ${event.chapter} · ${formatDayMonth(event.inStoryDate)} · ${event.scene}`,
          title,
          body,
        };
      });
  }, [db]);

  if (entries.length === 0) {
    return (
      <>
        <SectionLabel>Chapters</SectionLabel>
        <EmptyRow body="Each chapter is summed up here once it ends." title="Nothing behind you yet" />
      </>
    );
  }

  return (
    <>
      <SectionLabel>Chapters</SectionLabel>
      <View style={styles.timeline}>
        {entries.map((entry, index) => (
          <View key={entry.id} style={styles.timelineItem}>
            <View style={styles.rail}>
              <View style={[styles.dot, index === 0 ? styles.dotNow : styles.dotPast]} />
              {index < entries.length - 1 ? <View style={styles.line} /> : null}
            </View>
            <View style={styles.timelineText}>
              <Text style={type.rowMeta}>{entry.when}</Text>
              <Text style={type.rowTitle}>{entry.title}</Text>
              {entry.body ? <Text style={type.rowBody}>{entry.body}</Text> : null}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

function WorldView({ db }: { db: AppDatabase }) {
  const news = useMemo(() => {
    const now = dateSortValue(db.state.inStoryDate);
    const heard = db.state.canonProgress?.heard ?? {};

    return db.events
      .filter(
        (event) =>
          event.tags.includes('canon') &&
          Boolean(heard[event.id]) &&
          dateSortValue(event.inStoryDate) <= now
      )
      .sort((a, b) => dateSortValue(b.inStoryDate) - dateSortValue(a.inStoryDate))
      .slice(0, 40);
  }, [db]);
  const heard = db.state.canonProgress?.heard ?? {};
  const visibleLore = db.loreEntries.filter((lore) => !lore.hidden && loreActive(db, lore));
  // Only the names you have heard yourself called.
  const names = knownEpithets(db);

  return (
    <>
      <SectionLabel>Word on the road</SectionLabel>
      {news.length === 0 ? (
        <EmptyRow
          body="News reaches you through people and couriers, never all at once."
          title="No word yet"
        />
      ) : (
        <ListCard>
          {news.map((event) => {
            const { title, body } = titleAndBody(event.summary);
            const source = heard[event.id]?.from;
            const how = source === 'witnessed' ? 'witnessed' : source ? `heard from ${source}` : null;

            return (
              <ListRow
                body={body}
                key={event.id}
                meta={[formatDayMonth(event.inStoryDate), how].filter(Boolean).join(' · ')}
                title={title}
              />
            );
          })}
        </ListCard>
      )}

      {names.length > 0 ? (
        <>
          <SectionLabel>What they call you</SectionLabel>
          <ListCard>
            {names.map(({ audience, epithet }) => (
              <ListRow
                body={epithet.history?.length ? `Before that: ${epithet.history.map((item) => item.name).join(', ')}` : null}
                key={audience}
                meta={`${AUDIENCE_NAME[audience].charAt(0).toUpperCase()}${AUDIENCE_NAME[audience].slice(1)} · since ${formatDayMonth(epithet.since)}, year ${epithet.since.year}`}
                title={epithet.name}
              />
            ))}
          </ListCard>
        </>
      ) : null}

      <SectionLabel>The world as you know it</SectionLabel>
      <ListCard>
        <ListRow body={localizePlaceNames(db.state.worldDescription)} title="The world" />
        {knownCanonPoint(db) ? <ListRow body={localizePlaceNames(knownCanonPoint(db))} title="Timeline" /> : null}
      </ListCard>

      {visibleLore.length > 0 ? (
        <>
          <SectionLabel>Lore</SectionLabel>
          <ListCard>
            {visibleLore.map((lore) => (
              <ListRow
                body={scrubNameLeaks(db, lore.text).text}
                key={lore.id}
                title={loreTitle(db, lore.keywords)}
              />
            ))}
          </ListCard>
        </>
      ) : null}
    </>
  );
}

function MemoriesView({ db }: { db: AppDatabase }) {
  const memories = useMemo<EventRecord[]>(
    () =>
      db.events
        .filter((event) => !event.tags.includes('canon'))
        .sort((a, b) => dateSortValue(b.inStoryDate) - dateSortValue(a.inStoryDate))
        .slice(0, 80),
    [db]
  );

  return (
    <>
      <SectionLabel>What you remember</SectionLabel>
      {memories.length === 0 ? (
        <EmptyRow body="The moments that matter stay here." title="Nothing worth keeping yet" />
      ) : (
        <ListCard>
          {memories.map((memory) => {
            const { title, body } = memoryTitle(memory);
            const people = peopleIn(db, memory.id);

            return (
              <ListRow
                body={body}
                key={memory.id}
                meta={[formatDayMonth(memory.inStoryDate), ...people].join(' · ')}
                title={title}
              />
            );
          })}
        </ListCard>
      )}
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

function LettersView({ db }: { db: AppDatabase }) {
  const letters = useMemo(() => letterArchive(db), [db]);
  const kept = letters.filter((letter) => letter.status === 'unsent');
  const rest = letters.filter((letter) => letter.status !== 'unsent');

  return (
    <>
      <SectionLabel>Letters</SectionLabel>
      {rest.length === 0 ? (
        <EmptyRow
          body="Letters you write and the ones that find you are kept here, word for word. Tap one to read it."
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
      {view === 'recap' ? <RecapView db={db} /> : null}
      {view === 'world' ? <WorldView db={db} /> : null}
      {view === 'memories' ? <MemoriesView db={db} /> : null}
      {view === 'letters' ? <LettersView db={db} /> : null}
      {view === 'scrapbook' ? <ScrapbookView db={db} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  timeline: {
    paddingTop: 4,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 14,
  },
  rail: {
    width: 12,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 3,
  },
  dotNow: {
    backgroundColor: colors.accent,
  },
  dotPast: {
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: 4,
    backgroundColor: colors.border,
  },
  timelineText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
    paddingBottom: 22,
  },
});
