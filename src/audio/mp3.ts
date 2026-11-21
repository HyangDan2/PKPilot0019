/** MP3 encoding through the pure-JS LAME build bundled by Vite. */

import { Mp3Encoder } from '@breezystack/lamejs';
import type { AudioData } from './types';
import { toInt16 } from './wav';

export type Mp3Bitrate = 128 | 192 | 320;
const BLOCK = 1152;

export function encodeMp3(data: AudioData, kbps: Mp3Bitrate = 192): Uint8Array {
  const channels = data.channels.length >= 2 ? 2 : 1;
  const encoder = new Mp3Encoder(channels, data.sampleRate, kbps);
  const left = toInt16([data.channels[0]])[0];
  const right = channels === 2 ? toInt16([data.channels[1]])[0] : null;
  const parts: Uint8Array[] = [];

  for (let offset = 0; offset < left.length; offset += BLOCK) {
    const leftBlock = left.subarray(offset, offset + BLOCK);
    const chunk = right
      ? encoder.encodeBuffer(leftBlock, right.subarray(offset, offset + BLOCK))
      : encoder.encodeBuffer(leftBlock);
    if (chunk.length) parts.push(new Uint8Array(chunk));
  }
  const tail = encoder.flush();
  if (tail.length) parts.push(new Uint8Array(tail));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}
