/**
 * Offline render + encoding for Lýra's export drawer.
 * Master mix or per-track stems, WAV 16/24, MP3, WebM/Opus.
 */

import { loopSeconds } from './clock';
import { encodeMp3, type Mp3Bitrate } from './mp3';
import { encodeWav, type WavBitDepth } from './wav';
import { seededRandom } from './dsp';
import type { AudioData, ProjectState } from './types';

export type ExportFormat = 'wav' | 'mp3' | 'webm';

export interface ExportOptions {
  format: ExportFormat;
  bitDepth: WavBitDepth;
  bitrate: Mp3Bitrate;
  sampleRate: 44100 | 48000;
  stems: boolean;
}

export interface ExportFile {
  name: string;
  blob: Blob;
}

function impulse(ctx: BaseAudioContext, seconds = 2.4, decay = 2.4): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  const random = seededRandom(0x72657665);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i += 1) {
      const t = i / length;
      data[i] = (random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buffer;
}

function trackGain(project: ProjectState, id: number): number {
  const anySolo = project.tracks.some((track) => track.solo);
  const track = project.tracks.find((entry) => entry.id === id);
  if (!track) return 0;
  if (track.mute) return 0;
  if (anySolo && !track.solo) return 0;
  return track.volume;
}

async function renderTracks(
  project: ProjectState,
  sampleRate: number,
  onlyTrackId: number | null,
): Promise<AudioBuffer> {
  const seconds = loopSeconds(project.bpm, project.beatsPerBar, project.beatUnit, project.bars);
  const frames = Math.max(1, Math.round(seconds * sampleRate));
  const Offline = window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error('no-offline-audio');
  const ctx = new Offline(2, frames, sampleRate);

  const masterIn = ctx.createGain();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.16;
  const masterGain = ctx.createGain();
  masterGain.gain.value = project.masterVolume;
  masterIn.connect(limiter);
  limiter.connect(masterGain);
  masterGain.connect(ctx.destination);

  const reverbBus = ctx.createGain();
  const convolver = ctx.createConvolver();
  convolver.buffer = impulse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.85;
  reverbBus.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(masterIn);

  const candidates = project.tracks.filter(
    (track) => track.buffer && (onlyTrackId === null ? track.active : track.id === onlyTrackId),
  );
  for (const track of candidates) {
    if (!track.buffer) continue;
    const input = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = Math.max(20, Math.min(2000, track.fx.hp));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.max(400, Math.min(20000, track.fx.lp));
    const dry = ctx.createGain();
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = Math.max(0.02, Math.min(1.2, track.fx.delayTime / 1000));
    const feedback = ctx.createGain();
    feedback.gain.value = Math.max(0, Math.min(0.85, track.fx.delayFeedback));
    const delayMix = ctx.createGain();
    delayMix.gain.value = Math.max(0, Math.min(0.9, track.fx.delayMix));
    const gain = ctx.createGain();
    gain.gain.value =
      onlyTrackId === null ? trackGain(project, track.id) : Math.max(0.05, track.volume);
    const panner = ctx.createStereoPanner();
    panner.pan.value = track.pan;
    const send = ctx.createGain();
    send.gain.value = Math.max(0, Math.min(1, track.fx.reverbSend));

    input.connect(hp);
    hp.connect(lp);
    lp.connect(dry);
    dry.connect(gain);
    lp.connect(delay);
    delay.connect(delayMix);
    delayMix.connect(gain);
    delay.connect(feedback);
    feedback.connect(delay);
    gain.connect(panner);
    panner.connect(masterIn);
    gain.connect(send);
    send.connect(reverbBus);

    const buffer = ctx.createBuffer(
      Math.max(1, track.buffer.channels.length),
      Math.max(1, track.buffer.channels[0]?.length ?? 1),
      track.buffer.sampleRate,
    );
    track.buffer.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(input);
    source.start(0);
  }

  return await ctx.startRendering();
}

function audioDataOf(buffer: AudioBuffer): AudioData {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch += 1) {
    channels.push(new Float32Array(buffer.getChannelData(ch)));
  }
  return { sampleRate: buffer.sampleRate, channels };
}

export function sanitizeFileName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
  return cleaned || 'lyra-loop';
}

function extensionFor(format: ExportFormat): string {
  return format === 'wav' ? 'wav' : format === 'mp3' ? 'mp3' : 'webm';
}

function mimeFor(format: ExportFormat): string {
  return format === 'wav' ? 'audio/wav' : format === 'mp3' ? 'audio/mpeg' : 'audio/webm';
}

export function webmSupported(): boolean {
  if (typeof MediaRecorder === 'undefined') return false;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].some((type) =>
    MediaRecorder.isTypeSupported(type),
  );
}

async function bufferToWebm(buffer: AudioBuffer): Promise<Blob> {
  const mime =
    ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) =>
      MediaRecorder.isTypeSupported(type),
    ) ?? '';
  if (!mime) throw new Error('no-webm-codec');
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctor({ sampleRate: buffer.sampleRate });
  const destination = ctx.createMediaStreamDestination();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(destination);
  const recorder = new MediaRecorder(destination.stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  const done = new Promise<Blob>((resolve) => {
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });
  recorder.start();
  source.start();
  await new Promise<void>((resolve) => {
    source.onended = () => resolve();
  });
  recorder.stop();
  const blob = await done;
  await ctx.close();
  return blob;
}

async function encode(buffer: AudioBuffer, options: ExportOptions): Promise<Blob> {
  const data = audioDataOf(buffer);
  if (options.format === 'wav') {
    const bytes = encodeWav(data, options.bitDepth);
    return new Blob([bytes.buffer as ArrayBuffer], { type: mimeFor('wav') });
  }
  if (options.format === 'mp3') {
    const bytes = encodeMp3(data, options.bitrate);
    return new Blob([bytes.buffer as ArrayBuffer], { type: mimeFor('mp3') });
  }
  return bufferToWebm(buffer);
}

export async function renderProject(
  project: ProjectState,
  options: ExportOptions,
  onProgress?: (fraction: number) => void,
): Promise<ExportFile[]> {
  if (options.format === 'webm' && !webmSupported()) throw new Error('no-webm-codec');
  const base = sanitizeFileName(project.name);
  const ext = extensionFor(options.format);
  const files: ExportFile[] = [];

  if (!options.stems) {
    const mixed = await renderTracks(project, options.sampleRate, null);
    onProgress?.(0.6);
    const blob = await encode(mixed, options);
    onProgress?.(1);
    files.push({ name: `${base}.${ext}`, blob });
    return files;
  }

  const tracks = project.tracks.filter((track) => !!track.buffer && track.active);
  if (!tracks.length) return [];
  let index = 0;
  for (const track of tracks) {
    const rendered = await renderTracks(project, options.sampleRate, track.id);
    const blob = await encode(rendered, options);
    index += 1;
    onProgress?.(index / tracks.length);
    files.push({
      name: `${base}-${String(track.id).padStart(2, '0')}-${sanitizeFileName(track.name)}.${ext}`,
      blob,
    });
  }
  return files;
}

export function downloadFile(file: ExportFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
