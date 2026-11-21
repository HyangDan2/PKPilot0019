/**
 * Lýra audio engine.
 *
 * Master clock, quantised recording, loop playback, per-track FX, instruments,
 * metronome/count-in and mic input. Plain Web Audio; nothing needs
 * SharedArrayBuffer, so it runs unchanged on GitHub Pages.
 */

import {
  barSeconds,
  barBeatAt,
  beatSeconds,
  loopFrames,
  loopPhase,
  loopSeconds,
  nextBarBoundary,
} from './clock';
import { applyOverdub, extractRegion, fitFrames, peakOf, resampleLoop, rotateFrames } from './dsp';
import { DrumKit, type DrumKitName } from './drums';
import { LoopRecorder } from './recorder';
import { PolySynth, type SynthPresetName } from './synth';
import {
  DEFAULT_FX,
  type LoopBuffer,
  type ProjectState,
  type TrackFx,
  type TrackStatus,
} from './types';

interface EngineTrack {
  id: number;
  input: GainNode;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  dry: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  delayMix: GainNode;
  gain: GainNode;
  panner: StereoPannerNode;
  analyser: AnalyserNode;
  reverbSend: GainNode;
  source: AudioBufferSourceNode | null;
  buffer: LoopBuffer | null;
  undo: LoopBuffer | null;
  armed: boolean;
  active: boolean;
  mute: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  recMode: 'rec' | 'overdub' | null;
  recStart: number;
  recEnd: number;
  /** Frames to keep when the performer stopped before the loop end. */
  recTrim: number;
  recorder: LoopRecorder | null;
  inputConnected: boolean;
}

export interface EngineLevels {
  master: number;
  input: number;
  tracks: Record<number, number>;
}

export interface EngineOptions {
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  bars: number;
  masterVolume: number;
  metronome: boolean;
  countIn: boolean;
  latencyMs: number;
}

export interface TrackRuntime {
  id: number;
  status: TrackStatus;
  progress: number;
  hasLoop: boolean;
  canUndo: boolean;
}

