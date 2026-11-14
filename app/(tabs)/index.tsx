import {
  Fragment,
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  ArrowDown,
  ArrowUp,
  CircleAlert,
  Download,
  Image as ImageIcon,
  Clock3,
  History,
  MoreHorizontal,
  Pencil,
  Copy as CopyIcon,
  Check,
  ChevronDown,
  Paintbrush,
  RotateCcw,
  RotateCw,
  Sparkles,
  Square,
  Wand2,
  Undo2,
  X,
} from 'lucide-react-native';

import { AppButton } from '@/components/AppButton';
import { FilterPills, ListCard, ListRow, SectionLabel } from '@/components/List';
import { Wordmark } from '@/components/Wordmark';
import { colors, fonts, radius, spacing, type } from '@/constants/theme';
import {
  formatClock,
  formatDayMonth,
  formatElapsed,
  formatStoryDate,
  timeOfDayOf,
} from '@/lib/rpg/calendar';
import { narrationSegments } from '@/lib/rpg/narrationText';
import { scrubNameLeaks } from '@/lib/rpg/names';
import { testOpenRouterKey } from '@/lib/openrouter';
import { useReadingType } from '@/lib/reading';
import { localizePlaceNames } from '@/lib/rpg/glossary';
import { streamingPreview } from '@/lib/rpg/prompt';
import { REDO_WINDOW_MS, useGame, useStreamingText } from '@/lib/rpg/game';
import { dragInTurnedFrame, turnByDefault, turnedBox } from '@/lib/rpg/viewerTurn';
import { loadDraft, saveDraft, takePendingAction } from '@/lib/rpg/draft';
import { companionsOf } from '@/lib/rpg/companions';
import { useToast } from '@/components/Toast';
import { downloadImage } from '@/lib/rpg/file';
import { ensureImageCaps } from '@/lib/rpg/imageCaps';
import { useStoredImage } from '@/lib/rpg/imageStore';
import { SHOT_CHIPS, type ShotChip } from '@/lib/rpg/imageDirection';
import { paintScene, retouchSceneImage, type PaintedTake } from '@/lib/rpg/paintScene';
import { PAINT_STAGE_LABEL, storyMarkers, type PaintStage, type StoryMarker } from '@/lib/rpg/storyMarkers';
import { chapterJumps, entriesToShow, whereYouLeftOff, type LeftOff } from '@/lib/rpg/storyNav';
import { currentWeather, weatherPhrase } from '@/lib/rpg/weather';
import { WeatherIcon } from '@/components/WeatherIcon';
import { fightOptionInput, resolveTurnMode, timeSkipBlocked } from '@/lib/rpg/sceneMode';
import {
  FLASHBACK_BY_ID,
  REMEMBER_INPUT,
  activeFlashback,
  flashbackDateLine,
  flashbackView,
  rememberChip,
} from '@/lib/rpg/flashbacks';
import type { AppDatabase, RawLogEntry, SceneModeName } from '@/lib/rpg/types';
import { displayName } from '@/lib/rpg/names';
import {
  WAIT_INPUT,
  copyText,
  copyableText,
  enterSends,
  hasFinePointer,
  lastPlayerAction,
} from '@/lib/rpg/storyControls';

type StoryMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image: string | null;
  /** The state tracker flagged this beat as worth painting. */
  imageWorthy?: boolean;
  elapsedSeconds?: number;
  fightOptions?: string[];
  /** A turn inside a flashback (shown with the warm tint). */
  memory?: boolean;
  /** The first turn of a flashback: the date line shown above it. */
  memoryHeading?: { title: string; dateLine: string };
};

const MODE_LABEL: Record<SceneModeName, string> = {
  normal: 'Narration',
  conversation: 'Conversation',
  fight: 'Fight',
};

const MODE_CHOICES: { value: SceneModeName | null; title: string; body: string }[] = [
  { value: null, title: 'Automatic', body: 'Talk turns into a conversation and an attack into a fight on their own.' },
  { value: 'conversation', title: 'Conversation', body: 'Mostly speech, even while you walk or travel. Ends if a fight starts.' },
  { value: 'fight', title: 'Fight', body: 'Short exchanges: their move, then yours. Ends when the fight is over.' },
  { value: 'normal', title: 'Normal narration', body: 'Full prose until this conversation or fight is over.' },
];

/** The spans the Let time pass sheet offers (the longest skip is 3 years). */
const SKIP_SPANS = [
  { value: '1 week', label: 'A week' },
  { value: '1 month', label: 'A month' },
  { value: '3 months', label: '3 months' },
  { value: '6 months', label: '6 months' },
  { value: '1 year', label: 'A year' },
  { value: '2 years', label: '2 years' },
  { value: '3 years', label: '3 years' },
];

const TIME_PRESETS: { value: string; label: string; seconds: number }[] = [
  { value: '15', label: '15 s', seconds: 15 },
  { value: '60', label: '1 min', seconds: 60 },
  { value: '120', label: '2 min', seconds: 120 },
  { value: '600', label: '10 min', seconds: 600 },
  { value: '1800', label: '30 min', seconds: 1800 },
  { value: '3600', label: '1 h', seconds: 3600 },
  { value: '10800', label: '3 h', seconds: 10800 },
  { value: '28800', label: '8 h', seconds: 28800 },
  { value: '86400', label: '1 day', seconds: 86400 },
  { value: '259200', label: '3 days', seconds: 259200 },
];

type TimeUnit = 'min' | 'h' | 'd';

const UNIT_SECONDS: Record<TimeUnit, number> = { min: 60, h: 3600, d: 86400 };

function TimeChip({ seconds, onPress }: { seconds: number; onPress: () => void }) {
  const label = formatElapsed(seconds);

  return (
    <Pressable
      accessibilityLabel={`This took ${label.slice(1)}. Tap to correct the time.`}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.timeChip, pressed && styles.pressed]}
    >
      <Clock3 color={colors.textDim} size={12} strokeWidth={2} />
      <Text style={styles.timeChipLabel}>{label}</Text>
    </Pressable>
  );
}

function paragraphsOf(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** A narration paragraph: *action lines* and thoughts in dim italics, never their asterisks. */
function NarrationParagraph({ text, memory }: { text: string; memory?: boolean }) {
  const segments = narrationSegments(text);
  const reading = useReadingType();
  const prose = memory ? [reading.prose, styles.memoryProse] : reading.prose;

  return (
    <Text style={prose}>
      {segments.map((segment, index) =>
        segment.action ? (
          <Text key={index} style={[styles.narrationAction, memory && styles.memoryAction]}>
            {segment.text}
          </Text>
        ) : (
          <Text key={index}>{segment.text}</Text>
        )
      )}
    </Text>
  );
}

/** Renders Kan's turn with *actions* in italics and everything else plain. */
function PlayerText({ text, memory }: { text: string; memory?: boolean }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  const reading = useReadingType();

  return (
    <Text style={[styles.playerText, reading.player, memory && styles.memoryProse]}>
      {parts.map((part, index) =>
        part.startsWith('*') && part.endsWith('*') && part.length > 2 ? (
          <Text key={index} style={styles.playerAction}>
            {part.slice(1, -1)}
          </Text>
        ) : (
          <Text key={index}>{part}</Text>
        )
      )}
    </Text>
  );
}

/** The newest scene images load straight away; older ones wait for a tap. */
const EAGER_SCENE_IMAGES = 3;

function SceneImage({ value, onOpen, eager }: { value: string; onOpen: (uri: string) => void; eager: boolean }) {
  const [wanted, setWanted] = useState(eager);
  const uri = useStoredImage(wanted || eager ? value : null);

  if (!wanted && !eager) {
    return (
      <Pressable
        accessibilityLabel="Show scene image"
        accessibilityRole="button"
        onPress={() => setWanted(true)}
        style={styles.sceneImageWrap}
      >
        <Text style={type.rowBody}>Show image</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityLabel="Open scene image"
      accessibilityRole="imagebutton"
      disabled={!uri}
      onPress={() => uri && onOpen(uri)}
      style={styles.sceneImageWrap}
    >
      {uri ? (
        <Animated.View entering={FadeIn.duration(500)} style={styles.sceneImage}>
          <Image
            accessibilityLabel="Generated story scene"
            resizeMode="cover"
            source={{ uri }}
            style={styles.sceneImage}
          />
        </Animated.View>
      ) : (
        <ActivityIndicator color={colors.textDim} size="small" />
      )}
    </Pressable>
  );
}

function InlineAction({
  label,
  icon,
  onPress,
  onLongPress,
  disabled,
  busy,
  glow,
  accessibilityHint,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** A key moment: the action invites you. */
  glow?: boolean;
  accessibilityHint?: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      delayLongPress={450}
      disabled={disabled || busy}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.inlineAction,
        glow && styles.inlineActionGlow,
        pressed && styles.pressed,
        (disabled || busy) && styles.disabled,
      ]}
    >
      {busy ? <ActivityIndicator color={colors.textMuted} size="small" /> : icon}
      <Text style={[styles.inlineActionLabel, glow && styles.inlineActionGlowLabel]}>{busy ? 'Painting…' : label}</Text>
    </Pressable>
  );
}

/** The story opens on this many turns; "Show earlier" adds as many again (audit 9). */
const VISIBLE_TURNS = 40;

const NO_OPTIONS: string[] = [];

type MessageRowProps = {
  message: StoryMessage;
  eager: boolean;
  onOpenImage: (uri: string, logId: string) => void;
  onTimePress: (logId: string, seconds: number) => void;
  /** The controls under the latest reply; other replies show only their time chip. */
  footer?: ReactNode;
  /** Long-press a reply: the small menu to paint or copy it (audit 11c). */
  onReplyMenu?: (message: StoryMessage) => void;
  /** Long-press your last action: edit and resend it. */
  onEdit?: () => void;
};

