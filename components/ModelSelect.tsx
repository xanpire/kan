import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, RefreshCw, Search, X } from 'lucide-react-native';

import { AppButton } from '@/components/AppButton';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import {
  fetchOpenRouterImageModels,
  fetchOpenRouterModels,
  type OpenRouterModelSummary,
} from '@/lib/openrouter';
import { typedModelToSave } from '@/lib/rpg/modelDefaults';

type ModelSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  kind?: 'text' | 'image';
};

export function ModelSelect({ label, value, onChange, hint, kind = 'text' }: ModelSelectProps) {
  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = useState(false);
  const [models, setModels] = useState<OpenRouterModelSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // The typed id is kept here and saved once, when the field is left or the
  // sheet closes, instead of saving the whole story on every keystroke.
  const [typed, setTyped] = useState(value);

  const openPicker = () => {
    setTyped(value);
    setPickerVisible(true);
  };

  const saveTyped = () => {
    const id = typedModelToSave(typed, value);
    if (id) onChange(id);
  };

  const closePicker = () => {
    saveTyped();
    setPickerVisible(false);
  };

  const loadModels = async () => {
    setLoading(true);
    setError(null);

    try {
      const result =
        kind === 'image'
          ? (await fetchOpenRouterImageModels()).map((model) => ({
              id: model.id,
              name: model.name,
              contextLength: 0,
              promptPrice: null,
              recommended: model.maxReferences > 0,
              badge:
                model.maxReferences > 0
                  ? `${model.maxReferences} ref${model.maxReferences === 1 ? '' : 's'}`
                  : 'no refs',
            }))
          : await fetchOpenRouterModels();

      setModels(result satisfies OpenRouterModelSummary[]);
    } catch {
      setError('Could not load models. You can still type a model ID.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!pickerVisible || models.length > 0) {
      return;
    }

    void loadModels();
  }, [models.length, pickerVisible]);

  const filteredModels = models.filter((model) => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return true;
    }

    return (
      model.name.toLowerCase().includes(term) ||
      model.id.toLowerCase().includes(term)
    );
  });

  return (
    <>
      <Pressable
        accessibilityHint={hint}
        accessibilityLabel={`${label} model: ${value}`}
        accessibilityRole="button"
        onPress={openPicker}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Text style={styles.rowLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.rowValue}>
          {shortModelName(value)}
        </Text>
        <ChevronRight color={colors.textDim} size={16} strokeWidth={2} />
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={closePicker}
        transparent
        visible={pickerVisible}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityLabel="Close model picker"
            onPress={closePicker}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, spacing.lg) },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>{label}</Text>
              <View style={styles.headerActions}>
                <Pressable
                  accessibilityLabel="Refresh models"
                  accessibilityRole="button"
                  disabled={loading}
                  hitSlop={8}
                  onPress={() => void loadModels()}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.textMuted} size="small" />
                  ) : (
                    <RefreshCw color={colors.textMuted} size={18} strokeWidth={2} />
                  )}
                </Pressable>
                <Pressable
                  accessibilityLabel="Close model picker"
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={closePicker}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <X color={colors.textMuted} size={20} strokeWidth={2} />
                </Pressable>
              </View>
            </View>

            <View style={styles.searchWrap}>
              <Search color={colors.textDim} size={16} strokeWidth={2} />
              <TextInput
                accessibilityLabel="Search models"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setQuery}
                placeholder="Search models"
                placeholderTextColor={colors.textDim}
                style={styles.searchInput}
                value={query}
              />
            </View>

            <View style={styles.customWrap}>
              <TextInput
                accessibilityLabel="Custom model ID"
                autoCapitalize="none"
                autoCorrect={false}
                onBlur={saveTyped}
                onChangeText={setTyped}
                onSubmitEditing={saveTyped}
                placeholder="provider/model-id"
                placeholderTextColor={colors.textDim}
                returnKeyType="done"
                style={styles.customInput}
                value={typed}
              />
            </View>

            {error ? (
              <Text style={styles.error}>{error}</Text>
            ) : null}

            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {loading && models.length === 0 ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={colors.accent} size="small" />
                  <Text style={styles.loadingText}>Loading models…</Text>
                </View>
              ) : (
                filteredModels.slice(0, MODEL_ROWS).map((model) => (
                  <Pressable
                    accessibilityLabel={`Select ${model.name}`}
                    accessibilityRole="button"
                    key={model.id}
                    onPress={() => {
                      setTyped(model.id);
                      onChange(model.id);
                      setPickerVisible(false);
                    }}
                    style={({ pressed }) => [
                      styles.modelRow,
                      model.id === value && styles.modelRowSelected,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.modelCopy}>
                      <View style={styles.modelTitleRow}>
                        <Text numberOfLines={1} style={styles.modelName}>
                          {model.name}
                        </Text>
                        {kind === 'image' && model.badge ? (
                          <Text
                            style={[styles.referenceBadge, !model.recommended && styles.referenceBadgeOff]}
                          >
                            {model.badge}
                          </Text>
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.modelId}>
                        {model.id}
                      </Text>
                      {model.promptPrice ? (
                        <Text style={styles.modelMeta}>{model.promptPrice}</Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))
              )}
              {filteredModels.length > MODEL_ROWS ? (
                <Text style={styles.moreText}>
                  {filteredModels.length - MODEL_ROWS} more: search to narrow
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

/** Rows drawn before "N more: search to narrow". */
const MODEL_ROWS = 60;

/** "anthropic/claude-sonnet-4" → "claude-sonnet-4" for the compact row. */
function shortModelName(value: string) {
  const name = value.split('/').pop() ?? value;
  return name || 'Choose…';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingLeft: spacing.lg,
    paddingRight: 14,
  },
  rowLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  rowValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.65,
  },
  moreText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textDim,
    textAlign: 'center',
    paddingVertical: 14,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    height: '88%',
    paddingHorizontal: 18,
    paddingTop: 14,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: colors.text,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    marginTop: spacing.md,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  customWrap: {
    marginTop: spacing.sm,
  },
  customInput: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  error: {
    marginTop: spacing.sm,
    fontFamily: fonts.regular,
    fontSize: 11,
    color: colors.danger,
  },
  list: {
    flexGrow: 1,
    marginTop: spacing.md,
    gap: 6,
    paddingBottom: spacing.md,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.xxxl,
  },
  loadingText: {
    fontFamily: fonts.regular,
    fontSize: 12,
    color: colors.textDim,
  },
  modelRow: {
    padding: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  modelRowSelected: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  modelCopy: {
    gap: 2,
  },
  modelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  referenceBadge: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 11,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  referenceBadgeOff: {
    color: colors.textDim,
  },
  modelName: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  modelId: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textDim,
  },
  modelMeta: {
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
  },
});
