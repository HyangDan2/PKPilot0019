import { afterEach, describe, expect, it } from 'vitest';
import { loopFrames } from '../src/audio/clock';
import { AudioEngine } from '../src/audio/engine';
import { cloneProject, parseProjectJson, projectToJson } from '../src/audio/project';
import { renderProject } from '../src/audio/render';
import { DEFAULT_FX, createProject, type LoopBuffer, type ProjectState, type TrackStatus } from '../src/audio/types';
import {
  FakeGainNode,
  FakeMediaStreamSourceNode,
  FakeScriptProcessorNode,
  flushPromises,
  installAudioEnvironment,
  pumpInput,
  type AudioEnvironment,
  type FakeAudioNode,
} from './helpers/fake-audio';

const SAMPLE_RATE = 8000;

/** Ties one engine to one fake audio environment and drives the clock by hand. */
class Rig {
  readonly env: AudioEnvironment = installAudioEnvironment();
  readonly engine = new AudioEngine();

  get ctx() {
    return this.env.latestContext();
  }

  async boot(
    options: {
      bpm?: number;
      beatsPerBar?: number;
      beatUnit?: number;
      bars?: number;
      countIn?: boolean;
      tracks?: number;
    } = {},
  ): Promise<void> {
    await this.engine.init({
      bpm: options.bpm ?? 120,
      beatsPerBar: options.beatsPerBar ?? 4,
      beatUnit: options.beatUnit ?? 4,
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

  barSec(): number {
    return this.engine.barSecondsValue;
  }

  frames(): number {
    return loopFrames(this.loopSec(), this.engine.sampleRate);
  }

  barFrames(): number {
    return Math.round(this.barSec() * this.engine.sampleRate);
  }

  /** Newest recorder that is still capturing. */
  liveRecorder(): FakeScriptProcessorNode | null {
    for (let i = this.ctx.processors.length - 1; i >= 0; i -= 1) {
      const node = this.ctx.processors[i];
      if (node.onaudioprocess) return node;
    }
    return null;
  }

  /** Move the context clock to `to`, feeding `signal` into the live recorder. */
  advance(to: number, signal: (time: number) => number = () => 0): void {
    const from = this.ctx.currentTime;
    const recorder = this.liveRecorder();
    if (recorder && to > from) pumpInput(this.ctx, recorder, from, to, signal);
    this.ctx.currentTime = Math.max(from, to);
  }

  tick(): void {
    (this.engine as unknown as { tick(): void }).tick();
  }

  statusAt(time: number, id = 1): TrackStatus | null {
    const saved = this.ctx.currentTime;
    this.ctx.currentTime = time;
    const status = this.engine.trackRuntime().find((track) => track.id === id)?.status ?? null;
    this.ctx.currentTime = saved;
    return status;
  }

  /** First moment the track reports REC/OVERDUB, found by probing the clock. */
  recordingStart(id = 1, from = 0): number | null {
    for (let time = from; time < from + this.loopSec() * 4; time += 0.002) {
      const status = this.statusAt(time, id);
      if (status === 'REC' || status === 'OVERDUB') return time;
    }
    return null;
  }

  async settle(): Promise<void> {
    await flushPromises();
    await flushPromises();
  }

  dispose(): void {
    try {
      this.engine.stop(false);
    } catch {
      // context already torn down
    }
    const internals = this.engine as unknown as { timer: number | null };
    if (internals.timer !== null) {
      clearInterval(internals.timer);
      internals.timer = null;
    }
    this.env.restore();
  }
}

function noiseLoop(value: number, frames = 2400, sampleRate = SAMPLE_RATE): LoopBuffer {
  return { sampleRate, channels: [new Float32Array(frames).fill(value)] };
}

function maxAbs(channels: Float32Array[]): number {
  let peak = 0;
  for (const channel of channels) {
    for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i]));
  }
  return peak;
}

