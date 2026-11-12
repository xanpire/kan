import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Cake, Search } from 'lucide-react-native';

import { EmptyRow, ListCard, ListRow, SectionLabel } from '@/components/List';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { formatDayMonth } from '@/lib/rpg/calendar';
import { kanKnowsDeath } from '@/lib/rpg/deaths';
import { grudgeKnown, shownField } from '@/lib/rpg/disclosure';
import { STAGE_LABEL, grudgeStage } from '@/lib/rpg/grudges';
import { useGame } from '@/lib/rpg/game';
import { latestCharacterPortraitMap } from '@/lib/rpg/characterPortrait';
import { useStoredImage } from '@/lib/rpg/imageStore';
import { upcomingBirthdays, type UpcomingBirthday } from '@/lib/rpg/yearly';
import type { AppDatabase, BondRecord, CalendarDate, EntityRecord } from '@/lib/rpg/types';
import { displayName, searchableNames } from '@/lib/rpg/names';

type BondEntry = {
  entity: EntityRecord;
  bond: BondRecord | null;
  /** Dead, and the story has told you so. */
  dead?: boolean;
};

function dateValue(date: CalendarDate | undefined | null) {
  return date ? date.year * 10000 + date.month * 100 + date.day : -1;
}

function contactDate(entry: BondEntry) {
  return Math.max(dateValue(entry.entity.lastSeen), dateValue(entry.bond?.updatedInStoryDate));
}

export function formatAffinity(affinity: number) {
  return `${affinity > 0 ? '+' : ''}${affinity}`;
}

/** Seen recently: this many, then "Everyone you know (N)". */
const RECENT_COUNT = 10;

/** "Hana's birthday is in 3 days", "Shisui's birthday is today (remembered)". */
export function birthdayLine(item: UpcomingBirthday, db?: AppDatabase) {
  const when = item.inDays === 0 ? 'is today' : item.inDays === 1 ? 'is tomorrow' : `is in ${item.inDays} days`;
  const first = (db ? displayName(db, item.entity) : item.entity.name).split(' ')[0];

  return `${first}’s birthday ${when}${item.dead ? ' (remembered)' : ''}`;
}

export function bondSubtitle(entry: BondEntry, db: AppDatabase) {
  const { entity, bond } = entry;
  const today = db.state.inStoryDate;

  if (entry.dead) {
    const date = entity.deceased?.date;

    return date ? `Died ${formatDayMonth(date)} · Year ${date.year}` : 'Deceased';
  }
  const relation =
    bond?.relationship && bond.relationship !== 'stranger'
      ? bond.relationship.charAt(0).toUpperCase() + bond.relationship.slice(1)
      : bond?.status || entity.status || shownField(db, entity, 'role') || 'Unknown';
  const seen = entity.lastSeen
    ? dateValue(entity.lastSeen) === dateValue(today)
      ? 'seen today'
      : `last seen ${formatDayMonth(entity.lastSeen)}`
    : null;

  return seen ? `${relation} · ${seen}` : relation;
}

export function Avatar({
  name,
  size = 40,
  dimmed = false,
  image = null,
}: {
  name: string;
  size?: number;
  dimmed?: boolean;
  /** Their latest portrait (img: reference or data URI), when one is painted. */
  image?: string | null;
}) {
  const uri = useStoredImage(image);

  if (uri) {
    return (
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' },
          dimmed && styles.avatarDimmed,
        ]}
      >
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri }}
          style={styles.avatarImage}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        dimmed && styles.avatarDimmed,
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export function AffinityBar({ affinity }: { affinity: number }) {
  const width = `${Math.min(10, Math.abs(affinity)) * 10}%` as const;

  return (
    <View style={styles.barRow}>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            { width, backgroundColor: affinity >= 0 ? colors.accent : colors.textDim },
          ]}
        />
      </View>
      <Text style={styles.barValue}>{formatAffinity(affinity)}</Text>
    </View>
  );
}

