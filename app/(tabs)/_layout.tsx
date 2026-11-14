import { Tabs } from 'expo-router';
import { BookOpen, Settings2, UserRound } from 'lucide-react-native';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts } from '@/constants/theme';
import { EXPORT_REMINDER_TURNS, turnsSinceExport } from '@/lib/rpg/db';
import { useGame } from '@/lib/rpg/game';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { db } = useGame();
  // A quiet dot on Settings when the story has gone a long while without an export.
  const exportDue = db ? turnsSinceExport(db) >= EXPORT_REMINDER_TURNS : false;

  return (
    // Back goes to the screen you came from (a bond page back to Kan), not always to the Story tab.
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accentTint,
        tabBarInactiveTintColor: colors.textMeta,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: styles.label,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 60 + Math.max(insets.bottom, Platform.OS === 'web' ? 6 : 4),
            paddingBottom: Math.max(insets.bottom, 6),
          },
        ],
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Story',
          tabBarIcon: ({ color, focused }) => (
            <BookOpen color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="kan"
        options={{
          title: 'Kan',
          tabBarIcon: ({ color, focused }) => (
            <UserRound color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarBadge: exportDue ? '' : undefined,
          tabBarBadgeStyle: styles.dot,
          tabBarIcon: ({ color, focused }) => (
            <Settings2 color={color} size={21} strokeWidth={focused ? 2.2 : 1.8} />
          ),
        }}
      />
      {/* Bond detail lives inside the tabs so the tab bar stays visible; Kan stays highlighted. */}
      <Tabs.Screen name="bond/[id]" options={{ href: null }} />
      {/* Hidden: long-press the clock on the Story tab. */}
      <Tabs.Screen name="world-clock" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.background,
    paddingTop: 6,
    elevation: 0,
  },
  dot: {
    minWidth: 8,
    maxHeight: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.1,
  },
});
