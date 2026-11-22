import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loopFrames } from '../src/audio/clock';
import { AudioEngine, type RecorderFactory } from '../src/audio/engine';
import { LoopRecorder, RecorderFlushTimeoutError } from '../src/audio/recorder';
import { opusMime } from '../src/audio/render';
import { DEFAULT_FX, createProject, type LoopBuffer, type TrackStatus } from '../src/audio/types';
import { projectToStored, storedToProject } from '../src/store/session';
import {
  FakeAudioBuffer,
  FakeGainNode,
  FakeMediaStreamSourceNode,
  FakeScriptProcessorNode,
  flushPromises,
  installAudioEnvironment,
  pumpInput,
  type AudioEnvironment,
  FakeAudioNode,
} from './helpers/fake-audio';

const SAMPLE_RATE = 8000;

type Internals = {
  tracks: Map<number, Record<string, unknown>>;
  instrumentBus: FakeGainNode;
  instrumentMonitor: FakeGainNode;
  masterIn: FakeGainNode;
  tick(): void;
};

function internals(engine: AudioEngine): Internals {
  return engine as unknown as Internals;
}

/** Ties one engine to one fake audio environment and drives the clock by hand. */
class Rig {
  readonly env: AudioEnvironment = installAudioEnvironment();
  readonly engine: AudioEngine;
  /** Releases recorders whose flush a test is holding open. */
  readonly stops: (() => void)[] = [];

  constructor(options: { holdFlush?: boolean } = {}) {
    let factory: RecorderFactory | undefined;
    if (options.holdFlush) {
      const stops = this.stops;
      factory = async (ctx, source, recorderOptions) => {
        const recorder = await LoopRecorder.create(ctx, source, recorderOptions);
        const realStop = recorder.stopAsync.bind(recorder);
        recorder.stopAsync = () =>
          new Promise((resolve, reject) => {
            stops.push(() => {
              realStop().then(resolve, reject);
            });
          });
        return recorder;
      };
    }
    this.engine = new AudioEngine(factory ? { createRecorder: factory } : {});
  }

  get ctx() {
    return this.env.latestContext();
  }

  async boot(
    options: {
      bpm?: number;
      bars?: number;
      countIn?: boolean;
      tracks?: number;
    } = {},
  ): Promise<void> {
    await this.engine.init({
      bpm: options.bpm ?? 120,
      beatsPerBar: 4,
      beatUnit: 4,
      bars: options.bars ?? 2,
      countIn: options.countIn ?? false,
      sampleRate: SAMPLE_RATE,
    });
    const count = options.tracks ?? 1;
    for (let id = 1; id <= count; id += 1) this.engine.createTrack(id);
  }

  loopSec(): number {
    return this.engine.loopSecondsValue;
  }

  frames(): number {
    return loopFrames(this.loopSec(), this.engine.sampleRate);
  }

  liveRecorder(): FakeScriptProcessorNode | null {
    for (let i = this.ctx.processors.length - 1; i >= 0; i -= 1) {
      const node = this.ctx.processors[i];
      if (node.onaudioprocess) return node;
    }
    return null;
  }

  advance(to: number, signal: (time: number) => number = () => 0): void {
    const from = this.ctx.currentTime;
    const recorder = this.liveRecorder();
    if (recorder && to > from) pumpInput(this.ctx, recorder, from, to, signal);
    this.ctx.currentTime = Math.max(from, to);
  }

  tick(): void {
    internals(this.engine).tick();
  }

  statusAt(time: number, id = 1): TrackStatus | null {
    const saved = this.ctx.currentTime;
    this.ctx.currentTime = time;
    const status = this.engine.trackRuntime().find((track) => track.id === id)?.status ?? null;
    this.ctx.currentTime = saved;
    return status;
  }

  recordingStart(id = 1, from = 0): number | null {
    for (let time = from; time < from + this.loopSec() * 4; time += 0.002) {
      const status = this.statusAt(time, id);
      if (status === 'REC' || status === 'OVERDUB') return time;
    }
    return null;
  }

