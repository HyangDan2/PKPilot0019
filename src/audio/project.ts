/**
 * `.lps.json` project format: settings + loops as base64 Int16 PCM.
 * Pure functions so serialise/parse can be unit-tested.
 */

import type { LoopBuffer, ProjectState, TrackData, TrackFx } from './types';
import { DEFAULT_FX, MAX_TRACKS, createProject } from './types';

export const PROJECT_FORMAT = 'lyra-loop-studio';
export const PROJECT_VERSION = 1;

interface SerializedLoop {
  sampleRate: number;
  channels: string[];
}

interface SerializedTrack {
  id: number;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  active: boolean;
  source: 'Mic' | 'Inst' | 'File';
  fx: TrackFx;
  loop: SerializedLoop | null;
}

interface SerializedProject {
  name: string;
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  bars: number;
  masterVolume: number;
  metronome: boolean;
  countIn: boolean;
  latencyMs: number;
  tracks: SerializedTrack[];
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  app: string;
  savedAt: string;
  project: SerializedProject;
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_ALPHABET[a >> 2];
    out += B64_ALPHABET[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? B64_ALPHABET[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_ALPHABET[c & 63] : '=';
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    const value = B64_ALPHABET.indexOf(char);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index] = (buffer >> bits) & 0xff;
      index += 1;
    }
  }
  return out.subarray(0, index);
}

export function channelToBase64(channel: Float32Array): string {
  const bytes = new Uint8Array(channel.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < channel.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i]));
    view.setInt16(i * 2, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
  }
  return bytesToBase64(bytes);
}

export function base64ToChannel(text: string): Float32Array {
  const bytes = base64ToBytes(text);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frames = Math.floor(bytes.byteLength / 2);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const value = view.getInt16(i * 2, true);
    out[i] = value < 0 ? value / 0x8000 : value / 0x7fff;
  }
  return out;
}

function serializeTrack(track: TrackData): SerializedTrack {
  return {
    id: track.id,
    name: track.name,
    volume: track.volume,
    pan: track.pan,
    mute: track.mute,
    solo: track.solo,
    armed: track.armed,
    active: track.active,
    source: track.source,
    fx: { ...track.fx },
    loop: track.buffer
      ? {
          sampleRate: track.buffer.sampleRate,
          channels: track.buffer.channels.map(channelToBase64),
        }
      : null,
  };
}

export function serializeProject(project: ProjectState): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    app: 'HD2Lab Lýra',
    savedAt: new Date().toISOString(),
    project: {
      name: project.name,
      bpm: project.bpm,
      beatsPerBar: project.beatsPerBar,
      beatUnit: project.beatUnit,
      bars: project.bars,
      masterVolume: project.masterVolume,
      metronome: project.metronome,
      countIn: project.countIn,
      latencyMs: project.latencyMs,
      tracks: project.tracks.map(serializeTrack),
    },
  };
}

export function projectToJson(project: ProjectState, pretty = false): string {
  return JSON.stringify(serializeProject(project), null, pretty ? 2 : 0);
}

function number(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function parseProjectFile(input: unknown): ProjectState {
  const file = input as Partial<ProjectFile> | null;
  if (!file || typeof file !== 'object') throw new Error('invalid-project');
  if (file.format !== PROJECT_FORMAT) throw new Error('invalid-format');
  if (!file.project || typeof file.project !== 'object') throw new Error('invalid-project');
  const raw = file.project as Partial<SerializedProject>;
  if (!Array.isArray(raw.tracks) || raw.tracks.length === 0) throw new Error('invalid-project');

  const base = createProject(
    typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled Loop',
    Math.min(MAX_TRACKS, Math.max(1, raw.tracks.length)),
  );
  base.bpm = number(raw.bpm, 96, 40, 220);
  base.beatsPerBar = number(raw.beatsPerBar, 4, 1, 12);
  base.beatUnit = number(raw.beatUnit, 4, 2, 16);
  base.bars = number(raw.bars, 2, 1, 8);
  base.masterVolume = number(raw.masterVolume, 0.85, 0, 1);
  base.metronome = bool(raw.metronome, false);
  base.countIn = bool(raw.countIn, true);
  base.latencyMs = number(raw.latencyMs, 0, -150, 150);

  base.tracks = raw.tracks.slice(0, MAX_TRACKS).map((entry, index) => {
    const track = entry as Partial<SerializedTrack>;
    let buffer: LoopBuffer | null = null;
    const loop = track.loop as Partial<SerializedLoop> | null | undefined;
    if (loop && Array.isArray(loop.channels) && loop.channels.length) {
      const channels = loop.channels.map((channel) =>
        typeof channel === 'string' ? base64ToChannel(channel) : new Float32Array(0),
      );
      const frames = Math.max(0, ...channels.map((channel) => channel.length));
      if (frames > 0) {
        const sampleRate = number(loop.sampleRate, 44100, 8000, 192000);
        buffer = { sampleRate, channels };
      }
    }
    return {
      id: number(track.id, index + 1, 1, MAX_TRACKS),
      name: typeof track.name === 'string' && track.name ? track.name : `Track ${index + 1}`,
      volume: number(track.volume, 0.8, 0, 1),
      pan: number(track.pan, 0, -1, 1),
      mute: bool(track.mute, false),
      solo: bool(track.solo, false),
      armed: bool(track.armed, false),
      active: bool(track.active, true),
      source: track.source === 'Inst' || track.source === 'File' ? track.source : 'Mic',
      fx: {
        hp: number(track.fx?.hp, DEFAULT_FX.hp, 20, 2000),
        lp: number(track.fx?.lp, DEFAULT_FX.lp, 400, 20000),
        delayTime: number(track.fx?.delayTime, DEFAULT_FX.delayTime, 20, 1200),
        delayFeedback: number(track.fx?.delayFeedback, DEFAULT_FX.delayFeedback, 0, 0.85),
        delayMix: number(track.fx?.delayMix, DEFAULT_FX.delayMix, 0, 0.9),
        reverbSend: number(track.fx?.reverbSend, DEFAULT_FX.reverbSend, 0, 1),
      },
      buffer,
    };
  });
  return base;
}

export function parseProjectJson(text: string): ProjectState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('invalid-json');
  }
  return parseProjectFile(parsed);
}

/** Deep copy a project so React state never aliases stored arrays. */
export function cloneProject(project: ProjectState): ProjectState {
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      fx: { ...track.fx },
      buffer: track.buffer
        ? {
            sampleRate: track.buffer.sampleRate,
            channels: track.buffer.channels.map((channel) => new Float32Array(channel)),
          }
        : null,
    })),
  };
}