export function BondsSection() {
  const { db } = useGame();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [everyoneOpen, setEveryoneOpen] = useState(false);
  const [deadOpen, setDeadOpen] = useState(false);

  const entries = useMemo<BondEntry[]>(() => {
    if (!db) {
      return [];
    }

    const term = query.trim().toLowerCase();

    return db.entities
      // People you have not met, and one-scene characters, stay off the list.
      .filter(
        (entity) =>
          entity.type === 'character' && entity.name !== 'Kan' && entity.met !== false && entity.tier !== 'minor'
      )
      .map((entity) => ({
        entity,
        bond: db.bonds.find((bond) => bond.entityId === entity.id) ?? null,
        dead: kanKnowsDeath(db, entity),
      }))
      .filter(({ entity, bond }) => {
        if (!term) {
          return true;
        }

        // Only names you know: a hidden name must never find (or spoil) anyone.
        return (
          searchableNames(db, entity).some((name) => name.toLowerCase().includes(term)) ||
          (bond?.status.toLowerCase().includes(term) ?? false)
        );
      })
      .sort((a, b) => {
        const contact = contactDate(b) - contactDate(a);

        if (contact !== 0) {
          return contact;
        }

        const major = Number(Boolean(b.bond?.isMajor)) - Number(Boolean(a.bond?.isMajor));

        if (major !== 0) {
          return major;
        }

        return (b.bond?.affinity ?? 0) - (a.bond?.affinity ?? 0);
      });
  }, [db, query]);

  const portraits = useMemo(
    () => (db ? latestCharacterPortraitMap(db) : new Map<string, string>()),
    [db]
  );

  // Birthdays you know in the next week, as one line (audit 11a).
  const birthdays = useMemo(() => (db ? upcomingBirthdays(db, 7).slice(0, 2) : []), [db]);

  // People travelling with you lead the list; everyone else by last contact.
  const travelling = query ? [] : entries.filter((entry) => !entry.dead && entry.entity.companion);
  const living = entries.filter((entry) => !entry.dead && !travelling.includes(entry));
  const dead = entries.filter((entry) => entry.dead);

  if (!db) {
    return null;
  }

  const renderRow = (entry: BondEntry) => (
    <ListRow
      accessibilityLabel={`Open ${displayName(db, entry.entity)}`}
      chevron
      key={entry.entity.id}
      leading={
        <Avatar
          dimmed={entry.dead}
          image={portraits.get(entry.entity.id) ?? null}
          name={displayName(db, entry.entity)}
        />
      }
      meta={bondSubtitle(entry, db)}
      onPress={() => router.push({ pathname: '/bond/[id]', params: { id: entry.entity.id } })}
    >
      <View style={styles.nameRow}>
        <Text numberOfLines={1} style={[styles.name, entry.dead && styles.nameDead]}>
          {displayName(db, entry.entity)}
        </Text>
        {entry.entity.companion && !entry.dead && query ? <Text style={styles.major}>With you</Text> : null}
        {entry.bond?.grudge && grudgeKnown(entry.bond.grudge) && !entry.dead ? (
          <Text style={styles.grudge}>{STAGE_LABEL[grudgeStage(db, entry.bond) ?? 'resentful']}</Text>
        ) : null}
      </View>
      {entry.bond && !entry.dead ? <AffinityBar affinity={entry.bond.yourFeelings?.affinity ?? entry.bond.affinity} /> : null}
    </ListRow>
  );

  // People who want you to pay, hottest first, under their own heading.
  const enemies = query ? [] : living.filter((entry) => grudgeKnown(entry.bond?.grudge));
  const others = living.filter((entry) => !enemies.includes(entry));
  // The ten you saw most recently; everyone else behind one row (audit 11a).
  const recent = query ? others : others.slice(0, RECENT_COUNT);
  const everyone = [...others].sort((a, b) => displayName(db, a.entity).localeCompare(displayName(db, b.entity)));

  return (
    <View style={styles.section}>
      <View style={styles.search}>
        <Search color={colors.textDim} size={16} strokeWidth={2} />
        <TextInput
          accessibilityLabel="Search people you know"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search people you know"
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
          value={query}
        />
      </View>

      {!query && birthdays.length > 0 ? (
        <View style={styles.birthday}>
          <Cake color={colors.accentTint} size={15} strokeWidth={2} />
          <Text numberOfLines={1} style={styles.birthdayText}>
            {birthdays.map((item) => birthdayLine(item, db)).join(' · ')}
          </Text>
        </View>
      ) : null}

      {entries.length === 0 ? (
        <>
          <SectionLabel>{query ? 'Results' : 'Seen recently'}</SectionLabel>
          <EmptyRow
            body={query ? 'Try another name.' : 'People appear here as you meet them.'}
            title={query ? 'You don’t know anyone by that name' : 'No one yet'}
          />
        </>
      ) : null}

      {travelling.length > 0 ? (
        <>
          <SectionLabel>With you</SectionLabel>
          <ListCard>{travelling.map(renderRow)}</ListCard>
        </>
      ) : null}

      {enemies.length > 0 ? (
        <>
          <SectionLabel>Want you to pay</SectionLabel>
          <ListCard>{enemies.map(renderRow)}</ListCard>
        </>
      ) : null}

      {recent.length > 0 ? (
        <>
          <SectionLabel>{query ? 'Results' : 'Seen recently'}</SectionLabel>
          <ListCard>{recent.map(renderRow)}</ListCard>
        </>
      ) : null}

      {query ? (
        dead.length > 0 ? <ListCard>{dead.map(renderRow)}</ListCard> : null
      ) : (
        <>
          {others.length > RECENT_COUNT || dead.length > 0 ? (
            <ListCard>
              {others.length > RECENT_COUNT ? (
                <ListRow
                  accessibilityState={{ expanded: everyoneOpen }}
                  chevron={!everyoneOpen}
                  meta={`${others.length} people, A to Z`}
                  onPress={() => setEveryoneOpen((value) => !value)}
                  title="Everyone you know"
                />
              ) : null}
              {everyoneOpen ? everyone.map(renderRow) : null}
              {dead.length > 0 ? (
                <ListRow
                  accessibilityState={{ expanded: deadOpen }}
                  chevron={!deadOpen}
                  meta={dead.length === 1 ? '1 person' : `${dead.length} people`}
                  onPress={() => setDeadOpen((value) => !value)}
                  title="The dead"
                />
              ) : null}
              {deadOpen ? dead.map(renderRow) : null}
            </ListCard>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 48,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  birthday: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  birthdayText: {
    ...type.rowMeta,
    flex: 1,
    color: colors.textSoft,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  // Portraits are 3:4 head-and-shoulders; pin the top so the face fills the circle.
  avatarImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '133%',
  },
  avatarDimmed: {
    opacity: 0.45,
  },
  avatarText: {
    fontFamily: fonts.bold,
    color: colors.accentText,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flexShrink: 1,
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  nameDead: {
    color: colors.textMuted,
  },
  grudge: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.danger,
  },
  major: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accentTint,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  barTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: colors.border,
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  barValue: {
    width: 26,
    textAlign: 'right',
    fontFamily: fonts.bold,
    fontSize: 12,
    color: '#D4D4D4',
  },
});