  releaseStops(): void {
    const pending = this.stops.splice(0, this.stops.length);
    for (const release of pending) release();
  }

  async settle(): Promise<void> {
    await flushPromises();
    await flushPromises();
    await flushPromises();
  }

  dispose(): void {
    try {
      this.engine.stop(false);
    } catch {
      // context already torn down
    }
    this.releaseStops();
    const state = this.engine as unknown as { timer: number | null };
    if (state.timer !== null) {
      clearInterval(state.timer);
      state.timer = null;
    }
    this.env.restore();
  }
}

function noiseLoop(value: number, frames: number): LoopBuffer {
  return { sampleRate: SAMPLE_RATE, channels: [new Float32Array(frames).fill(value)] };
}

function peakIndex(channel: Float32Array): number {
  let index = 0;
  let peak = 0;
  for (let i = 0; i < channel.length; i += 1) {
    const value = Math.abs(channel[i]);
    if (value > peak) {
      peak = value;
      index = i;
    }
  }
  return index;
}

function sameSamples(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

let rig: Rig | null = null;

afterEach(() => {
  rig?.dispose();
  rig = null;
});

describe('commits own their track (token + epoch)', () => {
  it('serialises a quick re-record behind the previous take instead of racing it', async () => {
    rig = new Rig({ holdFlush: true });
    await rig.boot({ bars: 2 });
    const loop = rig.loopSec();

    await rig.engine.record(1);
    rig.advance(0.09 + loop + 0.2, () => 0.2);
    rig.tick(); // finalize: commit A is queued but its flush is held

    const pendingSecond = rig.engine.record(1);
    await rig.settle();
    // Take B must not start while A is still writing: it waits for the chain.
    expect(rig.engine.getTrackBuffer(1)).toBeNull();
    expect(rig.stops.length).toBe(1);

    rig.releaseStops();
    await rig.settle();
    await pendingSecond;
    expect(rig.engine.getTrackBuffer(1)?.channels[0][0]).toBeCloseTo(0.2, 4);

    const start = rig.recordingStart(1, rig.ctx.currentTime);
    expect(start).not.toBeNull();
    rig.advance(start! + loop + 0.2, (time) => (time >= start! ? 0.3 : 0));
    rig.tick();
    await rig.settle();
    rig.releaseStops();
    await rig.settle();

    // B overdubbed onto A: both takes survive, in order.
    const mixed = rig.engine.getTrackBuffer(1)!.channels[0];
    expect(Math.max(...mixed)).toBeCloseTo(0.5, 3);
    expect(mixed[0]).toBeCloseTo(0.2, 3);
  });

  it('drops a take whose buffer was replaced while its flush was pending', async () => {
    rig = new Rig({ holdFlush: true });
    await rig.boot({ bars: 2 });

    await rig.engine.record(1);
    rig.advance(0.09 + rig.loopSec() + 0.2, () => 0.4);
    rig.tick();
    // An import/restore claims the track while the old take is still flushing.
    rig.engine.setTrackBuffer(1, noiseLoop(0.75, rig.frames()));
    rig.releaseStops();
    await rig.settle();

    const buffer = rig.engine.getTrackBuffer(1)!;
    expect(buffer.channels[0][0]).toBeCloseTo(0.75, 4);
  });

  it('never applies a take twice when the transport stops again mid-commit', async () => {
    rig = new Rig({ holdFlush: true });
    await rig.boot({ bars: 2 });

    await rig.engine.record(1);
    rig.advance(0.09 + rig.loopSec() + 0.2, () => 0.3);
    rig.engine.stop();
    rig.engine.stop();
    await rig.settle();
    rig.releaseStops();
    await rig.settle();

    expect(rig.engine.getTrackBuffer(1)?.channels[0][0]).toBeCloseTo(0.3, 3);
  });
});

describe('asynchronous import cannot land in another project', () => {
  it('discards a decode that finishes after the project was swapped', async () => {
    rig = new Rig();
    await rig.boot({ bars: 2 });
    rig.ctx.holdDecode = true;

    const pending = rig.engine.importFile(1, new ArrayBuffer(8));
    await rig.settle();
    expect(rig.ctx.pendingDecodes.length).toBe(1);

    const next = createProject('Swap', 1);
    next.bpm = 120;
    next.bars = 2;
    next.tracks[0].buffer = noiseLoop(0.25, rig.frames());
    await rig.engine.loadProject(next);

    const decoded = new FakeAudioBuffer(1, rig.frames(), SAMPLE_RATE);
    decoded.getChannelData(0).fill(0.9);
    rig.ctx.releaseDecode(decoded);

    expect(await pending).toBe(false);
    expect(rig.engine.getTrackBuffer(1)!.channels[0][0]).toBeCloseTo(0.25, 4);
  });

  it('discards a decode that finishes after a newer take claimed the track', async () => {
    rig = new Rig();
    await rig.boot({ bars: 2 });
    rig.ctx.holdDecode = true;
    const pending = rig.engine.importFile(1, new ArrayBuffer(8));
    await rig.settle();

    await rig.engine.record(1);
    const decoded = new FakeAudioBuffer(1, rig.frames(), SAMPLE_RATE);
    decoded.getChannelData(0).fill(0.9);
    rig.ctx.releaseDecode(decoded);
    expect(await pending).toBe(false);
    expect(rig.engine.getTrackBuffer(1)).toBeNull();
  });

  it('places a decoded file on a free track and marks it as a file source', async () => {
    rig = new Rig();
    await rig.boot({ bars: 2 });
    const decoded = new FakeAudioBuffer(2, rig.frames(), SAMPLE_RATE);
    decoded.getChannelData(0).fill(0.4);
    decoded.getChannelData(1).fill(-0.4);
    rig.ctx.decodeResult = decoded;

    expect(await rig.engine.importFile(1, new ArrayBuffer(8))).toBe(true);
    const buffer = rig.engine.getTrackBuffer(1)!;
    expect(buffer.channels.length).toBe(2);
    expect(buffer.channels[0].length).toBe(rig.frames());
    expect(buffer.channels[0][10]).toBeCloseTo(0.4, 4);
    expect(rig.engine.getTrackSource(1)).toBe('File');
  });
});

describe('tempo changes keep every recorded sample', () => {
  it('leaves the PCM untouched and fits the loop by playback rate', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2 });
    const frames = rig.frames();
    const original = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) original[i] = ((i % 97) - 48) / 64;
    rig.engine.setTrackBuffer(1, { sampleRate: SAMPLE_RATE, channels: [original] });
    const before = new Float32Array(rig.engine.getTrackBuffer(1)!.channels[0]);

    rig.engine.setBpm(150);

    const after = rig.engine.getTrackBuffer(1)!;
    expect(after.channels[0].length).toBe(frames);
    expect(sameSamples(after.channels[0], before)).toBe(true);
    expect(rig.engine.hasLoops()).toBe(true);

    rig.engine.play();
    const source = rig.ctx.bufferSources.filter((entry) => entry.started && !entry.stopped).pop()!;
    const targetFrames = loopFrames(rig.loopSec(), SAMPLE_RATE);
    expect(targetFrames).toBeLessThan(frames);
    expect(source.playbackRate.value).toBeCloseTo(frames / targetFrames, 6);
    expect(source.loop).toBe(true);
  });

  it('keeps the frames when a bar count change lengthens the grid', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2 });
    const before = noiseLoop(0.3, rig.frames());
    rig.engine.setTrackBuffer(1, before);
    const frames = rig.frames();

    rig.engine.setBars(4);

    const after = rig.engine.getTrackBuffer(1)!;
    expect(after.channels[0].length).toBe(frames);
    rig.engine.play();
    const source = rig.ctx.bufferSources.filter((entry) => entry.started && !entry.stopped).pop()!;
    expect(source.playbackRate.value).toBeCloseTo(frames / loopFrames(rig.loopSec(), SAMPLE_RATE), 6);
  });

  it('hands a loop recorded at another tempo to an export without trimming it', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2 });
    const recordedFrames = rig.frames();
    rig.engine.setTrackBuffer(1, noiseLoop(0.3, recordedFrames));
    rig.engine.setBpm(90);
    const project = createProject('Tempo', 1);
    project.bpm = 90;
    project.bars = 2;
    project.tracks[0].buffer = rig.engine.getTrackBuffer(1);
    // The project and the export keep the stored loop as-is; the grid is longer
    // at 90 BPM and the renderer fits the loop to it by rate.
    expect(rig.frames()).toBeGreaterThan(recordedFrames);
    expect(project.tracks[0].buffer!.channels[0].length).toBe(recordedFrames);
  });
});

