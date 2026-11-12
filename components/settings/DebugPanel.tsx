import { memo, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronLeft, ChevronRight, Copy } from 'lucide-react-native';

import { router } from 'expo-router';

import { ListCard, ListRow } from '@/components/List';
import { useToast } from '@/components/Toast';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import {
  clearDebugLog,
  formatCost,
  turnCost,
  turnsForSlot,
  turnTokens,
  useDebugLog,
  type DebugCall,
  type DebugCallKind,
  type DebugTurn,
  type DebugEvent,
} from '@/lib/rpg/debug';
export { formatCost } from '@/lib/rpg/debug';
import { trackerFieldStats, type TrackerFieldStat } from '@/lib/rpg/trackerStats';

const mono = Platform.select({
  web: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  ios: 'Menlo',
  default: 'monospace',
});

const KIND_LABEL: Record<DebugCallKind, string> = {
  narrator: 'Narrator',
  state: 'State',
  stateWorld: 'State (world)',
  timeSkip: 'Time skip',
  scene: 'Scene summary',
  arc: 'Arc summary',
  year: 'Year summary',
  saga: 'Saga summary',
  image: 'Scene image',
  imageAction: 'Image director',
  imageCheck: 'Image check',
  portrait: 'Portrait',
};

const STATE_LABEL = {
  running: 'Running…',
  applied: 'Applied',
  fallback: 'Unreadable · prose fallback',
  failed: 'Failed · queued for retry',
} as const;

function formatTokens(value: number) {
  return value.toLocaleString('en-US');
}

