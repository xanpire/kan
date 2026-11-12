// What a tab shows when it crashes while drawing (audit 9), instead of a white
// screen. Expo Router puts it around a route when the route file exports it
// as `ErrorBoundary`. The story itself lives in the provider above the tabs,
// so it is still there to export.

import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ErrorBoundaryProps } from 'expo-router';
import { AppButton } from '@/components/AppButton';
import { colors, spacing, type } from '@/constants/theme';
import { useGameActions } from '@/lib/rpg/game';
import { deliverFile } from '@/lib/rpg/saveFile';

export function TabErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const { exportActiveSlot, markExported } = useGameActions();
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');

  const exportSave = async () => {
    setExportState('busy');

    try {
      // Without images: the smallest file, and the least that can go wrong.
      const file = await exportActiveSlot({ withImages: false });

      if (!file) {
        setExportState('failed');
        return;
      }

      const result = await deliverFile(file.blob, file.filename);

      if (result !== 'cancelled') {
        await markExported().catch(() => undefined);
      }

      setExportState(result === 'cancelled' ? 'idle' : 'done');
    } catch {
      setExportState('failed');
    }
  };

  const reload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }

    void retry();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>This screen stopped working</Text>
        <Text style={styles.body}>
          Your story is safe: nothing was lost and nothing was written over. Reload to try again. If it keeps
          happening, export your story first.
        </Text>
        <Text selectable style={styles.detail}>
          {error.message || 'Unknown error'}
        </Text>
        <AppButton label="Reload" onPress={reload} style={styles.button} />
        <AppButton
          label={
            exportState === 'done'
              ? 'Story exported'
              : exportState === 'failed'
                ? 'The export didn’t work. Try again'
                : 'Export your story'
          }
          loading={exportState === 'busy'}
          onPress={() => void exportSave()}
          variant="secondary"
        />
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
  button: {
    marginTop: spacing.md,
  },
});
