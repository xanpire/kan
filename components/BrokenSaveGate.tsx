import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/AppButton';
import { colors, spacing, type } from '@/constants/theme';
import { isSlotBroken } from '@/lib/rpg/db';
import { useGame } from '@/lib/rpg/game';

/**
 * Blocks the app while the open story can't be read. Nothing is written to
 * that save in this state; the player can download it as it is, try again,
 * or open another story.
 */
export function BrokenSaveGate({ children }: { children: ReactNode }) {
  const { brokenSave, retryBrokenSave, downloadBrokenSave, slots, switchSlotById } = useGame();
  const [busy, setBusy] = useState(false);

  if (!brokenSave) {
    return <>{children}</>;
  }

  const others = slots.filter(
    (slot) => slot.slotId !== brokenSave.slotId && !slot.broken && !isSlotBroken(slot.slotId)
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Your save could not be opened</Text>
        <Text style={styles.body}>
          {brokenSave.kind === 'storage'
            ? 'The browser would not open the place your stories are kept. They have not been touched. Close other Kan tabs, then try again.'
            : 'Your story is still stored exactly as it was, and nothing will be written over it. Download it to keep a copy, then try again.'}
        </Text>
        <Text style={styles.detail}>{brokenSave.message}</Text>

        <View style={styles.actions}>
          {brokenSave.hasRaw ? (
            <AppButton label="Download the save as it is" onPress={downloadBrokenSave} variant="secondary" />
          ) : null}
          <AppButton label="Try again" loading={busy} onPress={() => void run(retryBrokenSave)} />
        </View>

        {others.length > 0 ? (
          <View style={styles.others}>
            <Text style={styles.label}>Open another story</Text>
            {others.map((slot) => (
              <AppButton
                key={slot.slotId}
                disabled={busy}
                label={slot.slotName}
                onPress={() => void run(() => switchSlotById(slot.slotId))}
                variant="ghost"
              />
            ))}
          </View>
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
  content: {
    padding: spacing.xxl,
    paddingTop: spacing.giant,
    gap: spacing.lg,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    ...type.pageTitle,
    color: colors.text,
  },
  body: {
    ...type.body,
    color: colors.textSoft,
  },
  detail: {
    ...type.caption,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  others: {
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  label: {
    ...type.sectionLabel,
    color: colors.textMeta,
  },
});
