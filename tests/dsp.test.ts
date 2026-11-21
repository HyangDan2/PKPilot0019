import { describe, expect, it } from 'vitest';
import {
  applyOverdub,
  extractRegion,
  fitFrames,
  loopPeaks,
  mixLoops,
  resampleLoop,
  rotateFrames,
  softClip,
  type RecordedChunk,
} from '../src/audio/dsp';

function chunksOf(values: number[][], startTime: number, sampleRate = 100): RecordedChunk[] {
  let cursor = 0;
  return values.map((frames) => {
    const chunk = { time: startTime + cursor / sampleRate, channels: [new Float32Array(frames)] };
    cursor += frames.length;
    return chunk;
  });
}

function ramp(start: number, length: number): number[] {
  return Array.from({ length }, (_, index) => start + index);
}

describe('recorder region extraction', () => {
  it('lifts an exact region with no offset', () => {
    const chunks = chunksOf([ramp(0, 40), ramp(40, 40), ramp(80, 20)], 10);
    const region = extractRegion(chunks, 10, 100, 100);
    expect(region[0].length).toBe(100);
    expect(region[0][0]).toBe(0);
    expect(region[0][99]).toBe(99);
    expect(region[0][40]).toBe(40);
  });

  it('zero-fills before the captured stream', () => {
    const chunks = chunksOf([ramp(0, 100)], 10.5, 100);
    const region = extractRegion(chunks, 10, 100, 100);
    expect(Array.from(region[0].slice(0, 50))).toEqual(Array(50).fill(0));
    expect(region[0][50]).toBe(0);
    expect(region[0][51]).toBe(1);
  });

  it('aligns a late performance with latency compensation', () => {
    // The player’s hit was heard at t=10 but landed 0.1 s later in the stream.
    const chunks = chunksOf([ramp(0, 200)], 10, 1000);
    const late = extractRegion(chunks, 10.1, 100, 1000);
    expect(late[0][0]).toBe(100); // frame 100 of the stream lands on beat 0
  });

  it('copies a second channel when asked', () => {
    const chunks: RecordedChunk[] = [
      { time: 0, channels: [new Float32Array([1, 2, 3]), new Float32Array([-1, -2, -3])] },
    ];
    const region = extractRegion(chunks, 0, 3, 1, 2);
    expect(Array.from(region[1])).toEqual([-1, -2, -3]);
  });

  it('returns silence for an empty stream', () => {
    const region = extractRegion([], 4, 8, 100);
    expect(Array.from(region[0])).toEqual(Array(8).fill(0));
  });
});

describe('loop shaping', () => {
  it('rotates content onto the loop origin', () => {
    const out = rotateFrames([new Float32Array([1, 2, 3, 4])], 1);
    expect(Array.from(out[0])).toEqual([2, 3, 4, 1]);
  });

  it('wraps a negative or oversized rotation', () => {
    const out = rotateFrames([new Float32Array([1, 2, 3, 4])], 5);
    expect(Array.from(out[0])).toEqual([2, 3, 4, 1]);
    const back = rotateFrames([new Float32Array([1, 2, 3, 4])], -1);
    expect(Array.from(back[0])).toEqual([4, 1, 2, 3]);
  });

  it('fits channels to an exact frame count', () => {
    const fitted = fitFrames([new Float32Array([1, 2, 3])], 5);
    expect(Array.from(fitted[0])).toEqual([1, 2, 3, 0, 0]);
    const trimmed = fitFrames([new Float32Array([1, 2, 3])], 2);
    expect(Array.from(trimmed[0])).toEqual([1, 2]);
  });

  it('resamples a loop to the context rate', () => {
    const source = { sampleRate: 1000, channels: [new Float32Array(100).fill(0.5)] };
    const out = resampleLoop(source, 2000);
    expect(out.sampleRate).toBe(2000);
    expect(out.channels[0].length).toBe(200);
    expect(out.channels[0][123]).toBeCloseTo(0.5, 5);
  });

  it('sums an overdub and soft-clips beyond full scale', () => {
    const base = { sampleRate: 100, channels: [new Float32Array([0.5, -0.5, 0.1])] };
    const take = { sampleRate: 100, channels: [new Float32Array([0.5, -0.5, 0.1])] };
    const { loop } = applyOverdub(base, take);
    expect(loop.channels[0][0]).toBeGreaterThan(0.9);
    expect(loop.channels[0][0]).toBeLessThanOrEqual(1);
    expect(loop.channels[0][2]).toBeCloseTo(0.2, 5);
  });

  it('keeps the previous take for one-step undo and does not mutate it', () => {
    const base = { sampleRate: 100, channels: [new Float32Array([0.25, 0.25])] };
    const take = { sampleRate: 100, channels: [new Float32Array([0.25, 0.25])] };
    const { loop, undo } = applyOverdub(base, take);
    expect(undo).toBe(base);
    expect(Array.from(base.channels[0])).toEqual([0.25, 0.25]);
    expect(loop.channels[0][0]).not.toBe(base.channels[0][0]);
  });

  it('mixes different loop lengths without dropping samples', () => {
    const base = { sampleRate: 100, channels: [new Float32Array(8).fill(0.1)] };
    const take = { sampleRate: 100, channels: [new Float32Array(4).fill(0.1)] };
    const out = mixLoops(base, take);
    expect(out.channels[0].length).toBe(8);
    expect(out.channels[0][6]).toBeCloseTo(0.1, 5);
  });

  it('describes a waveform with peaks in range', () => {
    const peaks = loopPeaks({ sampleRate: 100, channels: [new Float32Array([0, 0.5, -1, 0.2])] }, 2);
    expect(peaks.length).toBe(2);
    expect(Math.max(...peaks)).toBeLessThanOrEqual(1);
    expect(peaks[0]).toBeCloseTo(0.5, 5);
  });

  it('soft-clips symmetrically', () => {
    expect(softClip(2)).toBeLessThan(2);
    expect(softClip(2)).toBeGreaterThan(0.98);
    expect(softClip(-2)).toBeGreaterThan(-2);
    expect(softClip(0.5)).toBe(0.5);
  });
});
