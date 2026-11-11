import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  buildIndices,
  clearBrokenSlot,
  createSlot,
  deleteSlot,
  duplicateSlot,
  exportDatabase,
  importDatabase,
  listSlots,
  loadActiveSlot,
  loadApiKey,
  loadSlot,
  loadStorageMeta,
  loadStoredSlot,
  renameSlot,
  restoreBackup,
  saveApiKey,
  saveSlot,
  switchSlot,
  SlotLoadError,
  setSlotReadOnly,
  storyEntryCount,
  type StorageMeta,
} from './db';
import { acquireSlotLock, type SlotLock } from './tabLock';
import { downloadJson } from './file';
import { makeId } from './id';
import { externalizeImages, inlineImages, storeImage } from './imageStore';
import { FACE_IMAGE } from './imageCompress';
import { buildNarrationPrompt, stripNarrationJson } from './prompt';
import {
  beginDebugTurn,
  describeStateChange,
  failDebugTurn,
  linkDebugTurn,
  loadDebugLog,
  recordDebugCall,
  recordDebugState,
} from './debug';
import { streamChatCompletion } from '../openrouter';
import { extractTurnDiff } from './services';
import { appendStoryMessage, cloneDatabase, getLastExchange, pushSnapshot, restoreLastSnapshot } from './log';
import { markAlive, markDeceased } from './deaths';
import { endCompanion, setCompanion } from './companions';
import { mergeEntityPair } from './entities';
import { addCharacterPortraitToDb, setCharacterFaceInDb } from './characterPortrait';
import { deleteJutsuRecord, renameJutsuRecord } from './jutsu';
import { trimToSentence } from './util';
import { setSceneModeOverride } from './sceneMode';
import { beginFlashback } from './flashbacks';
import {
  applyStateStep,
  applySummaryJob,
  carryOverMemory,
  correctTurnTime as correctTurnTimeInDb,
  extractStateForJob,
  isJobValid,
  markJobFailed,
  markJobsQueued,
  pendingMemoryJobs,
  pruneJobs,
  queueStateRetry,
  removeJob,
  runSummaryJob,
  type TurnInfo,
} from './memoryJobs';
import type {
  AppDatabase,
  BondRecord,
  EventRecord,
  PortraitSignature,
  CharacterPortraitSignature,
  SceneImageMeta,
  SceneModeName,
  Settings,
  ThreadRecord,
  TurnDiff,
} from './types';

/** The save with every image left out: scene images, portraits and face references. */
function withoutImages(db: AppDatabase): AppDatabase {
  return {
    ...db,
    rawLog: db.rawLog.map((entry) => (entry.image ? { ...entry, image: null } : entry)),
    portraits: [],
    characterPortraits: [],
    characterFaces: [],
    snapshots: [],
  };
}

/** Moves inline images into IndexedDB and saves, so the save only holds references. */
async function withStoredImages(db: AppDatabase): Promise<AppDatabase> {
  try {
    const moved = await externalizeImages(db);

    if (!moved) {
      return db;
    }

    await saveSlot(moved);
    return moved;
  } catch {
    return db;
  }
}

