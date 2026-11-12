import { useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';

import { EmptyRow, ListCard, ListRow, SectionLabel } from '@/components/List';
import { colors, fonts, radius, spacing } from '@/constants/theme';
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

/** "Hana · today", "Shisui · in 5 days (remembered)". */
export function formatUpcomingBirthday(item: UpcomingBirthday, db?: AppDatabase) {
  const when = item.inDays === 0 ? 'today' : item.inDays === 1 ? 'tomorrow' : `in ${item.inDays} days`;
  const first = (db ? displayName(db, item.entity) : item.entity.name).split(' ')[0];

  return `${first} · ${when}${item.dead ? ' (remembered)' : item.turning !== undefined ? `, turns ${item.turning}` : ''}`;
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

  // Birthdays you know in the next month (the dead you remember included).
  const birthdays = useMemo(() => (db ? upcomingBirthdays(db, 30).slice(0, 4) : []), [db]);

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
        {entry.bond?.isMajor && !entry.dead ? <Text style={styles.major}>Major</Text> : null}
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

  return (
    <View style={styles.section}>

      {!query && birthdays.length > 0 ? (
        <ListCard>
          <ListRow
            body={birthdays.map((item) => formatUpcomingBirthday(item, db)).join('   ·   ')}
            bodyLines={3}
            title="Upcoming birthdays"
          />
        </ListCard>
      ) : null}

      <View style={styles.search}>
        <Search color={colors.textDim} size={16} strokeWidth={2} />
        <TextInput
          accessibilityLabel="Search bonds"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search bonds"
          placeholderTextColor={colors.textDim}
          style={styles.searchInput}
          value={query}
        />
      </View>

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
          <SectionLabel>Travelling with you</SectionLabel>
          <ListCard>{travelling.map(renderRow)}</ListCard>
        </>
      ) : null}

      {enemies.length > 0 ? (
        <>
          <SectionLabel>Want you to pay</SectionLabel>
          <ListCard>{enemies.map(renderRow)}</ListCard>
        </>
      ) : null}

      {others.length > 0 ? (
        <>
          <SectionLabel>{query ? 'Results' : 'Seen recently'}</SectionLabel>
          <ListCard>{others.map(renderRow)}</ListCard>
        </>
      ) : null}

      {dead.length > 0 ? (
        <>
          <SectionLabel>The dead</SectionLabel>
          <ListCard>{dead.map(renderRow)}</ListCard>
        </>
      ) : null}
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
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.text,
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
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accentText,
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
