import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/manrope';
import { Stack } from 'expo-router';
import * as NavigationBar from 'expo-navigation-bar';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppUpdateNotice } from '@/components/AppUpdateNotice';
import { BrokenSaveGate } from '@/components/BrokenSaveGate';
import { ToastProvider } from '@/components/Toast';
import { colors } from '@/constants/theme';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AmbiencePlayer } from '@/lib/audio/AmbiencePlayer';
import { GameProvider } from '@/lib/rpg/game';

void SplashScreen.preventAutoHideAsync().catch(() => {});

const APP_TITLE = 'Kan — Interactive Naruto RPG';

export default function RootLayout() {
  useFrameworkReady();
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontError, fontsLoaded]);

  // The browser tab keeps a title: navigation clears it on every route
  // (Session 2, audit 10.3), so it is put back whenever it goes empty.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const keep = () => {
      if (!document.title.trim()) document.title = APP_TITLE;
    };
    keep();
    const observer = new MutationObserver(keep);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'android') {
      void NavigationBar.setBackgroundColorAsync(colors.background).catch(() => {});
      void NavigationBar.setButtonStyleAsync('light').catch(() => {});
      void NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
    }
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <GameProvider>
          <AmbiencePlayer />
          <ToastProvider>
            <AppUpdateNotice />
            <View style={styles.root}>
            <BrokenSaveGate>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
                animation: 'fade',
              }}
            >
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="+not-found" />
            </Stack>
            </BrokenSaveGate>
            <StatusBar backgroundColor={colors.background} style="light" />
            </View>
          </ToastProvider>
        </GameProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