describe('instrument bus has one output while recording', () => {
  it('mutes the direct monitor and feeds the track instead', async () => {
    rig = new Rig();
    await rig.boot({ bars: 2 });
    expect(internals(rig.engine).instrumentMonitor.gain.value).toBeCloseTo(0.9, 4);

    await rig.engine.record(1);
    const state = internals(rig.engine);
    expect(state.instrumentMonitor.gain.value).toBe(0);
    const track = state.tracks.get(1) as {
      input: FakeAudioNode;
      connectedInstrument: FakeAudioNode | null;
    };
    expect(track.connectedInstrument).toBe(state.instrumentBus);
    expect(track.input.incoming.has(state.instrumentBus)).toBe(true);
    expect(rig.engine.getTrackSource(1)).toBe('Inst');

    rig.engine.stop();
    await rig.settle();
    // The direct monitor comes back as soon as no track captures the bus.
    expect(state.instrumentMonitor.gain.value).toBeCloseTo(0.9, 4);
  });

  it('keeps the microphone and the instrument on separate feeds into the track', async () => {
    rig = new Rig();
    await rig.boot({ bars: 2 });
    await rig.engine.requestMicrophone('mic-a');
    await rig.engine.record(1);

    const state = internals(rig.engine);
    const track = state.tracks.get(1) as { input: FakeAudioNode };
    const feeds = [...track.input.incoming].filter(
      (node) => node instanceof FakeGainNode || node === state.instrumentBus,
    );
    const micFeed = feeds.find((node) => {
      if (!(node instanceof FakeGainNode)) return false;
      return [...node.incoming].some((upstream) => upstream instanceof FakeMediaStreamSourceNode);
    });
    expect(micFeed).toBeDefined();
    expect(track.input.incoming.has(state.instrumentBus)).toBe(true);
    // Both sources converge on the track, but the instrument's own monitor is
    // silent: the track chain is the only route to the master.
    expect(state.instrumentMonitor.gain.value).toBe(0);
    expect(state.instrumentBus.outgoing.has(state.masterIn)).toBe(false);
  });
});

