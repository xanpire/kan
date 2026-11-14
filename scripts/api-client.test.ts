import { afterEach, describe, expect, test } from 'bun:test';

import {
  OpenRouterError,
  completeChat,
  createSseParser,
  describeCallError,
  isTransientError,
  streamChatCompletion,
} from '../lib/openrouter';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

const sse = (...events: unknown[]) =>
  events.map((event) => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');

/** A fetch that answers with a stream sending these chunks, then optionally hanging. */
function streamingFetch(chunks: string[], options: { hang?: boolean } = {}) {
  return (async (_url: unknown, init?: RequestInit) => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));

        if (!options.hang) {
          controller.close();
          return;
        }

        init?.signal?.addEventListener('abort', () => {
          controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

const request = { apiKey: 'k', model: 'm', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('the stream parser', () => {
  test('throws the error OpenRouter sends inside the stream', () => {
    const parser = createSseParser(() => undefined);
    expect(() =>
      parser.push(sse({ error: { code: 429, message: 'Rate limit exceeded' } }))
    ).toThrow('Rate limit exceeded');

    try {
      createSseParser(() => undefined).push(sse({ error: { code: 429, message: 'slow down' } }));
    } catch (caught) {
      expect(caught).toBeInstanceOf(OpenRouterError);
      expect((caught as OpenRouterError).status).toBe(429);
      expect(isTransientError(caught)).toBe(true);
    }
  });

  test('a provider error without a numeric code is a 502', () => {
    try {
      createSseParser(() => undefined).push(sse({ error: { code: 'server_error', message: 'boom' } }));
      throw new Error('no throw');
    } catch (caught) {
      expect((caught as OpenRouterError).status).toBe(502);
    }
  });

  test('reads the last line even without a trailing newline', () => {
    const deltas: string[] = [];
    const parser = createSseParser((delta) => deltas.push(delta));
    parser.push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Rain ' } }] })}\n`);
    parser.push(`data: ${JSON.stringify({ choices: [{ delta: { content: 'falls.' }, finish_reason: 'stop' }] })}`);
    const result = parser.finish();
    expect(result.full).toBe('Rain falls.');
    expect(result.finishReason).toBe('stop');
    expect(deltas).toEqual(['Rain ', 'falls.']);
  });

  test('keeps ignoring comments and broken fragments', () => {
    const parser = createSseParser(() => undefined);
    parser.push(': OPENROUTER PROCESSING\n\ndata: {not json\n\n' + sse({ choices: [{ delta: { content: 'ok' } }] }, '[DONE]'));
    expect(parser.finish().full).toBe('ok');
  });
});

describe('streamChatCompletion', () => {
  test('a mid-stream error reaches the caller instead of an empty reply', async () => {
    globalThis.fetch = streamingFetch([sse({ error: { code: 502, message: 'Provider returned error' } })]);
    await expect(streamChatCompletion({ ...request, onDelta: () => undefined })).rejects.toThrow(
      'Provider returned error'
    );
  });

  test('an HTTP failure keeps its status', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { message: 'Insufficient credits' } }), { status: 402 })) as typeof fetch;

    try {
      await streamChatCompletion({ ...request, onDelta: () => undefined });
      throw new Error('no throw');
    } catch (caught) {
      expect((caught as OpenRouterError).status).toBe(402);
      expect(describeCallError(caught)).toContain('out of credits');
    }
  });

  test('a stream that stalls is given up as a timeout, keeping what came', async () => {
    const deltas: string[] = [];
    globalThis.fetch = streamingFetch([sse({ choices: [{ delta: { content: 'You wait.' } }] })], { hang: true });

    try {
      await streamChatCompletion({ ...request, timeoutMs: 40, onDelta: (delta) => deltas.push(delta) });
      throw new Error('no throw');
    } catch (caught) {
      expect((caught as Error).name).toBe('OpenRouterTimeoutError');
      expect(isTransientError(caught)).toBe(true);
    }

    expect(deltas).toEqual(['You wait.']);
  });

  test('a stop from the player is an AbortError, not a timeout', async () => {
    globalThis.fetch = streamingFetch([sse({ choices: [{ delta: { content: 'You' } }] })], { hang: true });
    const controller = new AbortController();
    const pending = streamChatCompletion({ ...request, signal: controller.signal, onDelta: () => undefined });
    setTimeout(() => controller.abort(), 10);

    try {
      await pending;
      throw new Error('no throw');
    } catch (caught) {
      expect((caught as Error).name).toBe('AbortError');
      expect(isTransientError(caught)).toBe(false);
    }
  });
});