function peakIn(channel: Float32Array, from: number, to: number): number {
  let peak = 0;
  for (let i = Math.max(0, from); i < Math.min(channel.length, to); i += 1) {
    peak = Math.max(peak, Math.abs(channel[i]));
  }
  return peak;
}

function recorderInput(processor: FakeScriptProcessorNode): FakeAudioNode {
  const input = [...processor.incoming][0];
  if (!input) throw new Error('recorder has no input');
  return input;
}

/** The gain node that carries microphone audio into `input`, if any. */
function micGainFeeding(input: FakeAudioNode): { gain: FakeGainNode; stream: unknown } | null {
  for (const candidate of input.incoming) {
    if (!(candidate instanceof FakeGainNode)) continue;
    for (const upstream of candidate.incoming) {
      if (upstream instanceof FakeMediaStreamSourceNode) {
        return { gain: candidate, stream: upstream.stream };
      }
    }
  }
  return null;
}

let rig: Rig | null = null;

afterEach(() => {
  rig?.dispose();
  rig = null;
});

describe('recording commits a take locked to the loop grid', () => {
  const cases: { label: string; bars: number; beatsPerBar: number; beatUnit: number }[] = [];
  for (const bars of [1, 2, 4, 8]) {
    cases.push({ label: `${bars} bar 4/4`, bars, beatsPerBar: 4, beatUnit: 4 });
    cases.push({ label: `${bars} bar 3/4`, bars, beatsPerBar: 3, beatUnit: 4 });
    cases.push({ label: `${bars} bar 6/8`, bars, beatsPerBar: 6, beatUnit: 8 });
  }

  for (const entry of cases) {
    it(`keeps a full take for ${entry.label}`, async () => {
      rig = new Rig();
      await rig.boot({ ...entry, countIn: false });
      const loopSec = rig.loopSec();
      const frames = rig.frames();

      expect(await rig.engine.record(1)).toBe(true);
      rig.advance(0.09 + loopSec + 0.2, () => 0.5);
      rig.tick();
      await rig.settle();

      const buffer = rig.engine.getTrackBuffer(1);
      expect(buffer).not.toBeNull();
      expect(buffer?.channels[0].length).toBe(frames);
      // The whole take is the performed material, never a silent stretch.
      expect(maxAbs(buffer!.channels)).toBeCloseTo(0.5, 4);
      expect(peakIn(buffer!.channels[0], 0, frames)).toBeCloseTo(0.5, 4);
    });
  }
});

describe('early stop keeps the performed bars', () => {
  it('keeps the played bar and silences the rest of a 2-bar loop', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: false });
    const barFrames = rig.barFrames();

    await rig.engine.record(1);
    rig.advance(0.09 + 1.4, () => 0.5);
    rig.engine.stopRecording(1);
    expect(rig.statusAt(rig.ctx.currentTime)).toBe('REC');
    rig.advance(0.09 + 2.5 + 0.2, () => 0.5);
    rig.tick();
    await rig.settle();

    const loop = rig.engine.getTrackBuffer(1)!;
    expect(loop.channels[0].length).toBe(rig.frames());
    expect(peakIn(loop.channels[0], 0, barFrames - 4)).toBeCloseTo(0.5, 3);
    expect(peakIn(loop.channels[0], barFrames + 4, loop.channels[0].length)).toBe(0);
  });

  it('places a count-in take stopped early at its loop phase instead of trimming it to silence', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 4, countIn: true });
    const barSec = rig.barSec();
    const barFrames = rig.barFrames();
    const loopFramesTotal = rig.frames();

    await rig.engine.record(1);
    const recStart = 0.09 + barSec; // one count-in bar after the loop origin
    const performance = (time: number) => (time >= recStart && time < recStart + barSec ? 0.5 : 0);
    rig.advance(recStart + 1.2, performance);
    rig.engine.stopRecording(1);
    rig.advance(recStart + barSec + 0.2, performance);
    rig.tick();
    await rig.settle();

    const loop = rig.engine.getTrackBuffer(1)!;
    const channel = loop.channels[0];
    expect(channel.length).toBe(loopFramesTotal);
    // The take begins at loop phase (recStart - loopStart) = one bar, so the
    // performed bar must land there and nowhere else.
    expect(peakIn(channel, 0, barFrames - 4)).toBe(0);
    expect(peakIn(channel, barFrames, 2 * barFrames - 4)).toBeCloseTo(0.5, 3);
    expect(peakIn(channel, 2 * barFrames + 4, channel.length)).toBe(0);
  });

  it('cancels a take stopped before the first recorded bar', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: true });
    await rig.engine.record(1);
    // Still inside the count-in bar: nothing has been performed yet.
    rig.engine.stopRecording(1);
    expect(rig.engine.trackRuntime()[0].status).toBe('EMPTY');
    await rig.settle();
    expect(rig.engine.getTrackBuffer(1)).toBeNull();
  });
});