describe('negative latency calibration', () => {
  async function takeWithLatency(ms: number): Promise<Float32Array> {
    const local = new Rig();
    try {
      await local.boot({ bars: 2 });
      local.engine.setLatency(ms);
      await local.engine.record(1);
      const start = local.recordingStart(1, 0)!;
      const impulseAt = start + 0.5;
      local.advance(0.09 + local.loopSec() + 0.2, (time) =>
        time >= impulseAt && time < impulseAt + 32 / SAMPLE_RATE ? 0.9 : 0,
      );
      local.tick();
      await local.settle();
      return new Float32Array(local.engine.getTrackBuffer(1)!.channels[0]);
    } finally {
      local.dispose();
    }
  }

  it('moves the captured audio earlier for a positive trim and later for a negative one', async () => {
    const base = peakIndex(await takeWithLatency(0));
    const plus = peakIndex(await takeWithLatency(60));
    const minus = peakIndex(await takeWithLatency(-60));

    expect(base).toBeGreaterThan(1000);
    expect(Math.abs(plus - (base - Math.round(0.06 * SAMPLE_RATE)))).toBeLessThanOrEqual(4);
    expect(Math.abs(minus - (base + Math.round(0.06 * SAMPLE_RATE)))).toBeLessThanOrEqual(4);
  });
});