describe('completeChat', () => {
  test('a call that never answers times out', async () => {
    globalThis.fetch = ((_url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        );
      })) as typeof fetch;

    await expect(completeChat({ ...request, timeoutMs: 30 })).rejects.toThrow('did not answer within');
  });

  test('a 200 that only carries an error is thrown', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { code: 503, message: 'No instances available' } }), {
        status: 200,
      })) as typeof fetch;

    try {
      await completeChat(request);
      throw new Error('no throw');
    } catch (caught) {
      expect((caught as OpenRouterError).status).toBe(503);
    }
  });
});

describe('describeCallError', () => {
  const said = (status: number, message = '') => describeCallError(new OpenRouterError(message, status));

  test('says what went wrong and what to do, in second person', () => {
    expect(said(401)).toBe('OpenRouter rejected your API key. Check it in Settings.');
    expect(said(402)).toContain('out of credits');
    expect(said(429)).toContain('rate-limiting you');
    expect(said(503)).toContain('having trouble');
    expect(said(400, "This endpoint's maximum context length is 32768 tokens")).toContain('too long');
    expect(said(403, 'Input was flagged by moderation')).toContain('refused');
    expect(said(404, 'No endpoints found for model')).toContain('No provider');
    expect(describeCallError(new TypeError('Failed to fetch'))).toContain('offline');
  });
});

describe('keeping a stopped reply', () => {
  test('two full sentences or more are kept, cut at the last full stop', async () => {
    const { keepablePartial } = await import('../lib/rpg/util');
    expect(keepablePartial('Rain hammers the roof. Itachi does not look up. "We leave at')).toBe(
      'Rain hammers the roof. Itachi does not look up.'
    );
    expect(keepablePartial('The door opens. "Who sent you?" he asks, and')).toBe('The door opens. "Who sent you?"');
  });

  test('less than that is thrown away', async () => {
    const { keepablePartial } = await import('../lib/rpg/util');
    expect(keepablePartial('')).toBeNull();
    expect(keepablePartial('Rain hammers the roof. Itachi')).toBeNull();
    expect(keepablePartial('Rain hammers the')).toBeNull();
  });
});

describe('which output mode answered', () => {
  const ok = () =>
    new Response(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }), { status: 200 });
  const schema = { name: 's', schema: { type: 'object' } };

  test('a strict schema answer says so', async () => {
    globalThis.fetch = (async () => ok()) as typeof fetch;
    expect((await completeChat({ ...request, jsonSchema: schema })).responseMode).toBe('schema');
  });

  test('a refused schema falls to JSON mode, then to a plain reply, and the result says which', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls === 1 ? new Response('{}', { status: 404 }) : ok();
    }) as typeof fetch;
    expect((await completeChat({ ...request, jsonSchema: schema })).responseMode).toBe('json_object');

    calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return calls <= 2 ? new Response('{}', { status: 400 }) : ok();
    }) as typeof fetch;
    expect((await completeChat({ ...request, jsonSchema: schema })).responseMode).toBe('plain');
  });
});

describe('provider preference (audit 5.5, decided by Xan)', () => {
  /** A fetch that records each request body and answers a plain or streamed reply. */
  function recordingFetch(bodies: Record<string, unknown>[], stream: boolean) {
    return (async (_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)));
      if (stream) {
        const encoder = new TextEncoder();
        const text = sse({ choices: [{ delta: { content: 'You wait.' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }, '[DONE]');
        return new Response(new ReadableStream({ start: (c) => { c.enqueue(encoder.encode(text)); c.close(); } }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' }, finish_reason: 'stop' }] }), { status: 200 });
    }) as typeof fetch;
  }

  test('the narrator prefers Vertex, with fallbacks on', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = recordingFetch(bodies, true);
    await streamChatCompletion({ ...request, model: 'google/gemini-3.8-flash', onDelta: () => undefined });
    expect(bodies[0].provider).toEqual({ order: ['google-vertex'], allow_fallbacks: true });
  });

  test('the tracker prefers DeepSeek and still requires the schema', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = recordingFetch(bodies, false);
    await completeChat({ ...request, model: 'deepseek/deepseek-v4.1-flash-1017', jsonSchema: { name: 's', schema: { type: 'object' } } });
    expect(bodies[0].provider).toEqual({ order: ['morph'], allow_fallbacks: true, require_parameters: true });
  });

  test('a model with no preference is left to OpenRouter', async () => {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = recordingFetch(bodies, false);
    await completeChat({ ...request, model: 'someone/other-model' });
    expect(bodies[0].provider).toBeUndefined();
  });
});