describe('count-in alignment', () => {
  it('schedules a one-bar count-in that ends exactly where recording begins', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: true });
    await rig.engine.record(1);

    const clicks = rig.ctx.oscillators
      .map((oscillator) => oscillator.startTime)
      .filter((time): time is number => time !== null);
    const barSec = rig.barSec();
    const beatSec = 0.5;
    expect(clicks.length).toBe(4);
    expect(clicks[0]).toBeCloseTo(0.09, 3);
    expect(clicks[clicks.length - 1]).toBeCloseTo(0.09 + barSec - beatSec, 3);

    const recStart = rig.recordingStart(1, 0.09 + barSec - 1);
    expect(recStart).not.toBeNull();
    // Exactly the bar that closes the count-in, not one bar later.
    expect(recStart!).toBeCloseTo(clicks[0] + barSec, 2);
    expect(rig.statusAt(clicks[0] + barSec - 0.05)).toBe('COUNT-IN');
    expect(rig.statusAt(clicks[0] + barSec + 0.05)).toBe('REC');
  });

  it('does not schedule a click into the past on a cold load', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: true });
    rig.ctx.currentTime = 0.02;
    await expect(rig.engine.record(1)).resolves.toBe(true);
    const clickTimes = rig.ctx.oscillators.map((oscillator) => oscillator.startTime ?? 0);
    expect(clickTimes.length).toBe(4);
    for (const time of clickTimes) expect(time).toBeGreaterThanOrEqual(0.02);
  });
});

describe('in-flight commits cannot outlive their owner', () => {
  it('drops a take whose track was cleared while the flush was pending', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: false });
    await rig.engine.record(1);
    rig.advance(0.09 + rig.loopSec() + 0.2, () => 0.4);

    rig.engine.stop(); // queues the async commit
    rig.engine.clearTrack(1); // ...and the buffer is deleted first
    await rig.settle();

    expect(rig.engine.getTrackBuffer(1)).toBeNull();
    expect(rig.engine.trackRuntime()[0].hasLoop).toBe(false);
  });

  it('drops a take when the project is swapped while the flush is pending', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: false, tracks: 1 });
    await rig.engine.record(1);
    rig.advance(0.09 + rig.loopSec() + 0.2, () => 0.4);

    rig.engine.stop();
    const next = createProject('Next Project', 2);
    next.tracks[1].buffer = noiseLoop(0.25, rig.frames(), SAMPLE_RATE);
    await rig.engine.loadProject(next);
    await rig.settle();

    // Track 1 is empty in the incoming project and stays empty.
    expect(rig.engine.getTrackBuffer(1)).toBeNull();
    expect(rig.engine.getTrackBuffer(2)).not.toBeNull();
    expect(rig.engine.getTrackBuffer(2)!.channels[0][0]).toBeCloseTo(0.25, 3);
  });

  it('ignores a take started before loadProject replaces the tracks', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: false, tracks: 1 });
    await rig.engine.record(1);
    rig.advance(0.09, () => 0.3); // count-in/recording started, nothing committed yet

    const next = createProject('Swap', 1);
    await rig.engine.loadProject(next);
    rig.advance(0.09 + rig.loopSec() * 2, () => 0.3);
    rig.tick();
    await rig.settle();

    expect(rig.engine.getTrackBuffer(1)).toBeNull();
  });
});

