/** PCM WAV writer — 16 and 24 bit, any channel count. Pure and testable. */

import type { AudioData } from './types';

export type WavBitDepth = 16 | 24;

export function wavByteLength(frames: number, channels: number, bitDepth: WavBitDepth): number {
  return 44 + frames * channels * (bitDepth / 8);
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
}

export function encodeWav(data: AudioData, bitDepth: WavBitDepth = 16): Uint8Array {
  const channels = data.channels.length;
  const frames = data.channels[0]?.length ?? 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const dataBytes = frames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, data.sampleRate, true);
  view.setUint32(28, data.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let ch = 0; ch < channels; ch += 1) {
      const sample = Math.max(-1, Math.min(1, data.channels[ch][frame] ?? 0));
      if (bitDepth === 16) {
        view.setInt16(offset, Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff), true);
        offset += 2;
      } else {
        const value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
        view.setUint8(offset, value & 0xff);
        view.setUint8(offset + 1, (value >> 8) & 0xff);
        view.setUint8(offset + 2, (value >> 16) & 0xff);
        offset += 3;
      }
    }
  }
  return new Uint8Array(buffer);
}

export function wavInfo(bytes: Uint8Array): {
  channels: number;
  sampleRate: number;
  bitDepth: number;
  frames: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const channels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitDepth = view.getUint16(34, true);
  const dataBytes = view.getUint32(40, true);
  return { channels, sampleRate, bitDepth, frames: dataBytes / (channels * (bitDepth / 8)) };
}

/** Float samples → interleaved Int16 (used by the MP3 encoder). */
export function toInt16(channels: Float32Array[]): Int16Array[] {
  return channels.map((channel) => {
    const out = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, channel[i]));
      out[i] = Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff);
    }
    return out;
  });
}
