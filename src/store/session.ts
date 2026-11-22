/**
 * Session snapshot format for autosave.
 *
 * Autosave stores PCM as raw Float32Array channels inside IndexedDB, where the
 * structured-clone algorithm keeps them binary. Nothing on that path converts
 * samples to a string: the old Base64 serialiser walked every sample on the
 * main thread and stalled the transport while it did (a 2-bar 6-track session
 * is over a million samples). The JSON/Base64 form is still what `.lps.json`
 * files use, and it is only built off the main thread when a browser without
 * IndexedDB needs the localStorage fallback.
 */

import type { ProjectState, TrackData, TrackFx, TrackSource } from '../audio/types';
import { MAX_TRACKS, createProject } from '../audio/types';

export const SESSION_VERSION = 2;

export interface StoredTrack {
  id: number;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  active: boolean;
  source: TrackSource;
  fx: TrackFx;
  /** Sample rate the channel data was captured at; null when the track is empty. */
  sampleRate: number | null;
  /** Raw PCM. IndexedDB stores these as binary, not text. */
  channels: Float32Array[];
}

export interface StoredSession {
  version: typeof SESSION_VERSION;
  savedAt: string;
  project: Omit<ProjectState, 'tracks'>;
  tracks: StoredTrack[];
}

/** Snapshot the project for autosave. Channels are copied so a later edit cannot
 * change the data already handed to IndexedDB. */
export function projectToStored(project: ProjectState): StoredSession {
  return {
    version: SESSION_VERSION,
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
    },
    tracks: project.tracks.map((track) => ({
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
      sampleRate: track.buffer ? track.buffer.sampleRate : null,
      channels: track.buffer ? track.buffer.channels.map((channel) => new Float32Array(channel)) : [],
    })),
  };
}

/** Rebuild a project from an autosave snapshot, keeping every stored sample. */
export function storedToProject(stored: StoredSession): ProjectState {
  const base = createProject(stored.project.name || 'Untitled Loop', 1);
  const tracks: TrackData[] = stored.tracks.slice(0, MAX_TRACKS).map((track, index) => {
    const channels = Array.isArray(track.channels)
      ? track.channels.map((channel) =>
          channel instanceof Float32Array ? channel : new Float32Array(channel ?? []),
        )
      : [];
    const frames = Math.max(0, ...channels.map((channel) => channel.length));
    return {
      id: Number.isInteger(track.id) ? track.id : index + 1,
      name: typeof track.name === 'string' && track.name ? track.name : `Track ${index + 1}`,
      volume: track.volume,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo,
      armed: track.armed,
      active: track.active,
      source: track.source,
      fx: { ...base.tracks[0].fx, ...track.fx },
      buffer:
        frames > 0 && typeof track.sampleRate === 'number' && track.sampleRate > 0
          ? { sampleRate: track.sampleRate, channels }
          : null,
    };
  });
  return {
    ...base,
    ...stored.project,
    tracks: tracks.length ? tracks : base.tracks,
  };
}