describe('track PLAY / STOP / overdub', () => {
  it('starts a stopped transport from the track PLAY button without stopping the track again', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, tracks: 2 });
    rig.engine.setTrackBuffer(1, noiseLoop(0.4, rig.frames()));
    rig.engine.stop();
    expect(rig.engine.isPlaying).toBe(false);

    // The store's flow: decide, arm the track, then start the transport.
    rig.engine.setTrackActive(1, true);
    rig.engine.play();
    expect(rig.engine.isPlaying).toBe(true);
    expect(rig.engine.isTrackActive(1)).toBe(true);
    const playing = rig.ctx.bufferSources.filter((source) => source.started && !source.stopped);
    expect(playing.length).toBe(1);

    // The next press is an intentional STOP for that track only.
    rig.engine.toggleTrackPlayback(1);
    expect(rig.engine.isTrackActive(1)).toBe(false);
    expect(rig.ctx.bufferSources.filter((source) => source.started && !source.stopped).length).toBe(0);
  });

  it('keeps a track silent while stopped even though the transport runs', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, tracks: 2 });
    rig.engine.setTrackBuffer(1, noiseLoop(0.4, rig.frames()));
    rig.engine.setTrackBuffer(2, noiseLoop(0.2, rig.frames()));
    rig.engine.setTrackActive(2, false);
    rig.engine.play();
    const live = rig.ctx.bufferSources.filter((source) => source.started && !source.stopped);
    expect(live.length).toBe(1);
    expect(live[0].buffer?.getChannelData(0)[0]).toBeCloseTo(0.4, 3);
  });

  it('switches REC to OVERDUB on a track that already has a loop', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: false });
    await rig.engine.record(1);
    rig.advance(0.09 + rig.loopSec() + 0.2, () => 0.2);
    rig.tick();
    await rig.settle();
    expect(rig.engine.getTrackBuffer(1)!.channels[0][0]).toBeCloseTo(0.2, 3);

    await rig.engine.record(1);
    const secondStart = rig.recordingStart(1, rig.ctx.currentTime);
    expect(secondStart).not.toBeNull();
    expect(rig.statusAt(secondStart! + 0.05)).toBe('OVERDUB');
    rig.advance(secondStart! + rig.loopSec() + 0.2, (time) => (time >= secondStart! ? 0.3 : 0));
    rig.tick();
    await rig.settle();

    const mixed = rig.engine.getTrackBuffer(1)!;
    expect(mixed.channels[0][100]).toBeCloseTo(0.5, 3);
    expect(rig.engine.trackRuntime()[0].canUndo).toBe(true);
  });
});

