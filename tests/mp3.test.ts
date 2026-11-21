import { describe, expect, it } from 'vitest';
import { encodeMp3 } from '../src/audio/mp3';
import type { AudioData } from '../src/audio/types';

function tone(frames: number): AudioData {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    left[i] = Math.sin((2 * Math.PI * 220 * i) / 44100) * 0.4;
    right[i] = Math.sin((2 * Math.PI * 330 * i) / 44100) * 0.4;
  }
  return { sampleRate: 44100, channels: [left, right] };
}

describe('MP3 encoder', () => {
  it('produces a non-empty mpeg stream', () => {
    const bytes = encodeMp3(tone(44100), 128);
    expect(bytes.length).toBeGreaterThan(1000);
    const frameSync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33;
    expect(frameSync || id3).toBe(true);
  });

  it('encodes mono loops too', () => {
    const mono: AudioData = { sampleRate: 44100, channels: [tone(22050).channels[0]] };
    expect(encodeMp3(mono, 192).length).toBeGreaterThan(500);
  });

  it('grows with a higher bitrate', () => {
    const low = encodeMp3(tone(22050), 128).length;
    const high = encodeMp3(tone(22050), 320).length;
    expect(high).toBeGreaterThan(low);
  });
});
