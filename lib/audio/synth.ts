// Sound beds, synthesised live with Web Audio (section 17).
//
// Every bed is built from noise and oscillators, so nothing is downloaded,
// nothing is licensed and no loop ever repeats. Each builder wires its nodes
// into `out` and may return a `tick`, called a few times a second with the
// current time, to schedule events ahead (a bird call, a drip, a wave, a roll
// of thunder). Builders only use standard Web Audio, so they also run in an
// OfflineAudioContext for testing.

import type { AmbienceBed } from '@/lib/rpg/ambience';

export type Bed = {
  /** Schedule events from `now` up to `until` (seconds, context time). */
  tick?: (now: number, until: number) => void;
  /** Stop every source; the engine disconnects `out` itself. */
  stop: () => void;
};

export type Noise = { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer };

type Kit = {
  ctx: BaseAudioContext;
  out: AudioNode;
  noise: Noise;
  random: () => number;
};

const NOISE_SECONDS = 7;
/** The cross-faded stretch at each end of a noise buffer. */
export const SEAM_SECONDS = 0.05;
/** Brown noise has nothing above a few hundred hertz, so it is made at a quarter of the rate. */
const BROWN_RATE_DIVISOR = 4;

/** Samples cross-faded at the seam of a buffer at this rate. */
export function seamSamples(sampleRate: number) {
  return Math.floor(sampleRate * SEAM_SECONDS);
}

/**
 * Cross-fades the last `fade` samples toward the first `fade`, so the buffer's
 * last sample runs on into sample `fade`. A loop of it must start there
 * (`loopStart = fade / rate`), not at 0, or it jumps back across the fade.
 */
function fadeSeam(data: Float32Array, fade: number) {
  const length = data.length;
  for (let i = 0; i < fade; i += 1) {
    const k = i / fade;
    data[length - fade + i] = data[length - fade + i] * (1 - k) + data[i] * k;
  }
}

/**
 * Three stereo noise buffers, made once per context. About 6 MB of samples,
 * so the engine builds them in an idle moment, not inside the first tap.
 */
export function makeNoise(ctx: BaseAudioContext, random: () => number = Math.random): Noise {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * NOISE_SECONDS);
  const brownRate = Math.max(3000, Math.floor(rate / BROWN_RATE_DIVISOR));
  const brownLength = Math.floor(brownRate * NOISE_SECONDS);
  const white = ctx.createBuffer(2, length, rate);
  const pink = ctx.createBuffer(2, length, rate);
  const brown = ctx.createBuffer(2, brownLength, brownRate);

  for (let channel = 0; channel < 2; channel += 1) {
    const w = white.getChannelData(channel);
    const p = pink.getChannelData(channel);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < length; i += 1) {
      const x = random() * 2 - 1;
      w[i] = x * 0.5;
      // Paul Kellet's pink filter.
      b0 = 0.99886 * b0 + x * 0.0555179;
      b1 = 0.99332 * b1 + x * 0.0750759;
      b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856;
      b4 = 0.55 * b4 + x * 0.5329522;
      b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
    }

    // Brown: a leaky random walk. At a quarter of the rate each step is four
    // of the full-rate walk's, so the leak and the step are scaled to keep
    // the same colour and level.
    const b = brown.getChannelData(channel);
    const scale = rate / brownRate;
    const leak = 1 / (1 + 0.02 * scale);
    const step = 0.02 * Math.sqrt(scale);
    let last = 0;
    for (let i = 0; i < brownLength; i += 1) {
      last = (last + step * (random() * 2 - 1)) * leak;
      b[i] = last * 3.5;
    }

    fadeSeam(w, seamSamples(rate));
    fadeSeam(p, seamSamples(rate));
    fadeSeam(b, seamSamples(brownRate));
  }

  return { white, pink, brown };
}

// ---------------------------------------------------------------------------
// Small helpers

function between(random: () => number, low: number, high: number) {
  return low + (high - low) * random();
}

function loop(kit: Kit, buffer: AudioBuffer, sources: AudioScheduledSourceNode[]) {
  const source = kit.ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  // The seam was faded toward the buffer's start, so the end flows on into
  // the sample after the fade: loop back to there, not to 0 (audit 11e.1).
  const loopStart = seamSamples(buffer.sampleRate) / buffer.sampleRate;
  source.loopStart = loopStart;
  source.loopEnd = buffer.duration;
  source.start(kit.ctx.currentTime, between(kit.random, loopStart, buffer.duration));
  sources.push(source);
  return source;
}

