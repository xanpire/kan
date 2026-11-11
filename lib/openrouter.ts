import type { OpenRouterMessage } from './rpg/types';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';
const IMAGE_MODELS_URL = 'https://openrouter.ai/api/v1/images/models';
const IMAGES_URL = 'https://openrouter.ai/api/v1/images';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const KEY_URL = 'https://openrouter.ai/api/v1/key';
const GENERATION_URL = 'https://openrouter.ai/api/v1/generation';

export type OpenRouterModelSummary = {
  id: string;
  name: string;
  contextLength: number;
  promptPrice: string | null;
  recommended: boolean;
  /** Short tag shown next to the name, e.g. "4 refs". */
  badge?: string;
};

type RawModel = {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string };
};

export type OpenRouterImageModelSummary = {
  id: string;
  name: string;
  description: string;
  supportsStreaming: boolean;
  supportsImageInput: boolean;
  supportedParameters: string[];
  params: Record<string, ImageParamDescriptor>;
  maxReferences: number;
};

export type ImageGenerationResult = {
  dataUri: string;
  mediaType: string;
  cost: number | null;
};

export type KeyTestResult =
  | { ok: true; label: string }
  | { ok: false; message: string };

export type ChatRequest = {
  apiKey: string;
  model: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  responseFormatJson?: boolean;
  /**
   * Ask for OpenRouter structured output against this JSON schema. Falls
   * back to plain JSON mode, then to an ordinary reply, if the model (or
   * every provider for it) can't do structured output.
   */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  /**
   * OpenRouter reasoning settings. `exclude: true` keeps the thinking out of
   * the reply text; it still counts against max_tokens.
   */
  reasoning?: { effort?: 'low' | 'medium' | 'high'; exclude?: boolean };
  /**
   * Gives up after this long. For a plain call it is the whole call; for a
   * stream it is the longest wait for the next chunk. A timeout throws an
   * OpenRouterError with status 408, so it counts as a passing failure.
   */
  timeoutMs?: number;
};

/** How long each kind of call may take before it is given up (section 5.1 of the audit). */
export const CALL_TIMEOUTS = {
  /** A stream that sends nothing for this long has stalled. */
  streamStall: 45_000,
  state: 60_000,
  summary: 90_000,
  image: 180_000,
} as const;

/** What OpenRouter reported for one call. Nothing here is estimated unless `estimated` says so. */
export type CallUsage = {
  promptTokens: number;
  completionTokens: number;
  /** Thinking tokens (billed as completion tokens). */
  reasoningTokens: number;
  /** Prompt tokens served from the provider's cache. */
  cachedTokens: number;
  /** True when OpenRouter sent no usage and the counts are a length estimate. */
  estimated: boolean;
  /** USD, as billed by OpenRouter. Null until known. */
  cost: number | null;
  generationId: string | null;
  /** The model that actually answered (can differ from the one asked for). */
  servedModel: string | null;
  provider: string | null;
  durationMs: number;
};

export type StreamResult = {
  text: string;
  promptTokens: number;
  completionTokens: number;
  finishReason?: string;
  usage: CallUsage;
};

type RawUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
  prompt_tokens_details?: { cached_tokens?: number };
};

