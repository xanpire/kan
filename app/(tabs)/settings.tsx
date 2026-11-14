import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  Plus,
} from 'lucide-react-native';

import { AppButton } from '@/components/AppButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ListCard, ListRow, SectionLabel, Segmented } from '@/components/List';
import { ModelSelect } from '@/components/ModelSelect';
import { Slider } from '@/components/Slider';
import { DebugPanel } from '@/components/settings/DebugPanel';
import { useToast } from '@/components/Toast';
import { APP_VERSION } from '@/lib/version';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { fetchImageModelCaps, testOpenRouterKey } from '@/lib/openrouter';
import { describeImageCaps } from '@/lib/rpg/imageCaps';
import { formatDayMonth } from '@/lib/rpg/calendar';
import { DEFAULT_SETTINGS, PROMPT_BUDGET_OPTIONS } from '@/lib/rpg/defaults';
import { pickSaveFile } from '@/lib/rpg/file';
import { deliverFile } from '@/lib/rpg/saveFile';
import { useGame } from '@/lib/rpg/game';
import {
  EXPORT_REMINDER_TURNS,
  TRASH_DAYS,
  backupInfo,
  listTrash,
  turnsSinceExport, exportLine,
  type BackupInfo,
  type SlotSummary,
  type TrashedStory,
} from '@/lib/rpg/db';
import { storageStatus, type StorageStatus } from '@/lib/rpg/slotStore';
import { setTextSize, TEXT_SIZES, useTextSize } from '@/lib/reading';
import { loadModelLists, missingModelLine, missingModels, type ModelLists } from '@/lib/rpg/modelCheck';
import { NO_SPENDING, spendingLine, spendingVersion, storySpending, subscribeSpending } from '@/lib/rpg/spending';
import { currentAmbience, describeAmbience } from '@/lib/rpg/ambience';
import { ambienceEngine, ambienceSupported } from '@/lib/audio/ambienceEngine';
import { setAmbienceSettings, useAmbienceSettings } from '@/lib/audio/ambienceSettings';

type Feedback = {
  tone: 'success' | 'error';
  message: string;
};

