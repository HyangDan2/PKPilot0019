/** Shared audio / project types for Lýra. */

export type Lang = 'ko' | 'en';
export type Theme = 'light' | 'dark';

/** The per-track badge in the channel strip. */
export type TrackStatus =
  | 'EMPTY'
  | 'ARMED'
  | 'COUNT-IN'
  | 'REC'
  | 'PLAY'
  | 'OVERDUB'
  | 'STOPPED';

export type TrackSource = 'Mic' | 'Inst' | 'File';

/** A loop is plain sample data so it survives JSON, IndexedDB and offline render. */
export interface LoopBuffer {
  sampleRate: number;
  channels: Float32Array[];
}

/** Anything with interleaved-ready channel data: AudioBuffer or LoopBuffer. */
export interface AudioData {
  sampleRate: number;
  channels: Float32Array[];
}

export interface TrackFx {
  /** High-pass cutoff in Hz (20 = off). */
  hp: number;
  /** Low-pass cutoff in Hz (20000 = off). */
  lp: number;
  /** Delay time in ms. */
  delayTime: number;
  delayFeedback: number;
  delayMix: number;
  /** Reverb send 0..1. */
  reverbSend: number;
}

export interface TrackSettings {
  id: number;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  /** Loop playback enabled for this track. */
  active: boolean;
  source: TrackSource;
  fx: TrackFx;
}

export interface TrackData extends TrackSettings {
  buffer: LoopBuffer | null;
}

export interface ProjectState {
  name: string;
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  bars: number;
  masterVolume: number;
  metronome: boolean;
  countIn: boolean;
  /** Calibration shift in ms, -150..150. Positive advances recorded audio. */
  latencyMs: number;
  tracks: TrackData[];
}

export const MAX_TRACKS = 6;
export const MIN_TRACKS = 1;
export const DEFAULT_TRACKS = 4;
export const MIN_BPM = 40;
export const MAX_BPM = 220;
export const BAR_CHOICES = [1, 2, 4, 8] as const;
export const SIGNATURES = [
  { beatsPerBar: 4, beatUnit: 4, label: '4/4' },
  { beatsPerBar: 3, beatUnit: 4, label: '3/4' },
  { beatsPerBar: 6, beatUnit: 8, label: '6/8' },
] as const;

export const DEFAULT_FX: TrackFx = {
  hp: 20,
  lp: 20000,
  delayTime: 260,
  delayFeedback: 0.28,
  delayMix: 0,
  reverbSend: 0.12,
};

export const TRACK_TINTS = ['#8B6CE8', '#4C9BE8', '#3FB59A', '#D98A4B', '#C85C8E', '#7A8BE0'];

export function defaultTrack(id: number, name?: string): TrackData {
  return {
    id,
    name: name ?? `Track ${id}`,
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    active: true,
    source: 'Mic',
    fx: { ...DEFAULT_FX },
    buffer: null,
  };
}

export function createProject(name = 'Untitled Loop', trackCount = DEFAULT_TRACKS): ProjectState {
  return {
    name,
    bpm: 96,
    beatsPerBar: 4,
    beatUnit: 4,
    bars: 2,
    masterVolume: 0.85,
    metronome: false,
    countIn: true,
    latencyMs: 0,
    tracks: Array.from({ length: trackCount }, (_, index) => defaultTrack(index + 1)),
  };
}
