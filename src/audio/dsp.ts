/**
 * Sample-domain helpers: region extraction for worklet recorder chunks,
 * overdub mixing, peak computation and resampling. Pure functions only.
 */

import type { AudioData, LoopBuffer } from './types';

export interface RecordedChunk {
  /** AudioContext time of the first frame in this chunk. */
  time: number;
  channels: Float32Array[];
}

/**
 * Pull an exact `frames`-long region starting at `startTime` out of the chunks
 * a recorder posted. Gaps and offsets are zero-filled, never shifted, so the
 * result stays locked to the master clock.
 *
 * `latencySec` (applied by the caller as startTime + latencySec) is how a
 * positive calibration value advances the captured performance: audio played
 * L seconds late is read from L seconds further along the stream.
 */
export function extractRegion(
  chunks: RecordedChunk[],
  startTime: number,
  frames: number,
  sampleRate: number,
  channelCount = 1,
): Float32Array[] {
  const out = Array.from({ length: channelCount }, () => new Float32Array(Math.max(0, frames)));
  if (!chunks.length || frames <= 0) return out;

  for (const chunk of chunks) {
    const first = chunk.channels[0];
    if (!first) continue;
    const offset = Math.round((chunk.time - startTime) * sampleRate);
    const length = first.length;
    for (let ch = 0; ch < channelCount; ch += 1) {
      const source = chunk.channels[Math.min(ch, chunk.channels.length - 1)];
      if (!source) continue;
      const copyStart = Math.max(0, -offset);
      const copyEnd = Math.min(length, frames - offset);
      if (copyEnd <= copyStart) continue;
      out[ch].set(source.subarray(copyStart, copyEnd), offset + copyStart);
    }
  }
  return out;
}

export function softClip(value: number): number {
  if (value > 0.98) return 0.98 + (value - 0.98) * 0.06;
  if (value < -0.98) return -0.98 + (value + 0.98) * 0.06;
  return value;
}

/** Mix `add` into `base` (same shape) and return a new buffer. */
export function mixLoops(base: LoopBuffer, add: LoopBuffer, gain = 1): LoopBuffer {
  const channelCount = Math.max(base.channels.length, add.channels.length);
  const frames = Math.max(base.channels[0]?.length ?? 0, add.channels[0]?.length ?? 0);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < channelCount; ch += 1) {
    const out = new Float32Array(frames);
    const a = base.channels[Math.min(ch, base.channels.length - 1)];
    const b = add.channels[Math.min(ch, add.channels.length - 1)];
    for (let i = 0; i < frames; i += 1) {
      out[i] = softClip((a ? (a[i] ?? 0) : 0) + (b ? (b[i] ?? 0) : 0) * gain);
    }
    channels.push(out);
  }
  return { sampleRate: base.sampleRate, channels };
}

/** Overdub commit: returns the mixed loop plus the previous take for one-step undo. */
export function applyOverdub(
  base: LoopBuffer,
  take: LoopBuffer,
  gain = 1,
): { loop: LoopBuffer; undo: LoopBuffer } {
  return { loop: mixLoops(base, take, gain), undo: base };
}

/**
 * Write a recorded take into a fresh loop of `frames` frames so that the take's
 * own start lands on loop position `offsetFrames` (the phase at which recording
 * began) and the rest of the loop stays silent.
 *
 * This is the trim-then-place order the recorder commits with: only the frames
 * actually performed (`keepFrames`) are copied, and they wrap around the loop
 * end exactly like playback would. Rotating first and trimming afterwards — the
 * previous order — cut the wrong side of the loop whenever recording did not
 * start on the loop origin, which stored silence instead of the take.
 */
export function placeTake(
  channels: Float32Array[],
  offsetFrames: number,
  keepFrames: number,
  frames = channels[0]?.length ?? 0,
): Float32Array[] {
  const length = Math.max(1, frames);
  const keep = Math.max(0, Math.min(length, Math.round(keepFrames)));
  const offset = ((Math.round(offsetFrames) % length) + length) % length;
  return channels.map((channel) => {
    const out = new Float32Array(length);
    const first = Math.min(keep, length - offset);
    if (first > 0) out.set(channel.subarray(0, first), offset);
    const rest = keep - first;
    if (rest > 0) out.set(channel.subarray(first, first + rest), 0);
    return out;
  });
}

/** Deep copy of a loop's sample data. */
export function cloneLoop(buffer: LoopBuffer): LoopBuffer {
  return {
    sampleRate: buffer.sampleRate,
    channels: buffer.channels.map((channel) => new Float32Array(channel)),
  };
}