describe('a rejected input change keeps the working input', () => {
  let local: Rig;

  beforeEach(async () => {
    local = new Rig();
    rig = local;
    await local.boot({ bars: 2 });
    await local.engine.requestMicrophone('mic-a');
  });

  it('keeps the device, the stream and the previous processing settings', async () => {
    expect(await local.engine.setProcessing({ echoCancellation: true })).toBe(true);
    expect(local.engine.getProcessing().echoCancellation).toBe(true);

    local.env.devices.fail = true;
    expect(await local.engine.setProcessing({ noiseSuppression: true })).toBe(false);
    expect(local.engine.getProcessing().noiseSuppression).toBe(false);
    expect(local.engine.hasMicrophone()).toBe(true);
    expect(local.engine.getInputDeviceId()).toBe('mic-a');

    expect(await local.engine.setInputChannelMode('stereo')).toBe(false);
    expect(local.engine.getInputChannelMode()).toBe('mono');
    const current = local.env.devices.streams[local.env.devices.streams.length - 1];
    expect(current.tracks[0].readyState).toBe('live');
  });

  it('leaves a refused device switch on the current device', async () => {
    local.env.devices.fail = true;
    expect(await local.engine.requestMicrophone('mic-b')).toBe(false);
    expect(local.engine.getInputDeviceId()).toBe('mic-a');
    expect(local.engine.hasMicrophone()).toBe(true);
  });
});

describe('session snapshots are binary', () => {
  it('round-trips every float sample without base64', () => {
    const project = createProject('Binary', 2);
    const pcm = new Float32Array(2048);
    for (let i = 0; i < pcm.length; i += 1) pcm[i] = Math.sin(i / 7) * 0.987654321;
    project.tracks[0].buffer = { sampleRate: 48000, channels: [pcm, new Float32Array(2048).fill(-0.5)] };
    project.tracks[0].source = 'Inst';
    project.tracks[1].active = false;

    const stored = projectToStored(project);
    expect(stored.tracks[0].channels[0]).toBeInstanceOf(Float32Array);
    const restored = storedToProject(stored);
    expect(restored.tracks[0].buffer!.sampleRate).toBe(48000);
    expect(sameSamples(restored.tracks[0].buffer!.channels[0], pcm)).toBe(true);
    expect(restored.tracks[0].source).toBe('Inst');
    expect(restored.tracks[1].active).toBe(false);
  });
});

