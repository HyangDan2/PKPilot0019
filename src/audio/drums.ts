/** Three synthesized 8-pad drum kits (808 / Lo-Fi / Acoustic). */

import { seededRandom } from './dsp';

export type DrumKitName = '808' | 'lofi' | 'acoustic';

export const DRUM_PADS = ['kick', 'snare', 'clap', 'closed', 'open', 'rim', 'tom', 'crash'] as const;
export type DrumPad = (typeof DRUM_PADS)[number];

interface KitSpec {
  kickStart: number;
  kickEnd: number;
  kickDecay: number;
  kickClick: number;
  snareTone: number;
  snareDecay: number;
  snareNoise: number;
  hatDecay: number;
  hatTone: number;
  openDecay: number;
  tomStart: number;
  tomEnd: number;
  crashDecay: number;
  level: number;
}

const KITS: Record<DrumKitName, KitSpec> = {
  '808': {
    kickStart: 130,
    kickEnd: 44,
    kickDecay: 0.62,
    kickClick: 0.12,
    snareTone: 186,
    snareDecay: 0.22,
    snareNoise: 0.42,
    hatDecay: 0.055,
    hatTone: 7200,
    openDecay: 0.34,
    tomStart: 210,
    tomEnd: 104,
    crashDecay: 1.25,
    level: 0.9,
  },
  lofi: {
    kickStart: 108,
    kickEnd: 52,
    kickDecay: 0.3,
    kickClick: 0.05,
    snareTone: 210,
    snareDecay: 0.14,
    snareNoise: 0.3,
    hatDecay: 0.035,
    hatTone: 5200,
    openDecay: 0.2,
    tomStart: 180,
    tomEnd: 96,
    crashDecay: 0.75,
    level: 0.82,
  },
  acoustic: {
    kickStart: 155,
    kickEnd: 62,
    kickDecay: 0.22,
    kickClick: 0.2,
    snareTone: 196,
    snareDecay: 0.16,
    snareNoise: 0.46,
    hatDecay: 0.05,
    hatTone: 8600,
    openDecay: 0.26,
    tomStart: 240,
    tomEnd: 120,
    crashDecay: 1.4,
    level: 0.86,
  },
};

export class DrumKit {
  private ctx: AudioContext;
  private dest: AudioNode;
  private kit: DrumKitName = '808';
  private noise: AudioBuffer;

  constructor(ctx: AudioContext, dest: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
    this.noise = this.makeNoise();
  }

  setKit(name: DrumKitName): void {
    this.kit = name;
  }

  getKit(): DrumKitName {
    return this.kit;
  }

  private makeNoise(): AudioBuffer {
    const length = Math.floor(this.ctx.sampleRate * 1.6);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const random = seededRandom(0x4c797261);
    for (let i = 0; i < length; i += 1) data[i] = random() * 2 - 1;
    return buffer;
  }

  private noiseSource(): AudioBufferSourceNode {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    return source;
  }

  play(pad: number, velocity = 0.85, when?: number): void {
    const spec = KITS[this.kit];
    const time = when ?? this.ctx.currentTime;
    const gain = Math.max(0.05, Math.min(1, velocity));
    switch (pad) {
      case 0:
        return this.kick(spec, time, gain);
      case 1:
        return this.snare(spec, time, gain);
      case 2:
        return this.clap(spec, time, gain);
      case 3:
        return this.hat(spec, time, gain, false);
      case 4:
        return this.hat(spec, time, gain, true);
      case 5:
        return this.rim(spec, time, gain);
      case 6:
        return this.tom(spec, time, gain);
      case 7:
        return this.crash(spec, time, gain);
      default:
        return;
    }
  }