/** One saved turn. Memoised by its message, so a new turn or a keystroke never redraws the log. */
const MessageRow = memo(function MessageRow({ message, eager, onOpenImage, onTimePress, footer, onReplyMenu, onEdit }: MessageRowProps) {
  const paragraphs = useMemo(
    () => (message.role === 'assistant' ? paragraphsOf(message.content) : []),
    [message.role, message.content]
  );

  return (
    <>
      {message.memoryHeading ? (
        <View accessibilityRole="header" style={styles.memoryHeading}>
          <History color={colors.memoryAccent} size={14} strokeWidth={2} />
          <Text style={styles.memoryHeadingText}>
            <Text style={styles.memoryHeadingTitle}>{message.memoryHeading.title}</Text>
            {'  '}
            {message.memoryHeading.dateLine}
          </Text>
        </View>
      ) : null}
      {message.role === 'user' ? (
        <Pressable
          accessibilityHint={onEdit ? 'Long-press to edit and send it again' : undefined}
          delayLongPress={500}
          disabled={!onEdit}
          onLongPress={onEdit}
          style={[styles.playerBlock, message.memory && styles.memoryPlayerBlock]}
        >
          <PlayerText memory={message.memory} text={message.content} />
        </Pressable>
      ) : (
        <View style={[styles.narration, message.memory && styles.memoryNarration]}>
          <Pressable
            accessibilityHint={onReplyMenu ? 'Long-press to paint or copy this reply' : undefined}
            delayLongPress={500}
            disabled={!onReplyMenu}
            onLongPress={onReplyMenu ? () => onReplyMenu(message) : undefined}
            style={styles.narrationText}
          >
            {paragraphs.map((paragraph, index) => (
              <NarrationParagraph key={index} memory={message.memory} text={paragraph} />
            ))}
          </Pressable>
          {message.image ? (
            <SceneImage eager={eager} onOpen={(uri) => onOpenImage(uri, message.id)} value={message.image} />
          ) : null}
          {footer ??
            (message.elapsedSeconds !== undefined ? (
              <View style={styles.inlineActions}>
                <TimeChip
                  onPress={() => onTimePress(message.id, message.elapsedSeconds ?? 0)}
                  seconds={message.elapsedSeconds}
                />
              </View>
            ) : null)}
        </View>
      )}
    </>
  );
});

/**
 * First run (audit 10): paste your key, test it, begin, all on the Story tab.
 * The key is saved only once OpenRouter accepts it.
 */