function filter(kit: Kit, type: BiquadFilterType, frequency: number, q = 0.7) {
  const node = kit.ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  // Anchor the timeline so later ramps start from here.
  node.frequency.setValueAtTime(frequency, kit.ctx.currentTime);
  return node;
}

function gain(kit: Kit, value: number) {
  const node = kit.ctx.createGain();
  node.gain.value = value;
  node.gain.setValueAtTime(value, kit.ctx.currentTime);
  return node;
}

function pan(kit: Kit, value: number): AudioNode {
  if (typeof kit.ctx.createStereoPanner !== 'function') return gain(kit, 1);
  const node = kit.ctx.createStereoPanner();
  node.pan.value = value;
  return node;
}

function chain(...nodes: AudioNode[]) {
  for (let i = 0; i < nodes.length - 1; i += 1) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/** A steady noise layer: noise → filters → gain → out. */
function layer(kit: Kit, sources: AudioScheduledSourceNode[], buffer: AudioBuffer, level: number, ...filters: BiquadFilterNode[]) {
  const level_ = gain(kit, level);
  chain(loop(kit, buffer, sources), ...filters, level_, kit.out);
  return level_;
}

/**
 * Moves a parameter to a new random value now and then, smoothly. Only
 * linear ramps are chained (every browser treats those the same).
 */
function drifter(param: AudioParam, random: () => number, low: number, high: number, minSeconds: number, maxSeconds: number) {
  let next = -1;

  return (now: number, until: number) => {
    if (next < now) next = now;
    while (next < until) {
      next += between(random, minSeconds, maxSeconds);
      param.linearRampToValueAtTime(between(random, low, high), next);
    }
  };
}

/**
 * A struck-noise voice: a noise source that stays connected through a
 * band-pass and a silent gain; `hit` opens the gain for a moment. Cheap enough
 * for dozens of raindrops or crackles a second.
 */
function striker(kit: Kit, sources: AudioScheduledSourceNode[], buffer: AudioBuffer, type: BiquadFilterType, q: number, panValue: number, dest: AudioNode = kit.out): Strike {
  const band = filter(kit, type, 2000, q);
  const env = gain(kit, 0);
  chain(loop(kit, buffer, sources), band, env, pan(kit, panValue), dest);
  let busy = 0;

  return (at: number, peak: number, decay: number, frequency: number) => {
    // One hit at a time per voice, so envelopes never overlap.
    if (at < busy) return false;
    const end = at + 0.002 + decay * 3;
    band.frequency.setValueAtTime(frequency, at);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    env.gain.setValueAtTime(0, end);
    busy = end + 0.001;
    return true;
  };
}

type Strike = (at: number, peak: number, decay: number, frequency: number) => boolean;

/** Hits whichever voice is free, starting from a random one. */
function strikeAny(strikes: Strike[], random: () => number, at: number, peak: number, decay: number, frequency: number) {
  const first = Math.floor(random() * strikes.length);
  for (let i = 0; i < strikes.length; i += 1) {
    if (strikes[(first + i) % strikes.length](at, peak, decay, frequency)) return;
  }
}

/** A short tone with its own envelope (bird notes, drips, bubbles, hoots). */
function tone(
  kit: Kit,
  at: number,
  options: {
    from: number;
    to?: number;
    length: number;
    peak: number;
    pan?: number;
    type?: OscillatorType;
    attack?: number;
    vibrato?: { rate: number; depth: number };
    dest?: AudioNode;
  },
) {
  const { ctx } = kit;
  const osc = ctx.createOscillator();
  const env = gain(kit, 0);
  const end = at + options.length;
  const attack = options.attack ?? Math.min(0.015, options.length / 4);
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(options.from, at);
  if (options.to) osc.frequency.exponentialRampToValueAtTime(options.to, end);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(options.peak, at + attack);
  env.gain.linearRampToValueAtTime(options.peak * 0.8, Math.max(at + attack, end - options.length * 0.4));
  env.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
  env.gain.setValueAtTime(0, end + 0.05);

  const extra: AudioScheduledSourceNode[] = [];
  if (options.vibrato) {
    const lfo = ctx.createOscillator();
    const depth = gain(kit, options.vibrato.depth);
    lfo.frequency.value = options.vibrato.rate;
    chain(lfo, depth);
    depth.connect(osc.frequency);
    lfo.start(at);
    lfo.stop(end + 0.1);
    extra.push(lfo);
  }

  const panner = pan(kit, options.pan ?? 0);
  chain(osc, env, panner, options.dest ?? kit.out);
  osc.start(at);
  osc.stop(end + 0.1);
  osc.onended = () => {
    osc.disconnect();
    env.disconnect();
    panner.disconnect();
    for (const node of extra) node.disconnect();
  };
}

type Ping = (at: number, options: { from: number; to: number; length: number; peak: number; pan: number }) => boolean;

/**
 * A short rising blip (a bubble, a drip) from a fixed pool of oscillators that
 * run all the time behind a closed gain, as `striker` does for noise. Water
 * fires dozens of these a second; a fresh oscillator each time made the
 * stream build about 1,600 nodes a minute (audit 11e.1).
 */
function pinger(kit: Kit, sources: AudioScheduledSourceNode[], voices: number, dest: AudioNode = kit.out): Ping {
  const { ctx } = kit;
  const pool = Array.from({ length: voices }, () => {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(1000, ctx.currentTime);
    const env = gain(kit, 0);
    const panner = typeof ctx.createStereoPanner === 'function' ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.setValueAtTime(0, ctx.currentTime);
      chain(osc, env, panner, dest);
    } else {
      chain(osc, env, dest);
    }
    osc.start();
    sources.push(osc);
    return { osc, env, panner, busy: 0 };
  });

  return (at, options) => {
    const first = Math.floor(kit.random() * pool.length);
    for (let i = 0; i < pool.length; i += 1) {
      const voice = pool[(first + i) % pool.length];
      if (at < voice.busy) continue;
      const end = at + options.length;
      const attack = Math.min(0.015, options.length / 4);
      voice.osc.frequency.setValueAtTime(options.from, at);
      voice.osc.frequency.exponentialRampToValueAtTime(options.to, end);
      voice.panner?.pan.setValueAtTime(options.pan, at);
      voice.env.gain.setValueAtTime(0, at);
      voice.env.gain.linearRampToValueAtTime(options.peak, at + attack);
      voice.env.gain.exponentialRampToValueAtTime(0.0001, end + 0.05);
      voice.env.gain.setValueAtTime(0, end + 0.05);
      voice.busy = end + 0.06;
      return true;
    }
    return false;
  };
}

