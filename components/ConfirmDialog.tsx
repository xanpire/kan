import { TriangleAlert } from 'lucide-react-native';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AppButton } from '@/components/AppButton';
import { colors, fonts, radius, spacing } from '@/constants/theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** The small warning label above the title. */
  label?: string;
  busy?: boolean;
  /** Shown under the buttons while busy, e.g. "Deleting the story…". */
  busyText?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  label = 'Are you sure?',
  busy = false,
  busyText = 'Working…',
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      animationType="fade"
      // Escape and the back gesture must not close it in the middle of the action.
      onRequestClose={busy ? () => undefined : onCancel}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Cancel"
          onPress={busy ? undefined : onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.dialog}>
          <View style={styles.labelRow}>
            <TriangleAlert color={colors.danger} size={15} strokeWidth={2} />
            <Text style={styles.label}>{label}</Text>
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <AppButton
              compact
              disabled={busy}
              label="Cancel"
              onPress={onCancel}
              style={styles.action}
              variant="secondary"
            />
            <AppButton
              compact
              label={confirmLabel}
              loading={busy}
              onPress={onConfirm}
              style={styles.action}
              variant="destructive"
            />
          </View>
          {busy ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={colors.textMuted} size="small" />
              <Text style={styles.busyText}>{busyText}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.overlay,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    padding: 20,
    gap: spacing.sm,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.danger,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 23,
    lineHeight: 29,
    letterSpacing: -0.5,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
    marginBottom: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
  busyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.xs,
  },
  busyText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textDim,
  },
});
