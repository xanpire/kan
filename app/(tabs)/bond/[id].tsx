import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Flame, Footprints, GitMerge, HeartPulse, Skull, UserMinus, Wrench } from 'lucide-react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';

import { EmptyRow, ListCard, ListRow, SectionLabel } from '@/components/List';
import { formatAffinity } from '@/components/kan/BondsSection';
import { CharacterPortraitCard } from '@/components/kan/CharacterPortraitCard';
import { memoryTitle } from '@/components/kan/JournalSection';
import { sharedMemories } from '@/lib/rpg/sharedMemories';
import { knownLife } from '@/lib/rpg/lives';
import { grudgeKnown, howTheySeem, shownProfile } from '@/lib/rpg/disclosure';
import { resolveEntity } from '@/lib/rpg/entities';
import { MergeSheet } from '@/components/kan/MergeSheet';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { dateSortValue, entityAge, formatDayMonth } from '@/lib/rpg/calendar';
import { MAX_COMPANIONS, castWithCompanions, companionsOf, daysTogether, formatTogether } from '@/lib/rpg/companions';
import { kanKnowsDeath } from '@/lib/rpg/deaths';
import { STAGE_LABEL, grudgeStage } from '@/lib/rpg/grudges';
import { useGame } from '@/lib/rpg/game';
import { alsoKnownAs, displayName, kanKnowsName } from '@/lib/rpg/names';

function Chip({ label, accent }: { label: string; accent?: boolean }) {
  return (
    <View style={[styles.chip, accent && styles.chipAccent]}>
      <Text style={[styles.chipText, accent && styles.chipTextAccent]}>{label}</Text>
    </View>
  );
}