function formatTime(at: number) {
  const date = new Date(at);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function shortModel(model: string) {
  return model.includes('/') ? model.split('/').slice(1).join('/') : model;
}

async function copyText(text: string) {
  const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;

  if (!clipboard?.writeText) {
    return false;
  }

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function DebugPanel({ slotId }: { slotId?: string | null }) {
  const { turns: allTurns } = useDebugLog();
  // Only the open story: other stories' prompts and costs don't belong here.
  const turns = useMemo(() => turnsForSlot(allTurns, slotId), [allTurns, slotId]);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  // Jump back to the newest turn whenever a new one starts.
  const newestId = turns[0]?.id;
  useEffect(() => {
    setIndex(0);
  }, [turns.length, newestId]);

  const turn = turns[Math.min(index, Math.max(turns.length - 1, 0))] ?? null;
  const latest = turns[0] ?? null;
  const latestCost = latest ? turnCost(latest) : null;

  const session = useMemo(() => {
    let total = 0;
    let priced = 0;
    let pricedTotal = 0;

    for (const entry of turns) {
      const cost = turnCost(entry);
      total += cost.total;

      // The average counts only turns whose every call has a known cost.
      if (cost.complete && entry.calls.length > 0) {
        priced += 1;
        pricedTotal += cost.total;
      }
    }

    return { total, count: turns.length, priced, average: priced > 0 ? pricedTotal / priced : 0 };
  }, [turns]);

  return (
    <ListCard>
      <ListRow
        accessibilityState={{ expanded: open }}
        meta="Prompt, state change, tokens and cost for each turn."
        onPress={() => setOpen((value) => !value)}
        title="Debug panel"
        trailing={
          <View style={styles.trailing}>
            {latestCost ? (
              <Text style={styles.trailingText}>
                {`Last turn ${formatCost(latestCost.total)}${latestCost.complete ? '' : '+'}`}
              </Text>
            ) : null}
            {open ? (
              <ChevronDown color={colors.textDim} size={16} strokeWidth={2} />
            ) : (
              <ChevronRight color={colors.textDim} size={16} strokeWidth={2} />
            )}
          </View>
        }
      />

      {open ? (
        <ListRow
          meta="Shows what canon is about to do: spoilers for your story."
          onPress={() => router.push('/world-clock')}
          title="World clock"
          trailing={<ChevronRight color={colors.textDim} size={16} strokeWidth={2} />}
        />
      ) : null}

      {open ? (
        <View style={styles.body}>
          {!turn ? (
            <Text style={type.rowBody}>
              Nothing recorded yet. Play a turn and it shows up here: the exact prompt the
              narrator saw, what the state step changed, and what each call cost.
            </Text>
          ) : (
            <>
              <TurnStepper
                count={turns.length}
                index={index}
                onChange={setIndex}
                turn={turn}
              />
              <CostBlock turn={turn} />
              <StateBlock turn={turn} />
              <TrackerBlock turns={turns} />
              <PromptBlock
                onCopy={async (text) => {
                  const ok = await copyText(text);
                  showToast(ok ? 'Prompt copied.' : 'Copy isn’t available here.', ok ? 'success' : 'error');
                }}
                turn={turn}
              />

              <View style={styles.footer}>
                <Text style={type.rowMeta}>
                  {`${session.count} turn${session.count === 1 ? '' : 's'} logged · ${formatCost(
                    session.total
                  )} total${
                    session.priced > 0 ? ` · ${formatCost(session.average)} avg` : ''
                  }`}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    clearDebugLog();
                    showToast('Debug log cleared.', 'success');
                  }}
                  style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
                >
                  <Text style={styles.clearLabel}>Clear log</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      ) : null}
    </ListCard>
  );
}

function TurnStepper({
  turn,
  index,
  count,
  onChange,
}: {
  turn: DebugTurn;
  index: number;
  count: number;
  onChange: (index: number) => void;
}) {
  const older = index < count - 1;
  const newer = index > 0;

  return (
    <View style={styles.block}>
      <View style={styles.stepper}>
        <Pressable
          accessibilityLabel="Older turn"
          accessibilityRole="button"
          disabled={!older}
          onPress={() => onChange(index + 1)}
          style={({ pressed }) => [styles.stepButton, !older && styles.disabled, pressed && styles.pressed]}
        >
          <ChevronLeft color={colors.textMuted} size={18} strokeWidth={2} />
        </Pressable>
        <View style={styles.stepText}>
          <Text style={styles.label}>
            {index === 0 ? 'Latest turn' : `${index} turn${index === 1 ? '' : 's'} back`}
          </Text>
          <Text style={type.rowMeta}>
            {`${formatTime(turn.startedAt)} · ${shortModel(turn.narratorModel)}`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Newer turn"
          accessibilityRole="button"
          disabled={!newer}
          onPress={() => onChange(index - 1)}
          style={({ pressed }) => [styles.stepButton, !newer && styles.disabled, pressed && styles.pressed]}
        >
          <ChevronRight color={colors.textMuted} size={18} strokeWidth={2} />
        </Pressable>
      </View>
      <Text numberOfLines={3} style={styles.action}>
        {turn.action}
      </Text>
      {turn.error ? <Text style={styles.error}>{turn.error}</Text> : null}
    </View>
  );
}

function CostBlock({ turn }: { turn: DebugTurn }) {
  const cost = turnCost(turn);
  const tokens = turnTokens(turn);
  const pending = turn.calls.some((call) => call.costSource === 'pending');

  return (
    <View style={styles.block}>
      <Text style={type.sectionLabel}>Tokens & cost</Text>
      <View style={styles.totals}>
        <Stat label="Cost" value={`${formatCost(cost.total)}${cost.complete ? '' : '+'}`} />
        <Stat label="Prompt" value={formatTokens(tokens.prompt)} />
        <Stat label="Output" value={formatTokens(tokens.completion)} />
      </View>
      {!cost.complete ? (
        <Text style={type.rowMeta}>
          {pending
            ? 'Some costs are still being looked up from OpenRouter.'
            : '+ Some calls didn’t report a cost, so the total is a floor.'}
        </Text>
      ) : null}
      <View style={styles.calls}>
        {turn.calls.length === 0 ? (
          <Text style={type.rowMeta}>Waiting for the narrator…</Text>
        ) : (
          turn.calls.map((call) => <CallRow call={call} key={call.id} />)
        )}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={type.rowMeta}>{label}</Text>
    </View>
  );
}

function CallRow({ call }: { call: DebugCall }) {
  const usage = call.usage;
  const costText =
    typeof usage?.cost === 'number'
      ? formatCost(usage.cost)
      : call.costSource === 'pending'
        ? 'looking up…'
        : 'no cost';

  const details: string[] = [];

  if (usage && (usage.promptTokens > 0 || usage.completionTokens > 0)) {
    details.push(
      `${formatTokens(usage.promptTokens)} in · ${formatTokens(usage.completionTokens)} out${
        usage.estimated ? ' (estimated)' : ''
      }`
    );
  }

  if (usage?.reasoningTokens) {
    details.push(`${formatTokens(usage.reasoningTokens)} thinking`);
  }

  if (usage?.cachedTokens) {
    details.push(`${formatTokens(usage.cachedTokens)} cached`);
  }

  if (usage?.durationMs) {
    details.push(`${(usage.durationMs / 1000).toFixed(1)}s`);
  }

  if (call.finishReason && call.finishReason !== 'stop') {
    details.push(`finish: ${call.finishReason}`);
  }

  if (call.responseMode) {
    details.push(RESPONSE_MODE_LABEL[call.responseMode]);
  }

  const served = usage?.servedModel && usage.servedModel !== call.model ? usage.servedModel : null;

  return (
    <View style={styles.callRow}>
      <View style={styles.callHead}>
        <Text style={styles.callKind}>{KIND_LABEL[call.kind]}</Text>
        <Text style={[styles.callCost, call.costSource === 'lookup' && styles.callCostLookup]}>
          {costText}
        </Text>
      </View>
      <Text numberOfLines={1} style={styles.mono}>
        {`${shortModel(served ?? call.model)}${usage?.provider ? ` · ${usage.provider}` : ''}`}
      </Text>
      {details.length > 0 ? <Text style={type.rowMeta}>{details.join(' · ')}</Text> : null}
      {call.error ? <Text style={styles.error}>{call.error}</Text> : null}
    </View>
  );
}

/** One colour per kind of engine event: warnings warm, routine grey. */
const EVENT_COLOR: Record<DebugEvent['kind'], string> = {
  fallback: colors.warning,
  mode: colors.textMuted,
  refused: colors.accentTint,
  merged: colors.textMuted,
  dropped: colors.warning,
  retry: colors.textMuted,
  violation: colors.danger,
};

/** Which output mode answered a JSON call. Anything but "schema" on the state call means strict output was refused. */
const RESPONSE_MODE_LABEL = {
  schema: 'strict schema',
  json_object: 'JSON mode (schema refused)',
  plain: 'plain reply (JSON refused)',
} as const;

function StateBlock({ turn }: { turn: DebugTurn }) {
  const [showRaw, setShowRaw] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showWorld, setShowWorld] = useState(false);
  const state = turn.state;

  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={type.sectionLabel}>State change</Text>
        {state ? (
          <Text
            style={[
              styles.badge,
              state.status === 'applied' && styles.badgeOk,
              (state.status === 'failed' || state.status === 'fallback') && styles.badgeWarn,
            ]}
          >
            {STATE_LABEL[state.status]}
          </Text>
        ) : null}
      </View>

      {!state ? (
        <Text style={type.rowMeta}>
          {turn.error ? 'No state step: the narrator call failed.' : 'Runs after the narrator finishes.'}
        </Text>
      ) : (
        <>
          {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
          {state.note ? <Text style={type.rowMeta}>{state.note}</Text> : null}
          {state.events?.length ? (
            <View style={styles.events}>
              {state.events.map((event, position) => (
                <View key={`${event.kind}-${position}`} style={styles.event}>
                  <Text style={[styles.eventTag, { color: EVENT_COLOR[event.kind], borderColor: EVENT_COLOR[event.kind] }]}>
                    {event.kind}
                  </Text>
                  <Text selectable style={[type.rowMeta, styles.eventText]}>
                    {event.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {state.nameLeaks?.length ? (
            <Text style={styles.error}>{`Names Kan couldn't know yet, used outside dialogue: ${state.nameLeaks.join('; ')}`}</Text>
          ) : null}
          {state.changes ? (
            state.changes.length === 0 ? (
              <Text style={type.rowMeta}>Nothing in the save changed.</Text>
            ) : (
              <View style={styles.changes}>
                {state.changes.map((change, position) => (
                  <View key={`${change.path}-${position}`} style={styles.change}>
                    <Text style={styles.changePath}>{change.path}</Text>
                    <Text selectable style={styles.mono}>
                      <Text style={styles.from}>{change.from}</Text>
                      <Text style={styles.arrow}>{'  →  '}</Text>
                      <Text style={styles.to}>{change.to}</Text>
                    </Text>
                  </View>
                ))}
              </View>
            )
          ) : null}

          <View style={styles.toggles}>
            {state.diff !== undefined ? (
              <Toggle
                label="Applied diff"
                onPress={() => setShowDiff((value) => !value)}
                open={showDiff}
              />
            ) : null}
            {state.raw !== undefined ? (
              <Toggle label="Raw reply" onPress={() => setShowRaw((value) => !value)} open={showRaw} />
            ) : null}
            {state.worldRaw !== undefined ? (
              <Toggle label="World reply" onPress={() => setShowWorld((value) => !value)} open={showWorld} />
            ) : null}
          </View>
          {state.worldAreas?.length ? (
            <Text style={type.rowMeta}>{`World call asked: ${state.worldAreas.join(', ')}`}</Text>
          ) : (
            <Text style={type.rowMeta}>No World call this turn.</Text>
          )}
          {showDiff ? <CodeBox text={JSON.stringify(state.diff, null, 2)} /> : null}
          {showRaw ? <CodeBox text={prettyJson(state.raw ?? '')} /> : null}
          {showWorld ? <CodeBox text={prettyJson(state.worldRaw ?? '')} /> : null}
        </>
      )}
    </View>
  );
}

/**
 * Field by field over every logged turn of this story: how often the tracker
 * filled it, and how often you fixed that part by hand afterwards (audit 7).
 */
function TrackerBlock({ turns }: { turns: DebugTurn[] }) {
  const [open, setOpen] = useState(false);
  const stats = useMemo(() => trackerFieldStats(turns), [turns]);
  const fixes = stats.fields.reduce((sum, field) => sum + field.corrected, 0);

  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={type.sectionLabel}>Tracker fields</Text>
        <Toggle label={open ? 'Hide' : 'Show'} onPress={() => setOpen((value) => !value)} open={open} />
      </View>
      <Text style={type.rowMeta}>
        {`${stats.turns} readable repl${stats.turns === 1 ? 'y' : 'ies'}${
          stats.unreadable ? ` · ${stats.unreadable} unreadable` : ''
        } · ${fixes} fixed by hand (time, merge, death, travel)`}
      </Text>
      {open ? (
        <View style={styles.changes}>
          {stats.fields.map((field) => (
            <TrackerRow field={field} key={field.field} total={stats.turns} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function TrackerRow({ field, total }: { field: TrackerFieldStat; total: number }) {
  return (
    <View style={styles.trackerRow}>
      <Text numberOfLines={1} style={[styles.mono, styles.flex]}>
        {field.field}
      </Text>
      <Text style={type.rowMeta}>{`${field.filled}/${total}`}</Text>
      <Text style={[type.rowMeta, styles.trackerFixed, field.corrected > 0 && styles.error]}>
        {field.corrected > 0 ? `fixed ${field.corrected}` : ''}
      </Text>
    </View>
  );
}

function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text || '(empty reply)';
  }
}

function PromptBlock({ turn, onCopy }: { turn: DebugTurn; onCopy: (text: string) => void }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const prompt = turn.prompt;
  const narrator = turn.calls.find((call) => call.kind === 'narrator');

  const fullText = useMemo(
    () =>
      prompt
        ? prompt.map((message) => `### ${message.role}\n${message.content}`).join('\n\n')
        : '',
    [prompt]
  );

  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Text style={type.sectionLabel}>Narrator prompt</Text>
        {prompt ? (
          <Pressable
            accessibilityLabel="Copy the full prompt"
            accessibilityRole="button"
            onPress={() => onCopy(fullText)}
            style={({ pressed }) => [styles.copy, pressed && styles.pressed]}
          >
            <Copy color={colors.textMuted} size={14} strokeWidth={2} />
            <Text style={styles.copyLabel}>Copy</Text>
          </Pressable>
        ) : null}
      </View>

      {!prompt ? (
        <Text style={type.rowMeta}>Only the newest 5 turns keep their full prompt.</Text>
      ) : (
        <>
          <Text style={type.rowMeta}>
            {`${prompt.length} messages · ~${formatTokens(turn.promptEstimate)} estimated${
              narrator?.usage && !narrator.usage.estimated
                ? ` · ${formatTokens(narrator.usage.promptTokens)} billed`
                : ''
            }`}
          </Text>
          <View style={styles.messages}>
            {prompt.map((message, position) => (
              <PromptMessage
                content={message.content}
                key={position}
                onToggle={() => setOpenIndex((value) => (value === position ? null : position))}
                open={openIndex === position}
                role={message.role}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const PromptMessage = memo(function PromptMessage({
  role,
  content,
  open,
  onToggle,
}: {
  role: string;
  content: string;
  open: boolean;
  onToggle: () => void;
}) {
  const preview = content.replace(/\s+/g, ' ').slice(0, 90);

  return (
    <View style={styles.message}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.messageHead, pressed && styles.pressed]}
      >
        <Text style={styles.role}>{role}</Text>
        <Text numberOfLines={1} style={[type.rowMeta, styles.flex]}>
          {preview}
        </Text>
        <Text style={type.rowMeta}>{`${formatTokens(content.length)} ch`}</Text>
      </Pressable>
      {open ? <CodeBox text={content} /> : null}
    </View>
  );
});

function Toggle({ label, open, onPress }: { label: string; open: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={({ pressed }) => [styles.toggle, open && styles.toggleOpen, pressed && styles.pressed]}
    >
      <Text style={[styles.toggleLabel, open && styles.toggleLabelOpen]}>{label}</Text>
    </Pressable>
  );
}

function CodeBox({ text }: { text: string }) {
  return (
    <ScrollView nestedScrollEnabled style={styles.code}>
      <Text selectable style={styles.codeText}>
        {text}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  trackerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  trackerFixed: {
    minWidth: 56,
    textAlign: 'right',
  },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.3 },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trailingText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  body: {
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  block: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepText: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.text,
  },
  action: {
    ...type.rowBody,
    fontStyle: 'italic',
    color: colors.textSoft,
  },
  error: {
    ...type.rowMeta,
    color: colors.danger,
  },
  totals: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  stat: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontFamily: fonts.bold,
    fontSize: 16,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  calls: {
    gap: spacing.sm,
  },
  callRow: {
    gap: 3,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  callHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  callKind: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.text,
  },
  callCost: {
    fontFamily: fonts.bold,
    fontSize: 13,
    color: colors.success,
    fontVariant: ['tabular-nums'],
  },
  callCostLookup: {
    color: colors.textSoft,
  },
  mono: {
    fontFamily: mono,
    fontSize: 12,
    lineHeight: 17,
    color: colors.textMuted,
  },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.full,
    fontFamily: fonts.bold,
    fontSize: 11,
    color: colors.textMuted,
    backgroundColor: colors.surfaceRaised,
  },
  badgeOk: {
    color: colors.success,
    backgroundColor: colors.successSoft,
  },
  badgeWarn: {
    color: colors.warning,
    backgroundColor: 'rgba(240, 163, 74, 0.12)',
  },
  changes: {
    gap: spacing.sm,
  },
  events: {
    gap: 6,
  },
  event: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  eventTag: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  eventText: {
    flex: 1,
  },
  change: {
    gap: 2,
  },
  changePath: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textSoft,
  },
  from: {
    color: colors.textDim,
  },
  arrow: {
    color: colors.textDim,
  },
  to: {
    color: colors.text,
  },
  toggles: {
    flexDirection: 'row',
    gap: 6,
  },
  toggle: {
    minHeight: 32,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  toggleOpen: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  toggleLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
  },
  toggleLabelOpen: {
    color: colors.background,
  },
  copy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  copyLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
  },
  messages: {
    gap: 4,
  },
  message: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  messageHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
    paddingHorizontal: spacing.md,
  },
  role: {
    width: 64,
    fontFamily: mono,
    fontSize: 11,
    color: colors.accentTint,
    textTransform: 'uppercase',
  },
  code: {
    maxHeight: 360,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#000000',
  },
  codeText: {
    fontFamily: mono,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSoft,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  clear: {
    minHeight: 36,
    justifyContent: 'center',
  },
  clearLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.danger,
  },
});
