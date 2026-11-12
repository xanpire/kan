import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ImagePlus, RefreshCw, X } from 'lucide-react-native';

import { ListCard, ListRow } from '@/components/List';
import { useToast } from '@/components/Toast';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { generateImage } from '@/lib/openrouter';
import { formatDayMonth } from '@/lib/rpg/calendar';
import {
  buildCharacterPortraitPrompt,
  characterFaceOf,
  alreadyPainted,
  beginPainting,
  characterPortraitSignature,
  characterPortraitStaleReason,
  endPainting,
  portraitKey,
  faceReferenceWarning,
  latestCharacterPortrait,
} from '@/lib/rpg/characterPortrait';
import { recordDebugImage } from '@/lib/rpg/debug';
import { pickImageFile } from '@/lib/rpg/file';
import { useGame } from '@/lib/rpg/game';
import { displayName, kanKnowsName } from '@/lib/rpg/names';
import { ensureImageCaps } from '@/lib/rpg/imageCaps';
import { loadImage, useStoredImage } from '@/lib/rpg/imageStore';
import { planReferences } from '@/lib/rpg/referencePlan';
import type { EntityRecord } from '@/lib/rpg/types';

function StoredImage({ value, fallback }: { value: string | null; fallback?: ReactNode }) {
  const uri = useStoredImage(value);

  if (!value) {
    return <>{fallback ?? null}</>;
  }

  if (!uri) {
    return <ActivityIndicator color={colors.textDim} size="small" />;
  }

  return <Image resizeMode="cover" source={{ uri }} style={StyleSheet.absoluteFill} />;
}

/**
 * Top of a bond page: their portrait (painted only when you ask), who they
 * are, and an optional face reference that keeps them on-model.
 */