export default function BondScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { db, mergeCharacters, setCharacterDeceased, setTravelling } = useGame();
  const [merging, setMerging] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [confirmDead, setConfirmDead] = useState(false);

  const entity = db?.entities.find((item) => item.id === id) ?? null;
  const bond = db?.bonds.find((item) => item.entityId === id) ?? null;

  // Only memories you shared: they were there. Being named in one isn't enough.
  const shared = useMemo(() => (db && id ? sharedMemories(db, id) : []), [db, id]);
  // What you know of their own life while you were apart.
  const life = useMemo(() => {
    const person = db?.entities.find((item) => item.id === id);

    return person ? knownLife(person) : [];
  }, [db, id]);

  // Tabs' back() falls through to the first tab (Story), so go to Kan explicitly.
  const back = () => router.navigate('/(tabs)/kan');

  if (!db || !entity) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.content}>
          <EmptyRow body="This person isn’t in the current story." title="Not found" />
        </View>
      </SafeAreaView>
    );
  }

  const age = entityAge(db.state.inStoryDate, entity);
  // Only ever the name you know them by (names.ts).
  const name = displayName(db, entity);
  const otherNames = alsoKnownAs(db, entity);
  // Only once the story has told you: a death still on its way is not spoiled here.
  const dead = kanKnowsDeath(db, entity);
  const death = entity.deceased;
  const deathLabel = dead
    ? death?.date
      ? `Died ${formatDayMonth(death.date)} · Year ${death.date.year}`
      : 'Deceased'
    : null;
  // Your own feelings you know exactly; theirs only as they seem to you.
  const affinity = bond?.yourFeelings?.affinity ?? bond?.affinity ?? 0;
  const theySeem = howTheySeem(bond?.theirFeelings?.affinity ?? bond?.affinity ?? 0);
  // What Kan can know of them: no canon secret before the story tells him.
  const profile = shownProfile(db, entity);
  // Their mood now only if they are here; otherwise how they were when you last saw them.
  const hereNow =
    Boolean(entity.companion) ||
    castWithCompanions(db, db.state.sceneCast ?? []).some((name) => resolveEntity(db, name)?.id === entity.id);
  const relationship =
    bond?.relationship && bond.relationship !== 'stranger'
      ? bond.relationship.charAt(0).toUpperCase() + bond.relationship.slice(1)
      : bond?.status || null;
  const seen = dead
    ? null
    : entity.lastSeen
    ? dateSortValue(entity.lastSeen) >= dateSortValue({ ...db.state.inStoryDate, hour: 0, minute: 0 })
      ? 'Seen today'
      : `Last seen ${formatDayMonth(entity.lastSeen)}`
    : null;
  const companion = !dead ? entity.companion : undefined;
  const together = companion ? daysTogether(db, entity) : 0;
  const togetherLabel = companion
    ? together <= 0
      ? 'Joined you today'
      : `Together ${formatTogether(together)}`
    : null;
  // A grudge shows once they have acted on it; until then it stews where you can't see it.
  const grudge = !dead && bond?.grudge && grudgeKnown(bond.grudge) ? bond.grudge : null;
  const stage = grudge && bond ? grudgeStage(db, bond) : null;
  const STAGE_TEXT = {
    resentful: 'They resent you, and left alone it will only grow.',
    vengeful: 'They want you to pay, and will act when they get the chance.',
    hunting: 'They are coming after you.',
  } as const;
  const grudgeMeta = grudge
    ? [
        `Since ${formatDayMonth(grudge.since)}, Year ${grudge.since.year}`,
        `struck ${grudge.strikes === 1 ? 'once' : `${grudge.strikes} times`}`,
        grudge.lastStrike ? `last ${formatDayMonth(grudge.lastStrike)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null;
  const partyFull = !companion && companionsOf(db).length >= MAX_COMPANIONS;
  const details = [
    { label: 'Also known as', value: otherNames.length > 0 ? otherNames.join(', ') : undefined },
    { label: 'Died', value: dead ? death?.cause : undefined },
    { label: 'Mood', value: dead || !hereNow ? undefined : entity.mood },
    {
      label: 'Last you saw them',
      value:
        dead || hereNow || !entity.mood || entity.mood === 'Unknown'
          ? undefined
          : `${entity.mood}${entity.lastSeen ? ` (${formatDayMonth(entity.lastSeen)}, year ${entity.lastSeen.year})` : ''}`,
    },
    { label: 'Personality', value: profile.personality },
    { label: 'Speaks', value: profile.speechStyle },
    { label: 'Appearance', value: profile.appearance },
  ].filter((item) => item.value && item.value !== 'Unknown');

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Back to bonds"
          accessibilityRole="button"
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <ChevronLeft color={colors.text} size={22} strokeWidth={2} />
          <Text style={styles.backLabel}>Bonds</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CharacterPortraitCard
          dead={dead}
          entity={entity}
          subtitle={[deathLabel, !dead && age !== undefined ? `Age ${age}` : null, profile.role ?? entity.status]
            .filter(Boolean)
            .join(' · ')}
        />

        {bond ? (
          <ListCard>
            <View style={styles.bondCard}>
              <View style={styles.bondTop}>
                <Text style={type.sectionLabel}>Bond</Text>
                <Text style={styles.bondValue}>{formatAffinity(affinity)}</Text>
              </View>
              <View style={styles.segments}>
                {Array.from({ length: 10 }).map((_, index) => (
                  <View
                    key={index}
                    style={[
                      styles.segment,
                      index < Math.abs(affinity) && {
                        backgroundColor: affinity >= 0 ? colors.accent : colors.textDim,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.chips}>
                {dead ? <Chip label="Deceased" /> : null}
                {companion ? <Chip accent label="Travelling with you" /> : null}
                {relationship ? <Chip label={relationship} /> : null}
                {bond.isMajor ? <Chip accent label="Major bond" /> : null}
                {seen ? <Chip label={seen} /> : null}
              </View>
              <View style={styles.sides}>
                <Text style={type.rowBody}>
                  {`Toward you they seem ${theySeem}`}
                </Text>
                <Text style={type.rowBody}>
                  {`You toward them ${formatAffinity(affinity)}${bond.yourFeelings?.note ? ` · ${bond.yourFeelings.note}` : ''}`}
                </Text>
              </View>
            </View>
          </ListCard>
        ) : null}

        {grudge && stage ? (
          <>
            <SectionLabel>Grudge</SectionLabel>
            <ListCard>
              <ListRow
                body={`${STAGE_TEXT[stage]} ${grudge.reason}`}
                leading={<Flame color={colors.danger} size={18} strokeWidth={2} />}
                meta={grudgeMeta}
                title={STAGE_LABEL[stage]}
              />
            </ListCard>
          </>
        ) : null}

        {details.length > 0 ? (
          <ListCard>
            {details.map((item) => (
              <View key={item.label} style={styles.detail}>
                <Text style={styles.detailLabel}>{item.label}</Text>
                <Text style={styles.detailValue}>{item.value}</Text>
              </View>
            ))}
          </ListCard>
        ) : null}

        {life.length > 0 ? (
          <>
            <SectionLabel>Their life</SectionLabel>
            <ListCard>
              {life.map((event, index) => (
                <ListRow
                  key={`${event.date.year}-${event.date.month}-${event.date.day}-${index}`}
                  meta={`${formatDayMonth(event.date)}, year ${event.date.year}`}
                  title={`${kanKnowsName(entity) ? name.split(' ')[0] : name.charAt(0).toUpperCase() + name.slice(1)} ${event.text}`}
                />
              ))}
            </ListCard>
          </>
        ) : null}

        <SectionLabel>Shared memories</SectionLabel>
        {shared.length === 0 ? (
          <EmptyRow title="Nothing shared yet" />
        ) : (
          <ListCard>
            {shared.map((event) => {
              const { title, body } = memoryTitle(event);

              return (
                <ListRow
                  body={body}
                  key={event.id}
                  meta={`${formatDayMonth(event.inStoryDate)} · ${event.scene}`}
                  title={title}
                />
              );
            })}
          </ListCard>
        )}

        {entity.name.toLowerCase() !== 'kan' ? (
          <>
            {companion ? (
              <>
                <SectionLabel>With you</SectionLabel>
                <ListCard>
                  <ListRow
                    body={[
                      companion.reason ? `${companion.reason.charAt(0).toUpperCase()}${companion.reason.slice(1)}.` : null,
                      companion.sinceLocation ? `Joined you at ${companion.sinceLocation}.` : null,
                      'In every scene with you until the story parts you. The scenes you share move their bond.',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    bodyLines={2}
                    leading={<Footprints color={colors.accentTint} size={18} strokeWidth={2} />}
                    meta={`${togetherLabel} · ${companion.sharedScenes} scene${companion.sharedScenes === 1 ? '' : 's'} shared`}
                    title="Travelling with you"
                  />
                </ListCard>
              </>
            ) : null}

            {/* One row for the hand fixes (audit 11a); Mark as dead asks first. */}
            <ListCard style={styles.fixCard}>
              <ListRow
                accessibilityState={{ expanded: fixOpen }}
                chevron={!fixOpen}
                leading={<Wrench color={colors.textMuted} size={18} strokeWidth={2} />}
                meta={`When the story got ${name} wrong`}
                onPress={() => setFixOpen((value) => !value)}
                title="Fix the story"
              />
              {fixOpen && !dead ? (
                <ListRow
                  accessibilityLabel={companion ? `Part ways with ${name}` : `Travel together with ${name}`}
                  body={
                    companion
                      ? 'If they left in the story and it was missed, let them go.'
                      : partyFull
                        ? `You already travel with ${MAX_COMPANIONS} people. Part ways with someone first.`
                        : 'If they are coming along and the story missed it, keep them at your side.'
                  }
                  leading={
                    companion ? (
                      <UserMinus color={colors.textMuted} size={18} strokeWidth={2} />
                    ) : (
                      <Footprints color={colors.textMuted} size={18} strokeWidth={2} />
                    )
                  }
                  onPress={partyFull ? undefined : () => setTravelling(entity.id, !companion)}
                  title={companion ? 'Part ways' : 'Travel together'}
                />
              ) : null}
              {fixOpen ? (
                <ListRow
                  accessibilityLabel={`Merge ${name} with someone else`}
                  body="If the story split one person into two, fold them back together."
                  chevron
                  leading={<GitMerge color={colors.textMuted} size={18} strokeWidth={2} />}
                  onPress={() => setMerging(true)}
                  title="Merge with…"
                />
              ) : null}
              {fixOpen ? (
                <ListRow
                  accessibilityLabel={dead ? `Mark ${name} as alive` : `Mark ${name} as dead`}
                  body={
                    dead
                      ? 'If the story got this wrong, or they truly came back, bring them back.'
                      : 'If they died and the story missed it, mark them dead so they stay dead.'
                  }
                  leading={
                    dead ? (
                      <HeartPulse color={colors.textMuted} size={18} strokeWidth={2} />
                    ) : (
                      <Skull color={colors.danger} size={18} strokeWidth={2} />
                    )
                  }
                  onPress={() => (dead ? void setCharacterDeceased(entity.id, false) : setConfirmDead(true))}
                  title={dead ? 'Mark as alive' : 'Mark as dead'}
                />
              ) : null}
            </ListCard>
          </>
        ) : null}
      </ScrollView>

      <ConfirmDialog
        body={`Only if the story already killed ${name} and missed it. They move to The dead and the narrator treats them as gone. Mark as alive brings them back.`}
        confirmLabel="Mark as dead"
        onCancel={() => setConfirmDead(false)}
        onConfirm={() => {
          setConfirmDead(false);
          void setCharacterDeceased(entity.id, true);
        }}
        title={`Mark ${name} as dead?`}
        visible={confirmDead}
      />

      <MergeSheet
        db={db}
        entity={entity}
        onCancel={() => setMerging(false)}
        onMerge={async (keepId, dropId) => {
          await mergeCharacters(keepId, dropId);
          setMerging(false);

          if (keepId !== entity.id) {
            router.replace({ pathname: '/bond/[id]', params: { id: keepId } });
          }
        }}
        visible={merging}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fixCard: {
    marginTop: spacing.lg,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pressed: {
    opacity: 0.65,
  },
  topBar: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    alignSelf: 'flex-start',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
  },
  backLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.textMuted,
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  bondCard: {
    gap: 10,
    padding: spacing.lg,
  },
  bondTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  bondValue: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    color: colors.text,
  },
  sides: {
    gap: spacing.xs,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingTop: 2,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  chipAccent: {
    backgroundColor: colors.accentSoft,
  },
  chipText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: '#D4D4D4',
  },
  chipTextAccent: {
    fontFamily: fonts.bold,
    color: colors.accentTint,
  },
  detail: {
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  detailLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMeta,
  },
  detailValue: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSoft,
  },
});

// A crash while drawing shows Reload and Export instead of a white screen (audit 9).
export { TabErrorBoundary as ErrorBoundary } from '@/components/TabErrorBoundary';
