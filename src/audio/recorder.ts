/**
 * Loop recorder. Preferred path: AudioWorklet posting Float32Array chunks over
 * its MessagePort (no SharedArrayBuffer, so GitHub Pages' missing COOP/COEP
 * headers do not matter). Fallback: ScriptProcessorNode.
 */

import type { RecordedChunk } from './dsp';

export interface RecorderOptions {
  channelCount?: number;
}

export class LoopRecorder {
  private ctx: AudioContext;
  private chunks: RecordedChunk[] = [];
  private node: AudioWorkletNode | ScriptProcessorNode;
  private sink: GainNode;
  private mode: 'worklet' | 'script';
  private recording = false;
  private flushResolve: (() => void) | null = null;
  private disposed = false;

  private constructor(
    ctx: AudioContext,
    node: AudioWorkletNode | ScriptProcessorNode,
    sink: GainNode,
    mode: 'worklet' | 'script',
  ) {
    this.ctx = ctx;
    this.node = node;
    this.sink = sink;
    this.mode = mode;
  }

  static async create(
    ctx: AudioContext,
    source: AudioNode,
    options: RecorderOptions = {},
  ): Promise<LoopRecorder> {
    const channelCount = options.channelCount ?? 1;
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
        const recorder = new LoopRecorder(ctx, node, sink, 'worklet');
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
    const recorder = new LoopRecorder(ctx, node, sink, 'script');
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
      this.flushResolve?.();
      this.flushResolve = null;
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

  stop(): RecordedChunk[] {
    if (this.mode === 'worklet') {
      const port = (this.node as AudioWorkletNode).port;
      const wait = new Promise<void>((resolve) => {
        this.flushResolve = resolve;
        window.setTimeout(resolve, 120);
      });
      port.postMessage({ type: 'stop' });
      this.recording = false;
      // The caller awaits `stopAsync`; plain stop keeps the synchronous contract.
      void wait;
    } else {
      this.recording = false;
    }
    return this.chunks;
  }

  async stopAsync(): Promise<RecordedChunk[]> {
    if (this.mode !== 'worklet') {
      this.recording = false;
      return this.chunks;
    }
    const port = (this.node as AudioWorkletNode).port;
    const flushed = new Promise<void>((resolve) => {
      this.flushResolve = resolve;
      window.setTimeout(resolve, 150);
    });
    this.recording = false;
    port.postMessage({ type: 'stop' });
    await flushed;
    return this.chunks;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.recording = false;
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
