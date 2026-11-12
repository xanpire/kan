// The ambience player (section 17): runs the synthesised beds and crossfades
// between mixes. Web only; on other platforms, or without Web Audio, every
// call does nothing.
//
// Graph: bed → bed gain → outdoor bus (low-pass, opens and closes for
// indoors) or indoor bus → fight duck → volume → speakers.

import { AMBIENCE_BEDS, INDOOR_BEDS, type AmbienceBed, type AmbienceMix } from '@/lib/rpg/ambience';
import { buildBed, makeNoise, type Bed, type Noise } from './synth';

/** Seconds for a crossfade. */
export const CROSSFADE_SECONDS = 4;
/** A bed faded out this long is stopped to save the battery. */
const IDLE_STOP_SECONDS = 10;
const TICK_MS = 200;
/**
 * How far ahead each bed schedules its events. A busy main thread (a long
 * reply streaming in, a save) can hold the timer back for a second; anything
 * already scheduled keeps playing through it (audit 11e.1).
 */
export const LOOKAHEAD_SECONDS = 1.5;
/** How far a fight lowers the ambience. */
export const FIGHT_DUCK = 0.3;
/** Overall headroom; the volume slider scales this. */
const MASTER = 0.55;

/** Evens the beds out so 1 means about as loud for each. */
export const BED_TRIM: Record<AmbienceBed, number> = {
  'rain-light': 0.9,
  'rain-heavy': 0.75,
  'rain-roof': 0.9,
  storm: 1.4,
  'wind-light': 0.8,
  'wind-strong': 0.7,
  'wind-high': 1.1,
  'snow-quiet': 0.8,
  'forest-day': 2.2,
  insects: 1.4,
  owl: 1.4,
  cicadas: 1.2,
  stream: 1.1,
  river: 0.8,
  waterfall: 0.7,
  sea: 0.8,
  village: 2,
  murmur: 2.5,
  room: 0.8,
  fire: 0.75,
  cave: 0.9,
};

/** Glide a parameter from wherever it is now to `target` over `seconds`. */
function glide(param: AudioParam, target: number, now: number, seconds: number) {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(target, now + seconds);
}

type Voice = {
  bed: Bed;
  out: GainNode;
  level: number;
  silentSince: number | null;
};