function readUsage(
  raw: RawUsage | undefined,
  meta: { id?: string; model?: string; provider?: string },
  fallback: { prompt: number; completion: number },
  startedAt: number
): CallUsage {
  const hasCounts = typeof raw?.prompt_tokens === 'number' && raw.prompt_tokens > 0;

  return {
    promptTokens: hasCounts ? (raw?.prompt_tokens as number) : fallback.prompt,
    completionTokens:
      typeof raw?.completion_tokens === 'number' ? raw.completion_tokens : fallback.completion,
    reasoningTokens: raw?.completion_tokens_details?.reasoning_tokens ?? 0,
    cachedTokens: raw?.prompt_tokens_details?.cached_tokens ?? 0,
    estimated: !hasCounts,
    cost: typeof raw?.cost === 'number' ? raw.cost : null,
    generationId: meta.id ?? null,
    servedModel: meta.model ?? null,
    provider: meta.provider ?? null,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Looks up the billed cost of a finished call. OpenRouter needs a moment to
 * settle the stats, so this retries a few times. Returns null if it never
 * becomes available.
 */
export async function fetchGenerationCost(
  apiKey: string,
  generationId: string
): Promise<number | null> {
  const delays = [1500, 3000, 6000];

  for (const delay of delays) {
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const response = await fetch(
        `${GENERATION_URL}?id=${encodeURIComponent(generationId)}`,
        { headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` } }
      );

      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as { data?: { total_cost?: number } };

      if (typeof payload.data?.total_cost === 'number') {
        return payload.data.total_cost;
      }
    } catch {
      // Try again after the next delay.
    }
  }

  return null;
}

const RECOMMENDED_MODELS = new Set([
  'deepseek/deepseek-v4.1-flash-1017',
  'google/gemini-3.8-flash',
  'anthropic/claude-sonnet-5.5',
  'google/gemini-4-argon',
  'openai/gpt-6.1-sol',
]);

export async function fetchOpenRouterModels(): Promise<OpenRouterModelSummary[]> {
  const response = await fetch(MODELS_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Could not load OpenRouter models.');
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      context_length?: number;
      pricing?: { prompt?: string };
    }>;
  };

  return (payload.data ?? [])
    .filter((model): model is RawModel & { id: string; name: string } => Boolean(model.id && model.name))
    .map((model) => ({
      id: model.id,
      name: model.name.includes(':')
        ? model.name.split(':').slice(1).join(':').trim()
        : model.name,
      contextLength: model.context_length ?? 0,
      promptPrice: formatPrice(model.pricing?.prompt),
      recommended: RECOMMENDED_MODELS.has(model.id),
    }))
    .sort((a, b) => {
      if (a.recommended !== b.recommended) {
        return a.recommended ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
}

export async function fetchOpenRouterImageModels(): Promise<OpenRouterImageModelSummary[]> {
  const response = await fetch(IMAGE_MODELS_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error('Could not load OpenRouter image models.');
  }

  const payload = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      description?: string;
      supports_streaming?: boolean;
      supported_parameters?: Record<string, unknown>;
      architecture?: { input_modalities?: string[] };
    }>;
  };

  return (payload.data ?? [])
    .filter(
      (
        model
      ): model is {
        id: string;
        name: string;
        description?: string;
        supports_streaming?: boolean;
        supported_parameters?: Record<string, unknown>;
        architecture?: { input_modalities?: string[] };
      } => Boolean(model.id && model.name)
    )
    .map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description ?? '',
      supportsStreaming: Boolean(model.supports_streaming),
      supportsImageInput: Boolean(
        model.architecture?.input_modalities?.includes('image')
      ),
      supportedParameters: Object.keys(model.supported_parameters ?? {}),
      params: readParams(model.supported_parameters),
      maxReferences: maxReferencesOf(readParams(model.supported_parameters)),
    }))
    .sort((a, b) => {
      if (a.maxReferences !== b.maxReferences) {
        return b.maxReferences - a.maxReferences;
      }

      return a.name.localeCompare(b.name);
    });
}

/** One request field an image endpoint accepts, as OpenRouter describes it. */
export type ImageParamDescriptor =
  | { type: 'enum'; values: string[] }
  | { type: 'range'; min: number; max: number }
  | { type: 'boolean' };

/**
 * What the chosen image model accepts. Looked up when the model is picked in
 * Settings, so requests only carry fields the model takes.
 */
export type ImageModelCaps = {
  modelId: string;
  params: Record<string, ImageParamDescriptor>;
  /** How many reference images every endpoint of this model accepts. 0 = none. */
  maxReferences: number;
  /** "endpoints": strict per-provider records. "model": the looser model-level summary. */
  source: 'endpoints' | 'model';
  fetchedAt: number;
};

function readDescriptor(raw: unknown): ImageParamDescriptor | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value = raw as { type?: string; values?: unknown; min?: unknown; max?: unknown };

  if (value.type === 'enum' && Array.isArray(value.values)) {
    return { type: 'enum', values: value.values.filter((v): v is string => typeof v === 'string') };
  }

  if (value.type === 'range') {
    const min = typeof value.min === 'number' ? value.min : 0;
    const max = typeof value.max === 'number' ? value.max : min;
    return { type: 'range', min, max };
  }

  if (value.type === 'boolean') {
    return { type: 'boolean' };
  }

  return null;
}

function readParams(raw: unknown): Record<string, ImageParamDescriptor> {
  const params: Record<string, ImageParamDescriptor> = {};

  if (!raw || typeof raw !== 'object') {
    return params;
  }

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const descriptor = readDescriptor(value);

    if (descriptor) {
      params[key] = descriptor;
    }
  }

  return params;
}

/** Keeps only what every endpoint accepts, so whichever provider serves the call takes it. */
function intersectParams(list: Array<Record<string, ImageParamDescriptor>>) {
  if (list.length === 0) {
    return {};
  }

  const result: Record<string, ImageParamDescriptor> = {};

  for (const [key, first] of Object.entries(list[0])) {
    const all = list.map((params) => params[key]);

    if (all.some((descriptor) => !descriptor || descriptor.type !== first.type)) {
      continue;
    }

    if (first.type === 'enum') {
      const values = first.values.filter((v) =>
        all.every((d) => (d as { values: string[] }).values.includes(v))
      );

      if (values.length > 0) {
        result[key] = { type: 'enum', values };
      }
    } else if (first.type === 'range') {
      const min = Math.max(...all.map((d) => (d as { min: number }).min));
      const max = Math.min(...all.map((d) => (d as { max: number }).max));

      if (max >= min) {
        result[key] = { type: 'range', min, max };
      }
    } else {
      result[key] = first;
    }
  }

  return result;
}

function maxReferencesOf(params: Record<string, ImageParamDescriptor>) {
  const descriptor = params.input_references;

  if (!descriptor) {
    return 0;
  }

  if (descriptor.type === 'range') {
    return Math.max(0, Math.floor(descriptor.max));
  }

  // Supported but no count given: one is the only safe number.
  return 1;
}

/**
 * Looks up which settings and how many reference images an image model
 * takes. Uses the per-endpoint records (the strict truth) and falls back to
 * the model list's summary.
 */
export async function fetchImageModelCaps(modelId: string): Promise<ImageModelCaps> {
  const id = modelId.trim();

  try {
    const response = await fetch(`${IMAGE_MODELS_URL}/${id}/endpoints`, {
      headers: { Accept: 'application/json' },
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        data?: { endpoints?: Array<{ supported_parameters?: unknown }> };
        endpoints?: Array<{ supported_parameters?: unknown }>;
      };
      const endpoints = payload.endpoints ?? payload.data?.endpoints ?? [];

      if (endpoints.length > 0) {
        const params = intersectParams(endpoints.map((e) => readParams(e.supported_parameters)));

        return {
          modelId: id,
          params,
          maxReferences: maxReferencesOf(params),
          source: 'endpoints',
          fetchedAt: Date.now(),
        };
      }
    }
  } catch {
    // Fall through to the model list.
  }

  const models = await fetchOpenRouterImageModels();
  const model = models.find((entry) => entry.id === id);

  if (!model) {
    throw new Error(`OpenRouter has no image model called ${id}.`);
  }

  return {
    modelId: id,
    params: model.params,
    maxReferences: maxReferencesOf(model.params),
    source: 'model',
    fetchedAt: Date.now(),
  };
}

function ratioOf(value: string) {
  const [w, h] = value.split(':').map(Number);
  return w > 0 && h > 0 ? w / h : null;
}

/** The request body for this model: only fields it accepts, with values it allows. */
export function buildImageRequestBody(
  caps: ImageModelCaps,
  request: { prompt: string; references: string[]; aspectRatio: string }
) {
  const { params } = caps;
  const body: Record<string, unknown> = { model: caps.modelId, prompt: request.prompt };
  const pick = (key: string, preferred: string[]) => {
    const descriptor = params[key];

    if (descriptor?.type !== 'enum') {
      return null;
    }

    return preferred.find((value) => descriptor.values.includes(value)) ?? null;
  };

  const resolution = pick('resolution', ['1K', '2K']);
  if (resolution) body.resolution = resolution;

  const aspect = params.aspect_ratio;
  if (aspect?.type === 'enum' && aspect.values.length > 0) {
    if (aspect.values.includes(request.aspectRatio)) {
      body.aspect_ratio = request.aspectRatio;
    } else {
      const target = ratioOf(request.aspectRatio) ?? 1;
      const closest = aspect.values
        .map((value) => ({ value, ratio: ratioOf(value) }))
        .filter((entry): entry is { value: string; ratio: number } => entry.ratio !== null)
        .sort((a, b) => Math.abs(Math.log(a.ratio / target)) - Math.abs(Math.log(b.ratio / target)))[0];

      if (closest) body.aspect_ratio = closest.value;
    }
  }

  const quality = pick('quality', ['high', 'medium', 'auto']);
  if (quality) body.quality = quality;

  const format = pick('output_format', ['jpeg', 'webp']);
  if (format) {
    body.output_format = format;
    const compression = params.output_compression;

    if (compression?.type === 'range') {
      body.output_compression = Math.min(compression.max, Math.max(compression.min, 80));
    }
  }

  const references = request.references.filter(Boolean).slice(0, caps.maxReferences);

  if (references.length > 0) {
    body.input_references = references.map((url) => ({
      type: 'image_url',
      image_url: { url },
    }));
  }

  return { body, sentReferences: references.length };
}

export async function generateImage({
  apiKey,
  caps,
  prompt,
  inputReferences,
  aspectRatio = '16:9',
  signal,
  timeoutMs = CALL_TIMEOUTS.image,
}: {
  apiKey: string;
  caps: ImageModelCaps;
  prompt: string;
  /** In priority order: anything past the model's limit is left off the end. */
  inputReferences?: string[];
  aspectRatio?: '16:9' | '3:4';
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<ImageGenerationResult> {
  if (!apiKey) {
    throw new Error('Add your OpenRouter API key in Settings first.');
  }

  const { body } = buildImageRequestBody(caps, {
    prompt,
    references: inputReferences ?? [],
    aspectRatio,
  });

  const timer = timeoutSignal(signal, timeoutMs);
  let payload: {
    data?: Array<{
      b64_json?: string;
      media_type?: string;
    }>;
    usage?: { cost?: number };
  };

  try {
    let response = await fetch(IMAGES_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey, false),
      body: JSON.stringify(body),
      signal: timer.signal,
    });

    // A rejected optional setting: retry with only the prompt and the same
    // references. References are never dropped here: that would lose Kan's face.
    if (response.status === 400 || response.status === 422) {
      const minimal: Record<string, unknown> = { model: body.model, prompt: body.prompt };

      if (body.input_references) {
        minimal.input_references = body.input_references;
      }

      response = await fetch(IMAGES_URL, {
        method: 'POST',
        headers: buildHeaders(apiKey, false),
        body: JSON.stringify(minimal),
        signal: timer.signal,
      });
    }

    if (!response.ok) {
      throw new OpenRouterError(await readErrorMessage(response), response.status);
    }

    payload = (await response.json()) as typeof payload;
  } catch (caught) {
    throw timer.wrap(caught);
  } finally {
    timer.clear();
  }

  const image = payload.data?.[0];

  if (!image?.b64_json) {
    throw new Error('The image model did not return an image.');
  }

  const mediaType = image.media_type ?? 'image/png';

  return {
    dataUri: `data:${mediaType};base64,${image.b64_json}`,
    mediaType,
    cost: payload.usage?.cost ?? null,
  };
}

export async function testOpenRouterKey(key: string): Promise<KeyTestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(KEY_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key.trim()}`,
      },
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, message: 'OpenRouter rejected this key.' };
    }

    if (response.status === 429) {
      return { ok: false, message: 'OpenRouter is rate limiting. Try again soon.' };
    }

    if (!response.ok) {
      return { ok: false, message: 'OpenRouter could not verify this key.' };
    }

    const payload = (await response.json()) as { data?: { label?: string } };
    return { ok: true, label: payload.data?.label?.trim() || 'OpenRouter key' };
  } catch {
    return { ok: false, message: 'Could not reach OpenRouter.' };
  } finally {
    clearTimeout(timeout);
  }
}

function formatPrice(value: string | undefined) {
  if (value === undefined) {
    return null;
  }

  const price = Number(value);

  if (!Number.isFinite(price)) {
    return null;
  }

  if (price === 0) {
    return 'Free';
  }

  const perMillion = price * 1_000_000;

  if (perMillion < 1) {
    return `$${perMillion.toFixed(2)} / 1M`;
  }

  if (perMillion < 10) {
    return `$${perMillion.toFixed(1)} / 1M`;
  }

  return `$${Math.round(perMillion)} / 1M`;
}

function buildHeaders(apiKey: string, json: boolean) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'X-Title': 'Kan RPG',
  };

  if (json) {
    headers.Accept = 'application/json';
  }

  return headers;
}

