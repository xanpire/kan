import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, GitMerge, Search } from 'lucide-react-native';

import { AppButton } from '@/components/AppButton';
import { EmptyRow, ListCard, ListRow } from '@/components/List';
import { Avatar } from '@/components/kan/BondsSection';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { dateSortValue } from '@/lib/rpg/calendar';
import type { AppDatabase, EntityRecord } from '@/lib/rpg/types';
import { alsoKnownAs, displayName, searchableNames } from '@/lib/rpg/names';

type MergeSheetProps = {
  visible: boolean;
  db: AppDatabase;
  /** The person whose bond screen you are on. */
  entity: EntityRecord;
  onCancel: () => void;
  /** Called with the person to keep and the one folded into them. */
  onMerge: (keepId: string, dropId: string) => Promise<void>;
};

/** Only names you know (names.ts): the sheet never shows or finds a hidden one. */
function otherNames(db: AppDatabase, entity: EntityRecord) {
  return alsoKnownAs(db, entity);
}

/** Shared words in two people's names: a likely duplicate floats to the top. */
function nameOverlap(a: EntityRecord, b: EntityRecord) {
  const words = (entity: EntityRecord) =>
    new Set(
      [entity.name, ...entity.aliases]
        .join(' ')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 2)
    );
  const left = words(a);

  return [...words(b)].filter((word) => left.has(word)).length;
}

export function MergeSheet({ visible, db, entity, onCancel, onMerge }: MergeSheetProps) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<EntityRecord | null>(null);
  const [keepId, setKeepId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setTarget(null);
      setKeepId(null);
      setBusy(false);
    }
  }, [visible]);

  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();

    return db.entities
      .filter(
        (item) =>
          item.type === 'character' &&
          item.id !== entity.id &&
          item.name.toLowerCase() !== 'kan'
      )
      .filter(
        (item) =>
          !term ||
          searchableNames(db, item).some((name) => name.toLowerCase().includes(term))
      )
      .sort((a, b) => {
        const overlap = nameOverlap(entity, b) - nameOverlap(entity, a);

        if (overlap !== 0) {
          return overlap;
        }

        const met = Number(b.met !== false) - Number(a.met !== false);

        if (met !== 0) {
          return met;
        }

        const seen =
          (b.lastSeen ? dateSortValue(b.lastSeen) : -1) -
          (a.lastSeen ? dateSortValue(a.lastSeen) : -1);

        return seen !== 0 ? seen : a.name.localeCompare(b.name);
      });
  }, [db, entity, query]);

  const choose = (item: EntityRecord) => {
    setTarget(item);
    // Usually you open the duplicate and pick the real person, so the
    // picked name is kept by default.
    setKeepId(item.id);
  };

  const confirm = async () => {
    if (!target || !keepId || busy) {
      return;
    }

    setBusy(true);

    try {
      await onMerge(keepId, keepId === target.id ? entity.id : target.id);
    } finally {
      setBusy(false);
    }
  };

  const shown = (item: EntityRecord | null | undefined) => (item ? displayName(db, item) : undefined);
  const keepName = keepId === entity.id ? shown(entity) : shown(target);
  const dropName = keepId === entity.id ? shown(target) : shown(entity);

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Cancel"
          onPress={busy ? undefined : onCancel}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet}>
          <View style={styles.labelRow}>
            <GitMerge color={colors.accentTint} size={15} strokeWidth={2} />
            <Text style={styles.label}>Merge with…</Text>
          </View>

          {!target ? (
            <>
              <Text style={styles.title}>Who else is {displayName(db, entity)}?</Text>
              <Text style={styles.body}>
                Pick the person this is a duplicate of. Their bonds, memories and facts become one.
              </Text>

              <View style={styles.search}>
                <Search color={colors.textDim} size={16} strokeWidth={2} />
                <TextInput
                  accessibilityLabel="Search people"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setQuery}
                  placeholder="Search people"
                  placeholderTextColor={colors.textDim}
                  style={styles.searchInput}
                  value={query}
                />
              </View>

              <ScrollView
                contentContainerStyle={styles.listContent}
                keyboardShouldPersistTaps="handled"
                style={styles.list}
              >
                {candidates.length === 0 ? (
                  <EmptyRow title="No one by that name" body="Try another name or alias." />
                ) : (
                  <ListCard>
                    {candidates.map((item) => {
                      const names = otherNames(db, item).slice(0, 3).join(', ');
                      const meta = [item.met === false ? 'Not met yet' : null, names || null]
                        .filter(Boolean)
                        .join(' · ');

                      return (
                        <ListRow
                          accessibilityLabel={`Merge with ${displayName(db, item)}`}
                          chevron
                          key={item.id}
                          leading={<Avatar name={displayName(db, item)} size={34} />}
                          meta={meta || null}
                          onPress={() => choose(item)}
                          title={displayName(db, item)}
                          titleLines={1}
                        />
                      );
                    })}
                  </ListCard>
                )}
              </ScrollView>

              <AppButton compact label="Cancel" onPress={onCancel} variant="secondary" />
            </>
          ) : (
            <>
              <Text style={styles.title}>Make them one person?</Text>
              <Text style={styles.body}>
                {dropName} becomes another name for {keepName}. Bonds, shared memories, facts and
                jutsu are combined. This can’t be undone.
              </Text>

              <Text style={[type.sectionLabel, styles.keepLabel]}>Name to keep</Text>
              <ListCard>
                {[target, entity].map((item) => {
                  const selected = keepId === item.id;

                  return (
                    <ListRow
                      accessibilityLabel={`Keep the name ${displayName(db, item)}`}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: selected }}
                      key={item.id}
                      leading={<Avatar name={displayName(db, item)} size={34} />}
                      meta={item.met === false ? 'Not met yet' : (item.role ?? null)}
                      onPress={() => setKeepId(item.id)}
                      title={displayName(db, item)}
                      titleLines={1}
                      trailing={
                        <View style={[styles.radio, selected && styles.radioOn]}>
                          {selected ? (
                            <Check color={colors.onAccent} size={13} strokeWidth={3} />
                          ) : null}
                        </View>
                      }
                    />
                  );
                })}
              </ListCard>

              <View style={styles.actions}>
                <AppButton
                  compact
                  disabled={busy}
                  label="Back"
                  onPress={() => setTarget(null)}
                  style={styles.action}
                  variant="secondary"
                />
                <AppButton
                  compact
                  label="Merge"
                  loading={busy}
                  loadingLabel="Merging…"
                  onPress={confirm}
                  style={styles.action}
                  variant="primary"
                />
              </View>
            </>
          )}
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
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '86%',
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
    color: colors.accentTint,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 44,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  listContent: {
    paddingVertical: spacing.xs,
  },
  keepLabel: {
    marginTop: spacing.xs,
  },
  radio: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
  },
  radioOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
