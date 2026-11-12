// The sound beds against a mock Web Audio context (audit 11e.1): every bed
// builds and runs ten minutes without throwing, ramps never aim at zero,
// nothing is scheduled in the past, node creation stays within a budget,
// stop() stops every source, and the noise loops have no seam click.

import { describe, expect, mock, test } from 'bun:test';

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    getAllKeys: async () => [],
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
  },
}));

// Load the world data first, as the app does (ambience alone hits an import cycle).
import '../lib/rpg/db';
import { AMBIENCE_BEDS, ambienceMix, type AmbienceBed, type AmbienceInput } from '../lib/rpg/ambience';
import { LOOKAHEAD_SECONDS } from '../lib/audio/ambienceEngine';
import { BED_BUILDERS, buildBed, makeNoise, seamSamples, type Noise } from '../lib/audio/synth';

// ---------------------------------------------------------------------------
// A small mock of the parts of Web Audio the beds use.

type Problem = string;

class MockContext {
  sampleRate = 48000;
  currentTime = 0;
  created = 0;
  problems: Problem[] = [];
  sources: MockSource[] = [];
  destination = new MockNode(this);

  createBuffer(channels: number, length: number, sampleRate: number) {
    return new MockBuffer(channels, length, sampleRate);
  }
  createBufferSource() {
    const source = new MockSource(this);
    this.sources.push(source);
    return source;
  }
  createOscillator() {
    const osc = new MockOscillator(this);
    this.sources.push(osc);
    return osc;
  }
  createGain() {
    const node = new MockNode(this) as MockNode & { gain: MockParam };
    node.gain = new MockParam(this, 'gain', 1);
    return node;
  }
  createBiquadFilter() {
    const node = new MockNode(this) as MockNode & { type: string; frequency: MockParam; Q: MockParam };
    node.type = 'lowpass';
    node.frequency = new MockParam(this, 'frequency', 350);
    node.Q = new MockParam(this, 'Q', 1);
    return node;
  }
  createStereoPanner() {
    const node = new MockNode(this) as MockNode & { pan: MockParam };
    node.pan = new MockParam(this, 'pan', 0);
    return node;
  }
  createDelay() {
    const node = new MockNode(this) as MockNode & { delayTime: MockParam };
    node.delayTime = new MockParam(this, 'delayTime', 0);
    return node;
  }
}

class MockNode {
  constructor(protected ctx: MockContext) {
    ctx.created += 1;
  }
  connect<T>(dest: T) {
    return dest;
  }
  disconnect() {}
}