function endsMidSentence(text: string) {
  const trimmed = text.trim();

  if (!trimmed) {
    return false;
  }

  return !/[.!?…](?:["'”’)]+)?$/.test(trimmed);
}

type GameContextValue = {
  db: AppDatabase | null;
  slots: AppDatabase[];
  meta: StorageMeta | null;
  apiKey: string;
  loading: boolean;
  error: string | null;
  /**
   * The open story's stored copy could not be read or prepared. The app shows
   * a blocking screen and writes nothing to that slot while this is set.
   */
  brokenSave: { slotId: string; kind: SlotLoadError['kind']; message: string; hasRaw: boolean } | null;
  /** Tries to open the broken story again. */
  retryBrokenSave: () => Promise<void>;
  /** Downloads the broken story's stored text exactly as it is. */
  downloadBrokenSave: () => void;
  /** This story is open in another tab; this one is read-only until that tab lets go. */
  openElsewhere: boolean;
  /** Notes that the open story was just exported (for the export reminder). */
  markExported: () => Promise<void>;
  /** Replaces the open story with its daily backup. */
  restoreDailyBackup: () => Promise<void>;
  isNarrating: boolean;
  /** True while the state step or any summary step is running. */
  isProcessing: boolean;
  /** Memory steps that failed or were interrupted and are waiting for a retry. */
  pendingMemoryCount: number;
  retryPendingMemory: () => Promise<void>;
  streamingText: string;
  pendingAction: string | null;
  lastPromptTokens: number;
  worldEventNotice: string | null;
  dismissWorldEventNotice: () => void;
  setApiKey: (key: string) => Promise<void>;
  /** Sends Kan's input. `remember` follows the offered flashback into the memory (the "Remember" chip). */
  sendTurn: (input: string, options?: { remember?: string }) => Promise<void>;
  regenerate: () => Promise<void>;
  undoLastTurn: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  switchSlotById: (slotId: string) => Promise<void>;
  createNewSlot: (slotName: string) => Promise<void>;
  deleteSlotById: (slotId: string) => Promise<void>;
  duplicateSlotById: (slotId: string, slotName: string) => Promise<void>;
  renameSlotById: (slotId: string, slotName: string) => Promise<void>;
  /** The save as JSON; without images it is a small file of story and memory only. */
  exportActiveSlot: (options?: { withImages?: boolean }) => Promise<string | null>;
  importSlot: (json: string, slotName?: string) => Promise<void>;
  updateBond: (bondId: string, patch: Partial<BondRecord>) => Promise<void>;
  /** Folds dropId into keepId: one person, with both histories. */
  mergeCharacters: (keepId: string, dropId: string) => Promise<void>;
  /** Hand correction when the story got someone's death wrong. */
  setCharacterDeceased: (entityId: string, deceased: boolean) => Promise<void>;
  /** Hand correction: starts or ends someone travelling with Kan. */
  setTravelling: (entityId: string, travelling: boolean) => Promise<void>;
  /** The mode chip: force conversation, fight or normal narration, or null for automatic. */
  setSceneMode: (mode: SceneModeName | null) => Promise<void>;
  updateThread: (threadId: string, patch: Partial<ThreadRecord>) => Promise<void>;
  toggleMemoryPin: (eventId: string) => Promise<void>;
  editMemory: (
    eventId: string,
    patch: Partial<Pick<EventRecord, 'summary' | 'tags' | 'importance' | 'pinned'>>
  ) => Promise<void>;
  deleteMemory: (eventId: string) => Promise<void>;
  /** Hand correction: renames a jutsu (merging it into one already by that name). */
  renameJutsu: (recordId: string, name: string) => Promise<void>;
  /** Hand correction: removes a jutsu record. */
  deleteJutsu: (recordId: string) => Promise<void>;
  attachImage: (logId: string, image: string, meta?: SceneImageMeta) => Promise<void>;
  /** Sets how many in-story seconds a reply took; the clock shifts to match. */
  correctTurnTime: (logId: string, seconds: number) => Promise<void>;
  addPortrait: (image: string, signature: PortraitSignature) => Promise<void>;
  /** Saves a painted portrait of someone in your bonds. */
  addCharacterPortrait: (
    entityId: string,
    image: string,
    signature: CharacterPortraitSignature,
    usedFace: boolean
  ) => Promise<void>;
  /** Sets (or, with null, removes) someone's face reference. */
  setCharacterFace: (entityId: string, image: string | null) => Promise<void>;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [slots, setSlots] = useState<AppDatabase[]>([]);
  const [meta, setMeta] = useState<StorageMeta | null>(null);
  const [apiKey, setApiKeyState] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [brokenError, setBrokenError] = useState<SlotLoadError | null>(null);
  const [openElsewhere, setOpenElsewhere] = useState(false);
  const openElsewhereRef = useRef(false);
  const slotLockRef = useRef<SlotLock | null>(null);
  const [isNarrating, setIsNarrating] = useState(false);
  const [stateStepRunning, setStateStepRunning] = useState(false);
  const [activeJobCount, setActiveJobCount] = useState(0);
  const [streamingText, setStreamingText] = useState('');
  /** Kan's line for the turn being narrated, shown until the turn is saved. */
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [lastPromptTokens, setLastPromptTokens] = useState(0);
  const [worldEventNotice, setWorldEventNotice] = useState<string | null>(null);

  const dbRef = useRef<AppDatabase | null>(null);
  /** The current turn's state step. The next turn, undo and regenerate wait for it. */
  const backgroundPromiseRef = useRef<Promise<void> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Saves run one at a time, in order, so an older copy never lands last. */
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Serializes read-modify-write on slots that aren't open right now. */
  const inactiveLockRef = useRef<Promise<unknown>>(Promise.resolve());
  /** Summary steps run one after another on this chain. */
  const memoryChainRef = useRef<Promise<void>>(Promise.resolve());
  const activeJobIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    dbRef.current = db;
  }, [db]);

  useEffect(() => {
    void loadDebugLog();
  }, []);

  const refreshSlots = useCallback(async () => {
    const allSlots = await listSlots();
    setSlots(allSlots);
  }, []);

  /** A slot failed to open: block the app on it instead of showing a blank story. */
  const showBroken = useCallback((caught: unknown) => {
    if (!(caught instanceof SlotLoadError)) {
      return false;
    }

    dbRef.current = null;
    setDb(null);
    setBrokenError(caught);
    return true;
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      const [storageMeta, storedApiKey] = await Promise.all([loadStorageMeta(), loadApiKey()]);
      let activeSlot: AppDatabase | null = null;
      let broken: SlotLoadError | null = null;

      try {
        activeSlot = await withStoredImages(await loadActiveSlot());
      } catch (caught) {
        if (!(caught instanceof SlotLoadError)) {
          throw caught;
        }
        broken = caught;
      }

      const allSlots = await listSlots();

      if (!active) {
        return;
      }

      setMeta(storageMeta);
      setApiKeyState(storedApiKey);
      setSlots(allSlots);

      if (broken) {
        showBroken(broken);
      } else {
        setDb(activeSlot);
      }
    })()
      .catch(() => {
        if (active) {
          setError('Could not load your story. Refresh the app and try again.');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [showBroken]);

  const retryBrokenSave = useCallback(async () => {
    const broken = brokenError;

    if (!broken) {
      return;
    }

    clearBrokenSlot(broken.slotId);

    try {
      const loaded = await withStoredImages(await loadSlot(broken.slotId));
      dbRef.current = loaded;
      setDb(loaded);
      setBrokenError(null);
      setSlots(await listSlots());
    } catch (caught) {
      if (!showBroken(caught)) {
        setBrokenError(new SlotLoadError(broken.slotId, broken.kind, broken.raw, caught));
      }
    }
  }, [brokenError, showBroken]);

  const downloadBrokenSave = useCallback(() => {
    if (brokenError?.raw) {
      downloadJson(`kan-story-unopened-${brokenError.slotId}.json`, brokenError.raw);
    }
  }, [brokenError]);

  // One tab per story: hold the open slot's lock; without it this tab is read-only.
  const openSlotId = db?.meta.slotId ?? null;

  useEffect(() => {
    if (!openSlotId) {
      return;
    }

    let blocked = false;
    const lock = acquireSlotLock(openSlotId, {
      onBlocked: () => {
        blocked = true;
        setSlotReadOnly(openSlotId, true);
        openElsewhereRef.current = true;
        setOpenElsewhere(true);
      },
      onAcquired: () => {
        setSlotReadOnly(openSlotId, false);
        openElsewhereRef.current = false;
        setOpenElsewhere(false);

        if (blocked) {
          // The other tab played on: pick up what it saved.
          blocked = false;
          void loadSlot(openSlotId)
            .then(withStoredImages)
            .then((fresh) => {
              if (dbRef.current?.meta.slotId === openSlotId) {
                dbRef.current = fresh;
                setDb(fresh);
              }
            })
            .catch((caught) => {
              if (caught instanceof SlotLoadError) {
                dbRef.current = null;
                setDb(null);
                setBrokenError(caught);
              }
            });
        }
      },
    });
    slotLockRef.current = lock;

    return () => {
      lock.release();
      setSlotReadOnly(openSlotId, false);
      openElsewhereRef.current = false;
      setOpenElsewhere(false);
    };
  }, [openSlotId]);

  const brokenSave = useMemo(
    () =>
      brokenError
        ? {
            slotId: brokenError.slotId,
            kind: brokenError.kind,
            message: brokenError.message,
            hasRaw: Boolean(brokenError.raw),
          }
        : null,
    [brokenError]
  );

  const enqueueSave = useCallback((next: AppDatabase) => {
    const write = saveQueueRef.current.catch(() => undefined).then(() => saveSlot(next));
    saveQueueRef.current = write;
    return write;
  }, []);

  const commitDb = useCallback(
    async (next: AppDatabase) => {
      if (openElsewhereRef.current && next.meta.slotId === dbRef.current?.meta.slotId) {
        throw new Error('Kan is open in another tab. Close it to keep playing here.');
      }

      const normalized = {
        ...next,
        indices: buildIndices(next),
      };

      // Update the in-memory copy first (synchronously), so anything that
      // reads dbRef next builds on this version rather than the one before it.
      dbRef.current = normalized;
      setDb(normalized);
      await enqueueSave(normalized);

      return normalized;
    },
    [enqueueSave]
  );

  /** The newest copy of a slot: the open one in memory, otherwise what's stored. */
  const readLatest = useCallback(async (slotId: string) => {
    const active = dbRef.current;

    if (active?.meta.slotId === slotId) {
      return active;
    }

    await saveQueueRef.current.catch(() => undefined);
    return loadStoredSlot(slotId);
  }, []);

  /**
   * Applies a change to the latest copy of a slot and saves it. `mutate`
   * returns null to skip the write (e.g. the turn it belonged to is gone).
   */
  const updateLatest = useCallback(
    async (
      slotId: string,
      mutate: (latest: AppDatabase) => AppDatabase | null
    ): Promise<AppDatabase | null> => {
      const active = dbRef.current;

      if (active?.meta.slotId === slotId) {
        const next = mutate(active);
        return next ? commitDb(next) : null;
      }

      const run = inactiveLockRef.current
        .catch(() => undefined)
        .then(async (): Promise<AppDatabase | null | 'reopened'> => {
          await saveQueueRef.current.catch(() => undefined);

          if (dbRef.current?.meta.slotId === slotId) {
            return 'reopened';
          }

          const stored = await loadStoredSlot(slotId);

          if (!stored) {
            return null;
          }

          const next = mutate(stored);

          if (!next) {
            return null;
          }

          const normalized = { ...next, indices: buildIndices(next) };
          await enqueueSave(normalized);
          return normalized;
        });

      inactiveLockRef.current = run;
      const result = await run;

      if (result === 'reopened') {
        // The player switched back to this slot while we waited.
        const reopened = dbRef.current;
        const next = reopened ? mutate(reopened) : null;
        return next ? commitDb(next) : null;
      }

      return result;
    },
    [commitDb, enqueueSave]
  );

  const setApiKey = useCallback(async (key: string) => {
    await saveApiKey(key);
    setApiKeyState(key.trim());
  }, []);

  const setJobActive = useCallback((jobId: string, active: boolean) => {
    if (active) {
      activeJobIdsRef.current.add(jobId);
    } else {
      activeJobIdsRef.current.delete(jobId);
    }

    setActiveJobCount(activeJobIdsRef.current.size);
  }, []);

  const showNotice = useCallback((slotId: string, notice: string | null) => {
    if (notice && dbRef.current?.meta.slotId === slotId) {
      setWorldEventNotice(notice);
    }
  }, []);

  /**
   * Runs memory jobs one at a time. Each job reads the latest save, calls the
   * model, then applies its result to the save as it is at that moment. A
   * failure only marks that one job as pending; the others still run.
   */
  const drainJobs = useCallback(
    async (activeKey: string, slotId: string, jobIds: string[]) => {
      const queue = [...jobIds];

      while (queue.length > 0) {
        const jobId = queue.shift() as string;
        const followUps: string[] = [];

        try {
          const base = await readLatest(slotId);
          const job = base?.memoryJobs?.find((entry) => entry.id === jobId);

          if (!base || !job) {
            continue;
          }

          if (!isJobValid(base, job)) {
            await updateLatest(slotId, (latest) => removeJob(latest, jobId));
            continue;
          }

          if (job.kind === 'state') {
            const extraction = await extractStateForJob(activeKey, base, job);
            let notice: string | null = null;

            await updateLatest(slotId, (latest) => {
              const current = latest.memoryJobs?.find((entry) => entry.id === jobId);

              if (!current || !isJobValid(latest, current)) {
                return null;
              }

              const narration =
                latest.rawLog.find((entry) => entry.id === job.turnLogId)?.content ?? '';
              const result = applyStateStep(
                latest,
                extraction,
                {
                  turnLogId: job.turnLogId,
                  userMessage: job.userMessage ?? '',
                  narration,
                },
                activeJobIdsRef.current
              );
              recordDebugState(job.turnLogId, {
                status: extraction ? 'applied' : 'fallback',
                diff: result.appliedDiff,
                changes: describeStateChange(latest, result.db),
                ...(result.nameLeaks?.length ? { nameLeaks: result.nameLeaks } : {}),
              });
              followUps.push(...result.followUpIds);
              notice = result.notice;
              return result.db;
            });

            showNotice(slotId, notice);
          } else {
            const output = await runSummaryJob(activeKey, base, job);

            await updateLatest(slotId, (latest) => {
              const result = applySummaryJob(latest, job, output);

              if (!result) {
                return null;
              }

              followUps.push(...result.followUpIds);
              return result.db;
            });
          }
        } catch (caught) {
          const failed = (await readLatest(slotId).catch(() => null))?.memoryJobs?.find(
            (entry) => entry.id === jobId
          );

          if (failed?.kind === 'state') {
            recordDebugState(failed.turnLogId, {
              status: 'failed',
              error: caught instanceof Error ? caught.message : String(caught),
            });
          }

          try {
            await updateLatest(slotId, (latest) =>
              latest.memoryJobs?.some((entry) => entry.id === jobId)
                ? markJobFailed(latest, jobId, caught)
                : null
            );
          } catch {
            // Storage itself failed; the job stays queued and shows as pending.
          }
        } finally {
          for (const id of followUps) {
            setJobActive(id, true);

            if (!queue.includes(id)) {
              queue.push(id);
            }
          }

          if (!queue.includes(jobId)) {
            setJobActive(jobId, false);
          }
        }
      }
    },
    [readLatest, setJobActive, showNotice, updateLatest]
  );

  const scheduleJobs = useCallback(
    (activeKey: string, slotId: string, jobIds: string[]) => {
      if (jobIds.length === 0) {
        return memoryChainRef.current;
      }

      jobIds.forEach((id) => setJobActive(id, true));

      const run = memoryChainRef.current
        .catch(() => undefined)
        .then(() => drainJobs(activeKey, slotId, jobIds));

      memoryChainRef.current = run;
      return run;
    },
    [drainJobs, setJobActive]
  );

  /**
   * Phase 1 of a turn: apply and save the state change straight away. The
   * summaries it calls for are queued and run afterwards on their own.
   */
  const runStateStep = useCallback(
    async (activeKey: string, slotId: string, turn: TurnInfo) => {
      setStateStepRunning(true);

      try {
        let extraction: TurnDiff | null;

        try {
          // Context for the state call is the save *before* this turn's
          // changes; the turn's own prose is passed separately.
          const base = await readLatest(slotId);

          if (!base) {
            return;
          }

          extraction = await extractTurnDiff({
            apiKey: activeKey,
            db: base,
            userMessage: turn.userMessage,
            assistantMessage: turn.narration,
            debugTurnId: turn.turnLogId,
          });
        } catch (caught) {
          recordDebugState(turn.turnLogId, {
            status: 'failed',
            error: caught instanceof Error ? caught.message : String(caught),
          });
          await updateLatest(slotId, (latest) =>
            latest.rawLog.some((entry) => entry.id === turn.turnLogId)
              ? queueStateRetry(latest, turn, caught)
              : null
          );
          return;
        }

        let followUps: string[] = [];
        let notice: string | null = null;

        await updateLatest(slotId, (latest) => {
          if (!latest.rawLog.some((entry) => entry.id === turn.turnLogId)) {
            return null;
          }

          const result = applyStateStep(latest, extraction, turn, activeJobIdsRef.current);
          recordDebugState(turn.turnLogId, {
            status: extraction ? 'applied' : 'fallback',
            diff: result.appliedDiff,
            changes: describeStateChange(latest, result.db),
          });
          followUps = result.followUpIds;
          notice = result.notice;
          return result.db;
        });

        showNotice(slotId, notice);
        void scheduleJobs(activeKey, slotId, followUps);
      } catch {
        setError('Your last turn could not be saved. Check your storage space and try again.');
      } finally {
        setStateStepRunning(false);
      }
    },
    [readLatest, scheduleJobs, showNotice, updateLatest]
  );

  const trackBackground = useCallback((task: Promise<void>) => {
    backgroundPromiseRef.current = task;
    void task.catch(() => undefined).finally(() => {
      if (backgroundPromiseRef.current === task) {
        backgroundPromiseRef.current = null;
      }
    });
  }, []);

  const sendTurnInner = useCallback(
    async (action: string, activeKey: string, remember?: string) => {
      if (backgroundPromiseRef.current) {
        await backgroundPromiseRef.current;
      }

      const current = dbRef.current;

      if (!current) {
        setError('Your story is still loading. Try again in a moment.');
        return;
      }

      if (openElsewhereRef.current) {
        setError('Kan is open in another tab. Close it to keep playing here.');
        return;
      }

      setIsNarrating(true);
      setStreamingText('');
      setPendingAction(action);
      setError(null);
      let debugTurnId: string | null = null;
      let narratorRecorded = false;

      try {
        // Following an offered memory: the flashback plays from this turn.
        const start = (db: AppDatabase) => (remember ? beginFlashback(db, remember) : db);
        const snapshotDb = start(pushSnapshot(current));
        const withUser = appendStoryMessage(
          snapshotDb,
          'user',
          action,
          null,
          0,
          0
        );

        const prompt = buildNarrationPrompt(withUser, action);
        setLastPromptTokens(prompt.estimatedTokens);
        debugTurnId = beginDebugTurn({
          slotId: current.meta.slotId,
          action,
          narratorModel: withUser.settings.narrationModel,
          prompt: prompt.messages,
          promptEstimate: prompt.estimatedTokens,
        });

        const controller = new AbortController();
        abortRef.current = controller;

        // Call 1: the narrator writes prose only and streams it straight to
        // the screen. State is extracted afterwards by a second call.
        let streamed = '';
        let flushTimer: ReturnType<typeof setTimeout> | null = null;
        const flush = () => {
          flushTimer = null;
          setStreamingText(streamed);
        };

        let result;

        try {
          result = await streamChatCompletion({
            apiKey: activeKey,
            model: withUser.settings.narrationModel,
            messages: prompt.messages,
            temperature: withUser.settings.temperature,
            maxTokens: withUser.settings.maxTokens,
            // Medium thinking, kept out of the streamed text. max_tokens is
            // sized so the thinking can't eat the room for prose + state.
            reasoning: { effort: 'medium', exclude: true },
            signal: controller.signal,
            onDelta: (delta) => {
              streamed += delta;

              if (!flushTimer) {
                flushTimer = setTimeout(flush, 60);
              }
            },
          });
        } finally {
          if (flushTimer) {
            clearTimeout(flushTimer);
          }
        }

        recordDebugCall(debugTurnId, {
          kind: 'narrator',
          model: withUser.settings.narrationModel,
          usage: result.usage,
          finishReason: result.finishReason,
          apiKey: activeKey,
        });
        narratorRecorded = true;

        const promptTokens = result.promptTokens;
        const completionTokens = result.completionTokens;
        // Safety net only: the narrator is no longer asked for JSON, but a
        // model that adds some anyway must never get it into the story.
        const prose = stripNarrationJson(result.text);
        const narration =
          result.finishReason === 'length' || endsMidSentence(prose)
            ? trimToSentence(prose)
            : prose;

        if (!narration.trim()) {
          throw new Error('The narrator returned an empty reply. Try again.');
        }

        // Save onto the latest copy, not the one the prompt was built from,
        // so summaries that finished during narration are kept.
        const slotId = current.meta.slotId;
        const model = withUser.settings.narrationModel;
        let turnLogId = '';

        const saved = await updateLatest(slotId, (latest) => {
          // The snapshot is taken first, so undo also undoes stepping into a memory.
          const withSnapshot = start(pushSnapshot(latest));
          const withPlayer = appendStoryMessage(withSnapshot, 'user', action, null, 0, 0);
          const withReply = appendStoryMessage(
            withPlayer,
            'assistant',
            narration,
            model,
            promptTokens,
            completionTokens
          );
          turnLogId = withReply.rawLog[withReply.rawLog.length - 1].id;
          // Which mode the reply was written in: the state step reads it for
          // the clock and the conversation streak.
          withReply.rawLog[withReply.rawLog.length - 1] = {
            ...withReply.rawLog[withReply.rawLog.length - 1],
            sceneMode: prompt.sceneMode.mode,
            ...(prompt.flashback.offerId ? { flashbackOffer: prompt.flashback.offerId } : {}),
          };

          // A turn inside a memory: both entries carry it, with the memory's clock.
          if (prompt.flashback.active) {
            const memory = prompt.flashback.active;
            const last = withReply.rawLog.length - 1;
            withReply.rawLog[last] = { ...withReply.rawLog[last], flashback: memory };
            withReply.rawLog[last - 1] = { ...withReply.rawLog[last - 1], flashback: memory };
          }
          // Clear the live text in the same tick the saved reply appears, so
          // the turn never shows twice.
          setStreamingText('');
          setPendingAction(null);
          return withReply;
        });

        if (!saved || !turnLogId) {
          return;
        }

        if (debugTurnId) {
          linkDebugTurn(debugTurnId, turnLogId);
        }

        // Call 2: read the state change out of the prose, in the background.
        trackBackground(
          runStateStep(activeKey, slotId, {
            turnLogId,
            userMessage: action,
            narration,
          })
        );
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'The narrator could not respond.';
        setError(message);

        if (debugTurnId) {
          if (!narratorRecorded) {
            recordDebugCall(debugTurnId, {
              kind: 'narrator',
              model: current.settings.narrationModel,
              usage: null,
              error: message,
            });
          }

          failDebugTurn(debugTurnId, message);
        }
      } finally {
        setIsNarrating(false);
        setStreamingText('');
        setPendingAction(null);
        abortRef.current = null;
      }
    },
    [runStateStep, trackBackground, updateLatest]
  );


  const sendTurn = useCallback(
    async (input: string, options?: { remember?: string }) => {
      const action = input.trim();
      const remember = options?.remember;

      if (!action) {
        return;
      }

      if (!apiKey.trim()) {
        const storedKey = (await loadApiKey()).trim();

        if (!storedKey) {
          setError('Add your OpenRouter API key in Settings before starting the story.');
          return;
        }

        setApiKeyState(storedKey);
        await sendTurnInner(action, storedKey, remember);
        return;
      }

      await sendTurnInner(action, apiKey.trim(), remember);
    },
    [apiKey, sendTurnInner]
  );


  const undoLastTurn = useCallback(async () => {
    if (openElsewhereRef.current) {
      return;
    }

    if (backgroundPromiseRef.current) {
      await backgroundPromiseRef.current;
    }

    const current = dbRef.current;

    if (!current) {
      return;
    }

    const restored = restoreLastSnapshot(current);

    if (!restored) {
      return;
    }

    await commitDb(carryOverMemory(current, restored));
    setStreamingText('');
    setError(null);
  }, [commitDb]);

  const regenerate = useCallback(async () => {
    if (openElsewhereRef.current) {
      return;
    }

    if (backgroundPromiseRef.current) {
      await backgroundPromiseRef.current;
    }

    const current = dbRef.current;

    if (!current) {
      return;
    }

    const { userMessage } = getLastExchange(current);

    if (!userMessage) {
      return;
    }

    const lastUser = [...current.rawLog].reverse().find((entry) => entry.kind === 'story' && entry.role === 'user');
    const snapshot = restoreLastSnapshot(current);
    const restored = snapshot ? carryOverMemory(current, snapshot) : current;
    await commitDb(restored);
    // The turn that stepped into a memory steps into it again.
    const remember =
      lastUser?.flashback && restored.state.flashbacks?.active?.id !== lastUser.flashback.id
        ? lastUser.flashback.id
        : undefined;
    await sendTurn(userMessage, remember ? { remember } : undefined);
  }, [commitDb, sendTurn]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      await commitDb({
        ...current,
        settings: {
          ...current.settings,
          ...patch,
        },
      });
    },
    [commitDb]
  );

  const switchSlotById = useCallback(
    async (slotId: string) => {
      // Let pending writes land first so the slot is read back up to date.
      await saveQueueRef.current.catch(() => undefined);
      await inactiveLockRef.current.catch(() => undefined);
      let loaded: AppDatabase | null;

      try {
        loaded = await switchSlot(slotId);
      } catch (caught) {
        if (showBroken(caught)) {
          await refreshSlots();
          return;
        }
        throw caught;
      }

      if (!loaded) {
        return;
      }

      const next = await withStoredImages(loaded);

      setBrokenError(null);
      setDb(next);
      dbRef.current = next;
      await refreshSlots();
    },
    [refreshSlots, showBroken]
  );

  const createNewSlot = useCallback(
    async (slotName: string) => {
      const next = await createSlot(slotName);
      setBrokenError(null);
      setDb(next);
      dbRef.current = next;
      setMeta(await loadStorageMeta());
      await refreshSlots();
    },
    [refreshSlots]
  );

  const deleteSlotById = useCallback(
    async (slotId: string) => {
      await deleteSlot(slotId);
      setMeta(await loadStorageMeta());

      try {
        const next = await loadActiveSlot();
        setBrokenError(null);
        setDb(next);
        dbRef.current = next;
      } catch (caught) {
        if (!showBroken(caught)) {
          throw caught;
        }
      }

      await refreshSlots();
    },
    [refreshSlots, showBroken]
  );

  const duplicateSlotById = useCallback(
    async (slotId: string, slotName: string) => {
      const next = await duplicateSlot(slotId, slotName);
      setBrokenError(null);
      setDb(next);
      dbRef.current = next;
      setMeta(await loadStorageMeta());
      await refreshSlots();
    },
    [refreshSlots]
  );

  const renameSlotById = useCallback(
    async (slotId: string, slotName: string) => {
      await renameSlot(slotId, slotName);
      await refreshSlots();

      if (dbRef.current?.meta.slotId === slotId) {
        const next = cloneDatabase(dbRef.current);
        next.meta.slotName = slotName;
        await commitDb(next);
      }
    },
    [commitDb, refreshSlots]
  );

  const exportActiveSlot = useCallback(async (options: { withImages?: boolean } = {}) => {
    const current = dbRef.current;

    if (!current) {
      return null;
    }

    if (options.withImages === false) {
      return exportDatabase(withoutImages(current));
    }

    return exportDatabase(await inlineImages(current));
  }, []);

  const importSlot = useCallback(
    async (json: string, slotName?: string) => {
      const imported = await withStoredImages(await importDatabase(json, slotName));
      setBrokenError(null);
      setDb(imported);
      dbRef.current = imported;
      setMeta(await loadStorageMeta());
      await refreshSlots();
    },
    [refreshSlots]
  );

  const updateBond = useCallback(
    async (bondId: string, patch: Partial<BondRecord>) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const bonds = current.bonds.map((bond) =>
        bond.id === bondId ? { ...bond, ...patch } : bond
      );

      await commitDb({
        ...current,
        bonds,
      });
    },
    [commitDb]
  );

  const mergeCharacters = useCallback(
    async (keepId: string, dropId: string) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const merged = mergeEntityPair(current, keepId, dropId);

      if (merged === current) {
        return;
      }

      await commitDb(merged);
    },
    [commitDb]
  );

  const setCharacterDeceased = useCallback(
    async (entityId: string, deceased: boolean) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      // The dead stop travelling with you.
      const next = deceased
        ? endCompanion(markDeceased(current, entityId, { known: true }), entityId, 'died')
        : markAlive(current, entityId);

      if (next === current) {
        return;
      }

      await commitDb(next);
    },
    [commitDb]
  );

  const setTravelling = useCallback(
    async (entityId: string, travelling: boolean) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const next = setCompanion(current, entityId, travelling);

      if (next === current) {
        return;
      }

      await commitDb(next);
    },
    [commitDb]
  );

  const setSceneMode = useCallback(
    async (mode: SceneModeName | null) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      await commitDb(setSceneModeOverride(current, mode));
    },
    [commitDb]
  );

  const updateThread = useCallback(
    async (threadId: string, patch: Partial<ThreadRecord>) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const threads = current.threads.map((thread) =>
        thread.id === threadId ? { ...thread, ...patch } : thread
      );

      await commitDb({
        ...current,
        threads,
      });
    },
    [commitDb]
  );

  const toggleMemoryPin = useCallback(
    async (eventId: string) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const events = current.events.map((event) =>
        event.id === eventId ? { ...event, pinned: !event.pinned } : event
      );

      await commitDb({
        ...current,
        events,
      });
    },
    [commitDb]
  );

  const editMemory = useCallback(
    async (
      eventId: string,
      patch: Partial<Pick<EventRecord, 'summary' | 'tags' | 'importance' | 'pinned'>>
    ) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const events = current.events.map((event) =>
        event.id === eventId ? { ...event, ...patch } : event
      );

      await commitDb({
        ...current,
        events,
      });
    },
    [commitDb]
  );

  const renameJutsu = useCallback(
    async (recordId: string, name: string) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const next = renameJutsuRecord(current, recordId, name);

      if (next !== current) {
        await commitDb(next);
      }
    },
    [commitDb]
  );

  const deleteJutsu = useCallback(
    async (recordId: string) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const next = deleteJutsuRecord(current, recordId);

      if (next !== current) {
        await commitDb(next);
      }
    },
    [commitDb]
  );

  const deleteMemory = useCallback(
    async (eventId: string) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const events = current.events.filter((event) => event.id !== eventId);
      const eventEntities = current.eventEntities.filter(
        (link) => link.eventId !== eventId
      );

      await commitDb({
        ...current,
        events,
        eventEntities,
      });
    },
    [commitDb]
  );

  const attachImage = useCallback(
    async (logId: string, image: string, meta?: SceneImageMeta) => {
      if (backgroundPromiseRef.current) {
        await backgroundPromiseRef.current;
      }

      const current = dbRef.current;

      if (!current) {
        return;
      }

      const stored = await storeImage(image);
      const latest = dbRef.current ?? current;
      const rawLog = latest.rawLog.map((entry) =>
        entry.id === logId ? { ...entry, image: stored, ...(meta ? { imageMeta: meta } : {}) } : entry
      );

      await commitDb({
        ...latest,
        rawLog,
      });
    },
    [commitDb]
  );

  const correctTurnTime = useCallback(
    async (logId: string, seconds: number) => {
      const slotId = dbRef.current?.meta.slotId;

      if (!slotId) {
        return;
      }

      try {
        await updateLatest(slotId, (latest) => correctTurnTimeInDb(latest, logId, seconds));
      } catch {
        setError('The time change could not be saved. Check your storage space and try again.');
      }
    },
    [updateLatest]
  );

  const addPortrait = useCallback(
    async (image: string, signature: PortraitSignature) => {
      const current = dbRef.current;

      if (!current) {
        return;
      }

      const latestBefore = (dbRef.current ?? current).portraits?.at(-1);

      // The same painting landing twice (a double trigger) is kept once.
      if (
        latestBefore &&
        JSON.stringify(latestBefore.signature) === JSON.stringify(signature) &&
        Date.now() - latestBefore.createdAt < 10 * 60_000
      ) {
        return;
      }

      const stored = await storeImage(image);
      const latest = dbRef.current ?? current;

      await commitDb({
        ...latest,
        portraits: [
          ...(latest.portraits ?? []),
          {
            id: makeId('portrait'),
            image: stored,
            signature,
            inStoryDate: latest.state.inStoryDate,
            location: latest.state.location,
            createdAt: Date.now(),
          },
        ].slice(-24),
      });
    },
    [commitDb]
  );

  const addCharacterPortrait = useCallback(
    async (entityId: string, image: string, signature: CharacterPortraitSignature, usedFace: boolean) => {
      const stored = await storeImage(image);
      const latest = dbRef.current;

      if (!latest) {
        return;
      }

      await commitDb(addCharacterPortraitToDb(latest, entityId, stored, signature, usedFace));
    },
    [commitDb]
  );

  const setCharacterFace = useCallback(
    async (entityId: string, image: string | null) => {
      const stored = image ? await storeImage(image, FACE_IMAGE) : null;
      const latest = dbRef.current;

      if (!latest) {
        return;
      }

      await commitDb(setCharacterFaceInDb(latest, entityId, stored));
    },
    [commitDb]
  );

  const retryPendingMemory = useCallback(async () => {
    const current = dbRef.current;

    if (!current) {
      return;
    }

    const activeKey = apiKey.trim() || (await loadApiKey()).trim();

    if (!activeKey) {
      setError('Add your OpenRouter API key in Settings to retry.');
      return;
    }

    if (backgroundPromiseRef.current) {
      await backgroundPromiseRef.current;
    }

    const slotId = current.meta.slotId;
    const pending = pendingMemoryJobs(dbRef.current, activeJobIdsRef.current);

    if (pending.length === 0) {
      return;
    }

    const ids = pending.map((job) => job.id);
    await updateLatest(slotId, (latest) =>
      markJobsQueued(pruneJobs(latest, activeJobIdsRef.current), ids)
    );

    const run = scheduleJobs(activeKey, slotId, ids);

    // A state step must land before the next turn is narrated.
    if (pending.some((job) => job.kind === 'state')) {
      trackBackground(run);
    }

    await run;
  }, [apiKey, scheduleJobs, trackBackground, updateLatest]);

  const pendingMemoryCount = useMemo(
    () => pendingMemoryJobs(db, activeJobIdsRef.current).length,
    // activeJobCount changes whenever the running set does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db, activeJobCount]
  );

  const isProcessing = stateStepRunning || activeJobCount > 0;

  const markExported = useCallback(async () => {
    const current = dbRef.current;

    if (!current) {
      return;
    }

    await commitDb({
      ...current,
      meta: { ...current.meta, exportedAtTurn: storyEntryCount(current), exportedAt: Date.now() },
    });
  }, [commitDb]);

  const restoreDailyBackup = useCallback(async () => {
    const current = dbRef.current;

    if (!current || openElsewhereRef.current) {
      return;
    }

    if (backgroundPromiseRef.current) {
      await backgroundPromiseRef.current.catch(() => undefined);
    }

    await saveQueueRef.current.catch(() => undefined);
    const restored = await withStoredImages(await restoreBackup(current.meta.slotId));
    dbRef.current = restored;
    setDb(restored);
    await refreshSlots();
  }, [refreshSlots]);

  const dismissWorldEventNotice = useCallback(() => {
    setWorldEventNotice(null);
  }, []);

  const value = useMemo<GameContextValue>(
    () => ({
      db,
      slots,
      meta,
      apiKey,
      loading,
      error,
      brokenSave,
      retryBrokenSave,
      downloadBrokenSave,
      openElsewhere,
      markExported,
      restoreDailyBackup,
      isNarrating,
      isProcessing,
      pendingMemoryCount,
      retryPendingMemory,
      streamingText,
      pendingAction,
      lastPromptTokens,
      worldEventNotice,
      dismissWorldEventNotice,
      setApiKey,
      sendTurn,
      regenerate,
      undoLastTurn,
      updateSettings,
      switchSlotById,
      createNewSlot,
      deleteSlotById,
      duplicateSlotById,
      renameSlotById,
      exportActiveSlot,
      importSlot,
      updateBond,
      mergeCharacters,
      setCharacterDeceased,
      setTravelling,
      setSceneMode,
      updateThread,
      toggleMemoryPin,
      editMemory,
      deleteMemory,
      renameJutsu,
      deleteJutsu,
      attachImage,
      correctTurnTime,
      addPortrait,
      addCharacterPortrait,
      setCharacterFace,
    }),
    [
      apiKey,
      createNewSlot,
      db,
      deleteMemory,
      renameJutsu,
      deleteJutsu,
      attachImage,
      addPortrait,
      addCharacterPortrait,
      setCharacterFace,
      correctTurnTime,
      deleteSlotById,
      duplicateSlotById,
      editMemory,
      error,
      brokenSave,
      retryBrokenSave,
      downloadBrokenSave,
      openElsewhere,
      markExported,
      restoreDailyBackup,
      exportActiveSlot,
      importSlot,
      isNarrating,
      isProcessing,
      lastPromptTokens,
      loading,
      meta,
      pendingMemoryCount,
      retryPendingMemory,
      regenerate,
      renameSlotById,
      sendTurn,
      setApiKey,
      slots,
      streamingText,
      pendingAction,
      worldEventNotice,
      dismissWorldEventNotice,
      switchSlotById,
      toggleMemoryPin,
      undoLastTurn,
      updateBond,
      mergeCharacters,
      setCharacterDeceased,
      setTravelling,
      setSceneMode,
      updateSettings,
      updateThread,
    ]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const context = useContext(GameContext);

  if (!context) {
    throw new Error('useGame must be used inside a GameProvider');
  }

  return context;
}