/** Calls `fire(at)` at random gaps between `low` and `high` seconds. */
function every(random: () => number, low: number, high: number, fire: (at: number) => void, startAfter = 0) {
  let next = -1;

  return (now: number, until: number) => {
    if (next < 0) next = now + startAfter + between(random, 0, low);
    if (next < now) next = now + between(random, 0, low);
    while (next < until) {
      fire(next);
      next += between(random, low, high);
    }
  };
}

function ticks(...parts: Array<(now: number, until: number) => void>) {
  return (now: number, until: number) => {
    for (const part of parts) part(now, until);
  };
}

function stopper(sources: AudioScheduledSourceNode[]) {
  return () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      source.disconnect();
    }
  };
}

// ---------------------------------------------------------------------------
// The beds

function rainLight(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const hiss = layer(kit, s, noise.white, 0.22, filter(kit, 'highpass', 1200), filter(kit, 'lowpass', 9000));
  const drops = [-0.7, -0.25, 0.25, 0.7].map((side) => striker(kit, s, noise.white, 'bandpass', 2.5, side));

  return {
    tick: ticks(
      drifter(hiss.gain, random, 0.16, 0.26, 2, 5),
      every(random, 0.03, 0.12, (at) => {
        strikeAny(drops, random, at, between(random, 0.15, 0.6), between(random, 0.01, 0.03), between(random, 2500, 7500));
      }),
    ),
    stop: stopper(s),
  };
}

function rainHeavy(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const wash = layer(kit, s, noise.pink, 0.9, filter(kit, 'highpass', 250), filter(kit, 'lowpass', 6500));
  layer(kit, s, noise.brown, 0.25, filter(kit, 'lowpass', 500));
  layer(kit, s, noise.white, 0.12, filter(kit, 'highpass', 3000));

  return { tick: drifter(wash.gain, random, 0.7, 1, 3, 7), stop: stopper(s) };
}