export function CharacterPortraitCard({
  entity,
  dead,
  subtitle,
}: {
  entity: EntityRecord;
  dead: boolean;
  subtitle: string;
}) {
  const { db, apiKey, addCharacterPortrait, setCharacterFace, updateSettings } = useGame();
  const { showToast } = useToast();
  // The name you know them by, never a hidden one (names.ts).
  const name = db ? displayName(db, entity) : entity.name;
  const [busy, setBusy] = useState(false);
  const [savingFace, setSavingFace] = useState(false);
  const [viewing, setViewing] = useState(false);

  const latest = db ? latestCharacterPortrait(db, entity.id) : null;
  const face = db ? characterFaceOf(db, entity.id) : null;
  const signature = useMemo(
    () => (db ? characterPortraitSignature(db, entity) : null),
    [db, entity]
  );
  const staleReason = signature
    ? characterPortraitStaleReason(latest, signature, { dead, hasFace: Boolean(face) })
    : null;
  const viewingUri = useStoredImage(viewing ? latest?.image ?? null : null);

  const paint = useCallback(async () => {
    if (!db || !signature || busy) {
      return;
    }

    if (!apiKey) {
      showToast('Add your OpenRouter key in Settings first.', 'error');
      return;
    }

    if (alreadyPainted(latest, signature, Boolean(face))) {
      showToast(`${name}’s portrait already shows them as they are now.`);
      return;
    }

    // One painting per person and details at a time, across every mounted card.
    const lock = portraitKey(entity.id, signature, face ? 'face' : '');

    if (!beginPainting(lock)) {
      return;
    }

    setBusy(true);

    try {
      const caps = await ensureImageCaps(db, updateSettings);
      const [faceUri, previous] = await Promise.all([
        face ? loadImage(face.image) : Promise.resolve(null),
        latest ? loadImage(latest.image) : Promise.resolve(null),
      ]);
      const plan = planReferences(
        [
          { kind: 'face', uri: faceUri ?? '' },
          { kind: 'previous', uri: previous ?? '' },
        ],
        caps.maxReferences
      );
      const usedFace = plan.references.some((reference) => reference.kind === 'face');

      if (face && !usedFace) {
        showToast(faceReferenceWarning(caps.modelId), 'error');
      }

      const startedAt = Date.now();
      const result = await generateImage({
        apiKey,
        caps,
        prompt: buildCharacterPortraitPrompt(db, entity, signature, plan.references),
        inputReferences: plan.references.map((reference) => reference.uri),
        aspectRatio: '3:4',
      });
      recordDebugImage(null, 'portrait', caps.modelId, result.cost, Date.now() - startedAt);
      await addCharacterPortrait(entity.id, result.dataUri, signature, usedFace);
    } catch (caught) {
      showToast(
        caught instanceof Error ? caught.message : 'The portrait wouldn’t paint. Try again.',
        'error'
      );
    } finally {
      endPainting(lock);
      setBusy(false);
    }
  }, [addCharacterPortrait, apiKey, busy, db, entity, face, latest, showToast, signature, updateSettings]);

  const chooseFace = useCallback(async () => {
    try {
      // The picker may never answer if it is dismissed, so stay idle until it does.
      const picked = await pickImageFile();

      if (!picked) {
        return;
      }

      setSavingFace(true);
      await setCharacterFace(entity.id, picked);
      showToast(`Face reference saved. Paint ${name} to use it.`);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'That image couldn’t be used.', 'error');
    } finally {
      setSavingFace(false);
    }
  }, [entity.id, name, setCharacterFace, showToast]);

  if (!db) {
    return null;
  }

  const stale = Boolean(staleReason);
  const status = busy
    ? 'Painting a portrait…'
    : !latest
      ? 'No portrait yet'
      : stale
        ? `They’ve changed · ${staleReason}`
        : `Painted ${formatDayMonth(latest.inStoryDate)}`;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={`Open ${name}'s portrait`}
          accessibilityRole="imagebutton"
          disabled={!latest}
          onPress={() => setViewing(true)}
          style={[styles.portrait, dead && styles.portraitDead]}
        >
          <StoredImage
            fallback={
              <Text style={styles.initial}>{(kanKnowsName(entity) ? name : '?').trim().charAt(0).toUpperCase() || '?'}</Text>
            }
            value={latest?.image ?? null}
          />
          {busy ? (
            <View style={styles.painting}>
              <Text style={styles.paintingText}>Painting…</Text>
            </View>
          ) : null}
        </Pressable>

        <View style={styles.info}>
          <Text style={type.pageTitle}>{kanKnowsName(entity) ? name : name.charAt(0).toUpperCase() + name.slice(1)}</Text>
          {subtitle ? <Text style={type.rowBody}>{subtitle}</Text> : null}
          <View style={styles.spacer} />
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: !latest ? colors.textDim : stale ? colors.warning : colors.success },
              ]}
            />
            <Text numberOfLines={1} style={[styles.statusText, latest && stale && styles.statusStale]}>
              {status}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={latest ? `Repaint ${name}` : `Paint ${name}`}
            accessibilityRole="button"
            accessibilityState={{ busy }}
            disabled={busy}
            onPress={() => void paint()}
            style={({ pressed }) => [
              styles.paint,
              stale ? styles.paintPrimary : styles.paintQuiet,
              pressed && styles.pressed,
              busy && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <RefreshCw color={stale ? colors.onAccent : colors.textSoft} size={15} strokeWidth={2} />
            )}
            <Text style={[styles.paintLabel, !stale && styles.paintLabelQuiet]}>
              {latest ? 'Repaint' : 'Paint portrait'}
            </Text>
          </Pressable>
        </View>
      </View>

      <ListCard>
        <ListRow
          accessibilityLabel={face ? `Replace ${name}'s face reference` : `Add a face reference for ${name}`}
          body={
            face
              ? `Sent every time ${name} is painted, so their face stays the same. Tap to replace it.`
              : `Optional. Choose a picture of ${name}'s face — for canon characters, an official image works best. It keeps them on-model and stays on this device.`
          }
          leading={
            <View style={styles.faceThumb}>
              {savingFace ? (
                <ActivityIndicator color={colors.textDim} size="small" />
              ) : (
                <StoredImage
                  fallback={<ImagePlus color={colors.textMuted} size={18} strokeWidth={2} />}
                  value={face?.image ?? null}
                />
              )}
            </View>
          }
          onPress={savingFace ? undefined : () => void chooseFace()}
          title={face ? 'Face reference' : 'Add a face reference'}
          trailing={
            face ? (
              <Pressable
                accessibilityLabel={`Remove ${name}'s face reference`}
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => void setCharacterFace(entity.id, null)}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            ) : undefined
          }
        />
      </ListCard>

      <Modal
        animationType="fade"
        onRequestClose={() => setViewing(false)}
        transparent
        visible={viewing && Boolean(latest)}
      >
        <View style={styles.viewer}>
          <Pressable
            accessibilityLabel="Close portrait"
            onPress={() => setViewing(false)}
            style={StyleSheet.absoluteFill}
          />
          {viewingUri ? (
            <Image resizeMode="contain" source={{ uri: viewingUri }} style={styles.viewerImage} />
          ) : (
            <ActivityIndicator color={colors.textDim} />
          )}
          {latest ? (
            <Text style={styles.viewerCaption}>
              {[
                name,
                latest.signature.age !== null ? `Age ${latest.signature.age}` : null,
                `Painted ${formatDayMonth(latest.inStoryDate)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel="Close portrait"
            accessibilityRole="button"
            onPress={() => setViewing(false)}
            style={({ pressed }) => [styles.viewerClose, pressed && styles.pressed]}
          >
            <X color={colors.text} size={20} strokeWidth={2} />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    gap: 14,
  },
  portrait: {
    width: 104,
    height: 138,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  portraitDead: {
    opacity: 0.55,
  },
  initial: {
    fontFamily: fonts.bold,
    fontSize: 36,
    color: colors.accentTint,
  },
  painting: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5, 5, 5, 0.72)',
  },
  paintingText: {
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.text,
  },
  info: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  spacer: {
    flex: 1,
    minHeight: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    flex: 1,
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    color: colors.textMeta,
  },
  statusStale: {
    color: colors.warning,
  },
  paint: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    marginTop: 6,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  paintPrimary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  paintQuiet: {
    backgroundColor: colors.surface,
    borderColor: colors.borderStrong,
  },
  paintLabel: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.onAccent,
  },
  paintLabelQuiet: {
    color: colors.textSoft,
  },
  faceThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  remove: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  removeText: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.6,
  },
  viewer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
  },
  viewerImage: {
    width: '100%',
    flex: 1,
  },
  viewerCaption: {
    ...type.rowMeta,
    textAlign: 'center',
  },
  viewerClose: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
