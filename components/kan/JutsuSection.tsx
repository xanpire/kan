import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/components/AppButton';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyRow, ListCard, ListRow, SectionLabel } from '@/components/List';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import { formatDayMonth } from '@/lib/rpg/calendar';
import { useGame } from '@/lib/rpg/game';
import { groupJutsuByNature, jutsuKey } from '@/lib/rpg/jutsu';
import type { JutsuRecord } from '@/lib/rpg/types';
import { resolveEntity } from '@/lib/rpg/entities';
import { displayName } from '@/lib/rpg/names';

export function JutsuSection() {
  const { db, renameJutsu, deleteJutsu } = useGame();
  const userName = (name: string) => {
    const entity = db ? resolveEntity(db, name) : null;
    return entity && db ? displayName(db, entity) : name;
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<JutsuRecord | null>(null);

  const startRename = (record: JutsuRecord) => {
    setEditingId(record.id);
    setDraft(record.name);
  };

  const saveRename = async (record: JutsuRecord) => {
    const name = draft.trim();

    if (!name || name === record.name) {
      setEditingId(null);
      return;
    }

    setSaving(true);
    await renameJutsu(record.id, name);
    setSaving(false);
    setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!deleting) {
      return;
    }

    const id = deleting.id;
    setDeleting(null);
    setOpenId(null);
    await deleteJutsu(id);
  };

  /** Another of this user's jutsu already has the name being typed. */
  const mergesInto = (record: JutsuRecord) =>
    db?.jutsuRecords.find(
      (item) =>
        item.id !== record.id &&
        item.user === record.user &&
        draft.trim() &&
        jutsuKey(item.name) === jutsuKey(draft),
    ) ?? null;

  const groups = useMemo(
    () => (db ? groupJutsuByNature(db.jutsuRecords) : []),
    [db],
  );

  if (!db) {
    return null;
  }

  const natures = db.state.player.natures ?? [];
  const abilities = db.state.player.abilities ?? [];
  // Your eyes, other abilities and chakra natures, above the jutsu.
  const abilityCard = (
    <View style={styles.section}>
      <SectionLabel>Abilities & natures</SectionLabel>
      <ListCard>
        {abilities.length === 0 ? (
          <ListRow body="Your dōjutsu and other abilities appear here when they awaken." title="No abilities awakened yet" />
        ) : (
          abilities.map((ability) => (
            <ListRow
              body={ability.stage}
              key={ability.name}
              meta={`Since ${formatDayMonth(ability.acquiredOn)}, year ${ability.acquiredOn.year}`}
              title={ability.name}
            />
          ))
        )}
        <ListRow
          body={
            natures.length === 0
              ? 'Your own chakra nature is not known yet.'
              : natures
                  .map((item) => `${item.nature}${item.source === 'innate' ? ' (yours)' : ` (Thousand Souls${item.from ? `, from ${userName(item.from)}` : ''})`}`)
                  .join(' · ')
          }
          title="Chakra natures"
        />
      </ListCard>
    </View>
  );

  if (groups.length === 0) {
    return (
      <View style={styles.section}>
        {abilityCard}
        <SectionLabel>Jutsu</SectionLabel>
        <EmptyRow
          body="Every technique you use or see is kept here for good."
          title="No jutsu seen yet"
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      {abilityCard}
      {groups.map((group) => (
        <View key={group.nature} style={styles.group}>
          <SectionLabel>
            {group.nature} · {group.jutsu.length}
          </SectionLabel>
          <ListCard>
            {group.jutsu.map((record) => {
              const open = openId === record.id;
              // The name Kan knows them by, never the record's own (audit 6b.2).
              const meta =
                record.user === 'Kan'
                  ? `Used ${record.timesUsed}×`
                  : `${userName(record.user)} · used ${record.timesUsed}×`;

              return (
                <View key={record.id}>
                  <ListRow
                    accessibilityState={{ expanded: open }}
                    body={record.effect}
                    bodyLines={open ? undefined : 2}
                    meta={
                      open
                        ? `${meta} · first seen ${formatDayMonth(record.firstSeen)}, year ${record.firstSeen.year}`
                        : meta
                    }
                    onPress={() => {
                      setOpenId(open ? null : record.id);
                      setEditingId(null);
                    }}
                    title={record.name}
                  >
                    {open && record.visual ? (
                      <Text style={type.rowBody}>
                        <Text style={styles.label}>Looks like </Text>
                        {record.visual}
                      </Text>
                    ) : null}
                    {open && record.description ? (
                      <Text style={type.rowBody}>{record.description}</Text>
                    ) : null}
                  </ListRow>
                  {open ? (
                    <View style={styles.panel}>
                      {editingId === record.id ? (
                        <View style={styles.edit}>
                          <TextInput
                            accessibilityLabel="Jutsu name"
                            autoCorrect={false}
                            autoFocus
                            onChangeText={setDraft}
                            onSubmitEditing={() => saveRename(record)}
                            placeholder="Jutsu name"
                            placeholderTextColor={colors.textDim}
                            returnKeyType="done"
                            style={styles.input}
                            value={draft}
                          />
                          {mergesInto(record) ? (
                            <Text style={type.rowMeta}>
                              {`Joins the "${mergesInto(record)?.name}" you already have; their uses are added together.`}
                            </Text>
                          ) : null}
                          <View style={styles.actions}>
                            <AppButton
                              compact
                              label="Cancel"
                              onPress={() => setEditingId(null)}
                              style={styles.action}
                              variant="secondary"
                            />
                            <AppButton
                              compact
                              disabled={!draft.trim()}
                              label="Save"
                              loading={saving}
                              onPress={() => saveRename(record)}
                              style={styles.action}
                            />
                          </View>
                        </View>
                      ) : null}
                      {editingId !== record.id ? (
                        <View style={styles.actions}>
                          <AppButton
                            compact
                            label="Rename"
                            onPress={() => startRename(record)}
                            style={styles.action}
                            variant="secondary"
                          />
                          <AppButton
                            compact
                            label="Delete"
                            onPress={() => setDeleting(record)}
                            style={styles.action}
                            variant="ghost"
                          />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ListCard>
        </View>
      ))}
      <ConfirmDialog
        body={
          deleting?.user === 'Kan'
            ? 'It comes off your jutsu list. If you use it again in the story, it is recorded fresh.'
            : 'It comes off the list. If it shows up again in the story, it is recorded fresh.'
        }
        confirmLabel="Delete"
        label="Delete jutsu"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={deleting ? `Delete ${deleting.name}?` : ''}
        visible={deleting !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  group: {
    gap: spacing.md,
  },
  label: {
    ...type.rowMeta,
    fontSize: 13,
  },
  panel: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    marginTop: -6,
  },
  edit: {
    gap: spacing.sm,
  },
  input: {
    height: 44,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