function rainRoof(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const drum = layer(kit, s, noise.pink, 0.45, filter(kit, 'lowpass', 1800), filter(kit, 'highpass', 120));
  const pats = [-0.6, -0.2, 0.2, 0.6].map((side) => striker(kit, s, noise.pink, 'bandpass', 3, side));

  // A gutter dripping somewhere.
  const ping = pinger(kit, s, 2);
  const drip = every(random, 1.2, 4, (at) => {
    ping(at, { from: between(random, 900, 1500), to: between(random, 1700, 2600), length: 0.05, peak: 0.05, pan: between(random, -0.7, 0.7) });
  });

  return {
    tick: ticks(
      drifter(drum.gain, random, 0.35, 0.5, 3, 6),
      every(random, 0.015, 0.06, (at) => {
        strikeAny(pats, random, at, between(random, 0.2, 0.7), between(random, 0.015, 0.04), between(random, 600, 2200));
      }),
      drip,
    ),
    stop: stopper(s),
  };
}

function storm(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const low = filter(kit, 'lowpass', 200, 0.5);
  const env = gain(kit, 0);
  chain(loop(kit, noise.brown, s), low, env, kit.out);
  const crack = striker(kit, s, noise.white, 'lowpass', 0.5, between(random, -0.4, 0.4));

  const thunder = every(random, 18, 45, (at) => {
    const near = random() < 0.3;
    const peak = near ? between(random, 0.4, 0.55) : between(random, 0.15, 0.3);
    const length = between(random, 5, 9);
    const attack = near ? 0.05 : between(random, 0.4, 1.2);
    low.frequency.setValueAtTime(near ? 1400 : 600, at);
    low.frequency.exponentialRampToValueAtTime(near ? 160 : 110, at + length * 0.6);
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(peak, at + attack);
    // The roll: two or three swells as it dies away.
    let t = at + attack;
    for (let i = 0; i < 3 && t < at + length - 2.5; i += 1) {
      t += between(random, 0.5, 1.2);
      env.gain.linearRampToValueAtTime(peak * between(random, 0.3, 0.6), t);
      t += between(random, 0.4, 1);
      env.gain.linearRampToValueAtTime(peak * between(random, 0.5, 0.9), t);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, at + length);
    env.gain.setValueAtTime(0, at + length);
    if (near) crack(at, 0.3, 0.25, 4000);
  }, 3);

  return { tick: thunder, stop: stopper(s) };
}

function wind(kit: Kit, strength: 'light' | 'strong'): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const strong = strength === 'strong';
  const parts: Array<(now: number, until: number) => void> = [];

  for (const side of [-0.5, 0.5]) {
    const band = filter(kit, 'bandpass', 500, strong ? 0.9 : 1.2);
    const level = gain(kit, 0.5);
    chain(loop(kit, noise.pink, s), band, level, pan(kit, side), kit.out);
    parts.push(
      drifter(band.frequency, random, strong ? 300 : 220, strong ? 1300 : 650, strong ? 1.5 : 2.5, strong ? 4 : 6),
      drifter(level.gain, random, strong ? 0.5 : 0.25, strong ? 1.6 : 0.8, strong ? 1 : 2, strong ? 3.5 : 6),
    );
  }
  if (strong) {
    const body = layer(kit, s, noise.brown, 0.5, filter(kit, 'lowpass', 300));
    parts.push(drifter(body.gain, random, 0.3, 0.8, 1.5, 4));
  }

  return { tick: ticks(...parts), stop: stopper(s) };
}

function windHigh(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const parts: Array<(now: number, until: number) => void> = [];

  // A thin whistle over rock and ice.
  for (const side of [-0.3, 0.4]) {
    const band = filter(kit, 'bandpass', 1000, 14);
    const level = gain(kit, 0.4);
    chain(loop(kit, noise.white, s), band, level, pan(kit, side), kit.out);
    parts.push(drifter(band.frequency, random, 650, 1700, 2, 5), drifter(level.gain, random, 0.1, 1.2, 1.5, 4));
  }
  const air = layer(kit, s, noise.pink, 0.25, filter(kit, 'bandpass', 1800, 0.6));
  parts.push(drifter(air.gain, random, 0.1, 0.4, 2, 5));

  return { tick: ticks(...parts), stop: stopper(s) };
}

