import { useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { colors } from '@/constants/theme';

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  /** Called once when the finger lifts. */
  onDone?: (value: number) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

const THUMB = 22;
const STEP = 0.05;

/** A 0–1 slider: drag or tap anywhere on the track. */
export function Slider({ value, onChange, onDone, disabled, accessibilityLabel }: SliderProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const left = useRef(0);
  const latest = useRef(value);
  const callbacks = useRef({ onChange, onDone });
  callbacks.current = { onChange, onDone };

  const at = (x: number) => {
    const usable = Math.max(1, widthRef.current - THUMB);
    const raw = Math.max(0, Math.min(1, (x - THUMB / 2) / usable));
    return Math.round(raw / STEP) * STEP;
  };

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (event) => {
        left.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
        latest.current = at(event.nativeEvent.locationX);
        callbacks.current.onChange(latest.current);
      },
      onPanResponderMove: (event) => {
        latest.current = at(event.nativeEvent.pageX - left.current);
        callbacks.current.onChange(latest.current);
      },
      onPanResponderRelease: () => callbacks.current.onDone?.(latest.current),
    }),
  ).current;

  const onLayout = (event: LayoutChangeEvent) => {
    widthRef.current = event.nativeEvent.layout.width;
    setWidth(event.nativeEvent.layout.width);
  };

  const offset = Math.max(0, width - THUMB) * Math.max(0, Math.min(1, value));
  const nudge = (delta: number) => {
    const next = Math.max(0, Math.min(1, Math.round((value + delta) / STEP) * STEP));
    onChange(next);
    onDone?.(next);
  };

  return (
    <View
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === 'increment' ? 0.1 : -0.1)}
      onLayout={onLayout}
      // The arrow keys move it on the web too (audit 11e.4).
      {...(Platform.OS === 'web'
        ? {
            focusable: !disabled,
            onKeyDown: (event: { key?: string; nativeEvent?: { key?: string }; preventDefault?: () => void }) => {
              const key = event.key ?? event.nativeEvent?.key;
              const delta = key === 'ArrowRight' || key === 'ArrowUp' ? STEP * 2 : key === 'ArrowLeft' || key === 'ArrowDown' ? -STEP * 2 : 0;
              if (!delta) return;
              event.preventDefault?.();
              nudge(delta);
            },
          }
        : {})}
      pointerEvents={disabled ? 'none' : 'auto'}
      style={[styles.root, disabled && styles.disabled]}
      {...responder.panHandlers}
    >
      <View pointerEvents="none" style={styles.track}>
        <View style={[styles.fill, { width: offset + THUMB / 2 }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: offset }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 44,
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
  track: {
    height: 4,
    borderRadius: 2,
    marginHorizontal: THUMB / 2,
    backgroundColor: colors.borderStrong,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    marginLeft: -THUMB / 2,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.text,
    borderWidth: 2,
    borderColor: colors.accent,
  },
});
