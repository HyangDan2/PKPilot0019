import { describe, expect, it } from 'vitest';
import {
  barBeatAt,
  barSeconds,
  beatSeconds,
  loopFrames,
  loopPhase,
  loopSeconds,
  nextBarBoundary,
  tapTempo,
} from '../src/audio/clock';

describe('beat / bar / loop maths', () => {
  it('treats the denominator note as one beat', () => {
    expect(beatSeconds(120, 4)).toBeCloseTo(0.5, 6);
    expect(beatSeconds(120, 8)).toBeCloseTo(0.25, 6);
    expect(beatSeconds(60, 4)).toBeCloseTo(1, 6);
  });

  it('builds a bar from its signature', () => {
    expect(barSeconds(96, 4, 4)).toBeCloseTo(2.5, 6);
    expect(barSeconds(96, 3, 4)).toBeCloseTo(1.875, 6);
    expect(barSeconds(96, 6, 8)).toBeCloseTo(1.875, 6);
  });

  it('multiplies bars into the loop', () => {
    expect(loopSeconds(96, 4, 4, 2)).toBeCloseTo(5, 6);
    expect(loopSeconds(96, 4, 4, 8)).toBeCloseTo(20, 6);
    expect(loopFrames(5, 48000)).toBe(240000);
  });

  it('clamps BPM to the transport range', () => {
    expect(beatSeconds(10, 4)).toBeCloseTo(1.5, 6); // clamped to 40
    expect(beatSeconds(400, 4)).toBeCloseTo(60 / 220, 6);
  });
});

describe('bar boundary quantise', () => {
  const bar = 2.5;

  it('returns the loop origin before the loop starts', () => {
    expect(nextBarBoundary(9, 10, bar)).toBe(10);
  });

  it('lands on the next bar line', () => {
    expect(nextBarBoundary(10.1, 10, bar)).toBeCloseTo(12.5, 6);
    expect(nextBarBoundary(12.6, 10, bar)).toBeCloseTo(15, 6);
  });

  it('does not slip a whole bar on an exact boundary', () => {
    expect(nextBarBoundary(12.5, 10, bar)).toBeCloseTo(12.5, 6);
  });
});

describe('loop phase', () => {
  it('wraps into [0, loop)', () => {
    expect(loopPhase(12, 10, 5)).toBeCloseTo(2, 6);
    expect(loopPhase(16, 10, 5)).toBeCloseTo(1, 6);
    expect(loopPhase(10, 10, 5)).toBe(0);
  });

  it('is safe for degenerate timing', () => {
    expect(loopPhase(Number.NaN, 0, 5)).toBe(0);
    expect(loopPhase(3, 0, 0)).toBe(0);
  });
});

describe('bar / beat read-out', () => {
  it('counts bars and beats from the loop origin', () => {
    const at = barBeatAt(2.5, 120, 4, 4, 2);
    expect(at.bar).toBe(2);
    expect(at.beat).toBe(2);
    const second = barBeatAt(1.0, 120, 4, 4, 2);
    expect(second.bar).toBe(1);
    expect(second.beat).toBe(3);
    expect(second.fraction).toBeCloseTo(0, 6);
  });
});

describe('tap tempo', () => {
  it('turns four taps into a tempo', () => {
    const now = 4000;
    expect(tapTempo([now - 1500, now - 1000, now - 500, now], now)).toBe(120);
  });

  it('ignores stale taps', () => {
    const now = 20000;
    expect(tapTempo([now - 30000, now - 20000, now - 1000, now - 500], now)).toBe(120);
  });

  it('needs at least two taps', () => {
    expect(tapTempo([1500], 1500)).toBeNull();
  });

  it('clamps wild tempo', () => {
    const now = 1000;
    expect(tapTempo([now - 50, now], now)).toBeNull();
  });
});