function snowQuiet(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const hush = layer(kit, s, kit.noise.brown, 0.25, filter(kit, 'lowpass', 260));
  layer(kit, s, kit.noise.pink, 0.02, filter(kit, 'bandpass', 3000, 0.5));
  return { tick: drifter(hush.gain, kit.random, 0.15, 0.3, 4, 9), stop: stopper(s) };
}

type Species = (at: number, side: number) => number;

/** A handful of birds for one forest, each with its own song. */
function makeSpecies(kit: Kit): Species[] {
  const { random } = kit;
  const chirper = (base: number): Species => (at, side) => {
    const count = 2 + Math.floor(random() * 5);
    let t = at;
    for (let i = 0; i < count; i += 1) {
      const f = base * between(random, 0.95, 1.05);
      tone(kit, t, { from: f, to: f * between(random, 1.25, 1.5), length: between(random, 0.05, 0.08), peak: 0.12, pan: side });
      t += between(random, 0.08, 0.14);
    }
    return t - at;
  };
  const whistler = (high: number, low: number): Species => (at, side) => {
    const repeats = 2 + Math.floor(random() * 2);
    let t = at;
    for (let i = 0; i < repeats; i += 1) {
      tone(kit, t, { from: high, to: high * 0.97, length: 0.14, peak: 0.1, pan: side, attack: 0.02 });
      tone(kit, t + 0.17, { from: low, to: low * 0.95, length: 0.16, peak: 0.09, pan: side, attack: 0.02 });
      t += 0.42;
    }
    return t - at;
  };
  const warbler = (base: number): Species => (at, side) => {
    const length = between(random, 0.6, 1.3);
    tone(kit, at, { from: base, to: base * between(random, 0.85, 1.2), length, peak: 0.07, pan: side, attack: 0.05, vibrato: { rate: between(random, 9, 16), depth: between(random, 250, 550) } });
    return length;
  };
  const dove = (base: number): Species => (at, side) => {
    tone(kit, at, { from: base, to: base * 0.92, length: 0.45, peak: 0.08, pan: side, type: 'sine', attack: 0.08 });
    tone(kit, at + 0.6, { from: base * 0.88, to: base * 0.8, length: 0.6, peak: 0.07, pan: side, type: 'sine', attack: 0.1 });
    return 1.3;
  };

  return [
    chirper(between(random, 2800, 4200)),
    whistler(between(random, 3000, 3600), between(random, 2300, 2700)),
    warbler(between(random, 2200, 3000)),
    random() < 0.6 ? dove(between(random, 420, 560)) : chirper(between(random, 4500, 5500)),
  ];
}

function forestDay(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const leaves = layer(kit, s, noise.pink, 0.08, filter(kit, 'bandpass', 2500, 0.6));
  const species = makeSpecies(kit);
  // Each bird sits somewhere in the trees and keeps to its spot.
  const seats = species.map(() => between(random, -0.85, 0.85));

  return {
    tick: ticks(
      drifter(leaves.gain, random, 0.03, 0.12, 2, 5),
      every(random, 0.7, 3.5, (at) => {
        const which = Math.floor(random() * species.length);
        species[which](at, seats[which]);
      }),
    ),
    stop: stopper(s),
  };
}

/**
 * Crickets: a high tone pulsed fast, in groups. Each one's level and chirp
 * rate wander slowly, so the field breathes instead of ticking like a clock.
 * Summer-to-autumn only: the mix never asks for them in winter or snow.
 */
