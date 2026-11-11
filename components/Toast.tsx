import { CircleAlert, CircleCheck, Info } from 'lucide-react-native';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { colors, fonts, radius } from '@/constants/theme';

import { toastDuration, type ToastTone } from './toastTiming';

type ToastAction = { label: string; onPress: () => void };

export type ToastOptions = {
  /** A button on the toast (e.g. "Redo"). Tapping it closes the toast. */
  action?: ToastAction;
  /** How long it stays. Defaults to the time it takes to read; errors stay until tapped. */
  durationMs?: number;
};

type ToastState = {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  /** Null: stays until tapped. */
  durationMs: number | null;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone, options?: ToastOptions) => void;
};


const ToastContext = createContext<ToastContextValue | null>(null);
const useNativeDriver = Platform.OS !== 'web';

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'info', options?: ToastOptions) => {
    setToast({
      id: Date.now(),
      message,
      tone,
      action: options?.action,
      durationMs: toastDuration(message, tone, options),
    });
  }, []);

  const hide = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver,
      }),
      Animated.timing(translateY, {
        toValue: 6,
        duration: 180,
        useNativeDriver,
      }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    if (timer.current) {
      clearTimeout(timer.current);
    }

    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 160,
        useNativeDriver,
      }),
    ]).start();

    if (toast.durationMs !== null) {
      timer.current = setTimeout(hide, toast.durationMs);
    }

    return () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, [hide, opacity, toast, translateY]);

  const value = useMemo(() => ({ showToast }), [showToast]);
  const ToneIcon =
    toast?.tone === 'success'
      ? CircleCheck
      : toast?.tone === 'error'
        ? CircleAlert
        : Info;
  const toneColor =
    toast?.tone === 'success'
      ? colors.success
      : toast?.tone === 'error'
        ? colors.danger
        : colors.textMuted;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.toastDock,
            {
              bottom: insets.bottom + 82,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Pressable
            accessibilityHint="Closes this message"
            accessibilityLiveRegion="polite"
            onPress={hide}
            style={styles.toast}
          >
            <ToneIcon color={toneColor} size={18} strokeWidth={2} />
            <Text style={styles.message}>{toast.message}</Text>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  const action = toast.action;
                  hide();
                  action?.onPress();
                }}
                style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
              >
                <Text style={styles.actionLabel}>{toast.action.label}</Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error('useToast must be used inside a ToastProvider');
  }

  return context;
}

const styles = StyleSheet.create({
  toastDock: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  toast: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  action: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
  actionPressed: {
    opacity: 0.6,
  },
  actionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 14,
    color: colors.accentTint,
  },
  message: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
  },
});
