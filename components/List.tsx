import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ChevronRight } from 'lucide-react-native';

import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { useReadingType } from '@/lib/reading';

/**
 * The shared list kit. Every list screen is built from SectionLabel +
 * ListCard + ListRow, so titles, body text, meta lines and padding stay
 * identical everywhere.
 */

export function SectionLabel({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return <Text style={[type.sectionLabel, !first && styles.sectionGap]}>{children}</Text>;
}

/** Rounded card that draws hairline dividers between its rows. */
export function ListCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <View style={[styles.card, style]}>
      {items.map((child, index) => (
        <Fragment key={child.key ?? index}>
          {index > 0 ? <View style={styles.divider} /> : null}
          {child}
        </Fragment>
      ))}
    </View>
  );
}

type ListRowProps = {
  title?: string;
  body?: string | null;
  meta?: string | null;
  /** Element before the text (avatar, icon). */
  leading?: ReactNode;
  /** Element after the text (value, tag, switch). */
  trailing?: ReactNode;
  /** Extra content under the text block. */
  children?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  titleLines?: number;
  bodyLines?: number;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link' | 'switch';
  accessibilityState?: { checked?: boolean; expanded?: boolean; selected?: boolean };
};

export function ListRow({
  title,
  body,
  meta,
  leading,
  trailing,
  children,
  onPress,
  chevron,
  titleLines,
  bodyLines,
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
}: ListRowProps) {
  // Row text follows Settings → Reading → Text size (audit 10).
  const reading = useReadingType();
  const content = (
    <>
      {leading}
      <View style={styles.text}>
        {title ? (
          <Text numberOfLines={titleLines} style={reading.rowTitle}>
            {title}
          </Text>
        ) : null}
        {body ? (
          <Text numberOfLines={bodyLines} style={reading.rowBody}>
            {body}
          </Text>
        ) : null}
        {children}
        {meta ? <Text style={reading.rowMeta}>{meta}</Text> : null}
      </View>
      {trailing}
      {chevron ? <ChevronRight color={colors.textDim} size={16} strokeWidth={2} /> : null}
    </>
  );

  if (!onPress) {
    return <View style={styles.row}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

export function EmptyRow({ title, body }: { title: string; body?: string }) {
  return (
    <ListCard>
      <ListRow body={body} title={title} />
    </ListCard>
  );
}

/** Pill filter used by Journal (and anywhere a small set of views is switched). */
export function FilterPills<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.pills}>
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            hitSlop={4}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.pill,
              selected && styles.pillSelected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The one segmented control (audit 11e.4). `tabs` (Bonds / Jutsu / Journal /
 * Map) marks the selected tab in grey; `choice` (a setting) fills it red.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  variant = 'tabs',
  accessibilityLabel,
  disabled = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  variant?: 'tabs' | 'choice';
  accessibilityLabel?: string;
  disabled?: boolean;
}) {
  const choice = variant === 'choice';

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={choice ? 'radiogroup' : 'tablist'}
      style={styles.segmented}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole={choice ? 'radio' : 'tab'}
            accessibilityState={choice ? { checked: selected, disabled } : { selected, disabled }}
            disabled={disabled}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && (choice ? styles.segmentChoice : styles.segmentSelected),
              pressed && styles.pressed,
              disabled && styles.segmentDisabled,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                selected && styles.segmentLabelSelected,
                selected && choice && styles.segmentLabelChoice,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionGap: {
    paddingTop: spacing.sm,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  pressed: {
    opacity: 0.65,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  pill: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  pillSelected: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  pillLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textMuted,
  },
  pillLabelSelected: {
    color: colors.background,
  },
  segmented: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  segmentSelected: {
    backgroundColor: colors.borderStrong,
  },
  segmentChoice: {
    backgroundColor: colors.accent,
  },
  segmentDisabled: {
    opacity: 0.45,
  },
  segmentLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.textMeta,
  },
  segmentLabelSelected: {
    color: colors.text,
  },
  segmentLabelChoice: {
    color: colors.onAccent,
  },
});