function insects(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { ctx, noise, random } = kit;
  const parts: Array<(now: number, until: number) => void> = [];
  layer(kit, s, noise.brown, 0.08, filter(kit, 'lowpass', 300));

  for (let i = 0; i < 3; i += 1) {
    const carrier = ctx.createOscillator();
    carrier.frequency.value = between(random, 4200, 5200);
    // A gain's own value plus a ±0.5 square wave: pulses between 0 and 1.
    const pulse = gain(kit, 0.5);
    const group = gain(kit, 0.5);
    const level = gain(kit, 0.018);
    const fast = ctx.createOscillator();
    fast.type = 'square';
    fast.frequency.value = between(random, 25, 45);
    const fastDepth = gain(kit, 0.5);
    const slow = ctx.createOscillator();
    slow.type = 'square';
    const rate = between(random, 1.5, 3.2);
    slow.frequency.value = rate;
    slow.frequency.setValueAtTime(rate, ctx.currentTime);
    const slowDepth = gain(kit, 0.5);
    chain(fast, fastDepth);
    fastDepth.connect(pulse.gain);
    chain(slow, slowDepth);
    slowDepth.connect(group.gain);
    chain(carrier, pulse, group, level, pan(kit, between(random, -0.8, 0.8)), kit.out);
    for (const osc of [carrier, fast, slow]) {
      osc.start();
      s.push(osc);
    }
    parts.push(
      drifter(level.gain, random, 0.006, 0.024, 6, 15),
      drifter(slow.frequency, random, Math.max(1.2, rate * 0.75), rate * 1.25, 8, 20),
    );
  }

  return { tick: ticks(...parts), stop: stopper(s) };
}

/** An owl, now and then, over a low night air. Plays in every season. */
function owl(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  layer(kit, s, noise.brown, 0.08, filter(kit, 'lowpass', 300));

  const hoot = every(random, 20, 50, (at) => {
    const base = between(random, 330, 420);
    const side = between(random, -0.8, 0.8);
    tone(kit, at, { from: base, to: base * 0.94, length: 0.4, peak: 0.12, pan: side, attack: 0.06 });
    tone(kit, at + 0.75, { from: base * 1.02, to: base * 0.96, length: 0.22, peak: 0.1, pan: side, attack: 0.04 });
    tone(kit, at + 1.05, { from: base, to: base * 0.9, length: 0.5, peak: 0.11, pan: side, attack: 0.06 });
  }, 6);

  return { tick: hoot, stop: stopper(s) };
}

function cicadas(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { ctx, noise, random } = kit;
  const parts: Array<(now: number, until: number) => void> = [];

  for (const side of [-0.6, 0.5]) {
    const band = filter(kit, 'bandpass', between(random, 4800, 6500), 5);
    const buzz = gain(kit, 0.5);
    const swell = gain(kit, 0.3);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = between(random, 60, 95);
    const depth = gain(kit, 0.5);
    chain(lfo, depth);
    depth.connect(buzz.gain);
    lfo.start();
    s.push(lfo);
    chain(loop(kit, noise.white, s), band, buzz, swell, pan(kit, side), kit.out);
    parts.push(drifter(swell.gain, random, 0.05, 0.6, 3, 8));
  }

  return { tick: ticks(...parts), stop: stopper(s) };
}

function babble(kit: Kit, s: AudioScheduledSourceNode[], amount: number, low: number, high: number) {
  const parts: Array<(now: number, until: number) => void> = [];
  for (let i = 0; i < amount; i += 1) {
    const band = filter(kit, 'bandpass', 1000, 2.5);
    parts.push(drifter(band.frequency, kit.random, low, high, 0.2, 0.7));
    chain(loop(kit, kit.noise.pink, s), band, gain(kit, 0.5), pan(kit, between(kit.random, -0.6, 0.6)), kit.out);
  }
  return parts;
}

function bubbles(kit: Kit, s: AudioScheduledSourceNode[], low: number, high: number, peak: number) {
  const ping = pinger(kit, s, 4);
  return every(kit.random, low, high, (at) => {
    const f = between(kit.random, 500, 1600);
    ping(at, { from: f, to: f * between(kit.random, 1.6, 2.2), length: between(kit.random, 0.025, 0.06), peak: peak * between(kit.random, 0.3, 1), pan: between(kit.random, -0.7, 0.7) });
  });
}

function stream(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  layer(kit, s, kit.noise.pink, 0.25, filter(kit, 'highpass', 400), filter(kit, 'lowpass', 5000));
  return { tick: ticks(...babble(kit, s, 3, 700, 2600), bubbles(kit, s, 0.04, 0.18, 0.06)), stop: stopper(s) };
}