/** An error OpenRouter answered with, keeping the HTTP status for retry decisions. */
export class OpenRouterError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
  }
}

/** Thrown when a call ran past its timeout. Status 408, so it is retried like a dropped call. */
export class OpenRouterTimeoutError extends OpenRouterError {
  constructor(seconds: number) {
    super(`OpenRouter did not answer within ${seconds} seconds.`, 408);
    this.name = 'OpenRouterTimeoutError';
  }
}

/**
 * A signal that aborts when the caller's signal does, or when the timer runs
 * out. `touch()` restarts the timer (a stream calls it on every chunk).
 */
export function timeoutSignal(parent: AbortSignal | undefined, ms: number | undefined) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;

  const onParentAbort = () => controller.abort(parent?.reason);

  if (parent) {
    if (parent.aborted) {
      controller.abort(parent.reason);
    } else {
      parent.addEventListener('abort', onParentAbort, { once: true });
    }
  }

  const touch = () => {
    if (!ms || ms <= 0 || controller.signal.aborted) {
      return;
    }

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
  };

  touch();

  return {
    signal: controller.signal,
    touch,
    timedOut: () => timedOut,
    clear: () => {
      if (timer) {
        clearTimeout(timer);
      }

      parent?.removeEventListener('abort', onParentAbort);
    },
    /** The error to throw: a timeout as OpenRouterTimeoutError, anything else unchanged. */
    wrap: (caught: unknown) =>
      timedOut && !parent?.aborted ? new OpenRouterTimeoutError(Math.round((ms ?? 0) / 1000)) : caught,
  };
}