describe('active state survives save, restore and export', () => {
  it('round-trips the active flag through the project file', () => {
    const project = createProject('Mix', 2);
    project.tracks[0].active = true;
    project.tracks[1].active = false;
    const restored = parseProjectJson(projectToJson(project));
    expect(restored.tracks[0].active).toBe(true);
    expect(restored.tracks[1].active).toBe(false);
  });

  it('restores the saved active state even when the engine had another one', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, tracks: 2 });
    rig.engine.setTrackActive(1, false);
    rig.engine.setTrackActive(2, false);

    const project = createProject('Restore', 2);
    project.tracks[0].active = true;
    project.tracks[1].active = false;
    project.tracks[0].buffer = noiseLoop(0.4, rig.frames());
    project.tracks[1].buffer = noiseLoop(0.2, rig.frames());
    await rig.engine.loadProject(project);

    expect(rig.engine.isTrackActive(1)).toBe(true);
    expect(rig.engine.isTrackActive(2)).toBe(false);
  });

  it('writes WAV from the active tracks only', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2 });
    const project = createProject('Export', 2);
    project.bpm = 120;
    project.bars = 2;
    project.tracks[0].buffer = noiseLoop(0.4, rig.frames());
    project.tracks[1].buffer = noiseLoop(0.3, rig.frames());
    project.tracks[0].active = true;
    project.tracks[1].active = false;
    const cloned = cloneProject(project);

    const options = {
      format: 'wav' as const,
      bitDepth: 16 as const,
      bitrate: 192 as const,
      sampleRate: 44100 as const,
      stems: false,
    };
    const files = await renderProject(cloned, options);
    expect(files.length).toBe(1);
    expect(files[0].name).toBe('Export.wav');
    const frames = Math.round(rig.loopSec() * 44100);
    expect(files[0].blob.size).toBe(44 + frames * 2 * 2);

    // Stems: a stopped track is not exported at all.
    const stems = await renderProject(cloned, { ...options, stems: true });
    expect(stems.length).toBe(1);
    expect(stems[0].name).toContain('-01-');

    // ...and an active second track does get its own stem.
    const allActive = cloneProject(project);
    allActive.tracks[1].active = true;
    const allStems = await renderProject(allActive, { ...options, stems: true });
    expect(allStems.length).toBe(2);
  });

  it('encodes a rendered buffer into a valid WAV and MP3', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2 });
    const project = createProject('Encoded', 1);
    project.bpm = 120;
    project.bars = 2;
    project.tracks[0].buffer = noiseLoop(0.4, rig.frames());
    project.tracks[0].active = true;

    const wavFiles = await renderProject(project, {
      format: 'wav',
      bitDepth: 24,
      bitrate: 192,
      sampleRate: 44100,
      stems: false,
    });
    const wavBytes = new Uint8Array(await wavFiles[0].blob.arrayBuffer());
    expect(String.fromCharCode(...wavBytes.subarray(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...wavBytes.subarray(8, 12))).toBe('WAVE');
    expect(wavFiles[0].blob.type).toBe('audio/wav');
    expect(wavFiles[0].blob.size).toBe(44 + Math.round(rig.loopSec() * 44100) * 2 * 3);

    const mp3Files = await renderProject(project, {
      format: 'mp3',
      bitDepth: 16,
      bitrate: 128,
      sampleRate: 44100,
      stems: false,
    });
    const mp3Bytes = new Uint8Array(await mp3Files[0].blob.arrayBuffer());
    expect(mp3Bytes.length).toBeGreaterThan(2000);
    expect(mp3Bytes[0]).toBe(0xff);
    expect(mp3Files[0].blob.type).toBe('audio/mpeg');
  });
});