function river(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const wash = layer(kit, s, kit.noise.pink, 0.6, filter(kit, 'lowpass', 1600));
  layer(kit, s, kit.noise.brown, 0.35, filter(kit, 'lowpass', 400));
  return {
    tick: ticks(drifter(wash.gain, kit.random, 0.45, 0.7, 3, 6), ...babble(kit, s, 2, 500, 1600), bubbles(kit, s, 0.1, 0.35, 0.04)),
    stop: stopper(s),
  };
}

function waterfall(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  layer(kit, s, kit.noise.white, 0.45, filter(kit, 'lowpass', 4000));
  layer(kit, s, kit.noise.pink, 0.7, filter(kit, 'lowpass', 2000));
  const rumble = layer(kit, s, kit.noise.brown, 0.7, filter(kit, 'lowpass', 180));
  return { tick: drifter(rumble.gain, kit.random, 0.55, 0.8, 2, 5), stop: stopper(s) };
}

function sea(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  layer(kit, s, noise.brown, 0.3, filter(kit, 'lowpass', 350));
  // Two lines of waves, each breaking, drawing back, then coming in again.
  const waves = [-0.4, 0.4].map((side, index) => {
    const low = filter(kit, 'lowpass', 350, 0.5);
    const env = gain(kit, 0.06);
    chain(loop(kit, noise.pink, s), low, env, pan(kit, side), kit.out);
    let next = -1;

    return (now: number, until: number) => {
      if (next < now) next = now + between(random, 0, 1.5) + index * between(random, 3, 5);
      while (next < until) {
        const rise = between(random, 2, 3.5);
        const fall = between(random, 3.5, 6);
        low.frequency.setValueAtTime(350, next);
        low.frequency.linearRampToValueAtTime(between(random, 1500, 2600), next + rise);
        low.frequency.linearRampToValueAtTime(350, next + rise + fall);
        env.gain.setValueAtTime(0.06, next);
        env.gain.linearRampToValueAtTime(between(random, 0.6, 1), next + rise);
        env.gain.linearRampToValueAtTime(0.06, next + rise + fall);
        next += rise + fall + between(random, 0.3, 2.5);
      }
    };
  });
  const swell = ticks(...waves);

  return { tick: swell, stop: stopper(s) };
}

function voices(kit: Kit, s: AudioScheduledSourceNode[], count: number, dest: AudioNode) {
  const { random } = kit;
  return Array.from({ length: count }, () => {
    const formant = filter(kit, 'bandpass', between(random, 450, 1300), 3.5);
    const env = gain(kit, 0);
    chain(loop(kit, kit.noise.pink, s), formant, env, pan(kit, between(random, -0.8, 0.8)), dest);
    let next = -1;
    return (now: number, until: number) => {
      if (next < now) next = now + between(random, 0, 3);
      while (next < until) {
        // A phrase: syllables at speech rate, then a pause.
        const syllables = 4 + Math.floor(random() * 16);
        let t = next;
        env.gain.setValueAtTime(0, t);
        formant.frequency.setValueAtTime(between(random, 400, 1400), t);
        for (let i = 0; i < syllables; i += 1) {
          const length = between(random, 0.1, 0.24);
          env.gain.linearRampToValueAtTime(between(random, 0.3, 1), t + 0.03);
          env.gain.linearRampToValueAtTime(between(random, 0, 0.15), t + length);
          formant.frequency.linearRampToValueAtTime(between(random, 400, 1400), t + length);
          t += length;
        }
        env.gain.linearRampToValueAtTime(0, t + 0.05);
        next = t + 0.05 + between(random, 0.8, 5);
      }
    };
  });
}

function village(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { random } = kit;
  const distance = filter(kit, 'lowpass', 1500);
  const level = gain(kit, 0.6);
  chain(distance, level, kit.out);
  const steps = striker(kit, s, kit.noise.brown, 'lowpass', 0.7, between(random, -0.5, 0.5));
  const knocks = striker(kit, s, kit.noise.white, 'bandpass', 9, between(random, -0.7, 0.7));

  return {
    tick: ticks(
      ...voices(kit, s, 6, distance),
      // Someone walking past.
      every(random, 6, 18, (at) => {
        const count = 4 + Math.floor(random() * 8);
        const pace = between(random, 0.45, 0.6);
        for (let i = 0; i < count; i += 1) steps(at + i * pace, 0.5, 0.05, between(random, 350, 600));
      }),
      // Wood on wood: a shutter, a cart, a stall being set up.
      every(random, 3, 12, (at) => knocks(at, between(random, 0.3, 0.7), 0.04, between(random, 700, 1300))),
    ),
    stop: stopper(s),
  };
}

