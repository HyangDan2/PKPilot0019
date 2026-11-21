import { describe, expect, it } from 'vitest';
import { encodeWav, toInt16, wavByteLength, wavInfo } from '../src/audio/wav';
import type { AudioData } from '../src/audio/types';

function sine(frames: number, sampleRate = 44100, amp = 0.5): AudioData {
  const channel = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) channel[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amp;
  return { sampleRate, channels: [channel] };
}

describe('WAV encoder', () => {
  it('writes a RIFF/WAVE header with the right sizes', () => {
    const data = sine(1000);
    const bytes = encodeWav(data, 16);
    expect(bytes.length).toBe(wavByteLength(1000, 1, 16));
    const text = new TextDecoder().decode(bytes.subarray(0, 4));
    expect(text).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.subarray(8, 12))).toBe('WAVE');
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(36 + 2000);
    expect(view.getUint32(40, true)).toBe(2000);
  });

  it('reports its own format', () => {
    const bytes = encodeWav(sine(256), 16);
    const info = wavInfo(bytes);
    expect(info).toEqual({ channels: 1, sampleRate: 44100, bitDepth: 16, frames: 256 });
  });

  it('encodes 16-bit samples little-endian', () => {
    const data: AudioData = { sampleRate: 48000, channels: [new Float32Array([0.5, -0.5, 1, -1])] };
    const bytes = encodeWav(data, 16);
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff));
    expect(view.getInt16(46, true)).toBe(-0x4000);
    expect(view.getInt16(48, true)).toBe(0x7fff);
    expect(view.getInt16(50, true)).toBe(-0x8000);
  });

  it('encodes 24-bit samples with the right byte order', () => {
    const data: AudioData = { sampleRate: 44100, channels: [new Float32Array([0.5, -0.5])] };
    const bytes = encodeWav(data, 24);
    expect(bytes.length).toBe(44 + 6);
    expect(bytes[44]).toBe(0x00);
    expect(bytes[45]).toBe(0x00);
    expect(bytes[46]).toBe(0x40);
    expect(bytes[47]).toBe(0x00);
    expect(bytes[48]).toBe(0x00);
    expect(bytes[49]).toBe(0xc0);
    expect(wavInfo(bytes).bitDepth).toBe(24);
  });

  it('interleaves stereo channels', () => {
    const data: AudioData = {
      sampleRate: 44100,
      channels: [new Float32Array([1, 1]), new Float32Array([-1, -1])],
    };
    const bytes = encodeWav(data, 16);
    const view = new DataView(bytes.buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
    expect(view.getInt16(48, true)).toBe(0x7fff);
    expect(wavInfo(bytes).frames).toBe(2);
  });

  it('converts floats to Int16 for the MP3 encoder', () => {
    const [ints] = toInt16([new Float32Array([0, 0.5, -0.5])]);
    expect(Array.from(ints)).toEqual([0, 16384, -16384]);
  });
});