class MockParam {
  constructor(private ctx: MockContext, private name: string, public value: number) {}
  private past(time: number, method: string) {
    if (time < this.ctx.currentTime - 1e-9) this.ctx.problems.push(`${this.name}.${method} at ${time.toFixed(3)} < now ${this.ctx.currentTime.toFixed(3)}`);
  }
  setValueAtTime(value: number, time: number) {
    this.past(time, 'setValueAtTime');
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.past(time, 'linearRamp');
    if (!Number.isFinite(value)) this.ctx.problems.push(`${this.name} linear ramp to ${value}`);
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    this.past(time, 'exponentialRamp');
    if (!(value > 0)) this.ctx.problems.push(`${this.name} exponential ramp to ${value}`);
    return this;
  }
  setTargetAtTime() {
    this.ctx.problems.push(`${this.name}: setTargetAtTime is not allowed`);
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class MockBuffer {
  private data: Float32Array[];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.data[channel];
  }
}

class MockSource extends MockNode {
  started = false;
  stopped = false;
  buffer: MockBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  offset = 0;
  onended: (() => void) | null = null;
  start(_when = 0, offset = 0) {
    if (this.started) this.ctx.problems.push('started twice');
    this.started = true;
    this.offset = offset;
  }
  stop() {
    this.stopped = true;
  }
}

class MockOscillator extends MockSource {
  type = 'sine';
  frequency = new MockParam(this.ctx, 'osc.frequency', 440);
  detune = new MockParam(this.ctx, 'osc.detune', 0);
}

/** A small seeded random, so every run hears the same forest. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const ctx0 = new MockContext();
const noise = makeNoise(ctx0 as unknown as BaseAudioContext, seeded(7)) as unknown as Noise;

type Run = { problems: Problem[]; nodesPerMinute: number; unstopped: number; ctx: MockContext };

function run(bed: AmbienceBed, minutes = 10): Run {
  const ctx = new MockContext();
  const bedCtx = ctx as unknown as BaseAudioContext;
  const out = ctx.createGain() as unknown as AudioNode;
  const built = buildBed(bed, bedCtx, out, noise, seeded(bed.length * 31 + 5));
  const afterBuild = ctx.created;

  // The engine's timer: every 200 ms, schedule LOOKAHEAD_SECONDS ahead.
  for (let t = 0; t <= minutes * 60; t += 0.2) {
    ctx.currentTime = t;
    built.tick?.(t, t + LOOKAHEAD_SECONDS);
  }
  const nodesPerMinute = (ctx.created - afterBuild) / minutes;
  built.stop();
  const unstopped = ctx.sources.filter((source) => source.started && !source.stopped).length;
  return { problems: ctx.problems, nodesPerMinute, unstopped, ctx };
}

const runs = new Map<AmbienceBed, Run>();
const runOf = (bed: AmbienceBed) => {
  if (!runs.has(bed)) runs.set(bed, run(bed));
  return runs.get(bed)!;
};

// ---------------------------------------------------------------------------

describe('sound beds: ten minutes each against a mock context', () => {
  test('every bed in the mix has a builder', () => {
    for (const bed of AMBIENCE_BEDS) expect(typeof BED_BUILDERS[bed]).toBe('function');
  });

  for (const bed of AMBIENCE_BEDS) {
    test(`${bed}: builds, ticks ten minutes, no ramp to zero, nothing in the past`, () => {
      const result = runOf(bed);
      expect(result.problems.slice(0, 5)).toEqual([]);
    });

    test(`${bed}: stop() stops every source`, () => {
      const result = runOf(bed);
      expect(result.unstopped).toBe(0);
    });

    test(`${bed}: every noise loop starts after the faded seam`, () => {
      const loops = runOf(bed).ctx.sources.filter((source) => source.loop && source.buffer);
      for (const source of loops) {
        const buffer = source.buffer!;
        expect(source.loopStart).toBeCloseTo(seamSamples(buffer.sampleRate) / buffer.sampleRate, 6);
        expect(source.loopEnd).toBeCloseTo(buffer.duration, 6);
        expect(source.offset).toBeGreaterThanOrEqual(source.loopStart);
        expect(source.offset).toBeLessThan(buffer.duration);
      }
    });
  }

  test('node creation per minute stays within budget (water and drips use a fixed pool)', () => {
    const budget: Partial<Record<AmbienceBed, number>> = {
      stream: 10,
      river: 10,
      'rain-roof': 10,
      'forest-day': 400,
    };
    for (const bed of AMBIENCE_BEDS) {
      const limit = budget[bed] ?? 120;
      const { nodesPerMinute } = runOf(bed);
      if (nodesPerMinute > limit) throw new Error(`${bed}: ${nodesPerMinute.toFixed(0)} nodes a minute (limit ${limit})`);
    }
  });
});

describe('noise loops: no click at the seam', () => {
  const steps = (data: Float32Array) => {
    const out: number[] = [];
    for (let i = 1; i < data.length; i += 1) out.push(Math.abs(data[i] - data[i - 1]));
    return out.sort((a, b) => a - b);
  };

  for (const name of ['white', 'pink', 'brown'] as const) {
    test(`${name}: the jump from the last sample back to loopStart is a normal step`, () => {
      const buffer = noise[name] as unknown as MockBuffer;
      for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel);
        const fade = seamSamples(buffer.sampleRate);
        const last = data[data.length - 1];
        // The fade leaves the last sample all but equal to the one just
        // before loopStart, so going on to loopStart is an ordinary step.
        const peak = Math.max(...Array.from(data.subarray(0, 4096), Math.abs));
        expect(Math.abs(last - data[fade - 1])).toBeLessThan(peak * (2 / fade) + 1e-6);
        const jump = Math.abs(data[fade] - last);
        const sorted = steps(data);
        const p999 = sorted[Math.floor(sorted.length * 0.999)];
        expect(jump).toBeLessThanOrEqual(p999);
      }
    });
  }

  test('brown noise is made at a quarter of the rate and keeps its level', () => {
    const brown = noise.brown as unknown as MockBuffer;
    const pink = noise.pink as unknown as MockBuffer;
    expect(brown.sampleRate).toBe(pink.sampleRate / 4);
    expect(brown.duration).toBeCloseTo(pink.duration, 3);
    const data = brown.getChannelData(0);
    let sum = 0;
    for (const x of data) sum += x * x;
    const rms = Math.sqrt(sum / data.length);
    // The full-rate walk this replaced sat around 0.1 to 0.5 rms.
    expect(rms).toBeGreaterThan(0.05);
    expect(rms).toBeLessThan(0.8);
  });
});

describe('insects and the owl', () => {
  const base: AmbienceInput = {
    condition: 'clear',
    period: 'night',
    hour: 23,
    season: 'summer',
    region: 'fire',
    kind: 'wilderness',
    place: 'Forest north of the Leaf',
    placeId: null,
    fight: false,
  };
  const mix = (change: Partial<AmbienceInput>) => ambienceMix({ ...base, ...change });

  test('a summer night in the forest has crickets and the owl', () => {
    expect(mix({}).beds.insects).toBeGreaterThan(0.5);
    expect(mix({}).beds.owl).toBeGreaterThan(0.3);
  });

  test('winter nights and snowy nights get the owl only', () => {
    for (const change of [{ season: 'winter' as const }, { condition: 'snow' as const }, { season: 'winter' as const, period: 'evening' as const, hour: 19 }]) {
      const beds = mix(change).beds;
      expect(beds.insects).toBeUndefined();
      if (change.period !== 'evening') expect(beds.owl).toBeGreaterThan(0);
    }
  });

  test('no crickets in a village on a snowy night', () => {
    expect(mix({ kind: 'settlement', place: 'Konoha', condition: 'snow', season: 'autumn' }).beds.insects).toBeUndefined();
  });
});