describe('recorder flush', () => {
  const created: { recorder: LoopRecorder; port: FakePort; node: FakeWorkletNode }[] = [];

  class FakePort {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    readonly sent: unknown[] = [];

    postMessage(message: unknown): void {
      this.sent.push(message);
    }

    emit(data: unknown): void {
      this.onmessage?.({ data });
    }
  }

  class FakeWorkletNode extends FakeAudioNode {
    readonly port = new FakePort();
    disconnected = false;

    constructor(readonly options: unknown) {
      super();
    }

    override disconnect(): void {
      this.disconnected = true;
      super.disconnect();
    }
  }

  class WorkletContext {
    readonly sampleRate = 48000;
    readonly destination = new FakeAudioNode();
    readonly audioWorklet = { addModule: async () => undefined };
    readonly gains: FakeGainNode[] = [];

    createGain(): FakeGainNode {
      const gain = new FakeGainNode();
      this.gains.push(gain);
      return gain;
    }
  }

  let previousNode: unknown;

  beforeEach(() => {
    created.length = 0;
    previousNode = (globalThis as Record<string, unknown>).AudioWorkletNode;
    (globalThis as Record<string, unknown>).AudioWorkletNode = class extends FakeWorkletNode {
      constructor(_ctx: unknown, _name: string, options: unknown) {
        super(options);
        const node = this as unknown as FakeWorkletNode;
        created.push({ recorder: node as unknown as LoopRecorder, port: node.port, node });
      }
    };
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).AudioWorkletNode = previousNode;
  });

  async function makeRecorder(timeoutMs = 60): Promise<{ recorder: LoopRecorder; port: FakePort }> {
    const ctx = new WorkletContext();
    const recorder = await LoopRecorder.create(
      ctx as unknown as AudioContext,
      new FakeGainNode() as unknown as AudioNode,
      { flushTimeoutMs: timeoutMs },
    );
    const port = created[created.length - 1]!.port;
    return { recorder, port };
  }

  it('waits for the worklet acknowledgement instead of a fixed timer', async () => {
    const { recorder, port } = await makeRecorder();
    recorder.start();
    port.emit({ time: 0, channels: [new Float32Array(8).fill(0.5)] });
    let settled = false;
    const pending = recorder.stopAsync().then((chunks) => {
      settled = true;
      return chunks;
    });
    await flushPromises();
    expect(settled).toBe(false);

    port.emit({ type: 'flushed' });
    const chunks = await pending;
    expect(settled).toBe(true);
    expect(chunks.length).toBe(1);
    expect(chunks[0].channels[0][0]).toBeCloseTo(0.5, 4);
  });

  it('raises an explicit error when the acknowledgement never comes', async () => {
    const { recorder, port } = await makeRecorder(40);
    recorder.start();
    port.emit({ time: 0, channels: [new Float32Array(4).fill(0.25)] });
    await expect(recorder.stopAsync()).rejects.toBeInstanceOf(RecorderFlushTimeoutError);
  });

  it('ignores an acknowledgement that arrives after the timeout', async () => {
    const { recorder, port } = await makeRecorder(20);
    recorder.start();
    const failure = recorder.stopAsync();
    await expect(failure).rejects.toBeInstanceOf(RecorderFlushTimeoutError);
    port.emit({ type: 'flushed' });
    await flushPromises();
    expect(true).toBe(true);
  });
});

describe('export container names', () => {
  it('names an Ogg/Opus file .ogg and a WebM one .webm', () => {
    const saved = (globalThis as Record<string, unknown>).MediaRecorder;
    try {
      (globalThis as Record<string, unknown>).MediaRecorder = class {
        static isTypeSupported(type: string): boolean {
          return type === 'audio/ogg;codecs=opus';
        }
      };
      expect(opusMime()).toBe('audio/ogg;codecs=opus');
      (globalThis as Record<string, unknown>).MediaRecorder = class {
        static isTypeSupported(type: string): boolean {
          return type === 'audio/webm;codecs=opus';
        }
      };
      expect(opusMime()).toBe('audio/webm;codecs=opus');
    } finally {
      if (saved === undefined) delete (globalThis as Record<string, unknown>).MediaRecorder;
      else (globalThis as Record<string, unknown>).MediaRecorder = saved;
    }
  });
});

describe('FX reaches the live track chain', () => {
  it('writes the values to the nodes the track actually plays through', async () => {
    rig = new Rig();
    await rig.boot({ bars: 2 });
    rig.engine.setTrackSettings(1, {
      fx: { ...DEFAULT_FX, hp: 480, lp: 6800, delayMix: 0.55, delayFeedback: 0.4, reverbSend: 0.35 },
    });
    const track = internals(rig.engine).tracks.get(1) as unknown as {
      input: FakeAudioNode;
      hp: { type: string; frequency: { value: number } };
      lp: { type: string; frequency: { value: number } };
      delayMix: { gain: { value: number } };
      reverbSend: { gain: { value: number } };
    };
    expect(track.hp.type).toBe('highpass');
    expect(track.hp.frequency.value).toBe(480);
    expect(track.lp.frequency.value).toBe(6800);
    expect(track.delayMix.gain.value).toBeCloseTo(0.55, 4);
    expect(track.reverbSend.gain.value).toBeCloseTo(0.35, 4);
    expect([...track.input.outgoing].includes(track.hp as unknown as FakeAudioNode)).toBe(true);
  });
});
