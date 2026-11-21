/**
 * Three built-in sample projects, rendered deterministically in TypeScript
 * (no network, no audio files, no CORS). Every loop is produced from simple
 * DSP so it survives `.lps.json` save/load and can be unit-tested.
 */

import { loopSeconds } from './clock';
import { seededRandom } from './dsp';
import { createProject, DEFAULT_FX, type LoopBuffer, type ProjectState, type TrackFx } from './types';

const SR = 44100;

interface Render {
  sr: number;
  frames: number;
  noise: Float32Array;
}

function makeRender(seconds: number): Render {
  const frames = Math.round(seconds * SR);
  const random = seededRandom(0x4c797261);
  const noise = new Float32Array(Math.max(SR, frames));
  for (let i = 0; i < noise.length; i += 1) noise[i] = random() * 2 - 1;
  return { sr: SR, frames, noise };
}

function add(out: Float32Array, index: number, value: number): void {
  const wrapped = ((index % out.length) + out.length) % out.length;
  out[wrapped] += value;
}

function envelope(t: number, dur: number, a: number, d: number, s: number, r: number): number {
  if (t < 0) return 0;
  if (t < a) return t / Math.max(0.0001, a);
  if (t < a + d) return 1 - (1 - s) * ((t - a) / Math.max(0.0001, d));
  if (t < dur) return s;
  const tail = t - dur;
  if (tail >= r) return 0;
  return s * (1 - tail / Math.max(0.0001, r));
}

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

interface VoiceSpec {
  partials: Array<[number, number]>;
  a: number;
  d: number;
  s: number;
  r: number;
  cutoff: number;
  amp: number;
  detune?: number;
}

const VOICES: Record<'ep' | 'pad' | 'pluck' | 'bass' | 'keys', VoiceSpec> = {
  ep: {
    partials: [[1, 0.7], [2, 0.24], [3, 0.09], [4, 0.03]],
    a: 0.004,
    d: 0.8,
    s: 0.2,
    r: 0.35,
    cutoff: 5200,
    amp: 0.5,
  },
  pad: {
    partials: [[1, 0.35], [2, 0.18], [3, 0.12], [4, 0.08], [5, 0.05], [6, 0.03]],
    a: 0.42,
    d: 0.6,
    s: 0.75,
    r: 1.1,
    cutoff: 1600,
    amp: 0.3,
    detune: 0.004,
  },
  pluck: {
    partials: [[1, 0.6], [2, 0.18], [3, 0.14], [5, 0.06]],
    a: 0.003,
    d: 0.22,
    s: 0.04,
    r: 0.18,
    cutoff: 3400,
    amp: 0.42,
  },
  bass: {
    partials: [[1, 0.85], [2, 0.18], [3, 0.06]],
    a: 0.008,
    d: 0.2,
    s: 0.65,
    r: 0.12,
    cutoff: 600,
    amp: 0.62,
  },
  keys: {
    partials: [[1, 0.65], [2, 0.3], [3, 0.12], [4, 0.06]],
    a: 0.005,
    d: 0.5,
    s: 0.35,
    r: 0.3,
    cutoff: 6200,
    amp: 0.45,
  },
};

function addVoice(
  out: Float32Array,
  rc: Render,
  startBeat: number,
  durSec: number,
  midi: number,
  preset: keyof typeof VOICES,
  amp = 1,
): void {
  const spec = VOICES[preset];
  const freq = midiToFreq(midi);
  const start = Math.round(startBeat * rc.sr);
  const total = Math.round((durSec + spec.r) * rc.sr);
  const coefficient = Math.exp((-2 * Math.PI * spec.cutoff) / rc.sr);
  let lp = 0;
  const detune = spec.detune ?? 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / rc.sr;
    const env = envelope(t, durSec, spec.a, spec.d, spec.s, spec.r);
    if (env <= 0) continue;
    let sample = 0;
    for (const [ratio, gain] of spec.partials) {
      sample += gain * Math.sin(2 * Math.PI * freq * ratio * t);
      if (detune > 0) {
        sample += gain * 0.6 * Math.sin(2 * Math.PI * freq * ratio * (1 + detune) * t);
      }
    }
    lp = sample * (1 - coefficient) + lp * coefficient;
    add(out, start + i, lp * env * spec.amp * amp);
  }
}

