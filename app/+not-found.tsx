import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBackground } from '@/components/AppBackground';
import { AppButton } from '@/components/AppButton';
import { Wordmark } from '@/components/Wordmark';
import { colors, fonts, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <AppBackground />
      <SafeAreaView style={styles.safe}>
        <Wordmark />
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>Page not found</Text>
          <Text style={styles.title}>This path ends here.</Text>
          <Text style={styles.body}>
            The page you were looking for is not part of Kan’s story.
          </Text>
        </View>
        <AppButton
          label="Back to story"
          onPress={() => router.replace('/(tabs)')}
          style={styles.button}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.xxxl,
  },
  copy: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -1.2,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    color: colors.textMuted,
    maxWidth: 340,
  },
  button: {
    alignSelf: 'flex-start',
    minWidth: 150,
  },
});