  private env(time: number, peak: number, decay: number, attack = 0.002): GainNode {
    const node = this.ctx.createGain();
    node.gain.setValueAtTime(0.0001, time);
    node.gain.linearRampToValueAtTime(peak, time + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
    node.connect(this.dest);
    return node;
  }

  private kick(spec: KitSpec, time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.kickStart, time);
    osc.frequency.exponentialRampToValueAtTime(spec.kickEnd, time + 0.09);
    const env = this.env(time, spec.level * velocity, spec.kickDecay, 0.004);
    osc.connect(env);
    osc.start(time);
    osc.stop(time + spec.kickDecay + 0.1);

    if (spec.kickClick > 0) {
      const click = this.noiseSource();
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1800;
      const envClick = this.env(time, spec.kickClick * velocity, 0.02);
      click.connect(hp);
      hp.connect(envClick);
      click.start(time, 0.1);
      click.stop(time + 0.05);
    }
  }

  private snare(spec: KitSpec, time: number, velocity: number): void {
    const tone = this.ctx.createOscillator();
    tone.type = 'triangle';
    tone.frequency.setValueAtTime(spec.snareTone, time);
    tone.frequency.exponentialRampToValueAtTime(spec.snareTone * 0.7, time + 0.1);
    const toneEnv = this.env(time, 0.3 * velocity, spec.snareDecay);
    tone.connect(toneEnv);
    tone.start(time);
    tone.stop(time + spec.snareDecay + 0.05);

    const noise = this.noiseSource();
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = this.kit === 'lofi' ? 1400 : 1900;
    band.Q.value = 0.8;
    const noiseEnv = this.env(time, spec.snareNoise * velocity, spec.snareDecay);
    noise.connect(band);
    band.connect(noiseEnv);
    noise.start(time, 0.2);
    noise.stop(time + spec.snareDecay + 0.05);
  }

  private clap(spec: KitSpec, time: number, velocity: number): void {
    for (let burst = 0; burst < 3; burst += 1) {
      const start = time + burst * 0.011;
      const noise = this.noiseSource();
      const band = this.ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1100;
      band.Q.value = 1.4;
      const env = this.env(start, 0.28 * velocity * (burst === 2 ? 1 : 0.7), 0.055);
      noise.connect(band);
      band.connect(env);
      noise.start(start, 0.3 + burst * 0.05);
      noise.stop(start + 0.09);
    }
    if (this.kit === '808') {
      const tone = this.ctx.createOscillator();
      tone.type = 'triangle';
      tone.frequency.value = 320;
      const env = this.env(time, 0.1 * velocity, 0.06);
      tone.connect(env);
      tone.start(time);
      tone.stop(time + 0.1);
    }
    void spec;
  }

  private hat(spec: KitSpec, time: number, velocity: number, open: boolean): void {
    const noise = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = spec.hatTone;
    const decay = open ? spec.openDecay : spec.hatDecay;
    const env = this.env(time, 0.2 * velocity, decay, 0.001);
    noise.connect(hp);
    hp.connect(env);
    noise.start(time, 0.5);
    noise.stop(time + decay + 0.05);
  }

  private rim(spec: KitSpec, time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, time);
    const env = this.env(time, 0.16 * velocity, 0.035);
    const band = this.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1200;
    band.Q.value = 1.2;
    osc.connect(band);
    band.connect(env);
    osc.start(time);
    osc.stop(time + 0.1);
    const click = this.noiseSource();
    const clickEnv = this.env(time, 0.1 * velocity, 0.02);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    click.connect(hp);
    hp.connect(clickEnv);
    click.start(time, 0.4);
    click.stop(time + 0.05);
    void spec;
  }

  private tom(spec: KitSpec, time: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(spec.tomStart, time);
    osc.frequency.exponentialRampToValueAtTime(spec.tomEnd, time + 0.18);
    const env = this.env(time, 0.34 * velocity, 0.26);
    osc.connect(env);
    osc.start(time);
    osc.stop(time + 0.4);
  }

  private crash(spec: KitSpec, time: number, velocity: number): void {
    const noise = this.noiseSource();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4200;
    const env = this.env(time, 0.24 * velocity, spec.crashDecay, 0.003);
    noise.connect(hp);
    hp.connect(env);
    noise.start(time, 0.2);
    noise.stop(time + spec.crashDecay + 0.1);
  }
}
