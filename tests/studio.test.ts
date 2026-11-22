import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loopFrames } from '../src/audio/clock';
import { engine } from '../src/audio/engine';
import { parseProjectJson } from '../src/audio/project';
import { renderProject } from '../src/audio/render';
import type { LoopBuffer } from '../src/audio/types';
import { studio } from '../src/store/studio';
import {
  flushPromises,
  installAudioEnvironment,
  type AudioEnvironment,
  type FakeAudioContext,
} from './helpers/fake-audio';

const SAMPLE_RATE = 8000;
const SESSION_KEY = 'lyra.session.v1';

function loop(value: number, seconds: number): LoopBuffer {
  return {
    sampleRate: SAMPLE_RATE,
    channels: [new Float32Array(loopFrames(seconds, SAMPLE_RATE)).fill(value)],
  };
}

let env: AudioEnvironment;
let ctx: FakeAudioContext;

function liveSources() {
  return ctx.bufferSources.filter((source) => source.started && !source.stopped);
}

beforeAll(async () => {
  env = installAudioEnvironment();
  localStorage.clear();
  window.confirm = () => true;
  await studio.boot();
  ctx = env.latestContext();
});

beforeEach(async () => {
  localStorage.clear();
  await studio.newProject();
});

afterAll(() => {
  const internals = engine as unknown as { timer: number | null };
  if (internals.timer !== null) {
    clearInterval(internals.timer);
    internals.timer = null;
  }
  engine.stop(false);
  env.restore();
});

describe('studio track transport', () => {
  it('starts the stopped transport from a track PLAY press and keeps that track playing', async () => {
    engine.setTrackBuffer(1, loop(0.4, engine.loopSecondsValue));
    await flushPromises();
    expect(studio.getSnapshot().project.tracks[0].buffer).not.toBeNull();
    expect(engine.isPlaying).toBe(false);

    await studio.toggleTrackPlay(1);

    expect(engine.isPlaying).toBe(true);
    expect(studio.getSnapshot().project.tracks[0].active).toBe(true);
    expect(engine.isTrackActive(1)).toBe(true);
    expect(liveSources().length).toBe(1);
  });

  it('keeps STOP, project state and the autosave in step with the track button', async () => {
    engine.setTrackBuffer(1, loop(0.4, engine.loopSecondsValue));
    await flushPromises();
    await studio.toggleTrackPlay(1);
    expect(studio.getSnapshot().project.tracks[0].active).toBe(true);

    studio.stopTrack(1);
    expect(studio.getSnapshot().project.tracks[0].active).toBe(false);
    expect(engine.isTrackActive(1)).toBe(false);
    expect(liveSources().length).toBe(0);

    // The debounced autosave writes the stopped state, not the stale one.
    await new Promise((resolve) => {
      setTimeout(resolve, 1800);
    });
    const saved = localStorage.getItem(SESSION_KEY);
    expect(saved).toBeTruthy();
    const restored = parseProjectJson(saved!);
    expect(restored.tracks[0].active).toBe(false);
    expect(restored.tracks[0].buffer).not.toBeNull();
  });

  it('leaves a stopped track out of the mixed export', async () => {
    engine.setTrackBuffer(1, loop(0.4, engine.loopSecondsValue));
    engine.setTrackBuffer(2, loop(0.3, engine.loopSecondsValue));
    await flushPromises();
    studio.stopTrack(2);
    await flushPromises();

    const project = studio.getSnapshot().project;
    expect(project.tracks[1].active).toBe(false);
    const files = await renderProject(project, {
      format: 'wav',
      bitDepth: 16,
      bitrate: 192,
      sampleRate: 44100,
      stems: false,
    });
    expect(files.length).toBe(1);
    expect(files[0].blob.size).toBe(44 + Math.round(engine.loopSecondsValue * 44100) * 2 * 2);
  });
});
