/** Polyphonic Web Audio synth with the four Lýra presets. */

export type SynthPresetName = 'electric' | 'pad' | 'pluck' | 'sub';

interface PresetSpec {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  filter: number;
  q: number;
  /** Oscillator recipes: [type, ratio, detune cents, level]. */
  oscillators: Array<[OscillatorType, number, number, number]>;
  /** Sine modulator index (multiple of note frequency), 0 = no FM. */
  fmIndex: number;
  fmRatio: number;
  level: number;
}

const PRESETS: Record<SynthPresetName, PresetSpec> = {
  electric: {
    attack: 0.005,
    decay: 0.75,
    sustain: 0.22,
    release: 0.42,
    filter: 5200,
    q: 0.6,
    oscillators: [
      ['sine', 1, 0, 0.8],
      ['sine', 2, 4, 0.18],
      ['triangle', 1, -5, 0.16],
    ],
    fmIndex: 1.5,
    fmRatio: 2,
    level: 0.5,
  },
  pad: {
    attack: 0.55,
    decay: 0.9,
    sustain: 0.72,
    release: 1.7,
    filter: 1500,
    q: 1.1,
    oscillators: [
      ['sawtooth', 1, -8, 0.32],
      ['sawtooth', 1, 8, 0.32],
      ['triangle', 2, 0, 0.1],
    ],
    fmIndex: 0,
    fmRatio: 1,
    level: 0.36,
  },
  pluck: {
    attack: 0.004,
    decay: 0.26,
    sustain: 0.05,
    release: 0.22,
    filter: 3400,
    q: 2.4,
    oscillators: [
      ['triangle', 1, 0, 0.6],
      ['square', 2, 3, 0.14],
    ],
    fmIndex: 0,
    fmRatio: 1,
    level: 0.42,
  },
  sub: {
    attack: 0.012,
    decay: 0.24,
    sustain: 0.78,
    release: 0.16,
    filter: 420,
    q: 0.7,
    oscillators: [
      ['sine', 1, 0, 0.9],
      ['triangle', 2, 0, 0.16],
    ],
    fmIndex: 0,
    fmRatio: 1,
    level: 0.6,
  },
};

interface Voice {
  midi: number;
  gain: GainNode;
  filter: BiquadFilterNode;
  oscillators: OscillatorNode[];
  startedAt: number;
  released: boolean;
}

export function noteFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class PolySynth {
  private ctx: AudioContext;
  private dest: AudioNode;
  private preset: SynthPresetName = 'electric';
  private voices: Voice[] = [];
  private sustain = false;
  private held = new Set<number>();
  private transpose = 0;
  private level = 0.9;
  private maxVoices = 12;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
  }

  setPreset(name: SynthPresetName): void {
    this.preset = name;
  }

  getPreset(): SynthPresetName {
    return this.preset;
  }

  setSustain(on: boolean): void {
    this.sustain = on;
    if (!on) {
      for (const midi of [...this.held]) this.release(midi);
    }
  }

  isSustain(): boolean {
    return this.sustain;
  }

  setOctave(octave: number): void {
    this.transpose = Math.max(-2, Math.min(3, octave)) * 12;
  }

  getOctave(): number {
    return this.transpose / 12;
  }

  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
  }

  noteOn(midi: number, velocity = 0.85): void {
    const sounding = midi + this.transpose;
    this.held.add(sounding);
    const existing = this.voices.find((voice) => voice.midi === sounding && !voice.released);
    if (existing) return;
    while (this.voices.filter((voice) => !voice.released).length >= this.maxVoices) {
      const oldest = this.voices.find((voice) => !voice.released);
      if (!oldest) break;
      this.stopVoice(oldest, 0.02);
    }

    const spec = PRESETS[this.preset];
    const now = this.ctx.currentTime;
    const freq = noteFrequency(sounding);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(spec.filter, now);
    filter.Q.value = spec.q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    const peak = spec.level * Math.max(0.05, Math.min(1, velocity)) * this.level;
    gain.gain.exponentialRampToValueAtTime(peak, now + spec.attack);
    gain.gain.setTargetAtTime(peak * spec.sustain, now + spec.attack, Math.max(0.03, spec.decay / 3));

    filter.connect(gain);
    gain.connect(this.dest);

    const oscillators: OscillatorNode[] = [];
    for (const [type, ratio, detune, level] of spec.oscillators) {
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * ratio;
      osc.detune.value = detune;
      const mix = this.ctx.createGain();
      mix.gain.value = level;
      osc.connect(mix);
      mix.connect(filter);
      osc.start(now);
      oscillators.push(osc);
    }

    if (spec.fmIndex > 0) {
      const mod = this.ctx.createOscillator();
      mod.type = 'sine';
      mod.frequency.value = freq * spec.fmRatio;
      const index = this.ctx.createGain();
      index.gain.setValueAtTime(freq * spec.fmIndex, now);
      index.gain.setTargetAtTime(freq * spec.fmIndex * 0.12, now + 0.01, 0.22);
      mod.connect(index);
      index.connect(oscillators[0].frequency);
      mod.start(now);
      oscillators.push(mod);
    }

    this.voices.push({ midi: sounding, gain, filter, oscillators, startedAt: now, released: false });
  }

  noteOff(midi: number): void {
    this.held.delete(midi + this.transpose);
    if (this.sustain) return;
    this.release(midi + this.transpose);
  }

  allNotesOff(): void {
    this.held.clear();
    for (const voice of this.voices) if (!voice.released) this.stopVoice(voice, 0.05);
  }

  private release(midi: number): void {
    for (const voice of this.voices) {
      if (voice.midi === midi && !voice.released) this.stopVoice(voice);
    }
  }

  private stopVoice(voice: Voice, override?: number): void {
    const spec = PRESETS[this.preset];
    const now = this.ctx.currentTime;
    const release = override ?? spec.release;
    voice.released = true;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
    for (const osc of voice.oscillators) {
      try {
        osc.stop(now + release + 0.02);
      } catch {
        // already stopped
      }
    }
    window.setTimeout(() => {
      this.voices = this.voices.filter((entry) => entry !== voice);
      try {
        voice.gain.disconnect();
        voice.filter.disconnect();
      } catch {
        // already disconnected
      }
    }, (release + 0.1) * 1000);
  }
}
