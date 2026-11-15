import type { MemoryIndex, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  narrationModel: 'google/gemini-3.8-flash',
  summaryModel: 'google/gemini-3.8-flash',
  extractionModel: 'deepseek/deepseek-v4.1-flash-1017',
  imageModel: 'google/gemini-nano-banana-2.1',
  contextMessages: 16,
  retrievalLimit: 4,
  autoSummarizeThreshold: 12,
  temperature: 0.7,
  maxTokens: 5000,
  canonProgress: true,
  promptTokenBudget: 6000,
  budgetVersion: 2,
};

/**
 * Which provider OpenRouter should try first for a model (audit 5.5, decided
 * by Xan). Kept next to the default model ids so a model change can't leave a
 * stale order behind: a model with no entry is routed by OpenRouter as usual.
 * Fallbacks stay on, so a provider being down never breaks a turn.
 * - Gemini through Vertex: Session 1's slow replies (29 to 36 s) all came
 *   through AI Studio, the fast ones (9 to 20 s) through Vertex.
 * - The tracker on one provider, so its repeated prompt can hit the cache
 *   (Session 1: every call went elsewhere; cached on 2 turns of 10). Morph:
 *   the tracker sends `require_parameters` for its strict schema, which rules
 *   DeepSeek's own endpoint out, so all 34 of Session 2's state calls went to
 *   Morph anyway (audit 5.5b; cached 16 of 17, Core 7 to 46 s). If Morph
 *   stays slow, look for another strict-schema provider of the same model.
 */
export const PROVIDER_ORDER: Record<string, string[]> = {
  'google/gemini-3.8-flash': ['google-vertex'],
  'deepseek/deepseek-v4.1-flash-1017': ['morph'],
};

/** The OpenRouter `provider` routing for a model, or undefined to leave it to OpenRouter. */
export function providerRouting(model: string): { order: string[]; allow_fallbacks: true } | undefined {
  const order = PROVIDER_ORDER[model];
  return order ? { order, allow_fallbacks: true } : undefined;
}

/**
 * Choices offered in Settings for the narrator's story context: the tokens
 * for what changes each turn (the recent scene, facts, memories, lore), on
 * top of the fixed rules and Kan's sheet. Until v1.25.9 the number counted
 * the whole prompt (default 9,500), and the fixed part alone had grown to
 * about 8,000, so the narrator read two exchanges of scene and no memories.
 */
export const PROMPT_BUDGET_OPTIONS = [4000, 6000, 8000, 12000] as const;

/** `version` is the save's `budgetVersion`: before 2 the number counted the whole prompt, so it is replaced. */
export function normalizePromptBudget(value: unknown, version?: unknown): number {
  if (version !== 2) return DEFAULT_SETTINGS.promptTokenBudget;
  const number = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_SETTINGS.promptTokenBudget;
  return Math.min(16000, Math.max(3000, Math.round(number)));
}

export function emptyIndex(): MemoryIndex {
  return {
    eventsByTag: {},
    eventsByEntity: {},
    eventsByDate: {},
    factsBySubject: {},
    threadsByStatus: {},
    loreByKeyword: {},
  };
}
