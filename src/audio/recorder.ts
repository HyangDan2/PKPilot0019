/**
 * Loop recorder. Preferred path: AudioWorklet posting Float32Array chunks over
 * its MessagePort (no SharedArrayBuffer, so GitHub Pages' missing COOP/COEP
 * headers do not matter). Fallback: ScriptProcessorNode.
 *
 * Stopping is not a timer: the worklet answers `stop` with a `flushed` message
 * after it has posted its last partial block, and `stopAsync` resolves on that
 * acknowledgement. A worklet that stops answering raises an explicit
 * `RecorderFlushTimeoutError` instead of letting the take look complete while
 * its tail is still stuck in the audio thread.
 */

import type { RecordedChunk } from './dsp';

export interface RecorderOptions {
  channelCount?: number;
  /** How long to wait for the worklet's flush acknowledgement. */
  flushTimeoutMs?: number;
}

/** The worklet never acknowledged a `stop`; the chunks are whatever arrived. */
export class RecorderFlushTimeoutError extends Error {
  readonly chunks: RecordedChunk[];
  readonly timeoutMs: number;

  constructor(chunks: RecordedChunk[], timeoutMs: number) {
    super(`recorder flush was not acknowledged within ${timeoutMs}ms`);
    this.name = 'RecorderFlushTimeoutError';
    this.chunks = chunks;
    this.timeoutMs = timeoutMs;
  }
}

export const DEFAULT_FLUSH_TIMEOUT_MS = 500;

export class LoopRecorder {
  private ctx: AudioContext;
  private chunks: RecordedChunk[] = [];
  private node: AudioWorkletNode | ScriptProcessorNode;
  private sink: GainNode;
  private mode: 'worklet' | 'script';
  private recording = false;
  private flushWait: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private flushTimeoutMs: number;
  private disposed = false;

  private constructor(
    ctx: AudioContext,
    node: AudioWorkletNode | ScriptProcessorNode,
    sink: GainNode,
    mode: 'worklet' | 'script',
    flushTimeoutMs: number,
  ) {
    this.ctx = ctx;
    this.node = node;
    this.sink = sink;
    this.mode = mode;
    this.flushTimeoutMs = flushTimeoutMs;
  }

  static async create(
    ctx: AudioContext,
    source: AudioNode,
    options: RecorderOptions = {},
  ): Promise<LoopRecorder> {
    const channelCount = options.channelCount ?? 1;
    const flushTimeoutMs = Math.max(50, options.flushTimeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS);
    const sink = ctx.createGain();
    sink.gain.value = 0;
    sink.connect(ctx.destination);

    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        const url = `${import.meta.env.BASE_URL}recorder-worklet.js`;
        await ctx.audioWorklet.addModule(url);
        const node = new AudioWorkletNode(ctx, 'lyra-recorder', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [1],
          channelCount,
          channelCountMode: 'max',
        });
        const recorder = new LoopRecorder(ctx, node, sink, 'worklet', flushTimeoutMs);
        node.port.onmessage = (event: MessageEvent) => recorder.receive(event.data);
        node.port.onmessageerror = () => undefined;
        source.connect(node);
        node.connect(sink);
        return recorder;
      } catch {
        // Fall through to the script processor path.
      }
    }

    const node = ctx.createScriptProcessor(2048, channelCount, 1);
    const recorder = new LoopRecorder(ctx, node, sink, 'script', flushTimeoutMs);
    node.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!recorder.recording) return;
      const channels: Float32Array[] = [];
      for (let ch = 0; ch < channelCount; ch += 1) {
        const input = event.inputBuffer.getChannelData(ch);
        channels.push(new Float32Array(input));
      }
      recorder.chunks.push({ time: event.playbackTime, channels });
    };
    source.connect(node);
    node.connect(sink);
    return recorder;
  }

  private receive(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const payload = data as { type?: string; time?: number; channels?: Float32Array[] };
    if (payload.type === 'flushed') {
      const wait = this.flushWait;
      this.flushWait = null;
      wait?.resolve();
      return;
    }
    if (payload.time !== undefined && payload.channels) {
      this.chunks.push({ time: payload.time, channels: payload.channels });
    }
  }

  start(): void {
    if (this.disposed) return;
    this.chunks = [];
    this.recording = true;
    if (this.mode === 'worklet') (this.node as AudioWorkletNode).port.postMessage({ type: 'start' });
  }

  /**
   * Stop capture and wait for the audio thread to acknowledge its final flush.
   * Worklet mode resolves only on that acknowledgement; if it never arrives the
   * promise rejects with `RecorderFlushTimeoutError` carrying the chunks that
   * did arrive, so the caller can decide what to keep instead of assuming a
   * complete take.
   */
  async stopAsync(): Promise<RecordedChunk[]> {
    if (this.mode !== 'worklet' || this.disposed) {
      this.recording = false;
      return this.chunks;
    }
    const port = (this.node as AudioWorkletNode).port;
    this.recording = false;
    const flushed = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.flushWait?.reject !== reject) return;
        this.flushWait = null;
        reject(new RecorderFlushTimeoutError([...this.chunks], this.flushTimeoutMs));
      }, this.flushTimeoutMs);
      this.flushWait = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject,
      };
    });
    try {
      port.postMessage({ type: 'stop' });
    } catch (error) {
      this.flushWait = null;
      throw error instanceof Error ? error : new Error('recorder-stop-failed');
    }
    await flushed;
    return this.chunks;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.recording = false;
    this.flushWait = null;
    try {
      if (this.mode === 'worklet') {
        (this.node as AudioWorkletNode).port.postMessage({ type: 'stop' });
        (this.node as AudioWorkletNode).disconnect();
      } else {
        (this.node as ScriptProcessorNode).onaudioprocess = null;
        (this.node as ScriptProcessorNode).disconnect();
      }
      this.sink.disconnect();
    } catch {
      // Nodes may already be torn down with the context.
    }
  }

  get latencyMode(): 'worklet' | 'script' {
    return this.mode;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }
}
