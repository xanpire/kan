import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Segmented } from '@/components/List';
import { BondsSection } from '@/components/kan/BondsSection';
import { JournalSection } from '@/components/kan/JournalSection';
import { JutsuSection } from '@/components/kan/JutsuSection';
import { MapSection } from '@/components/kan/MapSection';
import { PortraitHeader } from '@/components/kan/PortraitHeader';
import { colors, spacing } from '@/constants/theme';
import { useGame } from '@/lib/rpg/game';

type KanTab = 'bonds' | 'jutsu' | 'journal' | 'map';

const TABS: { value: KanTab; label: string }[] = [
  { value: 'bonds', label: 'Bonds' },
  { value: 'jutsu', label: 'Jutsu' },
  { value: 'journal', label: 'Journal' },
  { value: 'map', label: 'Map' },
];

export default function KanScreen() {
  const { db } = useGame();
  const [tab, setTab] = useState<KanTab>('bonds');

  if (!db) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} size="small" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
        >
          <PortraitHeader />
          <View style={styles.tabsWrap}>
            <Segmented onChange={setTab} options={TABS} value={tab} />
          </View>
          {tab === 'bonds' ? <BondsSection /> : null}
          {tab === 'jutsu' ? <JutsuSection /> : null}
          {tab === 'journal' ? <JournalSection /> : null}
          {tab === 'map' ? <MapSection /> : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  tabsWrap: {
    paddingVertical: spacing.xs,
    backgroundColor: colors.background,
  },
});

// A crash while drawing shows Reload and Export instead of a white screen (audit 9).
export { TabErrorBoundary as ErrorBoundary } from '@/components/TabErrorBoundary';