function FirstRunCard({ onSave }: { onSave: (key: string) => Promise<void> }) {
  const [draft, setDraft] = useState('');
  const [testing, setTesting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const test = async () => {
    const key = draft.trim();
    if (!key) {
      setProblem('Paste your key first.');
      return;
    }

    setTesting(true);
    setProblem(null);

    try {
      const result = await testOpenRouterKey(key);
      if (result.ok) await onSave(key);
      else setProblem(result.message);
    } catch {
      setProblem('Could not save the key on this device.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <View style={styles.firstRun}>
      <Text style={styles.firstRunEyebrow}>Before you begin</Text>
      <Text style={type.rowBody}>
        The narrator runs on OpenRouter with your own key. It stays on this device.
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => void Linking.openURL('https://openrouter.ai/keys')}
        style={({ pressed }) => [styles.firstRunLink, pressed && styles.pressed]}
      >
        <Text style={styles.firstRunLinkText}>1. Get a key at openrouter.ai/keys</Text>
      </Pressable>
      <TextInput
        accessibilityLabel="OpenRouter key"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={(value) => {
          setDraft(value);
          setProblem(null);
        }}
        onSubmitEditing={() => void test()}
        placeholder="2. Paste it here (sk-or-…)"
        placeholderTextColor={colors.textDim}
        secureTextEntry
        style={styles.firstRunInput}
        value={draft}
      />
      {problem ? <Text style={styles.firstRunProblem}>{problem}</Text> : null}
      <AppButton
        disabled={testing}
        label={testing ? 'Testing…' : '3. Test and save'}
        loading={testing}
        onPress={() => void test()}
        variant="secondary"
      />
    </View>
  );
}

/** Where you left off (audit 10): what was happening, from the save alone. */
function LeftOffCard({ leftOff }: { leftOff: LeftOff }) {
  const reading = useReadingType();

  return (
    <View accessibilityLabel={`Where you left off, ${leftOff.away} ago`} style={styles.leftOff}>
      <Text style={styles.leftOffEyebrow}>Where you left off · {leftOff.away} ago</Text>
      {leftOff.chapter ? (
        <>
          {leftOff.chapter.title ? <Text style={reading.rowTitle}>{leftOff.chapter.title}</Text> : null}
          <Text numberOfLines={5} style={[styles.leftOffText, reading.rowBody]}>
            {leftOff.chapter.text}
          </Text>
        </>
      ) : null}
      <Text style={[styles.leftOffMeta, reading.rowMeta]}>
        {leftOff.place}
        {leftOff.withYou.length > 0 ? ` · With you: ${leftOff.withYou.join(', ')}` : ''}
      </Text>
      {leftOff.threads.length > 0 ? (
        <View style={styles.leftOffThreads}>
          {leftOff.threads.map((thread) => (
            <Text key={thread} numberOfLines={1} style={[styles.leftOffMeta, reading.rowMeta]}>
              · {thread}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A chapter card, or a thin centred line for a new day or place (audit 11b). */
function StoryMarkerView({ marker }: { marker: StoryMarker }) {
  if (marker.chapter) {
    return (
      <View accessibilityRole="header" style={styles.chapterCard}>
        <Text style={styles.chapterEyebrow}>Chapter {marker.chapter.number}</Text>
        <Text style={styles.chapterCardTitle}>{marker.chapter.title}</Text>
        {marker.chapter.line ? <Text style={styles.chapterLine}>{marker.chapter.line}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.markers}>
      {[marker.day, marker.place].filter(Boolean).map((text) => (
        <View key={text} style={styles.markerRow}>
          <View style={styles.markerRule} />
          <Text numberOfLines={1} style={styles.markerText}>
            {text}
          </Text>
          <View style={styles.markerRule} />
        </View>
      ))}
    </View>
  );
}

/** The three stages of a painting, instead of one spinner (audit 11b). */
function PaintingStages({ stage }: { stage: PaintStage }) {
  const order: PaintStage[] = ['framing', 'painting', 'checking'];
  const at = order.indexOf(stage);

  return (
    <View accessibilityLabel={`${PAINT_STAGE_LABEL[stage]}…`} accessibilityLiveRegion="polite" style={styles.sceneImageWrap}>
      <View style={styles.stages}>
        {order.map((item, index) => (
          <View key={item} style={styles.stageRow}>
            {index < at ? (
              <Check color={colors.success} size={14} strokeWidth={3} />
            ) : index === at ? (
              <ActivityIndicator color={colors.accent} size="small" />
            ) : (
              <View style={styles.stageDot} />
            )}
            <Text style={[styles.stageText, index === at && styles.stageTextNow]}>{PAINT_STAGE_LABEL[item]}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Kan's action and the reply as it streams. The only part of the screen that redraws while the narrator writes. */
function LiveReply({ db, pendingAction, memory }: { db: AppDatabase; pendingAction: string | null; memory: boolean }) {
  const streamingText = useStreamingText();
  // Only finished paragraphs are shown, each fading in as it completes, so
  // the reply reads like it is being written (audit 11b).
  const finished = useMemo(() => {
    const preview = streamingPreview(streamingText);
    const all = paragraphsOf(preview);
    return (/\n\s*\n\s*$/.test(preview) ? all : all.slice(0, -1)).join('\n\n');
  }, [streamingText]);
  // A name Kan doesn't know never shows, even while the reply streams (audit
  // 6b.3); worked out again only when a paragraph finishes.
  const paragraphs = useMemo(() => (finished ? paragraphsOf(scrubNameLeaks(db, finished).text) : []), [db, finished]);

  return (
    <>
      {pendingAction ? (
        <View style={[styles.playerBlock, memory && styles.memoryPlayerBlock]}>
          <PlayerText memory={memory} text={pendingAction} />
        </View>
      ) : null}
      <View style={[styles.narration, memory && styles.memoryNarration]}>
        {paragraphs.map((paragraph, index) => (
          <Animated.View entering={FadeIn.duration(450)} key={index}>
            <NarrationParagraph memory={memory} text={paragraph} />
          </Animated.View>
        ))}
        <View style={styles.typingRow}>
          <ActivityIndicator color={colors.accent} size="small" />
          {paragraphs.length === 0 ? <Text style={type.rowMeta}>The world is moving…</Text> : null}
        </View>
      </View>
    </>
  );
}

type ComposerHandle = {
  /** Empties the box (a turn was sent). */
  clear: () => void;
  /** Empties the box only if it holds exactly this (a retried action that was put back). */
  clearIf: (text: string) => void;
  /** Puts this in the box to edit (Edit your action). */
  set: (text: string) => void;
};

type ComposerProps = {
  db: AppDatabase;
  isNarrating: boolean;
  storyStarted: boolean;
  /** The fight moves offered under the latest reply. */
  fightOptions: string[];
  returnedAction: { text: string; id: number } | null;
  onSubmit: (value: string) => void;
  onStop: () => void;
  onOpenMode: () => void;
};

/**
 * The input box, its markers, the send/stop button, the mode chip and the
 * fight moves. It owns what you type, so a keystroke redraws only this.
 */
const Composer = memo(
  forwardRef<ComposerHandle, ComposerProps>(function Composer(
    { db, isNarrating, storyStarted, fightOptions, returnedAction, onSubmit, onStop, onOpenMode },
    ref
  ) {
    const [input, setInput] = useState('');
    const inputRef = useRef<TextInput | null>(null);
    const selectionRef = useRef<{ start: number; end: number } | null>(null);
    const slotId = db.meta.slotId;

    useImperativeHandle(
      ref,
      () => ({
        clear: () => {
          setInput('');
          selectionRef.current = null;
        },
        clearIf: (text: string) => setInput((current) => (current.trim() === text ? '' : current)),
        set: (text: string) => {
          setInput(text);
          selectionRef.current = null;
          inputRef.current?.focus();
        },
      }),
      []
    );

    // The input box is kept per story, so a reload never loses what you typed.
    const draftSlotRef = useRef<string | null>(null);

    useEffect(() => {
      if (draftSlotRef.current === slotId) {
        return;
      }

      draftSlotRef.current = slotId;
      // A reload while the narrator was thinking: the action comes back (audit 5.6).
      const lastPlayer = [...(db?.rawLog ?? [])].reverse().find((entry) => entry.role === 'user')?.content;
      setInput(loadDraft(slotId) || takePendingAction(slotId, lastPlayer));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slotId]);

    useEffect(() => {
      if (draftSlotRef.current !== slotId) {
        return;
      }

      const timer = setTimeout(() => saveDraft(slotId, input), 300);
      return () => clearTimeout(timer);
    }, [slotId, input]);

    // A turn that failed or was stopped with nothing kept: your action comes back.
    useEffect(() => {
      if (returnedAction) {
        setInput((current) => (current.trim() ? current : returnedAction.text));
      }
    }, [returnedAction]);

    const insertMarker = useCallback((marker: string) => {
      setInput((current) => {
        const selection = selectionRef.current;

        if (!selection) {
          return current + marker;
        }

        const next = current.slice(0, selection.start) + marker + current.slice(selection.end);

        selectionRef.current = {
          start: selection.start + marker.length,
          end: selection.start + marker.length,
        };

        return next;
      });

      inputRef.current?.focus();
    }, []);

    // The mode the next turn will be narrated in, read live from what you type.
    const turnMode = useMemo(() => resolveTurnMode(db, input), [db, input]);
    const override = db.state.sceneMode?.override ?? null;
    const shownMode: SceneModeName = turnMode?.mode ?? 'normal';
    const shownFightOptions = shownMode === 'fight' && !isNarrating ? fightOptions : NO_OPTIONS;
    const modeHint =
      shownMode === 'normal' && turnMode?.lean && !override
        ? 'Talk is building'
        : turnMode?.with.length && shownMode !== 'normal'
          ? turnMode.with.slice(0, 2).join(', ')
          : null;
    const canSend = Boolean(input.trim()) && !isNarrating;
    // An empty box sends Wait: the scene goes on without Kan acting (audit 10).
    const canWait = !isNarrating && storyStarted && !input.trim();
    const finePointer = useMemo(() => hasFinePointer(), []);

    return (
      <>
        {shownFightOptions.length > 0 ? (
          <ScrollView
            contentContainerStyle={styles.fightOptions}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
          >
            {shownFightOptions.map((option) => (
              <Pressable
                accessibilityLabel={`Fight move: ${option}`}
                accessibilityRole="button"
                disabled={isNarrating}
                key={option}
                onPress={() => onSubmit(fightOptionInput(option))}
                style={({ pressed }) => [styles.fightOption, pressed && styles.pressed]}
              >
                <Text numberOfLines={2} style={styles.fightOptionLabel}>
                  {option}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        {storyStarted ? (
          <View style={styles.modeRow}>
            <Pressable
              accessibilityLabel={`Scene mode: ${MODE_LABEL[shownMode]}${override ? ', set by you' : ', automatic'}. Change it`}
              accessibilityRole="button"
              hitSlop={6}
              onPress={onOpenMode}
              style={({ pressed }) => [
                styles.modeChip,
                shownMode === 'conversation' && styles.modeChipTalk,
                shownMode === 'fight' && styles.modeChipFight,
                pressed && styles.pressed,
              ]}
            >
              {shownMode !== 'normal' ? (
                <View style={[styles.modeDot, shownMode === 'fight' && styles.modeDotFight]} />
              ) : null}
              <Text
                style={[
                  styles.modeChipLabel,
                  shownMode !== 'normal' && styles.modeChipLabelOn,
                ]}
              >
                {MODE_LABEL[shownMode]}
                {override ? ' · set by you' : ''}
              </Text>
            </Pressable>
            {modeHint ? (
              <Text numberOfLines={1} style={styles.modeHint}>
                {modeHint}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={styles.composer}>
          <Pressable
            accessibilityLabel="Insert speech marks"
            accessibilityRole="button"
            onPress={() => insertMarker('"')}
            style={({ pressed }) => [styles.markerButton, pressed && styles.pressed]}
          >
            <Text style={styles.markerLabel}>“</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Insert action marker"
            accessibilityRole="button"
            onPress={() => insertMarker('*')}
            style={({ pressed }) => [
              styles.markerButton,
              styles.markerTight,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.markerLabel}>*</Text>
          </Pressable>
          <TextInput
            accessibilityLabel="What do you do?"
            editable={!isNarrating}
            maxLength={1000}
            multiline
            numberOfLines={1}
            onChangeText={setInput}
            onSelectionChange={(event) => {
              selectionRef.current = {
                start: event.nativeEvent.selection.start,
                end: event.nativeEvent.selection.end,
              };
            }}
            onKeyPress={(event) => {
              // Enter sends on a hardware keyboard; Shift+Enter is a new line.
              if (enterSends(event.nativeEvent as never, finePointer)) {
                event.preventDefault();
                if (canSend) onSubmit(input);
              }
            }}
            placeholder="What do you do?"
            placeholderTextColor={colors.textDim}
            ref={inputRef}
            style={styles.composerInput}
            value={input}
          />
          {canWait ? (
            <Pressable
              accessibilityHint="The scene goes on without you acting"
              accessibilityLabel="Wait"
              accessibilityRole="button"
              onPress={() => onSubmit(WAIT_INPUT)}
              style={({ pressed }) => [styles.waitButton, pressed && styles.pressed]}
            >
              <Text style={styles.waitLabel}>Wait</Text>
            </Pressable>
          ) : (
          <Pressable
            accessibilityHint={isNarrating ? 'Keeps what is written so far' : undefined}
            accessibilityLabel={isNarrating ? 'Stop the reply' : 'Send'}
            accessibilityRole="button"
            disabled={!isNarrating && !canSend}
            onPress={() => (isNarrating ? onStop() : onSubmit(input))}
            style={({ pressed }) => [
              styles.sendButton,
              !isNarrating && !canSend && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            {isNarrating ? (
              <Square color={colors.onAccent} fill={colors.onAccent} size={14} strokeWidth={2.4} />
            ) : (
              <ArrowUp color={colors.onAccent} size={19} strokeWidth={2.4} />
            )}
          </Pressable>
          )}
        </View>
      </>
    );
  })
);

export default function StoryScreen() {
  const {
    db,
    apiKey,
    setApiKey,
    error,
    isNarrating,
    openElsewhere,
    isProcessing,
    pendingMemoryCount,
    retryPendingMemory,
    pendingAction,
    stopNarration,
    returnedAction,
    sendTurn,
    regenerate,
    undoLastTurn,
    redoLastUndo,
    attachImage,
    correctTurnTime,
    updateSettings,
    setSceneMode,
  } = useGame();
  const { showToast } = useToast();

  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [paintStage, setPaintStage] = useState<PaintStage | null>(null);
  const [viewer, setViewer] = useState<{ uri: string; logId?: string } | null>(null);
  /** The viewer turns the 16:9 image on its side to fill an upright phone (audit 11c). */
  const [viewerTurned, setViewerTurned] = useState<boolean | null>(null);
  const [viewerBox, setViewerBox] = useState<{ width: number; height: number } | null>(null);
  const viewerTurnedShared = useSharedValue(0);
  const selectedImage = viewer?.uri ?? null;
  const windowSize = useWindowDimensions();
  // Upright phone: open turned, unless you turned it back (audit 11c).
  const turned = viewerTurned ?? turnByDefault(windowSize.width, windowSize.height);
  useEffect(() => {
    viewerTurnedShared.value = turned ? 1 : 0;
  }, [turned, viewerTurnedShared]);
  /** The shot menu (long-press Paint): a forced shot and how many takes. */
  const [shotMenuOpen, setShotMenuOpen] = useState(false);
  /** The reply the shot menu paints: an older one picked from its long-press menu, or the latest. */
  const [shotTarget, setShotTarget] = useState<string | null>(null);
  /** The long-press menu on a reply: paint that moment, or copy it (audit 11c). */
  const [replyMenu, setReplyMenu] = useState<StoryMessage | null>(null);
  /** Which reply is being painted, for the stages under it. */
  const [paintingId, setPaintingId] = useState<string | null>(null);
  const [shotChip, setShotChip] = useState<ShotChip>('auto');
  /** Two takes waiting for you to keep one. */
  const [pendingTakes, setPendingTakes] = useState<{ turnId: string; takes: PaintedTake[] } | null>(null);
  /** The retouch field in the viewer, and an edited version waiting to be kept. */
  const [retouchText, setRetouchText] = useState<string | null>(null);
  const [retouchDraft, setRetouchDraft] = useState<PaintedTake | null>(null);
  const [isRetouching, setIsRetouching] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  // Let time pass (audit 4.4): how long, and what you do meanwhile.
  const [skipOpen, setSkipOpen] = useState(false);
  const [skipSpan, setSkipSpan] = useState<string>('1 month');
  const [skipWhat, setSkipWhat] = useState('');
  const [timeTarget, setTimeTarget] = useState<{ id: string; seconds: number } | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [customUnit, setCustomUnit] = useState<TimeUnit>('min');
  const [modeOpen, setModeOpen] = useState(false);
  /** Retry, Undo, Edit and Copy, behind the ⋯ under the latest reply (audit 11a). */
  const [moreOpen, setMoreOpen] = useState(false);
  /** The turn being narrated steps into a memory (the Remember chip). */
  const [enteringMemory, setEnteringMemory] = useState(false);
  const imageScale = useSharedValue(1);
  const imageTranslateX = useSharedValue(0);
  const imageTranslateY = useSharedValue(0);
  const gestureStartScale = useSharedValue(1);
  const gestureStartTranslateX = useSharedValue(0);
  const gestureStartTranslateY = useSharedValue(0);
  const insets = useSafeAreaInsets();
  const reading = useReadingType();
  const scrollRef = useRef<ScrollView | null>(null);
  const composerRef = useRef<ComposerHandle | null>(null);
  const lastActionRef = useRef('');

  // Each turn's message is built once and reused while its log entry is
  // unchanged, so the memoised rows below keep their props (audit 9).
  const messageCacheRef = useRef(new Map<string, { entry: RawLogEntry; opens: boolean; message: StoryMessage }>());

  const messages = useMemo<StoryMessage[]>(() => {
    if (!db) {
      return [];
    }

    const story = db.rawLog.filter((message) => message.kind === 'story');
    const cache = messageCacheRef.current;
    const next = new Map<string, { entry: RawLogEntry; opens: boolean; message: StoryMessage }>();

    const built = story.map((entry, index) => {
      const memory = entry.flashback;
      // A flashback opens with its date line, so it is never taken for the present.
      const opens = Boolean(memory && story[index - 1]?.flashback?.id !== memory.id);
      const cached = cache.get(entry.id);

      if (cached && cached.entry === entry && cached.opens === opens) {
        next.set(entry.id, cached);
        return cached.message;
      }

      const record = memory ? FLASHBACK_BY_ID[memory.id] : undefined;
      // Replies are cleaned of stray JSON when saved (and old saves on load), not here.
      const message: StoryMessage = {
        id: entry.id,
        role: entry.role === 'user' ? 'user' : 'assistant',
        content: entry.content,
        image: entry.image ?? null,
        ...(entry.role === 'assistant' && entry.imageWorthy ? { imageWorthy: true } : {}),
        elapsedSeconds: entry.role === 'assistant' ? entry.elapsedSeconds : undefined,
        fightOptions: entry.role === 'assistant' ? entry.fightOptions : undefined,
        ...(memory ? { memory: true } : {}),
        ...(opens && memory
          ? { memoryHeading: { title: record?.title ?? 'A memory', dateLine: flashbackDateLine(db, memory.date) } }
          : {}),
      };
      next.set(entry.id, { entry, opens, message });
      return message;
    });

    messageCacheRef.current = next;
    return built;
  }, [db]);

  const eagerImages = useMemo(
    () => new Set(messages.filter((message) => message.image).slice(-EAGER_SCENE_IMAGES).map((message) => message.id)),
    [messages]
  );

  // Only the latest turns are drawn; "Show earlier" opens more (audit 9).
  const [visibleCount, setVisibleCount] = useState(VISIBLE_TURNS * 2);
  const hiddenCount = Math.max(0, messages.length - visibleCount);
  const visibleMessages = useMemo(() => messages.slice(hiddenCount), [messages, hiddenCount]);
  const scrollYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const anchorRef = useRef<{ height: number; y: number } | null>(null);
  const viewportHeightRef = useRef(0);
  /** Jump to latest shows once you are well above the newest turn (audit 10). */
  const [farFromEnd, setFarFromEnd] = useState(false);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  /** Where each chapter's opening entry sits in the scroll content, and a jump waiting for it. */
  const chapterYRef = useRef(new Map<string, number>());
  const chapterNodeRef = useRef(new Map<string, unknown>());
  const pendingJumpRef = useRef<string | null>(null);

  const updateFarFromEnd = useCallback(() => {
    const viewport = viewportHeightRef.current;
    const distance = contentHeightRef.current - scrollYRef.current - viewport;
    const far = viewport > 0 && distance > Math.max(600, viewport * 1.5);
    setFarFromEnd((current) => (current === far ? current : far));
  }, []);

  const jumps = useMemo(() => (db ? chapterJumps(db) : []), [db]);
  const jumpIds = useMemo(() => new Set(jumps.map((jump) => jump.entryId)), [jumps]);

  const scrollToChapter = useCallback((entryId: string) => {
    requestAnimationFrame(() => {
      // On the web the anchor is a DOM node: ask the browser where it is now,
      // since rows above it may have changed height since it was laid out.
      const node = chapterNodeRef.current.get(entryId) as { scrollIntoView?: (options: object) => void } | undefined;
      if (node?.scrollIntoView) {
        node.scrollIntoView({ block: 'start' });
        return;
      }

      const y = chapterYRef.current.get(entryId);
      if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.sm), animated: false });
    });
  }, []);

  const performJump = useCallback(
    (entryId: string) => {
      const need = db ? entriesToShow(db, entryId) : null;
      if (need === null) return;

      anchorRef.current = null;
      if (need > visibleCount) {
        // Open the window far enough first; the anchor scrolls once it is laid out.
        pendingJumpRef.current = entryId;
        setVisibleCount(need + (need % 2));
        return;
      }

      if (chapterYRef.current.has(entryId)) scrollToChapter(entryId);
      else pendingJumpRef.current = entryId;
    },
    [db, scrollToChapter, visibleCount]
  );

  // The jump waits for the chapter sheet to close: closing it gives focus back
  // to the "Chapter N" label at the top, and the browser scrolls to it.
  const queuedJumpRef = useRef<string | null>(null);
  const runQueuedJump = useCallback(() => {
    const entryId = queuedJumpRef.current;
    queuedJumpRef.current = null;
    if (entryId) requestAnimationFrame(() => performJump(entryId));
  }, [performJump]);

  const jumpToChapter = useCallback(
    (entryId: string) => {
      queuedJumpRef.current = entryId;
      setChaptersOpen(false);
      // onDismiss does not fire everywhere (Android); this catches it.
      setTimeout(runQueuedJump, 600);
    },
    [runQueuedJump]
  );

  const onChapterAnchor = useCallback(
    (entryId: string, y: number) => {
      chapterYRef.current.set(entryId, y);
      if (pendingJumpRef.current === entryId) {
        pendingJumpRef.current = null;
        scrollToChapter(entryId);
      }
    },
    [scrollToChapter]
  );

  const jumpToLatest = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const showEarlier = useCallback(() => {
    // Keep the turn you were reading where it is when earlier turns appear above it.
    anchorRef.current = { height: contentHeightRef.current, y: scrollYRef.current };
    setVisibleCount((count) => count + VISIBLE_TURNS * 2);
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    const anchor = anchorRef.current;
    contentHeightRef.current = height;

    if (anchor && height > anchor.height) {
      anchorRef.current = null;
      scrollRef.current?.scrollTo({ y: anchor.y + (height - anchor.height), animated: false });
    }

    updateFarFromEnd();
  }, [updateFarFromEnd]);

  // The story only scrolls itself at two moments: when a save is opened (jump
  // to the latest turn) and when you send an action (show it and where the
  // reply will start). While the narrator streams, the screen stays wherever
  // you put it, so you can scroll up and down freely.
  const slotId = db?.meta.slotId ?? null;
  const scrolledSlotRef = useRef<string | null>(null);

  // Where you left off (audit 10): when a story opens, or the app comes back,
  // a real day or more after its last turn. Gone with your first action.
  const [leftOff, setLeftOff] = useState<LeftOff | null>(null);
  const leftOffSlotRef = useRef<string | null>(null);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    if (!db || !slotId || leftOffSlotRef.current === slotId) return;
    leftOffSlotRef.current = slotId;
    setLeftOff(whereYouLeftOff(db));
  }, [db, slotId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      const current = dbRef.current;
      if (next === 'active' && current) {
        setLeftOff((shown) => shown ?? whereYouLeftOff(current));
      }
    });
    return () => subscription.remove();
  }, []);

  // A story opens on its latest turns.
  useEffect(() => {
    setVisibleCount(VISIBLE_TURNS * 2);
  }, [slotId]);

  useEffect(() => {
    if (!slotId || messages.length === 0 || scrolledSlotRef.current === slotId) {
      return;
    }

    scrolledSlotRef.current = slotId;
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [slotId, messages.length]);

  useEffect(() => {
    if (!isNarrating) {
      return;
    }

    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [isNarrating]);

  const submit = useCallback(
    async (value: string, remember?: string) => {
      const action = value.trim();

      if (!action || isNarrating) {
        return;
      }

      lastActionRef.current = action;
      composerRef.current?.clear();
      setLeftOff(null);
      setEnteringMemory(Boolean(remember));

      try {
        await sendTurn(action, remember ? { remember } : undefined);
      } finally {
        setEnteringMemory(false);
      }
    },
    [isNarrating, sendTurn]
  );

  const resetImageZoom = useCallback(() => {
    imageScale.value = withTiming(1);
    imageTranslateX.value = withTiming(0);
    imageTranslateY.value = withTiming(0);
  }, [imageScale, imageTranslateX, imageTranslateY]);

  const imagePinchGesture = Gesture.Pinch()
    .onBegin(() => {
      gestureStartScale.value = imageScale.value;
    })
    .onUpdate((event) => {
      const nextScale = gestureStartScale.value * event.scale;
      imageScale.value = Math.min(5, Math.max(1, nextScale));
    });

  const imagePanGesture = Gesture.Pan()
    .onBegin(() => {
      gestureStartTranslateX.value = imageTranslateX.value;
      gestureStartTranslateY.value = imageTranslateY.value;
    })
    .onUpdate((event) => {
      if (imageScale.value <= 1) {
        return;
      }

      const drag = viewerTurnedShared.value
        ? dragInTurnedFrame(event.translationX, event.translationY)
        : { x: event.translationX, y: event.translationY };
      imageTranslateX.value = gestureStartTranslateX.value + drag.x;
      imageTranslateY.value = gestureStartTranslateY.value + drag.y;
    });

  const imageDoubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      imageScale.value = withTiming(1);
      imageTranslateX.value = withTiming(0);
      imageTranslateY.value = withTiming(0);
    });

  const fullscreenImageStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: viewerTurnedShared.value ? '90deg' : '0deg' },
      { translateX: imageTranslateX.value },
      { translateY: imageTranslateY.value },
      { scale: imageScale.value },
    ],
  }));

  const generateSceneImage = useCallback(
    async (chip: ShotChip = 'auto', twoTakes = Boolean(db?.settings.imageTwoTakes), replyId?: string) => {
      if (!db || isGeneratingImage || !apiKey) {
        return;
      }

      setIsGeneratingImage(true);
      setPaintingId(replyId ?? null);

      try {
        const caps = await ensureImageCaps(db, updateSettings);
        const result = await paintScene({
          apiKey,
          db,
          caps,
          chip,
          takes: twoTakes ? 2 : 1,
          onWarning: (message) => showToast(message, 'error'),
          onStage: setPaintStage,
          ...(replyId ? { replyId } : {}),
        });

        if (result.takes.length > 1) {
          setPendingTakes(result);
          return;
        }

        const take = result.takes[0];
        await attachImage(result.turnId, take.dataUri, take.meta);

        if (take.meta.mightBeOff) {
          showToast('This one might be off: who does what may be swapped. Retouch or paint again.', 'error');
        }
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'The scene wouldn’t paint. Try again.';
        showToast(message, 'error');
      } finally {
        setIsGeneratingImage(false);
        setPaintStage(null);
        setPaintingId(null);
      }
    },
    [apiKey, attachImage, db, isGeneratingImage, showToast, updateSettings]
  );

  const keepTake = useCallback(
    async (take: PaintedTake) => {
      const pending = pendingTakes;
      setPendingTakes(null);

      if (pending) {
        await attachImage(pending.turnId, take.dataUri, take.meta);
      }
    },
    [attachImage, pendingTakes]
  );

  const retouch = useCallback(async () => {
    const tweak = retouchText?.trim();

    if (!db || !apiKey || !viewer?.logId || !tweak || isRetouching) {
      return;
    }

    setIsRetouching(true);

    try {
      const caps = await ensureImageCaps(db, updateSettings);
      const draft = await retouchSceneImage({
        apiKey,
        db,
        caps,
        logId: viewer.logId,
        image: viewer.uri,
        tweak,
      });
      setRetouchDraft(draft);
      setRetouchText(null);
    } catch (caught) {
      showToast(caught instanceof Error ? caught.message : 'The retouch didn’t work. Try again.', 'error');
    } finally {
      setIsRetouching(false);
    }
  }, [apiKey, db, isRetouching, retouchText, showToast, updateSettings, viewer]);

  const keepRetouch = useCallback(async () => {
    const draft = retouchDraft;
    const logId = viewer?.logId;

    if (!draft || !logId) {
      return;
    }

    setRetouchDraft(null);
    setViewer({ uri: draft.dataUri, logId });
    await attachImage(logId, draft.dataUri, draft.meta);
  }, [attachImage, retouchDraft, viewer]);

  // Retry and Undo need the snapshot taken before the turn. An imported save
  // starts without one, and undo can use them up.
  const canUndo = (db?.snapshots.length ?? 0) > 0;

  const undo = useCallback(async (edit = false) => {
    const action = edit && db ? lastPlayerAction(db) : null;

    if (!(await undoLastTurn())) {
      return;
    }

    if (action) {
      // Edit and resend: the turn is undone and your action is back in the box.
      composerRef.current?.set(action);
    }

    showToast(action ? 'Change your action and send it again.' : 'Turn undone.', 'info', {
      durationMs: REDO_WINDOW_MS,
      action: {
        label: 'Redo',
        onPress: () => {
          void redoLastUndo().then((done) => {
            if (!done) {
              showToast('That turn can’t come back now.', 'info');
            } else if (action) {
              // The turn is back, so the action in the box would be sent twice (audit 10.2).
              composerRef.current?.clearIf(action.trim());
            }
          });
        },
      },
    });
  }, [db, redoLastUndo, showToast, undoLastTurn]);

  const editLastAction = useCallback(() => void undo(true), [undo]);

  const copyReply = useCallback(
    (content: string) => {
      void copyText(copyableText(content)).then((done) => showToast(done ? 'Copied.' : 'Copying isn’t allowed here.', 'info'));
    },
    [showToast]
  );

  const retry = useCallback(async () => {
    const action = lastActionRef.current;

    if (action) {
      // The failed action was put back in the box; sending it empties the box again.
      composerRef.current?.clearIf(action);
      await sendTurn(action);
      return;
    }

    await regenerate();
  }, [regenerate, sendTurn]);

  const openImage = useCallback(
    (uri: string, logId?: string) => {
      resetImageZoom();
      setRetouchText(null);
      setRetouchDraft(null);
      setViewer({ uri, logId });
    },
    [resetImageZoom]
  );

  const closeViewer = useCallback(() => {
    resetImageZoom();
    setRetouchText(null);
    setRetouchDraft(null);
    setViewer(null);
  }, [resetImageZoom]);

  const openTimeSheet = useCallback((id: string, seconds: number) => {
    setCustomAmount('');
    setCustomUnit(seconds >= 86400 ? 'd' : seconds >= 3600 ? 'h' : 'min');
    setTimeTarget({ id, seconds });
  }, []);

  const openModeSheet = useCallback(() => setModeOpen(true), []);
  const submitTyped = useCallback((value: string) => void submit(value), [submit]);

  if (!db) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.loadingText}>Loading your story…</Text>
        </SafeAreaView>
      </View>
    );
  }

  const applyTime = (seconds: number) => {
    const target = timeTarget;
    setTimeTarget(null);

    if (target && Math.round(seconds) !== target.seconds) {
      void correctTurnTime(target.id, seconds);
    }
  };

  const customSeconds = (() => {
    const amount = Number.parseFloat(customAmount.replace(',', '.'));
    return Number.isFinite(amount) && amount >= 0 ? amount * UNIT_SECONDS[customUnit] : null;
  })();

  const storyStarted = messages.length > 0;
  // While a memory plays, the header shows its clock, place and weather.
  const playing = activeFlashback(db);
  const state = (playing ? flashbackView(db) ?? db : db).state;
  const liveMemory = Boolean(playing) || enteringMemory;
  const remember = !isNarrating ? rememberChip(db, [...messages].reverse().find((m) => m.role === 'assistant')?.id) : null;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id;
  const markers = storyMarkers(db);
  const lastReply = messages.find((message) => message.id === lastAssistantId) ?? null;
  const night = ['night', 'evening'].includes(timeOfDayOf(state.inStoryDate));
  const weather = db ? currentWeather(playing ? flashbackView(db) ?? db : db) : { condition: 'clear' as const, seasonLabel: '', night, region: 'fire' as const };
  const override = state.sceneMode?.override ?? null;
  const latestFightOptions = messages.find((message) => message.id === lastAssistantId)?.fightOptions ?? NO_OPTIONS;
  const location = localizePlaceNames(state.location);
  // Let time pass is closed in a fight (audit 4.9); the sheet says why.
  const skipBlocked = db && !playing ? timeSkipBlocked(db) : null;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <Wordmark compact />
          <Pressable
            accessibilityLabel="Show your status"
            accessibilityRole="button"
            onPress={() => setStatusOpen(true)}
            style={({ pressed }) => [styles.statusButton, pressed && styles.pressed]}
          >
            <View style={styles.statusCopy}>
              <Text numberOfLines={1} style={[styles.statusTime, playing && styles.memoryHeader]}>
                {playing ? `Memory · Year ${state.inStoryDate.year} · ` : ''}
                {formatClock(state.inStoryDate)} · {formatDayMonth(state.inStoryDate)}
              </Text>
              <Text numberOfLines={1} style={styles.statusPlace}>
                {location}
              </Text>
            </View>
            <WeatherIcon color={colors.textMuted} condition={weather.condition} night={night} />
          </Pressable>
        </View>

        <View style={styles.storyArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={onContentSizeChange}
          onLayout={(event) => {
            viewportHeightRef.current = event.nativeEvent.layout.height;
            updateFarFromEnd();
          }}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
            updateFarFromEnd();
          }}
          ref={scrollRef}
          scrollEventThrottle={100}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            accessibilityHint={jumps.length > 1 ? 'Opens the list of chapters' : undefined}
            accessibilityLabel={`Chapter ${db.state.chapter}. Chapters`}
            accessibilityRole="button"
            disabled={jumps.length === 0}
            hitSlop={8}
            onPress={() => setChaptersOpen(true)}
            style={({ pressed }) => [styles.chapterLabel, pressed && styles.pressed]}
          >
            <Text numberOfLines={1} style={[type.sectionLabel, styles.chapterLabelText]}>
              Chapter {db.state.chapter} · {db.state.scene || db.state.chapterTitle}
            </Text>
            {jumps.length > 0 ? <ChevronDown color={colors.textMeta} size={14} strokeWidth={2.2} /> : null}
          </Pressable>

          {!storyStarted ? (
            <View style={styles.seed}>
              <Text style={styles.seedTitle}>The rain hasn’t stopped.</Text>
              <Text style={reading.prose}>
                Days ago Itachi told you he would kill the clan. You fought him, you lost, and he
                sent you here to wait. Now you crouch in the forest outside the Leaf, soaked to the
                bone, not knowing if he went through with it — or who is still alive. He promised you
                an answer. Every drop sounds like footsteps.
              </Text>
              {!apiKey ? <FirstRunCard onSave={setApiKey} /> : null}
              <AppButton
                disabled={!apiKey}
                label={apiKey ? 'Wait for him' : 'Begin: wait for him'}
                onPress={() => void submit('*You wait in the rain for Itachi.*')}
                style={styles.seedButton}
              />
            </View>
          ) : null}

          {hiddenCount > 0 ? (
            <Pressable
              accessibilityLabel={`Show earlier turns, ${Math.ceil(hiddenCount / 2)} more`}
              accessibilityRole="button"
              onPress={showEarlier}
              style={({ pressed }) => [styles.showEarlier, pressed && styles.pressed]}
            >
              <Text style={styles.showEarlierLabel}>Show earlier</Text>
            </Pressable>
          ) : null}

          {visibleMessages.map((message) => (
            <Fragment key={message.id}>
            {jumpIds.has(message.id) ? (
              <View
                key={`${message.id}:${hiddenCount}`}
                onLayout={(event) => onChapterAnchor(message.id, event.nativeEvent.layout.y)}
                ref={(node) => {
                  if (node) chapterNodeRef.current.set(message.id, node);
                  else chapterNodeRef.current.delete(message.id);
                }}
                style={styles.chapterAnchor}
              />
            ) : null}
            {markers.get(message.id) ? <StoryMarkerView marker={markers.get(message.id)!} /> : null}
            {leftOff && message.id === lastAssistantId && !isNarrating ? <LeftOffCard leftOff={leftOff} /> : null}
            <MessageRow
              eager={eagerImages.has(message.id)}
              footer={
                message.id === lastAssistantId && !isNarrating ? (
                  <View style={styles.inlineActions}>
                    {message.elapsedSeconds !== undefined ? (
                      <TimeChip
                        onPress={() => openTimeSheet(message.id, message.elapsedSeconds ?? 0)}
                        seconds={message.elapsedSeconds}
                      />
                    ) : null}
                    {remember ? (
                      <InlineAction
                        disabled={!apiKey}
                        icon={<History color={colors.memoryAccent} size={15} strokeWidth={2} />}
                        label="Remember"
                        onPress={() => void submit(REMEMBER_INPUT, remember.id)}
                      />
                    ) : null}
                    <InlineAction
                      accessibilityHint="Long-press to pick the shot"
                      busy={isGeneratingImage}
                      disabled={!apiKey}
                      glow={Boolean(message.imageWorthy && !message.image)}
                      icon={
                        message.imageWorthy && !message.image ? (
                          <Paintbrush color={colors.accent} size={15} strokeWidth={2} />
                        ) : (
                          <ImageIcon color={colors.textMuted} size={15} strokeWidth={2} />
                        )
                      }
                      label="Paint"
                      onLongPress={() => {
                        setShotTarget(null);
                        setShotMenuOpen(true);
                      }}
                      onPress={() => void generateSceneImage()}
                    />
                    <Pressable
                      accessibilityLabel="More: retry, undo, edit, copy"
                      accessibilityRole="button"
                      hitSlop={4}
                      onPress={() => setMoreOpen(true)}
                      style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
                    >
                      <MoreHorizontal color={colors.textMuted} size={18} strokeWidth={2} />
                    </Pressable>
                  </View>
                ) : undefined
              }
              key={message.id}
              message={message}
              onReplyMenu={message.role === 'assistant' && !isNarrating ? setReplyMenu : undefined}
              onEdit={message.id === lastUserId && canUndo && !isNarrating ? editLastAction : undefined}
              onOpenImage={openImage}
              onTimePress={openTimeSheet}
            />
            {message.id === (paintingId ?? lastAssistantId) && paintStage ? <PaintingStages stage={paintStage} /> : null}
            </Fragment>
          ))}

          {isNarrating ? <LiveReply db={db} memory={liveMemory} pendingAction={pendingAction} /> : null}

          {openElsewhere ? (
            <ListCard>
              <ListRow
                body="Close it to keep playing here. This tab only reads your story until then, and picks up where the other one left off."
                leading={<CircleAlert color={colors.warning} size={18} strokeWidth={2} />}
                title="Kan is open in another tab"
              />
            </ListCard>
          ) : null}

          {error ? (
            <ListCard>
              <ListRow
                body={error}
                leading={<CircleAlert color={colors.danger} size={18} strokeWidth={2} />}
                title="The story lost its thread"
                trailing={
                  <AppButton
                    compact
                    label="Retry"
                    onPress={() => void retry()}
                    variant="secondary"
                  />
                }
              />
            </ListCard>
          ) : null}

          {!apiKey && storyStarted ? <FirstRunCard onSave={setApiKey} /> : null}
        </ScrollView>
          {farFromEnd ? (
            <Pressable
              accessibilityLabel="Jump to latest"
              accessibilityRole="button"
              onPress={jumpToLatest}
              style={({ pressed }) => [styles.jumpLatest, pressed && styles.pressed]}
            >
              <ArrowDown color={colors.text} size={16} strokeWidth={2.2} />
              <Text style={styles.jumpLatestLabel}>Latest</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.composerShell}>
          {isProcessing ? (
            <View style={styles.processingRow}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={type.rowMeta}>Memory updating…</Text>
            </View>
          ) : pendingMemoryCount > 0 ? (
            <View
              accessibilityLabel={`Memory pending: ${pendingMemoryCount} ${
                pendingMemoryCount === 1 ? 'step' : 'steps'
              } didn't finish. Your story is saved.`}
              style={styles.processingRow}
            >
              <CircleAlert color={colors.warning} size={14} strokeWidth={2.2} />
              <Text style={[type.rowMeta, styles.pendingLabel]}>
                Memory pending{pendingMemoryCount > 1 ? ` · ${pendingMemoryCount}` : ''}
              </Text>
              <Pressable
                accessibilityLabel="Retry memory update"
                accessibilityRole="button"
                disabled={isNarrating}
                hitSlop={8}
                onPress={() => void retryPendingMemory()}
                style={({ pressed }) => [
                  styles.pendingRetry,
                  pressed && styles.pressed,
                  isNarrating && styles.disabled,
                ]}
              >
                <RotateCcw color={colors.textMuted} size={12} strokeWidth={2.2} />
                <Text style={styles.inlineActionLabel}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          <Composer
            db={db}
            fightOptions={latestFightOptions}
            isNarrating={isNarrating}
            onOpenMode={openModeSheet}
            onStop={stopNarration}
            onSubmit={submitTyped}
            ref={composerRef}
            returnedAction={returnedAction}
            storyStarted={storyStarted}
          />
        </View>
      </SafeAreaView>

      <Modal
        animationType="fade"
        onRequestClose={() => setModeOpen(false)}
        transparent
        visible={modeOpen}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel="Close scene mode"
            onPress={() => setModeOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <SectionLabel first>How scenes play</SectionLabel>
            <ListCard>
              {MODE_CHOICES.map((choice) => {
                const selected = (override ?? null) === choice.value;

                return (
                  <ListRow
                    body={choice.body}
                    key={choice.title}
                    onPress={() => {
                      setModeOpen(false);
                      void setSceneMode(choice.value);
                    }}
                    title={choice.title}
                    trailing={
                      selected ? <View style={[styles.modeDot, styles.modeDotSelected]} /> : undefined
                    }
                  />
                );
              })}
            </ListCard>
            <AppButton
              label="Close"
              onPress={() => setModeOpen(false)}
              style={styles.sheetClose}
              variant="secondary"
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setStatusOpen(false)}
        transparent
        visible={statusOpen}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel="Close status"
            onPress={() => setStatusOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <SectionLabel first>Right now</SectionLabel>
            <ListCard>
              <ListRow
                meta={formatStoryDate(
                  state.inStoryDate,
                  state.player.birthday,
                  state.player.birthYear
                )}
                title={location}
              />
              <ListRow meta="Mood" title={state.mood} />
              {db ? (
                <ListRow
                  meta={`Weather · ${weather.seasonLabel}`}
                  title={capitalize(weatherPhrase(weather))}
                />
              ) : null}
              {db && companionsOf(db).length > 0 ? (
                <ListRow
                  meta="Travelling with you"
                  title={companionsOf(db).map((entity) => displayName(db, entity)).join(', ')}
                />
              ) : null}
              <ListRow meta={`Chapter ${state.chapter}`} title={state.scene || state.chapterTitle || `Chapter ${state.chapter}`} />
            </ListCard>
            {skipBlocked ? (
              <>
                <AppButton
                  disabled
                  label="Let time pass"
                  onPress={() => undefined}
                  style={styles.sheetClose}
                  variant="secondary"
                />
                <Text style={type.rowBody}>{skipBlocked}</Text>
              </>
            ) : skipOpen ? (
              <>
                <SectionLabel>Let time pass</SectionLabel>
                <Text style={type.rowBody}>
                  How long, and what you do meanwhile. It stops early if something of your own is about to begin.
                </Text>
                <FilterPills onChange={setSkipSpan} options={SKIP_SPANS} value={skipSpan} />
                <TextInput
                  accessibilityLabel="What you do meanwhile"
                  multiline
                  onChangeText={setSkipWhat}
                  placeholder="You train with Itachi, out of sight of the patrols."
                  placeholderTextColor={colors.textDim}
                  style={styles.skipInput}
                  value={skipWhat}
                />
                <AppButton
                  disabled={isNarrating}
                  label="Let it pass"
                  onPress={() => {
                    const what = skipWhat.trim().replace(/^\*+|\*+$/g, '');
                    setSkipOpen(false);
                    setStatusOpen(false);
                    setSkipWhat('');
                    void submit(`*Time passes: ${skipSpan}. ${what || 'You keep to yourself and let the days go by.'}*`);
                  }}
                />
              </>
            ) : (
              <AppButton
                disabled={isNarrating}
                label="Let time pass"
                onPress={() => setSkipOpen(true)}
                style={styles.sheetClose}
                variant="secondary"
              />
            )}
            <AppButton
              label="Close"
              onPress={() => {
                setSkipOpen(false);
                setStatusOpen(false);
              }}
              style={styles.sheetClose}
              variant="secondary"
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setTimeTarget(null)}
        transparent
        visible={Boolean(timeTarget)}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel="Close time"
            onPress={() => setTimeTarget(null)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <SectionLabel first>How long did this take?</SectionLabel>
            <Text style={type.rowBody}>
              {timeTarget ? `Now ${formatElapsed(timeTarget.seconds).slice(1)}. ` : ''}
              Your clock moves by the difference.
            </Text>
            <FilterPills
              onChange={(value) => {
                const preset = TIME_PRESETS.find((item) => item.value === value);
                if (preset) applyTime(preset.seconds);
              }}
              options={TIME_PRESETS}
              value={
                (TIME_PRESETS.find((item) => item.seconds === timeTarget?.seconds)?.value ??
                  '') as string
              }
            />
            <View style={styles.timeCustomRow}>
              <TextInput
                accessibilityLabel="Custom amount"
                inputMode="decimal"
                keyboardType="decimal-pad"
                onChangeText={setCustomAmount}
                onSubmitEditing={() => {
                  if (customSeconds !== null) applyTime(customSeconds);
                }}
                placeholder="Amount"
                placeholderTextColor={colors.textDim}
                style={styles.timeCustomInput}
                value={customAmount}
              />
              <FilterPills
                onChange={setCustomUnit}
                options={[
                  { value: 'min', label: 'min' },
                  { value: 'h', label: 'hours' },
                  { value: 'd', label: 'days' },
                ]}
                value={customUnit}
              />
            </View>
            <AppButton
              disabled={customSeconds === null}
              label="Set time"
              onPress={() => {
                if (customSeconds !== null) applyTime(customSeconds);
              }}
            />
            <AppButton
              label="Cancel"
              onPress={() => setTimeTarget(null)}
              variant="secondary"
            />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={closeViewer}
        transparent
        visible={Boolean(selectedImage)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.imageOverlay,
            { paddingBottom: Math.max(insets.bottom + (retouchText !== null || retouchDraft ? 150 : 80), spacing.xxxl) },
          ]}
        >
          <Pressable
            accessibilityLabel="Close image"
            onPress={closeViewer}
            style={StyleSheet.absoluteFill}
          />

          {selectedImage ? (
            <>
              <GestureDetector
                gesture={Gesture.Simultaneous(
                  imagePinchGesture,
                  imagePanGesture,
                  imageDoubleTapGesture
                )}
              >
                <View
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    setViewerBox({ width, height });
                  }}
                  style={styles.fullscreenFrame}
                >
                  <Animated.Image
                    accessibilityLabel={retouchDraft ? 'Retouched scene, not kept yet' : 'Generated story scene'}
                    resizeMode="contain"
                    source={{ uri: retouchDraft?.dataUri ?? selectedImage }}
                    style={[
                      turned && viewerBox ? turnedBox(viewerBox.width, viewerBox.height) : styles.fullscreenImage,
                      fullscreenImageStyle,
                    ]}
                  />
                </View>
              </GestureDetector>

              <View
                style={[styles.imageActionsColumn, { bottom: Math.max(insets.bottom + 20, spacing.xl) }]}
              >
                {retouchDraft ? (
                  <>
                    <Text style={styles.retouchNote}>Retouched: “{retouchDraft.meta.tweak}”. Keep it?</Text>
                    <View style={styles.imageActionsRow}>
                      <AppButton
                        compact
                        label="Keep"
                        onPress={() => void keepRetouch()}
                        style={styles.imageActionButton}
                      />
                      <AppButton
                        compact
                        label="Discard"
                        onPress={() => setRetouchDraft(null)}
                        style={styles.imageActionButton}
                        variant="secondary"
                      />
                    </View>
                  </>
                ) : retouchText !== null ? (
                  <>
                    <TextInput
                      accessibilityLabel="What to change"
                      autoFocus
                      editable={!isRetouching}
                      onChangeText={setRetouchText}
                      onSubmitEditing={() => void retouch()}
                      placeholder="Make him angrier, more fire, night not day…"
                      placeholderTextColor={colors.textDim}
                      returnKeyType="send"
                      style={styles.retouchInput}
                      value={retouchText}
                    />
                    <View style={styles.imageActionsRow}>
                      <AppButton
                        compact
                        disabled={!retouchText.trim() || isRetouching}
                        icon={isRetouching ? <ActivityIndicator color={colors.onAccent} size="small" /> : undefined}
                        label={isRetouching ? 'Retouching…' : 'Retouch'}
                        onPress={() => void retouch()}
                        style={styles.imageActionButton}
                      />
                      <AppButton
                        compact
                        disabled={isRetouching}
                        label="Cancel"
                        onPress={() => setRetouchText(null)}
                        style={styles.imageActionButton}
                        variant="secondary"
                      />
                    </View>
                  </>
                ) : (
                  <View style={styles.imageActionsRow}>
                    <AppButton
                      compact
                      icon={<Download color={colors.onAccent} size={15} strokeWidth={2} />}
                      label="Download"
                      onPress={() => {
                        downloadImage(`kan-scene-${Date.now()}.jpg`, selectedImage);
                        resetImageZoom();
                      }}
                      style={styles.imageActionButton}
                    />
                    {viewer?.logId && apiKey ? (
                      <AppButton
                        compact
                        icon={<Wand2 color={colors.text} size={15} strokeWidth={2} />}
                        label="Retouch"
                        onPress={() => {
                          resetImageZoom();
                          setRetouchText('');
                        }}
                        style={styles.imageActionButton}
                        variant="secondary"
                      />
                    ) : null}
                    <Pressable
                      accessibilityLabel={turned ? 'Turn the picture upright' : 'Turn the picture on its side to fill the screen'}
                      accessibilityRole="button"
                      hitSlop={4}
                      onPress={() => {
                        resetImageZoom();
                        setViewerTurned(!turned);
                      }}
                      style={({ pressed }) => [styles.turnButton, turned && styles.turnButtonOn, pressed && styles.pressed]}
                    >
                      <RotateCw color={turned ? colors.accent : colors.text} size={18} strokeWidth={2} />
                    </Pressable>
                    <AppButton
                      compact
                      icon={<X color={colors.text} size={15} strokeWidth={2} />}
                      label="Close"
                      onPress={closeViewer}
                      style={styles.imageActionButton}
                      variant="secondary"
                    />
                  </View>
                )}
              </View>
            </>
          ) : null}
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onDismiss={runQueuedJump}
        onRequestClose={() => setChaptersOpen(false)}
        transparent
        visible={chaptersOpen}
      >
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityLabel="Close" onPress={() => setChaptersOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, styles.chapterSheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <SectionLabel first>Chapters</SectionLabel>
            <ScrollView style={styles.chapterList}>
              <ListCard>
                {[...jumps].reverse().map((jump) => (
                  <ListRow
                    key={jump.entryId}
                    meta={`Chapter ${jump.number}${jump.line ? ` · ${jump.line}` : ''}`}
                    onPress={() => jumpToChapter(jump.entryId)}
                    title={jump.title}
                    trailing={jump.number === db.state.chapter ? <Text style={type.rowMeta}>Now</Text> : undefined}
                  />
                ))}
              </ListCard>
            </ScrollView>
            <AppButton label="Close" onPress={() => setChaptersOpen(false)} variant="secondary" />
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setMoreOpen(false)} transparent visible={moreOpen}>
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityLabel="Close" onPress={() => setMoreOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <SectionLabel first>This turn</SectionLabel>
            <ListCard>
              {canUndo ? (
                <>
                  <ListRow
                    leading={<RotateCcw color={colors.textMuted} size={18} strokeWidth={2} />}
                    meta="The narrator writes this reply again"
                    onPress={() => {
                      setMoreOpen(false);
                      void regenerate();
                    }}
                    title="Retry this reply"
                  />
                  <ListRow
                    leading={<Undo2 color={colors.textMuted} size={18} strokeWidth={2} />}
                    meta="Back to before your last action"
                    onPress={() => {
                      setMoreOpen(false);
                      void undo();
                    }}
                    title="Undo your turn"
                  />
                  <ListRow
                    leading={<Pencil color={colors.textMuted} size={18} strokeWidth={2} />}
                    meta="Undo it and put your action back in the box"
                    onPress={() => {
                      setMoreOpen(false);
                      editLastAction();
                    }}
                    title="Edit your action"
                  />
                </>
              ) : null}
              <ListRow
                leading={<CopyIcon color={colors.textMuted} size={18} strokeWidth={2} />}
                meta="Long-press any reply to copy or paint it"
                onPress={() => {
                  setMoreOpen(false);
                  if (lastReply) copyReply(lastReply.content);
                }}
                title="Copy"
              />
            </ListCard>
            <AppButton label="Cancel" onPress={() => setMoreOpen(false)} variant="secondary" />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setReplyMenu(null)}
        transparent
        visible={replyMenu !== null}
      >
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityLabel="Close" onPress={() => setReplyMenu(null)} style={StyleSheet.absoluteFill} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <SectionLabel first>This reply</SectionLabel>
            <ListCard>
              {apiKey && !isGeneratingImage ? (
                <>
                  <ListRow
                    leading={<Paintbrush color={colors.textMuted} size={18} strokeWidth={2} />}
                    meta={replyMenu?.image ? 'Paint it again; the old picture stays one step back' : 'Paint this moment'}
                    onPress={() => {
                      const target = replyMenu;
                      setReplyMenu(null);
                      if (target) void generateSceneImage('auto', undefined, target.id);
                    }}
                    title={replyMenu?.image ? 'Repaint' : 'Paint'}
                  />
                  <ListRow
                    leading={<ImageIcon color={colors.textMuted} size={18} strokeWidth={2} />}
                    meta="Close-up, jutsu, epic wide and more"
                    onPress={() => {
                      const target = replyMenu;
                      setReplyMenu(null);
                      setShotTarget(target?.id ?? null);
                      setShotMenuOpen(true);
                    }}
                    title="Choose the shot"
                  />
                </>
              ) : null}
              <ListRow
                leading={<CopyIcon color={colors.textMuted} size={18} strokeWidth={2} />}
                onPress={() => {
                  const target = replyMenu;
                  setReplyMenu(null);
                  if (target) copyReply(target.content);
                }}
                title="Copy"
              />
            </ListCard>
            <AppButton label="Cancel" onPress={() => setReplyMenu(null)} variant="secondary" />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setShotMenuOpen(false)}
        transparent
        visible={shotMenuOpen}
      >
        <View style={styles.sheetOverlay}>
          <Pressable
            accessibilityLabel="Close shot menu"
            onPress={() => setShotMenuOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <SectionLabel first>Paint this moment</SectionLabel>
            <FilterPills
              onChange={setShotChip}
              options={SHOT_CHIPS.map((chip) => ({ value: chip.value, label: chip.label }))}
              value={shotChip}
            />
            <Text style={type.rowBody}>{SHOT_CHIPS.find((chip) => chip.value === shotChip)?.hint}</Text>
            <ListRow
              accessibilityLabel="Two takes"
              accessibilityRole="switch"
              accessibilityState={{ checked: Boolean(db.settings.imageTwoTakes) }}
              meta="Paint two and keep the better one. Costs double."
              onPress={() => void updateSettings({ imageTwoTakes: !db.settings.imageTwoTakes })}
              title="Two takes"
              trailing={
                <Switch
                  onValueChange={(value) => void updateSettings({ imageTwoTakes: value })}
                  thumbColor={colors.text}
                  trackColor={{ false: colors.surfaceSoft, true: colors.accent }}
                  value={Boolean(db.settings.imageTwoTakes)}
                  {...(Platform.OS === 'web' ? { activeThumbColor: colors.text } : {})}
                />
              }
            />
            <AppButton
              disabled={!apiKey || isGeneratingImage}
              icon={<Sparkles color={colors.onAccent} size={15} strokeWidth={2} />}
              label="Paint"
              onPress={() => {
                setShotMenuOpen(false);
                void generateSceneImage(shotChip, undefined, shotTarget ?? undefined);
              }}
            />
            <AppButton label="Cancel" onPress={() => setShotMenuOpen(false)} variant="secondary" />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setPendingTakes(null)}
        transparent
        visible={Boolean(pendingTakes)}
      >
        <View style={[styles.imageOverlay, styles.takesOverlay]}>
          <SectionLabel first>Two takes · tap the one to keep</SectionLabel>
          <ScrollView contentContainerStyle={styles.takesList}>
            {pendingTakes?.takes.map((take, index) => (
              <Pressable
                accessibilityLabel={`Keep take ${index + 1}${take.meta.mightBeOff ? ', might be off' : ''}`}
                accessibilityRole="button"
                key={index}
                onPress={() => void keepTake(take)}
                style={({ pressed }) => [styles.takeCard, pressed && styles.pressed]}
              >
                <Image resizeMode="cover" source={{ uri: take.dataUri }} style={styles.takeImage} />
                <Text style={type.rowMeta}>
                  Take {index + 1}
                  {take.meta.mightBeOff ? ' · might be off' : ''}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <AppButton label="Keep neither" onPress={() => setPendingTakes(null)} variant="secondary" />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  storyArea: {
    flex: 1,
  },
  chapterLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    minHeight: 32,
    maxWidth: '100%',
  },
  chapterLabelText: {
    flexShrink: 1,
  },
  chapterAnchor: {
    height: 0,
  },
  chapterSheet: {
    maxHeight: '80%',
  },
  chapterList: {
    flexGrow: 0,
  },
  jumpLatest: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  jumpLatestLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.text,
  },
  firstRun: {
    gap: 10,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  firstRunEyebrow: {
    ...type.sectionLabel,
    color: colors.accentTint,
  },
  firstRunLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  firstRunLinkText: {
    ...type.rowBody,
    color: colors.text,
    textDecorationLine: 'underline',
  },
  firstRunInput: {
    ...type.input,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  firstRunProblem: {
    ...type.rowMeta,
    color: colors.danger,
  },
  leftOff: {
    gap: 6,
    marginVertical: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  leftOffEyebrow: {
    ...type.sectionLabel,
    color: colors.accentTint,
  },
  leftOffText: {
    ...type.rowBody,
  },
  leftOffMeta: {
    ...type.rowMeta,
  },
  leftOffThreads: {
    gap: 2,
  },
  showEarlier: {
    alignSelf: 'center',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  showEarlierLabel: {
    ...type.rowMeta,
    color: colors.textMuted,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    ...type.rowMeta,
  },
  pressed: {
    opacity: 0.65,
  },
  disabled: {
    opacity: 0.35,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.lg,
    paddingLeft: spacing.xl,
    paddingRight: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  statusButton: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingLeft: spacing.md,
  },
  statusCopy: {
    flexShrink: 1,
    alignItems: 'flex-end',
    gap: 1,
  },
  statusTime: {
    fontFamily: fonts.bold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  statusPlace: {
    fontFamily: fonts.medium,
    fontSize: 11,
    lineHeight: 15,
    color: colors.textMuted,
  },
  content: {
    width: '100%',
    maxWidth: 680,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: 22,
  },
  seed: {
    gap: 14,
  },
  seedTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: colors.text,
  },
  seedButton: {
    alignSelf: 'flex-start',
    minWidth: 190,
  },
  narration: {
    gap: 14,
  },
  playerBlock: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  playerText: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 23,
    color: colors.text,
  },
  playerAction: {
    fontStyle: 'italic',
    color: '#C8C8C8',
  },
  narrationAction: {
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  memoryNarration: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderLeftWidth: 2,
    borderLeftColor: colors.memoryBorder,
    backgroundColor: colors.memoryTint,
  },
  memoryPlayerBlock: {
    borderColor: colors.memoryBorder,
    backgroundColor: colors.memoryTint,
  },
  memoryProse: {
    color: colors.memoryText,
  },
  memoryAction: {
    color: colors.memoryMuted,
  },
  memoryHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.sm,
  },
  memoryHeadingText: {
    flexShrink: 1,
    fontFamily: fonts.medium,
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.memoryMuted,
  },
  memoryHeadingTitle: {
    fontFamily: fonts.bold,
    color: colors.memoryAccent,
  },
  memoryHeader: {
    color: colors.memoryAccent,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modeChipTalk: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  modeChipFight: {
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  modeChipLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textDim,
  },
  modeChipLabelOn: {
    color: colors.text,
  },
  modeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textMuted,
  },
  modeDotFight: {
    backgroundColor: colors.accentTint,
  },
  modeDotSelected: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  modeHint: {
    ...type.rowMeta,
    flexShrink: 1,
  },
  fightOptions: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  fightOption: {
    maxWidth: 220,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    backgroundColor: colors.accentSoft,
  },
  fightOptionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    lineHeight: 17,
    color: colors.text,
  },
  sceneImageWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sceneImage: {
    width: '100%',
    height: '100%',
  },
  inlineActions: {
    flexDirection: 'row',
    gap: 4,
    marginLeft: -10,
    marginTop: -6,
  },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  timeChipLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textDim,
    fontVariant: ['tabular-nums'],
  },
  skipInput: {
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    textAlignVertical: 'top',
  },
  timeCustomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timeCustomInput: {
    width: 96,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
  },
  inlineActionLabel: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: colors.textMuted,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chapterCard: {
    alignItems: 'center',
    gap: 6,
    marginVertical: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chapterEyebrow: {
    ...type.sectionLabel,
    color: colors.accentTint,
  },
  chapterCardTitle: {
    fontFamily: fonts.extrabold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.4,
    color: colors.text,
    textAlign: 'center',
  },
  chapterLine: {
    ...type.rowMeta,
    textAlign: 'center',
  },
  markers: {
    gap: 6,
    marginVertical: spacing.xs,
  },
  markerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  markerRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  markerText: {
    flexShrink: 1,
    fontFamily: fonts.semibold,
    fontSize: 11,
    letterSpacing: 0.6,
    color: colors.textMeta,
  },
  stages: {
    gap: 12,
  },
  stageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stageDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  stageText: {
    fontFamily: fonts.semibold,
    fontSize: 13,
    color: colors.textMeta,
  },
  stageTextNow: {
    color: colors.text,
  },
  composerShell: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    gap: 6,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
  },
  pendingLabel: {
    flex: 1,
  },
  pendingRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    padding: 4,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  markerButton: {
    width: 40,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerTight: {
    marginLeft: -6,
  },
  markerLabel: {
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 26,
    marginTop: 6,
    color: colors.textMuted,
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  sendDisabled: {
    backgroundColor: '#3A1013',
  },
  waitButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  waitLabel: {
    fontFamily: fonts.bold,
    fontSize: 14,
    color: colors.textSoft,
  },
  moreButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  narrationText: {
    gap: 14,
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
  sheetClose: {
    marginTop: spacing.sm,
  },
  imageOverlay: {
    flex: 1,
    padding: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
  },
  fullscreenImage: {
    flex: 1,
    width: '100%',
  },
  fullscreenFrame: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  turnButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  turnButtonOn: {
    borderColor: colors.accent,
  },
  imageActionsColumn: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    gap: spacing.sm,
  },
  imageActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  retouchInput: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
  },
  retouchNote: {
    ...type.rowBody,
    color: colors.text,
    textAlign: 'center',
  },
  takesOverlay: {
    gap: spacing.md,
    paddingTop: spacing.xxxl,
  },
  takesList: {
    gap: spacing.lg,
  },
  takeCard: {
    gap: spacing.xs,
  },
  takeImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  inlineActionGlow: {
    borderWidth: 1,
    borderRadius: radius.lg,
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  inlineActionGlowLabel: {
    color: colors.text,
  },
  imageActionButton: {
    flex: 1,
  },
});

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// A crash while drawing shows Reload and Export instead of a white screen (audit 9).
export { TabErrorBoundary as ErrorBoundary } from '@/components/TabErrorBoundary';
