/** Peak cache so waveform drawing does not rescan buffers on every render. */

import { loopPeaks } from '../audio/dsp';
import type { LoopBuffer } from '../audio/types';

const cache = new WeakMap<LoopBuffer, Map<number, number[]>>();

export function peaksFor(buffer: LoopBuffer | null, buckets = 96): number[] {
  if (!buffer) return [];
  let entry = cache.get(buffer);
  if (!entry) {
    entry = new Map();
    cache.set(buffer, entry);
  }
  const cached = entry.get(buckets);
  if (cached) return cached;
  const peaks = loopPeaks(buffer, buckets);
  entry.set(buckets, peaks);
  return peaks;
}