function murmur(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { random } = kit;
  const room = filter(kit, 'lowpass', 1100);
  const level = gain(kit, 0.5);
  chain(room, level, kit.out);

  return {
    tick: ticks(
      ...voices(kit, s, 5, room),
      // A cup set down.
      every(random, 4, 14, (at) => {
        const f = between(random, 1800, 2600);
        const side = between(random, -0.6, 0.6);
        tone(kit, at, { from: f, length: 0.25, peak: 0.03, pan: side, attack: 0.002 });
        tone(kit, at, { from: f * 2.7, length: 0.15, peak: 0.015, pan: side, attack: 0.002 });
      }),
    ),
    stop: stopper(s),
  };
}

function room(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  layer(kit, s, kit.noise.brown, 0.18, filter(kit, 'lowpass', 160));
  layer(kit, s, kit.noise.pink, 0.015, filter(kit, 'lowpass', 900));
  return { stop: stopper(s) };
}

function fire(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { noise, random } = kit;
  const roar = layer(kit, s, noise.brown, 0.5, filter(kit, 'lowpass', 380));
  const hiss = layer(kit, s, noise.pink, 0.05, filter(kit, 'bandpass', 1400, 0.5));
  const cracks = [-0.3, 0, 0.3].map((side) => striker(kit, s, noise.white, 'bandpass', 1.5, side));
  const pop = striker(kit, s, noise.white, 'bandpass', 2, 0);

  return {
    tick: ticks(
      drifter(roar.gain, random, 0.3, 0.6, 0.3, 1.2),
      drifter(hiss.gain, random, 0.02, 0.07, 0.5, 2),
      // Crackles come in little clusters.
      every(random, 0.15, 0.9, (at) => {
        const count = 1 + Math.floor(random() * 5);
        for (let i = 0; i < count; i += 1) {
          strikeAny(cracks, random, at + i * 0.04 + between(random, 0, 0.03), between(random, 0.3, 1), between(random, 0.004, 0.012), between(random, 2000, 6500));
        }
      }),
      every(random, 3, 9, (at) => pop(at, between(random, 0.6, 1.1), 0.03, between(random, 600, 1100))),
    ),
    stop: stopper(s),
  };
}

function cave(kit: Kit): Bed {
  const s: AudioScheduledSourceNode[] = [];
  const { ctx, noise, random } = kit;
  layer(kit, s, noise.brown, 0.22, filter(kit, 'lowpass', 140));
  // Drips with the cave's echo.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.21;
  const feedback = gain(kit, 0.38);
  const dark = filter(kit, 'lowpass', 2800);
  const wet = gain(kit, 0.6);
  chain(echo, dark, feedback, echo);
  chain(dark, wet, kit.out);
  const dry = gain(kit, 1);
  dry.connect(kit.out);
  dry.connect(echo);

  return {
    tick: every(random, 0.9, 4, (at) => {
      const f = between(random, 1100, 2400);
      tone(kit, at, { from: f, to: f * between(random, 1.3, 1.7), length: 0.06, peak: 0.12, pan: between(random, -0.6, 0.6), dest: dry, attack: 0.002 });
    }),
    stop: () => {
      stopper(s)();
      echo.disconnect();
      feedback.disconnect();
    },
  };
}

export const BED_BUILDERS: Record<AmbienceBed, (kit: Kit) => Bed> = {
  'rain-light': rainLight,
  'rain-heavy': rainHeavy,
  'rain-roof': rainRoof,
  storm,
  'wind-light': (kit) => wind(kit, 'light'),
  'wind-strong': (kit) => wind(kit, 'strong'),
  'wind-high': windHigh,
  'snow-quiet': snowQuiet,
  'forest-day': forestDay,
  insects,
  owl,
  cicadas,
  stream,
  river,
  waterfall,
  sea,
  village,
  murmur,
  room,
  fire,
  cave,
};

export function buildBed(bed: AmbienceBed, ctx: BaseAudioContext, out: AudioNode, noise: Noise, random: () => number = Math.random): Bed {
  return BED_BUILDERS[bed]({ ctx, out, noise, random });
}