type WindowLike = {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

/** Runs `work` when the browser is idle (or soon, where it has no idle callback). */
function whenIdle(work: () => void) {
  const w = (typeof window === 'undefined' ? {} : window) as unknown as WindowLike;
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(work, { timeout: 1000 });
  else setTimeout(work, 50);
}

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as WindowLike;
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function ambienceSupported() {
  return audioContextClass() !== null;
}

export class AmbienceEngine {
  private ctx: AudioContext | null = null;
  private noise: Noise | null = null;
  private volumeNode: GainNode | null = null;
  private duck: GainNode | null = null;
  private outdoor: GainNode | null = null;
  private muffle: BiquadFilterNode | null = null;
  private indoor: GainNode | null = null;
  private voices = new Map<AmbienceBed, Voice>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private mix: AmbienceMix | null = null;
  private volume = 0.7;
  private enabled = true;
  private visible = true;

  /** Builds the audio graph. Call from a tap: browsers only allow sound after one. */
  unlock() {
    const Context = audioContextClass();
    if (!Context) return;

    if (!this.ctx) {
      const ctx = new Context();
      this.ctx = ctx;
      // Only the context is made inside the tap. The noise (megabytes of
      // samples) is built in the next idle moment, then the mix starts
      // (audit 11e.1: the first tap stalled).
      whenIdle(() => {
        if (!this.ctx) return;
        this.noise = makeNoise(this.ctx);
        this.refresh();
      });
      this.volumeNode = ctx.createGain();
      this.volumeNode.gain.setValueAtTime(0, 0);
      this.duck = ctx.createGain();
      this.duck.gain.setValueAtTime(1, 0);
      this.outdoor = ctx.createGain();
      this.outdoor.gain.setValueAtTime(1, 0);
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.setValueAtTime(18000, 0);
      this.muffle.Q.value = 0.5;
      this.indoor = ctx.createGain();
      this.outdoor.connect(this.muffle);
      this.muffle.connect(this.duck);
      this.indoor.connect(this.duck);
      this.duck.connect(this.volumeNode);
      this.volumeNode.connect(ctx.destination);
    }

    this.refresh();
  }

  get unlocked() {
    return this.ctx !== null;
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
    this.applyVolume(0.4);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.refresh();
  }

  /** The app went to the background or came back. */
  setVisible(visible: boolean) {
    this.visible = visible;
    this.refresh();
  }

  setMix(mix: AmbienceMix) {
    if (this.mix?.key === mix.key) return;
    this.mix = mix;
    this.applyMix();
  }

  private get running() {
    return this.enabled && this.visible && this.volume > 0;
  }

  private refresh() {
    const ctx = this.ctx;
    if (!ctx) return;

    if (this.running) {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {});
      this.applyMix();
      this.applyVolume(1.5);
      this.startTimer();
    } else if (!this.visible) {
      // Hidden: pause at once, keep the beds for when the app comes back.
      this.stopTimer();
      void ctx.suspend().catch(() => {});
    } else {
      // Switched off: fade out, then stop everything.
      this.applyVolume(0.4);
      this.stopTimer();
      setTimeout(() => {
        if (this.running || !this.ctx) return;
        for (const bed of [...this.voices.keys()]) this.dropVoice(bed);
        void this.ctx.suspend().catch(() => {});
      }, 1500);
    }
  }

  private applyVolume(seconds: number) {
    const ctx = this.ctx;
    if (!ctx || !this.volumeNode) return;
    const target = this.running ? this.volume * this.volume * MASTER : 0;
    glide(this.volumeNode.gain, target, ctx.currentTime, seconds);
  }

  private applyMix() {
    const ctx = this.ctx;
    const mix = this.mix;
    if (!ctx || !mix || !this.running || !this.duck || !this.muffle || !this.outdoor) return;

    const now = ctx.currentTime;
    const fade = CROSSFADE_SECONDS;
    glide(this.duck.gain, mix.fight ? FIGHT_DUCK : 1, now, mix.fight ? 1.5 : fade);
    glide(this.muffle.frequency, mix.indoors ? 650 : 18000, now, fade);
    glide(this.outdoor.gain, mix.indoors ? 0.8 : 1, now, fade);

    for (const bed of AMBIENCE_BEDS) {
      const level = mix.beds[bed] ?? 0;
      let voice = this.voices.get(bed);

      if (level > 0 && !voice) voice = this.startVoice(bed);
      if (!voice) continue;

      voice.level = level;
      voice.silentSince = level > 0 ? null : (voice.silentSince ?? now);
      // Perceived loudness: square the level.
      glide(voice.out.gain, level * level * BED_TRIM[bed], now, fade);
    }
  }

  private startVoice(bed: AmbienceBed): Voice | undefined {
    const ctx = this.ctx;
    if (!ctx || !this.noise || !this.indoor || !this.outdoor) return undefined;

    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.connect(INDOOR_BEDS.has(bed) ? this.indoor : this.outdoor);
    const voice: Voice = { bed: buildBed(bed, ctx, out, this.noise), out, level: 0, silentSince: null };
    this.voices.set(bed, voice);
    voice.bed.tick?.(ctx.currentTime, ctx.currentTime + LOOKAHEAD_SECONDS);
    return voice;
  }

  private dropVoice(bed: AmbienceBed) {
    const voice = this.voices.get(bed);
    if (!voice) return;
    voice.bed.stop();
    voice.out.disconnect();
    this.voices.delete(bed);
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    for (const [bed, voice] of this.voices) {
      if (voice.silentSince !== null && now - voice.silentSince > IDLE_STOP_SECONDS) {
        this.dropVoice(bed);
        continue;
      }
      try {
        voice.bed.tick?.(now, now + LOOKAHEAD_SECONDS);
      } catch {
        // A bed that throws is dropped rather than breaking the others.
        this.dropVoice(bed);
      }
    }
  }

  private startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopTimer() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Beds playing now, for the debug panel and tests. */
  playing(): AmbienceBed[] {
    return [...this.voices.entries()].filter(([, voice]) => voice.level > 0).map(([bed]) => bed);
  }
}

let shared: AmbienceEngine | null = null;

export function ambienceEngine() {
  shared ??= new AmbienceEngine();
  return shared;
}