type Listener = () => void;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterIn!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private masterGain!: GainNode;
  private masterAnalyser!: AnalyserNode;
  private reverbBus!: GainNode;
  private reverbReturn!: GainNode;
  private instrumentBus!: GainNode;
  private metronomeBus!: GainNode;
  private tracks = new Map<number, EngineTrack>();
  private listeners = new Set<Listener>();
  private stateListeners = new Set<Listener>();

  private bpm = 96;
  private beatsPerBar = 4;
  private beatUnit = 4;
  private bars = 2;
  private metronome = false;
  private countIn = true;
  private latencyMs = 0;
  private masterVolume = 0.85;

  private playing = false;
  private loopStart = 0;
  private nextClickAt = 0;
  private timer: number | null = null;
  private started = false;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private inputGainValue = 0.9;
  private inputDeviceId: string | null = null;
  private processing = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  private inputChannelMode: 'mono' | 'stereo' = 'mono';
  private usingInstrument = false;

  synth: PolySynth | null = null;
  drums: DrumKit | null = null;

  get ready(): boolean {
    return !!this.ctx && this.started;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  get contextState(): string {
    return this.ctx?.state ?? 'closed';
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get loopSecondsValue(): number {
    return loopSeconds(this.bpm, this.beatsPerBar, this.beatUnit, this.bars);
  }

  get barSecondsValue(): number {
    return barSeconds(this.bpm, this.beatsPerBar, this.beatUnit);
  }

  private beatSecondsValue(): number {
    return beatSeconds(this.bpm, this.beatUnit);
  }

  on(event: 'change' | 'state', listener: Listener): () => void {
    const set = event === 'change' ? this.listeners : this.stateListeners;
    set.add(listener);
    return () => set.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private emitState(): void {
    for (const listener of this.stateListeners) listener();
  }

  async init(options: Partial<EngineOptions> & { sampleRate?: number } = {}): Promise<void> {
    if (this.ctx) return;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error('no-web-audio');
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'interactive', sampleRate: options.sampleRate });
    } catch {
      ctx = new Ctor({ latencyHint: 'interactive' });
    }
    this.ctx = ctx;
    this.masterIn = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.004;
    this.limiter.release.value = 0.16;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    this.masterAnalyser = ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;
    this.masterIn.connect(this.limiter);
    this.limiter.connect(this.masterGain);
    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(ctx.destination);

    this.reverbBus = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(2.6, 2.4);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.85;
    this.reverbBus.connect(convolver);
    convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.masterIn);

    this.instrumentBus = ctx.createGain();
    this.instrumentBus.gain.value = 0.9;
    this.instrumentBus.connect(this.masterIn);
    this.metronomeBus = ctx.createGain();
    this.metronomeBus.gain.value = 1;
    this.metronomeBus.connect(this.masterIn);

    this.synth = new PolySynth(ctx, this.instrumentBus);
    this.drums = new DrumKit(ctx, this.instrumentBus);
    this.started = true;
    if (options.bpm) this.bpm = options.bpm;
    if (options.beatsPerBar) this.beatsPerBar = options.beatsPerBar;
    if (options.beatUnit) this.beatUnit = options.beatUnit;
    if (options.bars) this.bars = options.bars;
    if (options.masterVolume !== undefined) this.masterVolume = options.masterVolume;
    if (options.metronome !== undefined) this.metronome = options.metronome;
    if (options.countIn !== undefined) this.countIn = options.countIn;
    if (options.latencyMs !== undefined) this.latencyMs = options.latencyMs;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.emit();
    this.emitState();
  }

  async ensure(): Promise<void> {
    if (!this.ctx) await this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        // A gesture is still required; the next call retries.
      }
    }
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch += 1) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i += 1) {
        const t = i / length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return impulse;
  }

  // ── transport ────────────────────────────────────────────────────────────

  setBpm(bpm: number): void {
    const next = Math.max(40, Math.min(220, Math.round(bpm)));
    if (next === this.bpm) return;
    const wasPlaying = this.playing;
    this.stop(false);
    this.bpm = next;
    this.refitBuffers();
    if (wasPlaying) this.play();
    this.emit();
  }

  setBars(bars: number): void {
    const next = Math.max(1, Math.min(8, Math.round(bars)));
    if (next === this.bars) return;
    const wasPlaying = this.playing;
    this.stop(false);
    this.bars = next;
    this.refitBuffers();
    if (wasPlaying) this.play();
    this.emit();
  }

  setSignature(beatsPerBar: number, beatUnit: number): void {
    if (beatsPerBar === this.beatsPerBar && beatUnit === this.beatUnit) return;
    const wasPlaying = this.playing;
    this.stop(false);
    this.beatsPerBar = beatsPerBar;
    this.beatUnit = beatUnit;
    this.refitBuffers();
    if (wasPlaying) this.play();
    this.emit();
  }

  setMetronome(on: boolean): void {
    this.metronome = on;
    this.emit();
  }

  setCountIn(on: boolean): void {
    this.countIn = on;
    this.emit();
  }

  setLatency(ms: number): void {
    this.latencyMs = Math.max(-150, Math.min(150, Math.round(ms)));
    this.emit();
  }

  getLatency(): number {
    return this.latencyMs;
  }

  getTimeSignature(): { beatsPerBar: number; beatUnit: number } {
    return { beatsPerBar: this.beatsPerBar, beatUnit: this.beatUnit };
  }

  setMasterVolume(value: number): void {
    this.masterVolume = Math.max(0, Math.min(1, value));
    if (this.ctx && this.masterGain) this.masterGain.gain.value = this.masterVolume;
    this.emit();
  }

  play(): void {
    if (!this.ctx) return;
    void this.ensure();
    if (this.playing) return;
    const now = this.ctx.currentTime;
    this.loopStart = now + 0.09;
    this.playing = true;
    this.nextClickAt = this.loopStart;
    for (const track of this.tracks.values()) this.startTrackSource(track, this.loopStart);
    this.emit();
    this.emitState();
  }

  stop(emit = true): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const track of this.tracks.values()) {
      if (track.recMode) this.finalize(track, now);
      this.stopTrackSource(track);
    }
    this.playing = false;
    if (emit) {
      this.emit();
      this.emitState();
    }
  }

  togglePlay(): void {
    if (this.playing) this.stop();
    else this.play();
  }

  position(): { phase: number; bar: number; beat: number; fraction: number } {
    if (!this.ctx || !this.playing) {
      return { phase: 0, bar: 1, beat: 1, fraction: 0 };
    }
    const phase = loopPhase(this.ctx.currentTime, this.loopStart, this.loopSecondsValue);
    const barBeat = barBeatAt(
      phase,
      this.bpm,
      this.beatsPerBar,
      this.beatUnit,
      this.bars,
    );
    return { phase, ...barBeat };
  }

  private nextGridTime(now: number): number {
    const loop = this.loopSecondsValue;
    if (!this.playing) return now + 0.05;
    const elapsed = now - this.loopStart;
    const index = Math.ceil(elapsed / loop - 1e-6);
    let target = this.loopStart + index * loop;
    if (target < now + 0.02) target += loop;
    return target;
  }

  // ── tracks ──────────────────────────────────────────────────────────────

  createTrack(id: number): void {
    if (!this.ctx || this.tracks.has(id)) return;
    const ctx = this.ctx;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = DEFAULT_FX.hp;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = DEFAULT_FX.lp;
    const dry = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = DEFAULT_FX.delayTime / 1000;
    const delayFeedback = ctx.createGain();
    delayFeedback.gain.value = DEFAULT_FX.delayFeedback;
    const delayMix = ctx.createGain();
    delayMix.gain.value = DEFAULT_FX.delayMix;
    const gain = ctx.createGain();
    gain.gain.value = 0.8;
    const panner = ctx.createStereoPanner();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    const reverbSend = ctx.createGain();
    reverbSend.gain.value = DEFAULT_FX.reverbSend;

    input.connect(hp);
    hp.connect(lp);
    lp.connect(dry);
    dry.connect(gain);
    lp.connect(delay);
    delay.connect(delayMix);
    delayMix.connect(gain);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    gain.connect(panner);
    panner.connect(analyser);
    analyser.connect(this.masterIn);
    gain.connect(reverbSend);
    reverbSend.connect(this.reverbBus);

    this.tracks.set(id, {
      id,
      input,
      hp,
      lp,
      dry,
      delay,
      delayFeedback,
      delayMix,
      gain,
      panner,
      analyser,
      reverbSend,
      source: null,
      buffer: null,
      undo: null,
      armed: false,
      active: true,
      mute: false,
      solo: false,
      volume: 0.8,
      pan: 0,
      recMode: null,
      recStart: 0,
      recEnd: 0,
      recTrim: 0,
      recorder: null,
      inputConnected: false,
    });
  }

  removeTrack(id: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    this.stopTrackSource(track);
    this.disconnectInputs(track);
    try {
      track.input.disconnect();
      track.gain.disconnect();
      track.analyser.disconnect();
    } catch {
      // ignore teardown races
    }
    this.tracks.delete(id);
    this.emit();
  }

  setTrackSettings(
    id: number,
    settings: Partial<{
      volume: number;
      pan: number;
      mute: boolean;
      solo: boolean;
      armed: boolean;
      active: boolean;
      fx: TrackFx;
    }>,
  ): void {
    const track = this.tracks.get(id);
    if (!track) return;
    if (settings.volume !== undefined) track.volume = Math.max(0, Math.min(1, settings.volume));
    if (settings.pan !== undefined) track.pan = Math.max(-1, Math.min(1, settings.pan));
    if (settings.mute !== undefined) track.mute = settings.mute;
    if (settings.solo !== undefined) track.solo = settings.solo;
    if (settings.armed !== undefined) track.armed = settings.armed;
    if (settings.active !== undefined) {
      track.active = settings.active;
      if (!track.active) this.stopTrackSource(track);
      else if (this.playing && track.buffer && !track.recMode) {
        this.startTrackSource(track, this.nextGridTime(this.ctx?.currentTime ?? 0));
      }
    }
    if (settings.fx) this.applyFx(track, settings.fx);
    this.applyGains();
    this.emit();
  }

  applyFx(track: EngineTrack, fx: TrackFx): void {
    track.hp.frequency.value = Math.max(20, Math.min(2000, fx.hp));
    track.lp.frequency.value = Math.max(400, Math.min(20000, fx.lp));
    track.delay.delayTime.value = Math.max(0.02, Math.min(1.2, fx.delayTime / 1000));
    track.delayFeedback.gain.value = Math.max(0, Math.min(0.85, fx.delayFeedback));
    track.delayMix.gain.value = Math.max(0, Math.min(0.9, fx.delayMix));
    track.reverbSend.gain.value = Math.max(0, Math.min(1, fx.reverbSend));
  }

  applyGains(): void {
    const anySolo = [...this.tracks.values()].some((track) => track.solo);
    for (const track of this.tracks.values()) {
      const audible = !track.mute && (!anySolo || track.solo);
      const target = audible ? track.volume : 0;
      track.gain.gain.setTargetAtTime(target, this.ctx?.currentTime ?? 0, 0.01);
      track.panner.pan.setTargetAtTime(track.pan, this.ctx?.currentTime ?? 0, 0.01);
    }
  }

  armedTrack(): number | null {
    for (const track of this.tracks.values()) if (track.armed) return track.id;
    return null;
  }

  setTrackBuffer(id: number, buffer: LoopBuffer | null, options?: { keepUndo?: boolean }): void {
    const track = this.tracks.get(id);
    if (!track || !this.ctx) return;
    const wasPlaying = this.playing;
    this.stopTrackSource(track);
    track.buffer = buffer
      ? {
          sampleRate: this.ctx.sampleRate,
          channels: fitFrames(resampleLoop(buffer, this.ctx.sampleRate).channels, loopFrames(this.loopSecondsValue, this.ctx.sampleRate)),
        }
      : null;
    if (!options?.keepUndo) track.undo = null;
    track.active = true;
    if (buffer && wasPlaying) this.startTrackSource(track, this.nextGridTime(this.ctx.currentTime));
    this.emit();
  }

  getTrackBuffer(id: number): LoopBuffer | null {
    return this.tracks.get(id)?.buffer ?? null;
  }

  clearTrack(id: number): void {
    const track = this.tracks.get(id);
    if (!track) return;
    if (track.recMode) this.finalize(track);
    this.stopTrackSource(track);
    track.buffer = null;
    track.undo = null;
    this.emit();
  }

  undoOverdub(id: number): boolean {
    const track = this.tracks.get(id);
    if (!track || !track.undo) return false;
    track.buffer = track.undo;
    track.undo = null;
    this.refreshTrackSource(track);
    this.emit();
    return true;
  }

  armTrack(id: number, armed: boolean): void {
    for (const track of this.tracks.values()) {
      if (track.id !== id) track.armed = false;
    }
    const track = this.tracks.get(id);
    if (track) track.armed = armed;
    this.emit();
  }

  toggleTrackPlayback(id: number): void {
    const track = this.tracks.get(id);
    if (!track || !track.buffer) return;
    if (track.active && track.source) {
      track.active = false;
      this.stopTrackSource(track);
    } else {
      track.active = true;
      if (this.playing) this.startTrackSource(track, this.nextGridTime(this.ctx?.currentTime ?? 0));
    }
    this.emit();
  }

  private refreshTrackSource(track: EngineTrack): void {
    const playing = this.playing;
    this.stopTrackSource(track);
    if (playing && this.ctx) this.startTrackSource(track, this.nextGridTime(this.ctx.currentTime));
  }

  private toAudioBuffer(buffer: LoopBuffer): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const frames = buffer.channels[0]?.length ?? 1;
    const audio = ctx.createBuffer(Math.max(1, buffer.channels.length), frames, buffer.sampleRate);
    buffer.channels.forEach((channel, index) => audio.getChannelData(index).set(channel));
    return audio;
  }

  private startTrackSource(track: EngineTrack, at: number): void {
    if (!this.ctx || !track.buffer || !track.active || track.recMode) return;
    this.stopTrackSource(track);
    const source = this.ctx.createBufferSource();
    source.buffer = this.toAudioBuffer(track.buffer);
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = source.buffer.duration;
    source.connect(track.hp);
    try {
      source.start(at);
    } catch {
      return;
    }
    track.source = source;
  }

  private stopTrackSource(track: EngineTrack): void {
    if (!track.source) return;
    try {
      track.source.stop();
      track.source.disconnect();
    } catch {
      // already stopped
    }
    track.source = null;
  }

  private refitBuffers(): void {
    if (!this.ctx) return;
    const frames = loopFrames(this.loopSecondsValue, this.ctx.sampleRate);
    for (const track of this.tracks.values()) {
      if (!track.buffer) continue;
      const resampled = resampleLoop(track.buffer, this.ctx.sampleRate);
      track.buffer = { sampleRate: this.ctx.sampleRate, channels: fitFrames(resampled.channels, frames) };
      if (track.undo) track.undo = { sampleRate: this.ctx.sampleRate, channels: fitFrames(resampleLoop(track.undo, this.ctx.sampleRate).channels, frames) };
    }
  }

  // ── recording ───────────────────────────────────────────────────────────

  async record(id: number): Promise<boolean> {
    await this.ensure();
    const track = this.tracks.get(id);
    if (!track || !this.ctx) return false;
    if (track.recMode) {
      this.stopRecording(id);
      return true;
    }
    if (!this.playing) this.play();
    if (!this.playing) return false;

    const now = this.ctx.currentTime;
    const loopSec = this.loopSecondsValue;
    // Recording starts on a loop boundary so the captured take stays locked to
    // the running cycle; the count-in bar then starts inside the loop and the
    // take is rotated back onto the loop origin when it is committed.
    let armAt = this.nextGridTime(now + 0.06);
    if (armAt - now < 0.08) armAt += loopSec;
    if (this.countIn) {
      this.scheduleCountIn(armAt - this.barSecondsValue, armAt);
      armAt += this.barSecondsValue;
    }
    track.recMode = track.buffer ? 'overdub' : 'rec';
    track.recStart = armAt;
    track.recEnd = armAt + loopSec;
    track.recTrim = 0;
    this.usingInstrument = !this.micStream;
    this.connectInputs(track);
    try {
      track.recorder = await LoopRecorder.create(this.ctx, track.input, {
        channelCount: this.inputChannelMode === 'stereo' ? 2 : 1,
      });
      track.recorder.start();
    } catch {
      track.recMode = null;
      this.disconnectInputs(track);
      return false;
    }
    this.emit();
    return true;
  }

  /** Stop early on the next bar line, keeping the take quantised. */
  stopRecording(id: number): void {
    const track = this.tracks.get(id);
    if (!track?.recMode || !this.ctx) return;
    const now = this.ctx.currentTime;
    const barSec = this.barSecondsValue;
    const stopAt = Math.min(
      track.recEnd,
      nextBarBoundary(now + 0.02, this.loopStart, barSec),
    );
    if (stopAt <= track.recStart) {
      this.cancelRecording(track);
      return;
    }
    const frames = loopFrames(this.loopSecondsValue, this.ctx.sampleRate);
    track.recTrim = Math.max(
      Math.round(this.beatSecondsValue() * this.ctx.sampleRate),
      Math.min(frames, Math.round((stopAt - track.recStart) * this.ctx.sampleRate)),
    );
    track.recEnd = stopAt;
  }

  private cancelRecording(track: EngineTrack): void {
    const recorder = track.recorder;
    track.recorder = null;
    track.recMode = null;
    track.recTrim = 0;
    this.disconnectInputs(track);
    if (recorder) {
      void recorder.stopAsync().then(() => recorder.dispose());
    }
    this.emit();
  }

  private scheduleCountIn(from: number, to: number): void {
    const beat = beatSeconds(this.bpm, this.beatUnit);
    const beats = Math.max(1, Math.round((to - from) / beat));
    for (let i = 0; i < beats; i += 1) this.click(from + i * beat, i % this.beatsPerBar === 0);
  }

  private click(time: number, accent: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = accent ? 1760 : 1180;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(accent ? 0.2 : 0.12, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain);
    gain.connect(this.metronomeBus);
    osc.start(time);
    osc.stop(time + 0.08);
  }

  private connectInputs(track: EngineTrack): void {
    if (track.inputConnected) return;
    if (this.micGain) this.micGain.connect(track.input);
    if (this.instrumentBus) this.instrumentBus.connect(track.input);
    track.inputConnected = true;
  }

  private disconnectInputs(track: EngineTrack): void {
    if (!track.inputConnected) return;
    try {
      this.micGain?.disconnect(track.input);
    } catch {
      // not connected
    }
    try {
      this.instrumentBus?.disconnect(track.input);
    } catch {
      // not connected
    }
    track.inputConnected = false;
  }

  private finalize(track: EngineTrack, nowOverride?: number): void {
    const ctx = this.ctx;
    if (!ctx || !track.recorder) {
      track.recMode = null;
      return;
    }
    const recorder = track.recorder;
    track.recorder = null;
    const mode = track.recMode;
    track.recMode = null;
    const now = nowOverride ?? ctx.currentTime;
    const latency = this.latencyMs / 1000;
    const frames = loopFrames(this.loopSecondsValue, ctx.sampleRate);
    const startAt = track.recStart + Math.max(0, latency);
    const offsetFrames = Math.round(
      ((((track.recStart - this.loopStart) % this.loopSecondsValue) + this.loopSecondsValue) %
        this.loopSecondsValue) *
        ctx.sampleRate,
    );
    const capturedFrames =
      now < track.recEnd ? Math.max(0, Math.round((now - startAt) * ctx.sampleRate)) : frames;

    this.disconnectInputs(track);
    void recorder.stopAsync().then((chunks) => {
      const channels = rotateFrames(
        extractRegion(
          chunks,
          startAt,
          frames,
          ctx.sampleRate,
          this.inputChannelMode === 'stereo' ? 2 : 1,
        ),
        offsetFrames,
      );
      const take = Math.max(1, Math.min(frames, track.recTrim || capturedFrames || frames));
      const loop: LoopBuffer = {
        sampleRate: ctx.sampleRate,
        channels: channels.map((channel) => {
          const trimmed = new Float32Array(frames);
          trimmed.set(channel.subarray(0, Math.min(take, frames)));
          return trimmed;
        }),
      };
      if (mode === 'overdub' && track.buffer) {
        const committed = applyOverdub(track.buffer, loop, 1);
        track.buffer = committed.loop;
        track.undo = committed.undo;
      } else {
        track.buffer = loop;
      }
      track.active = true;
      if (this.playing) {
        const at = this.nextGridTime(ctx.currentTime);
        this.startTrackSource(track, at);
      }
      recorder.dispose();
      this.emit();
      this.emitState();
    });
    if (this.playing) {
      // Keep the loop slot free until the captured chunks arrive.
      this.emit();
    }
  }

  // ── runtime read-outs ───────────────────────────────────────────────────

  trackRuntime(): TrackRuntime[] {
    const now = this.ctx?.currentTime ?? 0;
    const loopSec = this.loopSecondsValue;
    return [...this.tracks.values()].map((track) => {
      let status: TrackStatus = 'EMPTY';
      let progress = 0;
      if (track.recMode) {
        if (now < track.recStart) {
          status = 'COUNT-IN';
          progress = 0;
        } else {
          status = track.recMode === 'overdub' ? 'OVERDUB' : 'REC';
          progress = Math.max(0, Math.min(1, (now - track.recStart) / loopSec));
        }
      } else if (track.buffer) {
        status = track.active && this.playing ? 'PLAY' : 'STOPPED';
        progress = this.playing && track.active ? loopPhase(now, this.loopStart, loopSec) / loopSec : 0;
      } else if (track.armed) {
        status = 'ARMED';
      }
      return {
        id: track.id,
        status,
        progress,
        hasLoop: !!track.buffer,
        canUndo: !!track.undo,
      };
    });
  }

  levels(): EngineLevels {
    const tracks: Record<number, number> = {};
    const data = new Float32Array(1024);
    for (const track of this.tracks.values()) {
      track.analyser.getFloatTimeDomainData(data);
      tracks[track.id] = peakOf([data]);
    }
    let master = 0;
    if (this.ctx) {
      this.masterAnalyser.getFloatTimeDomainData(data);
      master = peakOf([data]);
    }
    let input = 0;
    if (this.micAnalyser) {
      this.micAnalyser.getFloatTimeDomainData(data);
      input = peakOf([data]);
    }
    return { master, input, tracks };
  }

  trackWaveform(id: number, target: Float32Array<ArrayBuffer>): boolean {
    const track = this.tracks.get(id);
    if (!track) return false;
    track.analyser.getFloatTimeDomainData(target);
    return true;
  }

  // ── input devices ──────────────────────────────────────────────────────

  async listDevices(): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    try {
      return await navigator.mediaDevices.enumerateDevices();
    } catch {
      return [];
    }
  }

  setInputGain(value: number): void {
    this.inputGainValue = Math.max(0, Math.min(2, value));
    if (this.micGain) this.micGain.gain.value = this.inputGainValue;
    this.emit();
  }

  getInputGain(): number {
    return this.inputGainValue;
  }

  setProcessing(next: Partial<typeof this.processing>): void {
    this.processing = { ...this.processing, ...next };
    if (this.micStream) void this.requestMicrophone(this.inputDeviceId ?? undefined);
  }

  getProcessing(): typeof this.processing {
    return { ...this.processing };
  }

  setInputChannelMode(mode: 'mono' | 'stereo'): void {
    this.inputChannelMode = mode;
    this.emit();
  }

  getInputChannelMode(): 'mono' | 'stereo' {
    return this.inputChannelMode;
  }

  hasMicrophone(): boolean {
    return !!this.micStream;
  }

  async requestMicrophone(deviceId?: string): Promise<boolean> {
    await this.ensure();
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: this.processing.echoCancellation,
          noiseSuppression: this.processing.noiseSuppression,
          autoGainControl: this.processing.autoGainControl,
          channelCount: this.inputChannelMode === 'stereo' ? 2 : 1,
        },
        video: false,
      });
      this.micStream?.getTracks().forEach((track) => track.stop());
      this.micStream = stream;
      this.inputDeviceId = deviceId ?? null;
      if (this.micSource) this.micSource.disconnect();
      if (this.micGain) this.micGain.disconnect();
      this.micSource = this.ctx!.createMediaStreamSource(stream);
      this.micGain = this.ctx!.createGain();
      this.micGain.gain.value = this.inputGainValue;
      this.micAnalyser = this.ctx!.createAnalyser();
      this.micAnalyser.fftSize = 512;
      this.micSource.connect(this.micGain);
      this.micGain.connect(this.micAnalyser);
      for (const track of this.tracks.values()) {
        if (track.recMode) this.connectInputs(track);
      }
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  async setOutputDevice(deviceId: string): Promise<boolean> {
    const ctx = this.ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!ctx?.setSinkId) return false;
    try {
      await ctx.setSinkId(deviceId);
      return true;
    } catch {
      return false;
    }
  }

  supportsOutputSelection(): boolean {
    return typeof (window.AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function';
  }

  // ── project ────────────────────────────────────────────────────────────

  async loadProject(project: ProjectState): Promise<void> {
    await this.ensure();
    this.stop(false);
    this.bpm = project.bpm;
    this.beatsPerBar = project.beatsPerBar;
    this.beatUnit = project.beatUnit;
    this.bars = project.bars;
    this.metronome = project.metronome;
    this.countIn = project.countIn;
    this.latencyMs = project.latencyMs;
    this.masterVolume = project.masterVolume;
    if (this.masterGain) this.masterGain.gain.value = this.masterVolume;

    const keep = new Set(project.tracks.map((track) => track.id));
    for (const id of [...this.tracks.keys()]) if (!keep.has(id)) this.removeTrack(id);
    for (const trackData of project.tracks) {
      this.createTrack(trackData.id);
      const track = this.tracks.get(trackData.id);
      if (!track) continue;
      track.armed = trackData.armed;
      track.mute = trackData.mute;
      track.solo = trackData.solo;
      track.volume = trackData.volume;
      track.pan = trackData.pan;
      track.active = track.active && trackData.active;
      this.applyFx(track, trackData.fx ?? DEFAULT_FX);
      track.buffer = trackData.buffer
        ? {
            sampleRate: this.ctx!.sampleRate,
            channels: fitFrames(
              resampleLoop(trackData.buffer, this.ctx!.sampleRate).channels,
              loopFrames(this.loopSecondsValue, this.ctx!.sampleRate),
            ),
          }
        : null;
      track.undo = null;
    }
    this.applyGains();
    this.emit();
    this.emitState();
  }

  async importFile(id: number, data: ArrayBuffer): Promise<boolean> {
    await this.ensure();
    if (!this.ctx) return false;
    try {
      const audio = await this.ctx.decodeAudioData(data.slice(0));
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < Math.min(2, audio.numberOfChannels); ch += 1) {
        channels.push(new Float32Array(audio.getChannelData(ch)));
      }
      const loop: LoopBuffer = { sampleRate: audio.sampleRate, channels };
      this.setTrackBuffer(id, loop);
      const track = this.tracks.get(id);
      if (track) track.active = true;
      this.emit();
      return true;
    } catch {
      return false;
    }
  }

  async restart(sampleRate?: number): Promise<void> {
    if (!this.ctx) return;
    const saved = [...this.tracks.values()].map((track) => ({
      id: track.id,
      buffer: track.buffer
        ? { sampleRate: track.buffer.sampleRate, channels: track.buffer.channels.map((c) => new Float32Array(c)) }
        : null,
    }));
    const settings = {
      bpm: this.bpm,
      beatsPerBar: this.beatsPerBar,
      beatUnit: this.beatUnit,
      bars: this.bars,
      masterVolume: this.masterVolume,
      metronome: this.metronome,
      countIn: this.countIn,
      latencyMs: this.latencyMs,
    };
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    try {
      await this.ctx.close();
    } catch {
      // ignore
    }
    this.ctx = null;
    this.started = false;
    this.tracks.clear();
    this.synth = null;
    this.drums = null;
    await this.init({ ...settings, sampleRate });
    for (const entry of saved) {
      this.createTrack(entry.id);
      if (entry.buffer) this.setTrackBuffer(entry.id, entry.buffer);
    }
    this.emit();
    this.emitState();
  }

  // ── periodic work ──────────────────────────────────────────────────────

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.playing) {
      this.scheduleMetronome(now);
      for (const track of this.tracks.values()) {
        if (!track.recMode) continue;
        const wait = Math.max(0, this.latencyMs) / 1000 + 0.08;
        if (now >= track.recEnd + wait) this.finalize(track, now);
      }
      this.emitState();
    }
  }

  private scheduleMetronome(now: number): void {
    const beat = beatSeconds(this.bpm, this.beatUnit);
    if (this.nextClickAt < now - 1) this.nextClickAt = this.nextGridTime(now);
    while (this.nextClickAt < now + 0.25) {
      const phase = loopPhase(this.nextClickAt, this.loopStart, this.loopSecondsValue);
      const accent = phase < beat * 0.5;
      if (this.metronome) this.click(this.nextClickAt, accent);
      this.nextClickAt += beat;
    }
  }

  // ── instrument ─────────────────────────────────────────────────────────

  setSynthPreset(name: SynthPresetName): void {
    this.synth?.setPreset(name);
  }

  setDrumKit(name: DrumKitName): void {
    this.drums?.setKit(name);
  }

  triggerDrum(pad: number, velocity = 0.85): void {
    void this.ensure();
    this.drums?.play(pad, velocity);
  }

  noteOn(midi: number, velocity = 0.85): void {
    void this.ensure();
    this.synth?.noteOn(midi, velocity);
  }

  noteOff(midi: number): void {
    this.synth?.noteOff(midi);
  }

  usingInstrumentSource(): boolean {
    return this.usingInstrument;
  }

  describe(): { sampleRate: number; state: string; playing: boolean; worklet: boolean } {
    return {
      sampleRate: this.sampleRate,
      state: this.contextState,
      playing: this.playing,
      worklet: typeof AudioWorkletNode !== 'undefined',
    };
  }
}

export const engine = new AudioEngine();