function addKick(
  out: Float32Array,
  rc: Render,
  startSec: number,
  amp: number,
  style: 'lofi' | '808' | 'acoustic',
): void {
  const start = Math.round(startSec * rc.sr);
  const config = {
    lofi: { f0: 108, f1: 52, decay: 0.3, click: 0.05 },
    '808': { f0: 132, f1: 44, decay: 0.6, click: 0.08 },
    acoustic: { f0: 152, f1: 62, decay: 0.22, click: 0.16 },
  }[style];
  const total = Math.round(config.decay * 1.4 * rc.sr);
  let phase = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / rc.sr;
    const freq = config.f1 + (config.f0 - config.f1) * Math.exp(-t / 0.03);
    phase += (2 * Math.PI * freq) / rc.sr;
    const env = Math.exp(-t / config.decay) * (t < 0.002 ? t / 0.002 : 1);
    const click = t < 0.012 ? config.click * (1 - t / 0.012) * rc.noise[i % rc.noise.length] : 0;
    add(out, start + i, (Math.sin(phase) * 0.9 + click) * env * amp);
  }
}

function addSnare(
  out: Float32Array,
  rc: Render,
  startSec: number,
  amp: number,
  style: 'lofi' | '808' | 'acoustic',
): void {
  const start = Math.round(startSec * rc.sr);
  const decay = style === 'lofi' ? 0.13 : 0.19;
  const total = Math.round(decay * 2.2 * rc.sr);
  let previous = 0;
  let phase = 0;
  const tone = style === 'acoustic' ? 196 : 186;
  for (let i = 0; i < total; i += 1) {
    const t = i / rc.sr;
    const env = Math.exp(-t / decay);
    const raw = rc.noise[(start + i) % rc.noise.length];
    const high = raw - previous * 0.75;
    previous = raw;
    phase += (2 * Math.PI * tone) / rc.sr;
    const body = Math.sin(phase) * 0.22;
    add(out, start + i, (high * 0.42 + body) * env * amp);
  }
}

function addHat(out: Float32Array, rc: Render, startSec: number, amp: number, open = false): void {
  const start = Math.round(startSec * rc.sr);
  const decay = open ? 0.28 : 0.045;
  const total = Math.round(decay * 2.4 * rc.sr);
  let previous = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / rc.sr;
    const env = Math.exp(-t / decay);
    const raw = rc.noise[(start + i * 2) % rc.noise.length];
    const high = raw - previous;
    previous = raw;
    add(out, start + i, high * env * amp * 0.6);
  }
}

function addClap(out: Float32Array, rc: Render, startSec: number, amp: number): void {
  for (let burst = 0; burst < 3; burst += 1) {
    const start = Math.round((startSec + burst * 0.011) * rc.sr);
    const total = Math.round(0.09 * rc.sr);
    let previous = 0;
    for (let i = 0; i < total; i += 1) {
      const t = i / rc.sr;
      const env = Math.exp(-t / 0.05);
      const raw = rc.noise[(start + i * 3) % rc.noise.length];
      const band = raw - previous * 0.6;
      previous = raw;
      add(out, start + i, band * env * amp * (burst === 2 ? 0.5 : 0.32));
    }
  }
}

function addRim(out: Float32Array, rc: Render, startSec: number, amp: number): void {
  const start = Math.round(startSec * rc.sr);
  const total = Math.round(0.07 * rc.sr);
  let previous = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / rc.sr;
    const env = Math.exp(-t / 0.02);
    const raw = rc.noise[(start + i * 5) % rc.noise.length];
    const high = raw - previous;
    previous = raw;
    const tone = Math.sin(2 * Math.PI * 880 * t) * 0.4;
    add(out, start + i, (high * 0.5 + tone) * env * amp);
  }
}

function addTom(out: Float32Array, rc: Render, startSec: number, amp: number): void {
  const start = Math.round(startSec * rc.sr);
  const total = Math.round(0.32 * rc.sr);
  let phase = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / rc.sr;
    const freq = 120 + 110 * Math.exp(-t / 0.12);
    phase += (2 * Math.PI * freq) / rc.sr;
    const env = Math.exp(-t / 0.24);
    add(out, start + i, Math.sin(phase) * env * amp * 0.55);
  }
}