/** Rotate a loop so that what was at `offset` frames moves to frame 0. */
export function rotateFrames(channels: Float32Array[], offset: number): Float32Array[] {
  const frames = channels[0]?.length ?? 0;
  if (!frames) return channels;
  const shift = ((Math.round(offset) % frames) + frames) % frames;
  if (shift === 0) return channels;
  return channels.map((channel) => {
    const out = new Float32Array(frames);
    out.set(channel.subarray(shift), 0);
    out.set(channel.subarray(0, shift), frames - shift);
    return out;
  });
}

/** Copy channels into an exactly `frames`-long array (pad with silence / trim). */
export function fitFrames(
  channels: Float32Array[],
  frames: number,
  channelCount = channels.length,
): Float32Array[] {
  const out: Float32Array[] = [];
  for (let ch = 0; ch < channelCount; ch += 1) {
    const target = new Float32Array(frames);
    const source = channels[Math.min(ch, channels.length - 1)];
    if (source) target.set(source.subarray(0, Math.min(source.length, frames)));
    out.push(target);
  }
  return out;
}

/**
 * Resize a loop to `frames` frames by linear resampling at the same sample
 * rate. Shorter and longer both keep all of the audible material, but the
 * pitch follows the length — this is the tape-style fit used until a real
 * time-stretcher exists, never a trim.
 */
export function resizeLoop(buffer: LoopBuffer, frames: number): LoopBuffer {
  const target = Math.max(1, Math.round(frames));
  const sourceFrames = buffer.channels[0]?.length ?? 0;
  if (!sourceFrames) return { sampleRate: buffer.sampleRate, channels: [] };
  if (sourceFrames === target) return buffer;
  const ratio = target / sourceFrames;
  const channels = buffer.channels.map((source) => {
    const out = new Float32Array(target);
    for (let i = 0; i < target; i += 1) {
      const position = i / ratio;
      const index = Math.floor(position);
      const frac = position - index;
      const a = source[index] ?? 0;
      const b = source[index + 1] ?? a;
      out[i] = a + (b - a) * frac;
    }
    return out;
  });
  return { sampleRate: buffer.sampleRate, channels };
}

/** Normalise the sample rate of a loop to the context's rate. */
export function resampleLoop(buffer: LoopBuffer, targetRate: number): LoopBuffer {
  if (buffer.sampleRate === targetRate) return buffer;
  const ratio = targetRate / buffer.sampleRate;
  const frames = Math.max(1, Math.round((buffer.channels[0]?.length ?? 1) * ratio));
  const channels = buffer.channels.map((source) => {
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      const position = i / ratio;
      const index = Math.floor(position);
      const frac = position - index;
      const a = source[index] ?? 0;
      const b = source[index + 1] ?? a;
      out[i] = a + (b - a) * frac;
    }
    return out;
  });
  return { sampleRate: targetRate, channels };
}

/** N peak values in 0..1 (max of absolute samples) for waveform drawing. */
export function loopPeaks(buffer: LoopBuffer | null, buckets = 160): number[] {
  if (!buffer || !buffer.channels.length) return [];
  const frames = buffer.channels[0].length;
  const size = Math.max(1, Math.floor(frames / buckets));
  const peaks: number[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = bucket * size;
    const end = Math.min(frames, start + size);
    let peak = 0;
    for (const channel of buffer.channels) {
      for (let i = start; i < end; i += 1) {
        const value = Math.abs(channel[i]);
        if (value > peak) peak = value;
      }
    }
    peaks.push(Math.min(1, peak));
  }
  return peaks;
}

export function peakOf(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) {
      const value = Math.abs(channel[i]);
      if (value > peak) peak = value;
    }
  }
  return Math.min(1, peak);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  if (gain <= 0.00001) return -Infinity;
  return 20 * Math.log10(gain);
}

export function toAudioData(buffer: LoopBuffer): AudioData {
  return { sampleRate: buffer.sampleRate, channels: buffer.channels };
}

/** Deterministic PRNG (mulberry32) for sample-project noise beds. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One-pole low-pass used by the offline demo renderer. */
export function makeLowPass(cutoffHz: number, sampleRate: number): (x: number) => number {
  const coefficient = Math.exp((-2 * Math.PI * cutoffHz) / sampleRate);
  let previous = 0;
  return (x: number) => {
    previous = x * (1 - coefficient) + previous * coefficient;
    return previous;
  };
}