describe('engine restart and microphone device changes', () => {
  it('restores track settings, buffers and the microphone after a sample-rate restart', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 104, bars: 2, tracks: 2 });
    const loop = noiseLoop(0.35, rig.frames());
    rig.engine.setTrackBuffer(1, loop);
    rig.engine.setTrackBuffer(2, noiseLoop(0.2, rig.frames()));
    rig.engine.setTrackSettings(1, { volume: 0.42, pan: -0.35, mute: true });
    rig.engine.setTrackSettings(1, { fx: { ...DEFAULT_FX, hp: 320, delayMix: 0.4, reverbSend: 0.3 } });
    rig.engine.setTrackSettings(2, { volume: 0.61, pan: 0.2, solo: true });
    rig.engine.setTrackActive(2, false);
    await rig.engine.requestMicrophone('mic-a');

    await rig.engine.restart(48000);

    expect(rig.engine.sampleRate).toBe(48000);
    expect(rig.engine.isPlaying).toBe(false);
    const settings = rig.engine.getTrackSettings(1)!;
    expect(settings.volume).toBeCloseTo(0.42, 3);
    expect(settings.pan).toBeCloseTo(-0.35, 3);
    expect(settings.mute).toBe(true);
    expect(settings.fx.hp).toBeCloseTo(320, 0);
    expect(settings.fx.delayMix).toBeCloseTo(0.4, 3);
    expect(settings.fx.reverbSend).toBeCloseTo(0.3, 3);
    expect(rig.engine.getTrackSettings(2)!.solo).toBe(true);
    expect(rig.engine.isTrackActive(2)).toBe(false);
    expect(rig.engine.getTrackBuffer(1)!.channels[0].length).toBe(
      loopFrames(rig.engine.loopSecondsValue, 48000),
    );
    expect(rig.engine.getTrackBuffer(1)!.channels[0][10]).toBeCloseTo(0.35, 3);

    // The microphone is still open and re-wired to the next recording.
    expect(rig.engine.hasMicrophone()).toBe(true);
    expect(await rig.engine.record(1)).toBe(true);
    const processor = rig.liveRecorder()!;
    const mic = micGainFeeding(recorderInput(processor));
    expect(mic).not.toBeNull();
    expect(mic!.stream).toBe(rig.env.devices.streams[0]);
  });

  it('cancels a take in flight when the engine restarts', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: false });
    await rig.engine.record(1);
    rig.advance(0.09 + 1.0, () => 0.4);
    await rig.engine.restart(44100);
    await rig.settle();
    expect(rig.engine.getTrackBuffer(1)).toBeNull();
    expect(rig.engine.trackRuntime()[0].status).toBe('EMPTY');
  });

  it('keeps every open input wired to the new microphone device', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, tracks: 1 });
    expect(await rig.engine.requestMicrophone('mic-a')).toBe(true);
    await rig.engine.record(1);
    const processor = rig.liveRecorder()!;
    const input = recorderInput(processor);
    const first = micGainFeeding(input);
    expect(first).not.toBeNull();

    expect(await rig.engine.requestMicrophone('mic-b')).toBe(true);
    const second = micGainFeeding(input);
    expect(second).not.toBeNull();
    expect(second!.gain).not.toBe(first!.gain);
    expect(second!.stream).toBe(rig.env.devices.streams[1]);
    expect(rig.env.devices.streams[0].tracks[0].readyState).toBe('ended');
    expect(rig.env.devices.requests.map((request) => request.deviceId)).toEqual(['mic-a', 'mic-b']);
  });

  it('keeps the current microphone connected when a device switch fails', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, tracks: 1 });
    await rig.engine.requestMicrophone('mic-a');
    await rig.engine.record(1);
    const input = recorderInput(rig.liveRecorder()!);
    const before = micGainFeeding(input);

    rig.env.devices.fail = true;
    expect(await rig.engine.requestMicrophone('mic-b')).toBe(false);

    const after = micGainFeeding(input);
    expect(after).not.toBeNull();
    expect(after!.gain).toBe(before!.gain);
    expect(after!.stream).toBe(rig.env.devices.streams[0]);
    expect(rig.env.devices.streams[0].tracks[0].readyState).toBe('live');
  });

  it('re-opens the input when the device reports its stream as ended', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, tracks: 1 });
    await rig.engine.requestMicrophone('mic-a');
    rig.env.devices.streams[0].tracks[0].end();
    await rig.settle();
    expect(rig.env.devices.requests.length).toBe(2);
    expect(rig.env.devices.requests[1].deviceId).toBe('mic-a');
    expect(rig.engine.hasMicrophone()).toBe(true);
  });
});

describe('project state moves with the engine', () => {
  it('keeps the project buffer list in step after a take commits', async () => {
    rig = new Rig();
    await rig.boot({ bpm: 120, bars: 2, countIn: false });
    const project: ProjectState = createProject('Loop', 1);
    project.bpm = 120;
    project.bars = 2;
    project.countIn = false;
    await rig.engine.loadProject(project);
    await rig.engine.record(1);
    rig.advance(0.09 + rig.loopSec() + 0.2, () => 0.33);
    rig.tick();
    await rig.settle();
    const buffer = rig.engine.getTrackBuffer(1)!;
    expect(maxAbs(buffer.channels)).toBeCloseTo(0.33, 3);
    expect(rig.engine.trackRuntime()[0].status).toBe('PLAY');
  });
});