/**
 * A failure as one plain sentence for the player, with what to do about it.
 * Second person; never a status code on its own.
 */
export function describeCallError(caught: unknown): string {
  if (!caught || typeof caught !== 'object') {
    return 'The narrator could not respond. Try again.';
  }

  const error = caught as { name?: string; status?: number; message?: string };
  const message = (error.message ?? '').toLowerCase();

  if (error.name === 'AbortError') {
    return 'You stopped the reply.';
  }

  if (error.name === 'OpenRouterTimeoutError' || error.status === 408) {
    return 'OpenRouter took too long to answer. Try again in a moment.';
  }

  if (error.status === 401 || (error.status === 403 && /key|auth/.test(message))) {
    return 'OpenRouter rejected your API key. Check it in Settings.';
  }

  if (error.status === 402 || /insufficient credits|more credits|credit/.test(message)) {
    return 'Your OpenRouter account is out of credits. Add credits on openrouter.ai, then try again.';
  }

  if (error.status === 429) {
    return 'OpenRouter is rate-limiting you. Wait a few seconds and try again.';
  }

  if (/context length|context window|maximum context|too many tokens|too long/.test(message)) {
    return 'The story is too long for this narrator model. Pick a model with a larger context in Settings.';
  }

  if (/moderation|content filter|flagged|safety|content_policy/.test(message)) {
    return "The model's provider refused this reply. Try again, or rephrase what you do.";
  }

  if (/no endpoints|no provider|no allowed providers/.test(message) || error.status === 404) {
    return 'No provider can run this model right now. Try again later, or pick another model in Settings.';
  }

  if (typeof error.status === 'number' && error.status >= 500) {
    return "OpenRouter or the model's provider is having trouble. Try again in a moment.";
  }

  if (caught instanceof TypeError) {
    return 'You seem to be offline. Check your connection and try again.';
  }

  return error.message || 'The narrator could not respond. Try again.';
}