export default function SettingsScreen() {
  const {
    apiKey,
    db,
    slots,
    setApiKey,
    updateSettings,
    createNewSlot,
    deleteSlotById,
    duplicateSlotById,
    renameSlotById,
    switchSlotById,
    exportActiveSlot,
    importSlot,
    markExported,
    restoreDailyBackup,
    freeUpSpace,
    restoreDeletedStory,
    isNarrating,
    isProcessing,
  } = useGame();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  // Switching, deleting, importing or restoring waits for the reply (audit 10).
  const busyStory = isNarrating || isProcessing;
  const ambience = useAmbienceSettings();
  const [ambienceVolume, setAmbienceVolume] = useState<number | null>(null);
  const soundSupported = Platform.OS === 'web' && ambienceSupported();

  const [keyOpen, setKeyOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [savingKey, setSavingKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  const [storageOpen, setStorageOpen] = useState(false);
  const [capsState, setCapsState] = useState<'idle' | 'loading' | 'failed'>('idle');

  const [creating, setCreating] = useState(false);
  const [newSlotName, setNewSlotName] = useState('');
  const [menuSlot, setMenuSlot] = useState<SlotSummary | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);
  const [deletingSlot, setDeletingSlot] = useState(false);
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [backup, setBackup] = useState<BackupInfo | null | undefined>(undefined);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [freeing, setFreeing] = useState(false);
  const [trash, setTrash] = useState<TrashedStory[]>([]);
  const [trashOpen, setTrashOpen] = useState(false);
  const slotCount = slots.length;
  const textSize = useTextSize();
  // Retired models are named here once the lists load (audit 10).
  const [modelLists, setModelLists] = useState<ModelLists | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadModelLists().then((lists) => {
      if (!cancelled) setModelLists(lists);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const goneModels = db && modelLists ? missingModels(db.settings, modelLists) : [];
  // Costs that arrive after a save show at once (audit 10).
  useSyncExternalStore(subscribeSpending, spendingVersion, spendingVersion);
  const spent = db ? storySpending(db) : NO_SPENDING;

  useEffect(() => {
    let cancelled = false;
    void listTrash()
      .then((items) => {
        if (!cancelled) setTrash(items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slotCount]);

  const openSlotId = db?.meta.slotId;
  const savedAt = db?.meta.updatedAt;

  useEffect(() => {
    let cancelled = false;
    void storageStatus().then((status) => {
      if (!cancelled) setStorage(status);
    });
    return () => {
      cancelled = true;
    };
  }, [savedAt]);

  useEffect(() => {
    if (!openSlotId) return;
    let cancelled = false;
    void backupInfo(openSlotId).then((info) => {
      if (!cancelled) setBackup(info);
    });
    return () => {
      cancelled = true;
    };
  }, [openSlotId, restoring]);

  useEffect(() => {
    setKeyDraft(apiKey);
  }, [apiKey]);

  // Look up what the image model accepts whenever it changes (debounced so
  // typing a custom ID doesn't fire a lookup per keystroke).
  const imageModel = db?.settings.imageModel.trim() ?? '';
  const imageCaps = db?.settings.imageModelCaps ?? null;
  const capsCurrent = Boolean(imageCaps && imageCaps.modelId === imageModel);

  useEffect(() => {
    if (!imageModel || capsCurrent) {
      setCapsState('idle');
      return;
    }

    let cancelled = false;
    setCapsState('loading');
    const timer = setTimeout(() => {
      fetchImageModelCaps(imageModel)
        .then(async (caps) => {
          if (!cancelled) {
            await updateSettings({ imageModelCaps: caps });
            setCapsState('idle');
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCapsState('failed');
          }
        });
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [capsCurrent, imageModel, updateSettings]);

  const imageCapsNote =
    capsCurrent && imageCaps
      ? describeImageCaps(imageCaps)
      : capsState === 'failed'
        ? 'Couldn’t check what this model accepts. It will be checked again when you make an image.'
        : 'Checking what this model accepts…';
  const imageCapsWarning = Boolean(capsCurrent && imageCaps && imageCaps.maxReferences === 0);

  const keyEditorVisible = keyOpen || !apiKey;

  const handleSaveKey = async () => {
    setKeyError(null);
    setFeedback(null);

    if (!keyDraft.trim()) {
      setKeyError('Enter your OpenRouter API key.');
      return;
    }

    setSavingKey(true);

    try {
      await setApiKey(keyDraft);
      setFeedback({ tone: 'success', message: 'Key saved on this device.' });
    } catch {
      setFeedback({ tone: 'error', message: 'Could not save the key. Check storage permissions.' });
    } finally {
      setSavingKey(false);
    }
  };

  const handleTestKey = async () => {
    setKeyError(null);
    setFeedback(null);

    if (!keyDraft.trim()) {
      setKeyError('Enter your OpenRouter API key before testing.');
      return;
    }

    setTestingKey(true);

    try {
      const result = await testOpenRouterKey(keyDraft);

      if (result.ok) {
        await setApiKey(keyDraft);
        setFeedback({ tone: 'success', message: `Connected · ${result.label}.` });
      } else {
        setFeedback({ tone: 'error', message: result.message });
      }
    } finally {
      setTestingKey(false);
    }
  };

  const handleRemoveKey = async () => {
    setRemovingKey(true);
    setFeedback(null);

    try {
      await setApiKey('');
      setKeyDraft('');
      setFeedback({ tone: 'success', message: 'Key removed.' });
    } catch {
      setFeedback({ tone: 'error', message: 'Could not remove the key.' });
    } finally {
      setRemovingKey(false);
    }
  };

  const [exporting, setExporting] = useState<'with' | 'without' | null>(null);

  const handleExport = async (withImages: boolean) => {
    setExporting(withImages ? 'with' : 'without');

    try {
      const file = await exportActiveSlot({ withImages });

      if (!file) {
        return;
      }

      const result = await deliverFile(file.blob, file.filename);

      if (result === 'cancelled') {
        return;
      }

      await markExported().catch(() => undefined);
      showToast(
        result === 'shared'
          ? 'Your story is ready to save.'
          : withImages
            ? 'Save file downloaded.'
            : 'Save file downloaded, without images.',
        'success'
      );
    } catch (error) {
      showToast(
        `The export didn’t work: ${error instanceof Error ? error.message : 'unknown error'}. Try Export without images.`,
        'error'
      );
    } finally {
      setExporting(null);
    }
  };

  const handleImport = async () => {
    try {
      const file = await pickSaveFile();

      if (!file) {
        return;
      }

      await importSlot(file);
      showToast('Story imported.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not import that file.', 'error');
    }
  };

  const handleCreateSlot = async () => {
    const name = newSlotName.trim() || 'New story';
    await createNewSlot(name);
    setNewSlotName('');
    setCreating(false);
    showToast(`Started ${name}.`, 'success');
  };

  const closeMenu = () => {
    setMenuSlot(null);
    setRenaming(false);
  };

  const handleRename = async () => {
    const name = renameValue.trim();

    if (!menuSlot || !name) {
      return;
    }

    await renameSlotById(menuSlot.slotId, name);
    closeMenu();
    showToast('Story renamed.', 'success');
  };

  const handleRestoreDeleted = async (item: TrashedStory) => {
    try {
      await restoreDeletedStory(item.key);
      setTrash((items) => items.filter((other) => other.key !== item.key));
      showToast(`${item.slotName} is back.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not bring that story back.', 'error');
    }
  };

  const handleFreeUp = async () => {
    setFreeing(true);

    try {
      const deleted = await freeUpSpace();
      setStorage(await storageStatus());
      showToast(
        deleted > 0 ? `Removed ${deleted} image${deleted === 1 ? '' : 's'} no story uses.` : 'Nothing to clear: every image belongs to a story.',
        'success'
      );
    } catch {
      showToast('Could not check every save, so nothing was removed.', 'error');
    } finally {
      setFreeing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);

    try {
      await restoreDailyBackup();
      setRestoreOpen(false);
      showToast('Your story is back as it was in the backup.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not restore the backup.', 'error');
    } finally {
      setRestoring(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!deleteSlotId) {
      return;
    }

    setDeletingSlot(true);

    try {
      await deleteSlotById(deleteSlotId);
      setDeleteSlotId(null);
      showToast(`Story deleted. It stays in Recently deleted for ${TRASH_DAYS} days.`, 'success');
    } catch {
      showToast('Could not delete that story.', 'error');
    } finally {
      setDeletingSlot(false);
    }
  };

  if (!db) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.accent} size="small" />
      </View>
    );
  }

  const menuIsActive = menuSlot?.slotId === db.meta.slotId;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.root}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[type.pageTitle, styles.pageTitle]}>Settings</Text>

          <SectionLabel>Narrator</SectionLabel>
          {goneModels.length > 0 ? (
            <ListCard style={styles.goneCard}>
              {goneModels.map((gone) => (
                <ListRow
                  body={missingModelLine(gone)}
                  bodyLines={3}
                  key={gone.key}
                  leading={<CircleAlert color={colors.warning} size={18} strokeWidth={2} />}
                  onPress={gone.key === 'narrationModel' || gone.key === 'imageModel' ? undefined : () => setAdvancedOpen(true)}
                  title={`${gone.label}: model not found`}
                />
              ))}
            </ListCard>
          ) : null}
          <ListCard>
            <ListRow
              accessibilityLabel="OpenRouter key"
              accessibilityState={{ expanded: keyEditorVisible }}
              meta={apiKey ? `${apiKey.slice(0, 8)}… · stays on this device` : 'Needed to play · stays on this device'}
              onPress={apiKey ? () => setKeyOpen((open) => !open) : undefined}
              title="OpenRouter key"
              trailing={
                <View style={styles.keyState}>
                  <View
                    style={[styles.dot, { backgroundColor: apiKey ? colors.success : colors.textDim }]}
                  />
                  <Text style={[styles.keyStateText, apiKey && styles.keyStateOn]}>
                    {apiKey ? 'Connected' : 'Not set'}
                  </Text>
                </View>
              }
            />

            {keyEditorVisible ? (
              <View style={styles.keyEditor}>
                <View style={[styles.inputWrap, keyError ? styles.inputError : null]}>
                  <TextInput
                    accessibilityLabel="OpenRouter API key"
                    autoCapitalize="none"
                    autoComplete="off"
                    autoCorrect={false}
                    onChangeText={(value) => {
                      setKeyDraft(value);
                      setKeyError(null);
                      setFeedback(null);
                    }}
                    onSubmitEditing={() => void handleSaveKey()}
                    placeholder="sk-or-v1-..."
                    placeholderTextColor={colors.textDim}
                    returnKeyType="done"
                    secureTextEntry={!showKey}
                    style={styles.input}
                    value={keyDraft}
                  />
                  <Pressable
                    accessibilityLabel={showKey ? 'Hide API key' : 'Show API key'}
                    accessibilityRole="button"
                    onPress={() => setShowKey((current) => !current)}
                    style={styles.eye}
                  >
                    {showKey ? (
                      <EyeOff color={colors.textDim} size={18} strokeWidth={2} />
                    ) : (
                      <Eye color={colors.textDim} size={18} strokeWidth={2} />
                    )}
                  </Pressable>
                </View>
                {keyError ? <Text style={styles.fieldError}>{keyError}</Text> : null}

                <View style={styles.buttonRow}>
                  <AppButton
                    compact
                    disabled={removingKey || testingKey}
                    label="Save"
                    loading={savingKey}
                    loadingLabel="Saving…"
                    onPress={() => void handleSaveKey()}
                    style={styles.flex}
                  />
                  <AppButton
                    compact
                    disabled={savingKey || removingKey}
                    label="Test"
                    loading={testingKey}
                    loadingLabel="Checking…"
                    onPress={() => void handleTestKey()}
                    style={styles.flex}
                    variant="secondary"
                  />
                </View>

                {feedback ? (
                  <View accessibilityLiveRegion="polite" style={styles.feedback}>
                    {feedback.tone === 'success' ? (
                      <CircleCheck color={colors.success} size={16} strokeWidth={2} />
                    ) : (
                      <CircleAlert color={colors.danger} size={16} strokeWidth={2} />
                    )}
                    <Text style={[type.rowBody, styles.flex]}>{feedback.message}</Text>
                  </View>
                ) : null}

                <View style={styles.linkRow}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL('https://openrouter.ai/keys')}
                    style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}
                  >
                    <Text style={styles.textLinkLabel}>Get a key</Text>
                    <ExternalLink color={colors.textMuted} size={13} strokeWidth={2} />
                  </Pressable>
                  {apiKey ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={removingKey || savingKey || testingKey}
                      onPress={() => void handleRemoveKey()}
                      style={({ pressed }) => [styles.textLink, pressed && styles.pressed]}
                    >
                      <Text style={styles.removeLabel}>Remove key</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ) : null}

            <ModelSelect
              hint="Writes the story. New stories start with the models you pick here."
              label="Story"
              onChange={(value) => void updateSettings({ narrationModel: value })}
              value={db.settings.narrationModel}
            />
            <ModelSelect
              hint="Reference-capable models keep Kan consistent."
              kind="image"
              label="Images"
              onChange={(value) => void updateSettings({ imageModel: value })}
              value={db.settings.imageModel}
            />
            <Text
              style={[
                styles.capsNote,
                imageCapsWarning && styles.capsWarning,
              ]}
            >
              {imageCapsNote}
            </Text>
            <ListRow
              accessibilityLabel="Check images"
              accessibilityRole="switch"
              accessibilityState={{ checked: db.settings.imageCheck !== false }}
              meta="Looks at each scene image for swapped roles and paints it again once if they are. A small extra cost."
              onPress={() => void updateSettings({ imageCheck: db.settings.imageCheck === false })}
              title="Check images"
              trailing={
                <Switch
                  onValueChange={(imageCheck) => void updateSettings({ imageCheck })}
                  thumbColor={colors.text}
                  trackColor={{ false: colors.surfaceSoft, true: colors.accent }}
                  value={db.settings.imageCheck !== false}
                  {...(Platform.OS === 'web' ? { activeThumbColor: colors.text } : {})}
                />
              }
            />
            <ListRow
              accessibilityLabel="Two takes"
              accessibilityRole="switch"
              accessibilityState={{ checked: Boolean(db.settings.imageTwoTakes) }}
              meta="Paints two of every scene and lets you keep one. Costs double."
              onPress={() => void updateSettings({ imageTwoTakes: !db.settings.imageTwoTakes })}
              title="Two takes"
              trailing={
                <Switch
                  onValueChange={(imageTwoTakes) => void updateSettings({ imageTwoTakes })}
                  thumbColor={colors.text}
                  trackColor={{ false: colors.surfaceSoft, true: colors.accent }}
                  value={Boolean(db.settings.imageTwoTakes)}
                  {...(Platform.OS === 'web' ? { activeThumbColor: colors.text } : {})}
                />
              }
            />
          </ListCard>

          <SectionLabel>Sound</SectionLabel>
          <ListCard>
            <ListRow
              accessibilityLabel="Ambience"
              accessibilityRole="switch"
              accessibilityState={{ checked: ambience.enabled && soundSupported }}
              meta={
                !soundSupported
                  ? 'This browser can’t play sound'
                  : ambience.enabled
                    ? `Now: ${describeAmbience(currentAmbience(db)).toLowerCase()}`
                    : 'Off'
              }
              onPress={soundSupported ? () => setAmbienceSettings({ enabled: !ambience.enabled }) : undefined}
              title="Ambience"
              trailing={
                <Switch
                  disabled={!soundSupported}
                  onValueChange={(enabled) => setAmbienceSettings({ enabled })}
                  thumbColor={colors.text}
                  trackColor={{ false: colors.surfaceSoft, true: colors.accent }}
                  value={ambience.enabled && soundSupported}
                  {...(Platform.OS === 'web' ? { activeThumbColor: colors.text } : {})}
                />
              }
            />
            {ambience.enabled && soundSupported ? (
              <View style={styles.budgetRow}>
                <View style={styles.volumeHead}>
                  <Text style={styles.budgetLabel}>Volume</Text>
                  <Text style={styles.valueText}>{Math.round((ambienceVolume ?? ambience.volume) * 100)}%</Text>
                </View>
                <Text style={styles.budgetHint}>
                  Rain, wind, birds, water and voices around you, made on this device. Quieter in a fight.
                </Text>
                <Slider
                  accessibilityLabel="Ambience volume"
                  onChange={(volume) => {
                    setAmbienceVolume(volume);
                    ambienceEngine().setVolume(volume);
                  }}
                  onDone={(volume) => {
                    setAmbienceSettings({ volume });
                    setAmbienceVolume(null);
                  }}
                  value={ambienceVolume ?? ambience.volume}
                />
              </View>
            ) : null}
          </ListCard>

          <SectionLabel>Reading</SectionLabel>
          <ListCard>
            <ListRow meta="The story, your actions and every list grow together." title="Text size">
              <View style={styles.readingChoice}>
                <Segmented
                  accessibilityLabel="Text size"
                  onChange={setTextSize}
                  options={TEXT_SIZES.map(({ value, label }) => ({ value, label }))}
                  value={textSize}
                  variant="choice"
                />
              </View>
            </ListRow>
          </ListCard>

          <SectionLabel>Stories</SectionLabel>
          <ListCard>
            {slots.map((slot) => {
              const active = slot.slotId === db.meta.slotId;
              // The open story is read live; the others from their saved summary.
              const chapter = active ? db.state.chapter : slot.chapter;
              const date = active ? db.state.inStoryDate : slot.inStoryDate;

              return (
                <ListRow
                  accessibilityLabel={active ? `${slot.slotName}, playing` : `Switch to ${slot.slotName}`}
                  key={slot.slotId}
                  meta={`Chapter ${chapter} · ${formatDayMonth(date)}, year ${date.year}`}
                  onPress={active || busyStory ? undefined : () => void switchSlotById(slot.slotId)}
                  trailing={
                    <Pressable
                      accessibilityLabel={`More options for ${slot.slotName}`}
                      accessibilityRole="button"
                      onPress={() => {
                        setMenuSlot(slot);
                        setRenameValue(slot.slotName);
                      }}
                      style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
                    >
                      <Ellipsis color={colors.textMuted} size={18} strokeWidth={2} />
                    </Pressable>
                  }
                >
                  <View style={styles.slotTitle}>
                    <Text numberOfLines={1} style={[type.rowTitle, styles.flexShrink]}>
                      {slot.slotName}
                    </Text>
                    {active ? <Text style={styles.playing}>Playing</Text> : null}
                  </View>
                </ListRow>
              );
            })}

            {creating ? (
              <View style={styles.createRow}>
                <TextInput
                  accessibilityLabel="New story name"
                  autoFocus
                  onChangeText={setNewSlotName}
                  onSubmitEditing={() => void handleCreateSlot()}
                  placeholder="Story name"
                  placeholderTextColor={colors.textDim}
                  style={[styles.input, styles.createInput]}
                  value={newSlotName}
                />
                <AppButton compact label="Start" onPress={() => void handleCreateSlot()} />
              </View>
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => setCreating(true)}
                style={({ pressed }) => [styles.newStory, pressed && styles.pressed]}
              >
                <Plus color={colors.accentTint} size={17} strokeWidth={2.2} />
                <Text style={styles.newStoryLabel}>New story</Text>
              </Pressable>
            )}
          </ListCard>

          {trash.length > 0 ? (
            <ListCard style={styles.storageCard}>
              <ListRow
                accessibilityState={{ expanded: trashOpen }}
                chevron
                onPress={() => setTrashOpen((open) => !open)}
                title={`Recently deleted (${trash.length})`}
              />
              {trashOpen
                ? trash.map((item) => {
                    const daysLeft = Math.max(1, Math.ceil(TRASH_DAYS - (Date.now() - item.deletedAt) / 86_400_000));
                    return (
                      <ListRow
                        body={`Deleted ${formatRealDate(item.deletedAt)}. ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`}
                        key={item.key}
                        onPress={isNarrating ? undefined : () => void handleRestoreDeleted(item)}
                        title={item.slotName}
                        trailing={<Text style={styles.restoreLabel}>Restore</Text>}
                      />
                    );
                  })
                : null}
            </ListCard>
          ) : null}

          {/* Export, import and backups behind one row; Free up space inside Storage (step 10 mockup). */}
          <ListCard style={styles.storageCard}>
            <ListRow
              accessibilityState={{ expanded: backupsOpen }}
              chevron={!backupsOpen}
              meta={exportLine(db.meta.exportedAt ? formatRealDate(db.meta.exportedAt) : null, turnsSinceExport(db))}
              onPress={() => setBackupsOpen((open) => !open)}
              title="Export, import and backups"
              trailing={
                turnsSinceExport(db) >= EXPORT_REMINDER_TURNS ? (
                  <View accessibilityLabel="Time to export" style={styles.reminderDot} />
                ) : null
              }
            />
            {backupsOpen ? (
              <View style={styles.groupBody}>
                <View style={styles.buttonRow}>
                  <AppButton
                    disabled={exporting !== null}
                    label="Export with images"
                    loading={exporting === 'with'}
                    onPress={() => void handleExport(true)}
                    style={styles.flex}
                    variant="secondary"
                  />
                  <AppButton
                    disabled={exporting !== null}
                    label="Export without images"
                    loading={exporting === 'without'}
                    onPress={() => void handleExport(false)}
                    style={styles.flex}
                    variant="secondary"
                  />
                </View>
                <AppButton
                  disabled={busyStory}
                  label={busyStory ? 'Import save (after the reply)' : 'Import save'}
                  onPress={() => void handleImport()}
                  variant="secondary"
                />
              </View>
            ) : null}
            {backupsOpen ? (
              <ListRow
                body={
                  backup
                    ? `Saved ${formatRealDate(backup.updatedAt)}, ${Math.floor(backup.storyTurns / 2)} turns in, on ${formatDayMonth(backup.inStoryDate)}, year ${backup.inStoryDate.year}.`
                    : 'A copy from the day before is kept from tomorrow on.'
                }
                onPress={backup && !busyStory ? () => setRestoreOpen(true) : undefined}
                title="Restore yesterday’s backup"
              />
            ) : null}
          </ListCard>

          <ListCard style={styles.storageCard}>
            <ListRow
              accessibilityState={{ expanded: storageOpen }}
              body={
                storage && storage.persisted !== null
                  ? storage.persisted
                    ? 'Protected: the browser keeps your stories even when space runs low.'
                    : 'Not protected: the browser may clear your stories if you don’t open Kan for a while. Install Kan to your home screen to keep them safe.'
                  : null
              }
              bodyLines={storageOpen ? undefined : 2}
              chevron={!storageOpen}
              meta={storage?.usage !== undefined ? `${formatBytes(storage.usage)} used` : null}
              onPress={() => setStorageOpen((open) => !open)}
              title="Storage"
            />
            {storageOpen ? (
              <ListRow
                body="Removes images left over from undone turns, repainted scenes and deleted stories."
                onPress={freeing || isNarrating ? undefined : () => void handleFreeUp()}
                title="Free up space"
                trailing={freeing ? <ActivityIndicator color={colors.textMuted} size="small" /> : null}
              />
            ) : null}
          </ListCard>

          {/* What this story has cost (audit 10): its own totals, kept in the save. */}
          <ListCard style={styles.storageCard}>
            <ListRow
              body={
                spendingLine(spent) ??
                'Nothing yet. Each turn, summary and painting is counted here from now on.'
              }
              bodyLines={2}
              meta={spent.since ? `Since ${formatRealDate(spent.since)}` : null}
              title="Spending on this story"
            />
          </ListCard>

          {/* Advanced, closed by default: the engine's models and the Debug panel (audit 11a). */}
          <SectionLabel>Advanced</SectionLabel>
          <ListCard>
            <ListRow
              accessibilityState={{ expanded: advancedOpen }}
              onPress={() => setAdvancedOpen((open) => !open)}
              title="Models for the engine"
              // Under the title, not beside it: at 375 px the title wrapped (audit 10.3).
              meta="Summaries, director, memory"
              titleLines={1}
              trailing={
                <View style={styles.trailingValue}>
                  {advancedOpen ? (
                    <ChevronDown color={colors.textDim} size={16} strokeWidth={2} />
                  ) : (
                    <ChevronRight color={colors.textDim} size={16} strokeWidth={2} />
                  )}
                </View>
              }
            />
            {advancedOpen ? (
              <View style={styles.nested}>
                <ModelSelect
                  hint="Rolls chapters and arcs into summaries."
                  label="Summaries"
                  onChange={(value) => void updateSettings({ summaryModel: value })}
                  value={db.settings.summaryModel}
                />
                <View style={styles.nestedDivider} />
                <ModelSelect
                  hint="Frames each scene image like a storyboard artist and checks it afterwards. Starts as the story model; it needs to see images."
                  label="Image director"
                  onChange={(value) => void updateSettings({ imageDirectorModel: value })}
                  value={db.settings.imageDirectorModel?.trim() || db.settings.narrationModel}
                />
                <View style={styles.nestedDivider} />
                <ModelSelect
                  hint="Reads each turn and records time, place, bonds, facts, and threads. A cheap model with structured output works best."
                  label="Memory"
                  onChange={(value) => void updateSettings({ extractionModel: value })}
                  value={db.settings.extractionModel}
                />
                <View style={styles.nestedDivider} />
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>Story context</Text>
                  <Text style={styles.budgetHint}>
                    How much the narrator reads each turn, in tokens. More remembers more of the scene; less costs less.
                  </Text>
                  <Segmented
                    accessibilityLabel="Story context size"
                    variant="choice"
                    onChange={(value) => void updateSettings({ promptTokenBudget: Number(value) })}
                    options={PROMPT_BUDGET_OPTIONS.map((option) => ({
                      value: String(option),
                      label: `${option % 1000 === 0 ? option / 1000 : (option / 1000).toFixed(1)}k`,
                    }))}
                    value={String(db.settings.promptTokenBudget ?? DEFAULT_SETTINGS.promptTokenBudget)}
                  />
                </View>
              </View>
            ) : null}
            <ListRow
              accessibilityState={{ expanded: debugOpen }}
              chevron={!debugOpen}
              meta="Turn log, tracker fields, the world clock, checking this save"
              onPress={() => setDebugOpen((open) => !open)}
              title="Debug"
            />
          </ListCard>
          {debugOpen ? <DebugPanel slotId={db?.meta.slotId} /> : null}

          <View style={styles.about}>
            <Text style={type.rowMeta}>{`KAN · v${APP_VERSION}`}</Text>
            <Text style={type.rowMeta}>an app made by xanpire.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <Modal animationType="fade" onRequestClose={closeMenu} transparent visible={Boolean(menuSlot)}>
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityLabel="Close menu" onPress={closeMenu} style={StyleSheet.absoluteFill} />
          {menuSlot ? (
            <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              <SectionLabel first>{menuSlot.slotName}</SectionLabel>
              {renaming ? (
                <View style={styles.createRow}>
                  <TextInput
                    accessibilityLabel="Rename story"
                    autoFocus
                    onChangeText={setRenameValue}
                    onSubmitEditing={() => void handleRename()}
                    style={[styles.input, styles.createInput, styles.sheetInput]}
                    value={renameValue}
                  />
                  <AppButton compact label="Save" onPress={() => void handleRename()} />
                </View>
              ) : (
                <ListCard>
                  {!menuIsActive ? (
                    <ListRow
                      meta={busyStory ? 'Wait for the reply to finish' : null}
                      onPress={busyStory ? undefined : () => {
                        void switchSlotById(menuSlot.slotId);
                        closeMenu();
                      }}
                      title="Play this story"
                    />
                  ) : null}
                  <ListRow
                    onPress={() => {
                      void duplicateSlotById(menuSlot.slotId, `${menuSlot.slotName} copy`);
                      closeMenu();
                    }}
                    title="Make a copy"
                  />
                  <ListRow onPress={() => setRenaming(true)} title="Rename" />
                  <ListRow
                    meta={busyStory ? 'Wait for the reply to finish' : null}
                    onPress={busyStory ? undefined : () => {
                      setDeleteSlotId(menuSlot.slotId);
                      closeMenu();
                    }}
                    trailing={<Text style={styles.removeLabel}>Delete</Text>}
                    title="Delete story"
                  />
                </ListCard>
              )}
              <AppButton label="Cancel" onPress={closeMenu} variant="secondary" />
            </View>
          ) : null}
        </View>
      </Modal>

      <ConfirmDialog
        body="Your story goes back to the copy kept at the start of the day. Everything you played since then is set aside, not deleted."
        busy={restoring}
        busyText="Restoring the backup…"
        confirmLabel="Restore"
        label="Restore backup"
        onCancel={() => setRestoreOpen(false)}
        onConfirm={() => void handleRestore()}
        title="Go back to yesterday’s backup?"
        visible={restoreOpen}
      />

      <ConfirmDialog
        body={`It moves to Recently deleted, at the bottom of Stories, for ${TRASH_DAYS} days. After that it is gone for good.`}
        busy={deletingSlot}
        busyText="Deleting the story…"
        label="Delete story"
        confirmLabel="Delete"
        onCancel={() => setDeleteSlotId(null)}
        onConfirm={() => void handleDeleteSlot()}
        title="Delete this story?"
        visible={Boolean(deleteSlotId)}
      />
    </View>
  );
}

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatRealDate(at: number) {
  try {
    return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  } catch {
    return new Date(at).toDateString();
  }
}

const styles = StyleSheet.create({
  readingChoice: {
    marginTop: spacing.sm,
  },
  goneCard: {
    marginBottom: spacing.sm,
  },
  storageCard: {
    marginTop: spacing.md,
  },
  restoreLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.accentTint,
  },
  reminderDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  pageTitle: {
    marginBottom: spacing.xs,
  },
  pressed: {
    opacity: 0.65,
  },
  flex: {
    flex: 1,
  },
  flexShrink: {
    flexShrink: 1,
  },
  keyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  keyStateText: {
    fontFamily: fonts.bold,
    fontSize: 12,
    color: colors.textMeta,
  },
  keyStateOn: {
    color: colors.success,
  },
  keyEditor: {
    gap: 10,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingLeft: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  inputError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  eye: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldError: {
    ...type.rowMeta,
    color: colors.danger,
  },
  groupBody: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  textLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
  },
  textLinkLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textMuted,
  },
  removeLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.danger,
  },
  trailingValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  valueText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  nested: {
    paddingLeft: spacing.md,
    backgroundColor: '#0A0A0A',
  },
  capsNote: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textDim,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  capsWarning: {
    color: colors.accent,
  },
  nestedDivider: {
    height: 1,
    backgroundColor: colors.divider,
  },
  budgetRow: {
    gap: 6,
    paddingVertical: 14,
    paddingLeft: spacing.lg,
    paddingRight: 14,
  },
  volumeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  budgetLabel: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 21,
    color: colors.text,
  },
  budgetHint: {
    marginBottom: 4,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textDim,
  },
  slotTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  playing: {
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.accentTint,
  },
  moreButton: {
    width: 44,
    height: 44,
    marginRight: -10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newStory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  newStoryLabel: {
    fontFamily: fonts.bold,
    fontSize: 15,
    color: colors.accentTint,
  },
  createRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  createInput: {
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  sheetInput: {
    backgroundColor: colors.surface,
  },
  about: {
    alignItems: 'center',
    gap: 2,
    paddingTop: spacing.xl,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
});

// A crash while drawing shows Reload and Export instead of a white screen (audit 9).
export { TabErrorBoundary as ErrorBoundary } from '@/components/TabErrorBoundary';
