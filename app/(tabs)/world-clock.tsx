import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

import { EmptyRow, ListCard, ListRow, SectionLabel } from '@/components/List';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { formatClock, formatDayMonth } from '@/lib/rpg/calendar';
import { newsUrgency, worldClock } from '@/lib/rpg/canon';
import { lettersInTransit } from '@/lib/rpg/letters';
import { waitingConsequences } from '@/lib/rpg/consequences';
import { livingBearers, newsOffer } from '@/lib/rpg/newsDelivery';
import { useGame } from '@/lib/rpg/game';
import type { CalendarDate } from '@/lib/rpg/types';
import { displayNameOf } from '@/lib/rpg/names';

const QUEUE_PREVIEW = 8;

function dateLabel(date: CalendarDate) {
  return `${formatDayMonth(date)}, year ${date.year}`;
}

function Tag({ label, tone = 'plain' }: { label: string; tone?: 'plain' | 'accent' | 'warn' }) {
  return (
    <View style={[styles.tag, tone === 'accent' && styles.tagAccent, tone === 'warn' && styles.tagWarn]}>
      <Text style={[styles.tagText, tone === 'accent' && styles.tagTextAccent, tone === 'warn' && styles.tagTextWarn]}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Hidden screen (long-press the clock on the Story tab). Shows the canon
 * scheduler as it really is — including things you haven't heard yet, so it
 * contains spoilers by design.
 */
export default function WorldClockScreen() {
  const router = useRouter();
  const { db } = useGame();
  const [showAllQueued, setShowAllQueued] = useState(false);
  const clock = useMemo(() => (db ? worldClock(db) : null), [db]);
  const offer = useMemo(() => (db ? newsOffer(db, { ignoreCombat: true }) : null), [db]);
  const letters = useMemo(() => (db ? lettersInTransit(db) : []), [db]);
  const seeds = useMemo(() => (db ? waitingConsequences(db) : []), [db]);

  const back = () => router.navigate('/(tabs)');

  if (!db || !clock) {
    return (
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.content}>
          <EmptyRow body="Start a story first." title="No world yet" />
        </View>
      </SafeAreaView>
    );
  }

  const due = clock.queued.filter((item) => item.due);
  const later = clock.queued.filter((item) => !item.due);
  const visibleLater = showAllQueued ? later : later.slice(0, QUEUE_PREVIEW);
  const firedHappened = clock.fired.filter((item) => !item.expired);
  const holding = clock.inCombat || clock.heldForCombat;

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Back to the story"
          accessibilityRole="button"
          onPress={back}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <ChevronLeft color={colors.text} size={22} strokeWidth={2} />
          <Text style={styles.backLabel}>Story</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heading}>
          <Text style={type.pageTitle}>World clock</Text>
          <Text style={type.rowBody}>
            Spoilers. What the world has done, what it's about to do, and what hasn't reached you yet.
          </Text>
        </View>

        <ListCard>
          <View style={styles.statusCard}>
            <Text style={styles.now}>
              {formatClock(clock.now)} · {dateLabel(clock.now)}
            </Text>
            <View style={styles.tags}>
              {holding ? (
                <Tag label="Held — you're in a fight" tone="warn" />
              ) : (
                <Tag label="Running" tone="accent" />
              )}
              <Tag label={`${firedHappened.length} fired`} />
              <Tag label={`${clock.unheard.length} unheard`} />
              <Tag label={`${clock.queued.length} queued`} />
            </View>
            <Text style={type.rowBody}>
              Events follow the in-story date only. Nothing fires during a fight, and at most one piece of news reaches you each turn, unless it piled up while you heard nothing: then it comes as one catch-up report.
            </Text>
          </View>
        </ListCard>

        <SectionLabel>Not heard yet</SectionLabel>
        {clock.unheard.length === 0 ? (
          <EmptyRow title="You're caught up" body="Everything that has happened has reached you." />
        ) : (
          <ListCard>
            {clock.unheard.map((item, index) => (
              <ListRow
                body={`${item.location}, ${item.region}. Can reach you via ${item.channel}${
                  livingBearers(db, item).length > 0 ? ` or ${livingBearers(db, item).slice(0, 3).join(', ')}` : ''
                }.`}
                key={item.eventId}
                meta={[
                  dateLabel(item.date),
                  item.daysOld > 0 ? `${item.daysOld} day${item.daysOld === 1 ? '' : 's'} ago` : 'today',
                  offer?.items.some((offered) => offered.eventId === item.eventId) && !holding
                    ? offer.mode === 'catch-up'
                      ? 'in the catch-up'
                      : 'next in line'
                    : null,
                  item.major ? 'major' : null,
                  newsUrgency(item) === 'fresh' ? null : newsUrgency(item),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                title={item.title}
              />
            ))}
          </ListCard>
        )}

        {due.length > 0 ? (
          <>
            <SectionLabel>Due, waiting to fire</SectionLabel>
            <ListCard>
              {due.map((item) => (
                <ListRow
                  body={holding ? 'Its date has come. It fires once the fight ends.' : 'Its date has come. It fires after the event before it.'}
                  key={item.milestone.id}
                  meta={`${item.milestone.era} · ${dateLabel(item.opensAt)}`}
                  title={item.milestone.title}
                />
              ))}
            </ListCard>
          </>
        ) : null}

        <SectionLabel>Queued</SectionLabel>
        {later.length === 0 ? (
          <EmptyRow title="Nothing left" body="The canon timeline has run its course." />
        ) : (
          <ListCard>
            {visibleLater.map((item) => (
              <ListRow
                key={item.milestone.id}
                meta={`${item.milestone.era} · ${dateLabel(item.opensAt)} · in ${item.daysUntil} day${
                  item.daysUntil === 1 ? '' : 's'
                }`}
                title={item.milestone.title}
              />
            ))}
            {later.length > QUEUE_PREVIEW ? (
              <ListRow
                accessibilityLabel={showAllQueued ? 'Show fewer queued events' : 'Show every queued event'}
                onPress={() => setShowAllQueued((value) => !value)}
                title={showAllQueued ? 'Show fewer' : `Show all ${later.length}`}
              />
            ) : null}
          </ListCard>
        )}

        {clock.offers.length > 0 ? (
          <>
            <SectionLabel>Open to you</SectionLabel>
            <ListCard>
              {clock.offers.map((milestone) => (
                <ListRow
                  body="A personal moment. It only happens if you choose it."
                  key={milestone.id}
                  meta={`${milestone.era}${milestone.to ? ` · until ${formatDayMonth({ ...milestone.to, day: milestone.to.day ?? 28, hour: 0, minute: 0 })}, year ${milestone.to.year}` : ''}`}
                  title={milestone.title}
                />
              ))}
            </ListCard>
          </>
        ) : null}

        {letters.length > 0 ? (
          <>
            <SectionLabel>Letters on the road</SectionLabel>
            <ListCard>
              {letters.map((letter) => (
                <ListRow
                  body={letter.gist}
                  key={letter.id}
                  meta={[
                    `sent ${dateLabel(letter.sentOn)} · arrives ${dateLabel(letter.arrivesOn)}`,
                    letter.carrier,
                    letter.coded ? 'coded' : null,
                    letter.interceptedBy ? `read by ${letter.interceptedBy}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  title={letter.direction === 'from-kan' ? `Your letter to ${displayNameOf(db, letter.entityId, letter.name)}` : `${displayNameOf(db, letter.entityId, letter.name)}'s reply to you`}
                />
              ))}
            </ListCard>
          </>
        ) : null}

        {seeds.length > 0 ? (
          <>
            <SectionLabel>Could come back</SectionLabel>
            <ListCard>
              {seeds.map((seed) => (
                <ListRow
                  body={[seed.what, seed.want ? `Wants ${seed.want}.` : null].filter(Boolean).join(' ')}
                  key={seed.id}
                  meta={`${seed.kind} · from ${dateLabel(seed.after)} · fades ${dateLabel(seed.before)}${seed.offeredOn ? ` · last offered ${dateLabel(seed.offeredOn)}` : ''}`}
                  title={seed.who}
                />
              ))}
            </ListCard>
          </>
        ) : null}

        <SectionLabel>Fired</SectionLabel>
        {firedHappened.length === 0 ? (
          <EmptyRow title="Nothing yet" body="The world hasn't moved since your story began." />
        ) : (
          <ListCard>
            {firedHappened.map((item) => (
              <ListRow
                key={item.milestone.id}
                meta={[
                  dateLabel(item.date),
                  item.heardFrom
                    ? item.heardFrom === 'witnessed'
                      ? 'you were there'
                      : `heard from ${item.heardFrom}`
                    : 'not heard',
                ].join(' · ')}
                title={item.milestone.title}
              />
            ))}
          </ListCard>
        )}

        {clock.missed.length > 0 ? (
          <>
            <SectionLabel>Passed you by</SectionLabel>
            <ListCard>
              {clock.missed.map((milestone) => (
                <ListRow key={milestone.id} meta={milestone.era} title={milestone.title} />
              ))}
            </ListCard>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  heading: {
    gap: 4,
    marginBottom: spacing.xs,
  },
  statusCard: {
    gap: 10,
    padding: spacing.lg,
  },
  now: {
    fontFamily: fonts.extrabold,
    fontSize: 18,
    color: colors.text,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  tagAccent: {
    backgroundColor: colors.accentSoft,
  },
  tagWarn: {
    backgroundColor: 'rgba(240, 163, 74, 0.12)',
  },
  tagText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: '#D4D4D4',
  },
  tagTextAccent: {
    fontFamily: fonts.bold,
    color: colors.accentTint,
  },
  tagTextWarn: {
    fontFamily: fonts.bold,
    color: colors.warning,
  },
});

// A crash while drawing shows Reload and Export instead of a white screen (audit 9).
export { TabErrorBoundary as ErrorBoundary } from '@/components/TabErrorBoundary';