/**
 * Worth trying again: the network dropped, a rate limit (429), a timeout
 * (408) or a server/provider error (5xx). Never a cancel or a bad key.
 */
export function isTransientError(caught: unknown): boolean {
  if (!caught || typeof caught !== 'object') {
    return false;
  }

  const error = caught as { name?: string; status?: number };

  if (error.name === 'AbortError') {
    return false;
  }

  if (typeof error.status === 'number') {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  // fetch rejects with a TypeError when the network fails.
  return caught instanceof TypeError;
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? `OpenRouter request failed (${response.status}).`;
  } catch {
    return `OpenRouter request failed (${response.status}).`;
  }
}

/**
 * Model families whose caching only kicks in with explicit cache_control
 * breakpoints. OpenAI, DeepSeek, Grok, Moonshot and others cache a repeated
 * prefix on their own, so they get plain string content.
 */
function needsCacheBreakpoints(model: string) {
  return /^(anthropic|google|qwen)\//.test(model);
}

/** Messages as sent on the wire: cacheable blocks become marked text parts where the model needs them. */
function toWireMessages(model: string, messages: OpenRouterMessage[]) {
  const explicit = needsCacheBreakpoints(model);

  return messages.map((message) => {
    if (message.images && message.images.length > 0) {
      return {
        role: message.role,
        content: [
          { type: 'text', text: message.content },
          ...message.images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      };
    }

    if (!explicit || !message.parts || message.parts.length === 0) {
      return { role: message.role, content: message.content };
    }

    return {
      role: message.role,
      content: message.parts.map((part) =>
        part.cache
          ? { type: 'text', text: part.text, cache_control: { type: 'ephemeral' } }
          : { type: 'text', text: part.text }
      ),
    };
  });
}

export async function completeChat({
  apiKey,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 900,
  signal,
  responseFormatJson = false,
  jsonSchema,
  reasoning,
  timeoutMs = CALL_TIMEOUTS.state,
}: ChatRequest): Promise<StreamResult> {
  if (!apiKey) {
    throw new Error('Add your OpenRouter API key in Settings first.');
  }

  const body: Record<string, unknown> = {
    model,
    messages: toWireMessages(model, messages),
    temperature,
    max_tokens: maxTokens,
    stream: false,
    reasoning: { exclude: true, ...(reasoning ?? {}) },
    usage: { include: true },
  };

  const startedAt = Date.now();

  if (jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: jsonSchema.name, strict: true, schema: jsonSchema.schema },
    };
    // Only route to providers that actually enforce the schema.
    body.provider = { require_parameters: true };
  } else if (responseFormatJson) {
    body.response_format = { type: 'json_object' };
  }

  const wantsJson = Boolean(jsonSchema) || responseFormatJson;
  const timer = timeoutSignal(signal, timeoutMs);
  let response: Response;
  let payload: {
    id?: string;
    model?: string;
    provider?: string;
    error?: { message?: string; code?: number };
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: RawUsage;
  } = {};

  try {
    response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey, wantsJson),
      body: JSON.stringify(body),
      signal: timer.signal,
    });

    if (response.ok) {
      payload = (await response.json()) as typeof payload;
    }
  } catch (caught) {
    throw timer.wrap(caught);
  } finally {
    timer.clear();
  }

  if (!response.ok) {
    const message = await readErrorMessage(response);
    // 400/422: parameter rejected. 404: no provider supports it.
    const unsupported =
      response.status === 400 || response.status === 404 || response.status === 422;

    if (jsonSchema && unsupported) {
      return completeChat({
        apiKey,
        model,
        messages,
        temperature,
        maxTokens,
        signal,
        reasoning,
        timeoutMs,
        responseFormatJson: true,
      });
    }

    if (responseFormatJson && unsupported) {
      return completeChat({
        apiKey,
        model,
        messages,
        temperature,
        maxTokens,
        signal,
        reasoning,
        timeoutMs,
        responseFormatJson: false,
      });
    }

    throw new OpenRouterError(message, response.status);
  }

  // A 200 can still carry an error (the provider failed after accepting).
  if (payload.error && !payload.choices?.length) {
    throw new OpenRouterError(
      payload.error.message ?? 'OpenRouter returned an error.',
      typeof payload.error.code === 'number' ? payload.error.code : 502
    );
  }

  const text = payload.choices?.[0]?.message?.content ?? '';
  const usage = readUsage(
    payload.usage,
    payload,
    {
      prompt: estimateTokens(messages),
      completion: estimateTokens([{ role: 'assistant', content: text }]),
    },
    startedAt
  );

  return {
    text,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    finishReason: payload.choices?.[0]?.finish_reason,
    usage,
  };
}