function addCrash(out: Float32Array, rc: Render, startSec: number, amp: number): void {
  const start = Math.round(startSec * rc.sr);
  const total = Math.round(1.1 * rc.sr);
  let previous = 0;
  for (let i = 0; i < total; i += 1) {
    const t = i / rc.sr;
    const env = Math.exp(-t / 0.5);
    const raw = rc.noise[(start + i * 7) % rc.noise.length];
    const high = raw - previous * 0.4;
    previous = raw;
    add(out, start + i, high * env * amp * 0.28);
  }
}

interface SampleTrackSpec {
  name: string;
  volume: number;
  fx?: Partial<TrackFx>;
  render: (data: Float32Array, rc: Render) => void;
}

function buildProject(
  meta: {
    name: string;
    bpm: number;
    beatsPerBar: number;
    beatUnit: number;
    bars: number;
  },
  tracks: SampleTrackSpec[],
): ProjectState {
  const seconds = loopSeconds(meta.bpm, meta.beatsPerBar, meta.beatUnit, meta.bars);
  const rc = makeRender(seconds);
  const project = createProject(meta.name, tracks.length);
  project.bpm = meta.bpm;
  project.beatsPerBar = meta.beatsPerBar;
  project.beatUnit = meta.beatUnit;
  project.bars = meta.bars;
  project.metronome = false;
  project.countIn = true;
  tracks.forEach((spec, index) => {
    const data = new Float32Array(rc.frames);
    spec.render(data, rc);
    // Keep every demo stem inside full scale so the master limiter is not
    // asked to rescue a clipped layer.
    let peak = 0;
    for (let i = 0; i < data.length; i += 1) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
    }
    if (peak > 0.9) {
      const scale = 0.88 / peak;
      for (let i = 0; i < data.length; i += 1) data[i] *= scale;
    }
    const loop: LoopBuffer = { sampleRate: SR, channels: [data] };
    const track = project.tracks[index];
    project.tracks[index] = {
      ...track,
      name: spec.name,
      volume: spec.volume,
      source: 'File',
      active: true,
      armed: false,
      buffer: loop,
      fx: { ...DEFAULT_FX, ...spec.fx },
    };
  });
  return project;
}

export interface SampleDefinition {
  key: 'lofi' | 'synthwave' | 'waltz';
  name: string;
  nameKo: string;
  blurbKo: string;
  blurbEn: string;
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  bars: number;
  trackCount: number;
  build: () => ProjectState;
}

