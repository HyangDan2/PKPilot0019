/** Transport maths. Everything here is pure so it can be unit-tested. */

export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_BEAT_UNIT = 4;

/** Seconds of one beat, where the beat is the signature's denominator note. */
export function beatSeconds(
  bpm: number,
  beatUnit: number = DEFAULT_BEAT_UNIT,
): number {
  const safeBpm = Math.min(220, Math.max(40, Number.isFinite(bpm) ? bpm : 96));
  return (60 / safeBpm) * (4 / beatUnit);
}

/** Seconds of one bar. */
export function barSeconds(
  bpm: number,
  beatsPerBar: number = DEFAULT_BEATS_PER_BAR,
  beatUnit: number = DEFAULT_BEAT_UNIT,
): number {
  const beats = Math.max(1, Math.round(beatsPerBar));
  return beatSeconds(bpm, beatUnit) * beats;
}

/** Seconds of the whole loop (bars × bar). */
export function loopSeconds(
  bpm: number,
  beatsPerBar: number,
  beatUnit: number,
  bars: number,
): number {
  return barSeconds(bpm, beatsPerBar, beatUnit) * Math.max(1, Math.round(bars));
}

/**
 * The next bar line at or after `now`, measured on the grid that starts at
 * `loopStart`. A tiny epsilon keeps a request made exactly on a bar line from
 * slipping a whole bar forward.
 */
export function nextBarBoundary(now: number, loopStart: number, barSec: number): number {
  const safeBar = Math.max(0.05, barSec);
  if (now <= loopStart) return loopStart;
  const elapsed = now - loopStart;
  const bars = Math.ceil(elapsed / safeBar - 1e-6);
  return loopStart + bars * safeBar;
}

/** Loop phase in seconds, wrapped to [0, loopSec). */
export function loopPhase(now: number, loopStart: number, loopSec: number): number {
  if (!Number.isFinite(now) || !Number.isFinite(loopStart) || loopSec <= 0) return 0;
  const raw = now - loopStart;
  const wrapped = ((raw % loopSec) + loopSec) % loopSec;
  return wrapped;
}

export interface BarBeat {
  bar: number;
  beat: number;
  /** 0..1 within the beat, for smooth UI pulses. */
  fraction: number;
}

export function barBeatAt(
  phase: number,
  bpm: number,
  beatsPerBar: number,
  beatUnit: number,
  bars: number,
): BarBeat {
  const beatSec = beatSeconds(bpm, beatUnit);
  const totalBeats = Math.max(1, Math.round(beatsPerBar)) * Math.max(1, Math.round(bars));
  const beatFloat = Math.max(0, phase) / beatSec;
  const wrapped = beatFloat % totalBeats;
  const index = Math.floor(wrapped);
  return {
    bar: Math.floor(index / Math.max(1, Math.round(beatsPerBar))) + 1,
    beat: (index % Math.max(1, Math.round(beatsPerBar))) + 1,
    fraction: wrapped - index,
  };
}

/** Average tap interval → BPM, clamped to the transport range. */
export function tapTempo(times: number[], now: number): number | null {
  const stamps = [...times].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (stamps.length < 2) return null;
  // Ignore taps that are far in the past (> 4 s gap breaks the run).
  const recent: number[] = [];
  for (const stamp of stamps) {
    if (now - stamp > 4000) continue;
    if (recent.length && stamp - recent[recent.length - 1] > 2500) recent.length = 0;
    recent.push(stamp);
  }
  if (recent.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i += 1) gaps.push(recent[i] - recent[i - 1]);
  const sorted = gaps.sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  if (!Number.isFinite(median) || median < 120 || median > 1600) return null;
  return Math.round(Math.min(220, Math.max(40, 60000 / median)));
}

/** Frames for a loop at a sample rate. */
export function loopFrames(loopSec: number, sampleRate: number): number {
  return Math.max(1, Math.round(loopSec * sampleRate));
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${minutes}:${rest.toFixed(2).padStart(5, '0')}`;
}