export async function streamChatCompletion({
  apiKey,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 900,
  signal,
  reasoning,
  timeoutMs = CALL_TIMEOUTS.streamStall,
  onDelta,
}: ChatRequest & { onDelta: (delta: string) => void }): Promise<StreamResult> {
  if (!apiKey) {
    throw new Error('Add your OpenRouter API key in Settings first.');
  }

  const body: Record<string, unknown> = {
    model,
    messages: toWireMessages(model, messages),
    temperature,
    max_tokens: maxTokens,
    stream: true,
    usage: { include: true },
  };

  if (reasoning) {
    body.reasoning = reasoning;
  }

  const startedAt = Date.now();
  // The timer is the stall timer: every chunk restarts it.
  const timer = timeoutSignal(signal, timeoutMs);

  try {
    return await readStream();
  } catch (caught) {
    throw timer.wrap(caught);
  } finally {
    timer.clear();
  }

  async function readStream(): Promise<StreamResult> {
    const response = await fetch(CHAT_URL, {
      method: 'POST',
      headers: buildHeaders(apiKey, false),
      body: JSON.stringify(body),
      signal: timer.signal,
    });

    if (!response.ok) {
      throw new OpenRouterError(await readErrorMessage(response), response.status);
    }

    if (!response.body) {
      const text = await response.text();
      onDelta(text);
      const usage = readUsage(
        undefined,
        {},
        {
          prompt: estimateTokens(messages),
          completion: estimateTokens([{ role: 'assistant', content: text }]),
        },
        startedAt
      );

      return {
        text,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        usage,
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createSseParser(onDelta);

    while (true) {
      const { done, value } = await reader.read();
      timer.touch();

      if (done) {
        break;
      }

      parser.push(decoder.decode(value, { stream: true }));
    }

    parser.push(decoder.decode());
    const { full, rawUsage, meta, finishReason } = parser.finish();

    const usage = readUsage(
      rawUsage,
      meta,
      {
        prompt: estimateTokens(messages),
        completion: estimateTokens([{ role: 'assistant', content: full }]),
      },
      startedAt
    );

    return {
      text: full,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      finishReason,
      usage,
    };
  }
}

/**
 * Reads OpenRouter's server-sent events. A mid-stream failure arrives as an
 * `error` object in a `data:` line and is thrown as an OpenRouterError, so
 * the player sees the real reason instead of "an empty reply". Whatever is
 * left in the buffer when the stream ends is read too.
 */
export function createSseParser(onDelta: (delta: string) => void) {
  let buffer = '';
  let full = '';
  let rawUsage: RawUsage | undefined;
  const meta: { id?: string; model?: string; provider?: string } = {};
  let finishReason: string | undefined;

  const readLine = (line: string) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) {
      return;
    }

    const data = trimmed.slice(5).trim();

    if (data === '[DONE]') {
      return;
    }

    let parsed: {
      id?: string;
      model?: string;
      provider?: string;
      error?: { message?: string; code?: number | string };
      choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
      usage?: RawUsage;
    };

    try {
      parsed = JSON.parse(data);
    } catch {
      // Ignore malformed SSE fragments.
      return;
    }

    if (parsed.error) {
      const code = Number(parsed.error.code);
      throw new OpenRouterError(
        parsed.error.message ?? 'The stream failed.',
        Number.isFinite(code) && code >= 100 ? code : 502
      );
    }

    meta.id = parsed.id ?? meta.id;
    meta.model = parsed.model ?? meta.model;
    meta.provider = parsed.provider ?? meta.provider;

    if (parsed.choices?.[0]?.finish_reason) {
      finishReason = parsed.choices[0].finish_reason ?? finishReason;
    }

    // Some providers end a failed stream with finish_reason "error".
    if (finishReason === 'error' && !full) {
      throw new OpenRouterError('The model stopped with an error before writing anything.', 502);
    }

    const delta = parsed.choices?.[0]?.delta?.content;

    if (delta) {
      full += delta;
      onDelta(delta);
    }

    if (parsed.usage) {
      rawUsage = parsed.usage;
    }
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(readLine);
    },
    finish() {
      if (buffer) {
        readLine(buffer);
        buffer = '';
      }

      return { full, rawUsage, meta, finishReason };
    },
  };
}

export function estimateTokens(messages: OpenRouterMessage[]) {
  const text = messages.map((message) => message.content).join('\n');
  return Math.ceil(text.length / 4);
}