export const SAMPLE_PROJECTS: SampleDefinition[] = [
  {
    key: 'lofi',
    name: 'Lo-Fi Chill Groove',
    nameKo: '로파이 칠 그루브',
    blurbKo: '92 BPM · 2마디 — 드럼·EP 코드·서브 베이스·플럭 멜로디',
    blurbEn: '92 BPM · 2 bars — drums, EP chords, sub bass, pluck melody',
    bpm: 92,
    beatsPerBar: 4,
    beatUnit: 4,
    bars: 2,
    trackCount: 4,
    build: () => {
      const beat = 60 / 92;
      return buildProject(
        { name: 'Lo-Fi Chill Groove', bpm: 92, beatsPerBar: 4, beatUnit: 4, bars: 2 },
        [
          {
            name: 'Lo-Fi Drums',
            volume: 0.8,
            fx: { lp: 9000, reverbSend: 0.1 },
            render: (data, rc) => {
              for (const b of [0, 2.5, 4, 6.5]) addKick(data, rc, b * beat, 0.95, 'lofi');
              for (const b of [2, 6]) addSnare(data, rc, b * beat, 0.75, 'lofi');
              for (let b = 0; b < 8; b += 0.5) {
                addHat(data, rc, b * beat, b % 1 === 0 ? 0.34 : 0.2);
              }
              addHat(data, rc, 3.75 * beat, 0.3, true);
              for (const b of [3.25, 7.25]) addRim(data, rc, b * beat, 0.35);
              addCrash(data, rc, 0, 0.22);
              addTom(data, rc, 3.5 * beat, 0.3);
            },
          },
          {
            name: 'Warm EP Chords',
            volume: 0.62,
            fx: { lp: 4200, reverbSend: 0.34 },
            render: (data, rc) => {
              for (const midi of [53, 57, 60, 64]) addVoice(data, rc, 0, 1.85 * beat, midi, 'ep', 0.85);
              for (const midi of [57, 60, 64, 67]) addVoice(data, rc, 4 * beat, 1.85 * beat, midi, 'ep', 0.8);
            },
          },
          {
            name: 'Sub Bass',
            volume: 0.7,
            fx: { lp: 800, reverbSend: 0 },
            render: (data, rc) => {
              addVoice(data, rc, 0 * beat, 0.9 * beat, 29, 'bass', 1);
              addVoice(data, rc, 1.5 * beat, 0.4 * beat, 29, 'bass', 0.8);
              addVoice(data, rc, 2.75 * beat, 0.35 * beat, 36, 'bass', 0.75);
              addVoice(data, rc, 4 * beat, 0.9 * beat, 33, 'bass', 1);
              addVoice(data, rc, 5.5 * beat, 0.4 * beat, 33, 'bass', 0.8);
              addVoice(data, rc, 6.75 * beat, 0.35 * beat, 40, 'bass', 0.75);
            },
          },
          {
            name: 'Pluck Melody',
            volume: 0.6,
            fx: { lp: 5200, delayMix: 0.24, delayTime: 320, delayFeedback: 0.3, reverbSend: 0.22 },
            render: (data, rc) => {
              const notes: Array<[number, number]> = [
                [0.5, 69], [1, 72], [1.75, 76], [3, 79],
                [4.5, 76], [5.25, 72], [6, 74], [7, 69],
              ];
              for (const [b, midi] of notes) addVoice(data, rc, b * beat, 0.32 * beat, midi, 'pluck', 0.9);
            },
          },
        ],
      );
    },
  },
  {
    key: 'synthwave',
    name: 'Synthwave Pulse',
    nameKo: '신스웨이브 펄스',
    blurbKo: '118 BPM · 2마디 — 808 비트·드라이빙 베이스·러시 패드·리드 아르페지오',
    blurbEn: '118 BPM · 2 bars — 808 beat, driving bass, lush pad, lead arp',
    bpm: 118,
    beatsPerBar: 4,
    beatUnit: 4,
    bars: 2,
    trackCount: 4,
    build: () => {
      const beat = 60 / 118;
      return buildProject(
        { name: 'Synthwave Pulse', bpm: 118, beatsPerBar: 4, beatUnit: 4, bars: 2 },
        [
          {
            name: '808 Beat',
            volume: 0.82,
            fx: { lp: 11000, reverbSend: 0.08 },
            render: (data, rc) => {
              for (let b = 0; b < 8; b += 1) addKick(data, rc, b * beat, 0.95, '808');
              for (const b of [1, 3, 5, 7]) addClap(data, rc, b * beat, 0.95);
              for (let b = 0; b < 8; b += 0.25) {
                addHat(data, rc, b * beat, b % 1 === 0 ? 0.24 : 0.13);
              }
              addHat(data, rc, 3.5 * beat, 0.24, true);
              addHat(data, rc, 7.5 * beat, 0.24, true);
            },
          },
          {
            name: 'Driving Synth Bass',
            volume: 0.68,
            fx: { lp: 1400, delayMix: 0.08, reverbSend: 0 },
            render: (data, rc) => {
              const chords: Array<[number, number]> = [[0, 33], [2, 29], [4, 36], [6, 31]];
              for (const [startBeat, root] of chords) {
                for (let step = 0; step < 4; step += 1) {
                  const b = startBeat + step * 0.5;
                  addVoice(data, rc, b * beat, 0.4 * beat, root + (step === 3 ? 12 : 0), 'bass', 0.95);
                }
              }
            },
          },
          {
            name: 'Lush Pad',
            volume: 0.56,
            fx: { lp: 2600, reverbSend: 0.5, delayMix: 0.06 },
            render: (data, rc) => {
              const chords: Array<[number, number[]]> = [
                [0, [57, 60, 64]],
                [2, [53, 57, 60]],
                [4, [60, 64, 67]],
                [6, [55, 59, 62]],
              ];
              for (const [startBeat, notes] of chords) {
                for (const midi of notes) addVoice(data, rc, startBeat * beat, 1.7 * beat, midi, 'pad', 0.9);
              }
            },
          },
          {
            name: 'Lead Arp',
            volume: 0.52,
            fx: { lp: 6200, delayMix: 0.3, delayTime: 250, delayFeedback: 0.34, reverbSend: 0.2 },
            render: (data, rc) => {
              const patterns: number[][] = [
                [69, 72, 76, 81],
                [65, 69, 72, 77],
                [72, 76, 79, 84],
                [67, 71, 74, 79],
              ];
              patterns.forEach((pattern, block) => {
                for (let step = 0; step < 8; step += 1) {
                  const midi = pattern[step % 4] + (step >= 4 ? 0 : 0);
                  addVoice(data, rc, (block * 2 + step * 0.25) * beat, 0.18 * beat, midi, 'pluck', 0.75);
                }
              });
            },
          },
        ],
      );
    },
  },
  {
    key: 'waltz',
    name: 'Acoustic Waltz',
    nameKo: '어쿠스틱 왈츠',
    blurbKo: '104 BPM · 3/4 2마디 — 어쿠스틱 드럼·핑거 베이스·일렉트릭 키스',
    blurbEn: '104 BPM · 3/4, 2 bars — acoustic drums, fingered bass, electric keys',
    bpm: 104,
    beatsPerBar: 3,
    beatUnit: 4,
    bars: 2,
    trackCount: 3,
    build: () => {
      const beat = 60 / 104;
      return buildProject(
        { name: 'Acoustic Waltz', bpm: 104, beatsPerBar: 3, beatUnit: 4, bars: 2 },
        [
          {
            name: 'Acoustic Drums',
            volume: 0.66,
            fx: { lp: 12000, reverbSend: 0.22 },
            render: (data, rc) => {
              for (const b of [0, 3]) addKick(data, rc, b * beat, 0.8, 'acoustic');
              for (const b of [1, 4]) addSnare(data, rc, b * beat, 0.55, 'acoustic');
              for (const b of [2, 5]) addHat(data, rc, b * beat, 0.26);
              addHat(data, rc, 5.5 * beat, 0.2, true);
              addRim(data, rc, 2.5 * beat, 0.22);
            },
          },
          {
            name: 'Fingered Bass',
            volume: 0.66,
            fx: { lp: 1200, reverbSend: 0.1 },
            render: (data, rc) => {
              const notes: Array<[number, number, number]> = [
                [0, 36, 0.85], [1, 43, 0.5], [2, 40, 0.5],
                [3, 41, 0.85], [4, 48, 0.5], [5, 45, 0.5],
              ];
              for (const [b, midi, dur] of notes) addVoice(data, rc, b * beat, dur * beat, midi, 'bass', 0.9);
            },
          },
          {
            name: 'Electric Keys',
            volume: 0.6,
            fx: { lp: 5600, reverbSend: 0.3 },
            render: (data, rc) => {
              for (const midi of [60, 64, 67]) addVoice(data, rc, 0, 1.15 * beat, midi, 'keys', 0.75);
              for (const midi of [57, 60, 64]) addVoice(data, rc, 1.5 * beat, 0.35 * beat, midi, 'keys', 0.45);
              for (const midi of [59, 62, 67]) addVoice(data, rc, 3 * beat, 1.15 * beat, midi, 'keys', 0.75);
              for (const midi of [55, 59, 62]) addVoice(data, rc, 4.5 * beat, 0.35 * beat, midi, 'keys', 0.45);
            },
          },
        ],
      );
    },
  },
];

export function sampleByKey(key: string): SampleDefinition | undefined {
  return SAMPLE_PROJECTS.find((sample) => sample.key === key);
}

export function sampleProjectNames(lang: 'ko' | 'en'): string[] {
  return SAMPLE_PROJECTS.map((sample) => (lang === 'ko' ? sample.nameKo : sample.name));
}
