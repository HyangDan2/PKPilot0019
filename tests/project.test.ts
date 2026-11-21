import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  channelToBase64,
  base64ToChannel,
  cloneProject,
  parseProjectFile,
  parseProjectJson,
  projectToJson,
  serializeProject,
} from '../src/audio/project';
import { createProject } from '../src/audio/types';

function projectWithLoop() {
  const project = createProject('Night Loop', 2);
  project.bpm = 118;
  project.bars = 4;
  project.beatsPerBar = 3;
  project.tracks[0].name = 'Bass DI';
  project.tracks[0].volume = 0.66;
  project.tracks[0].fx.delayMix = 0.25;
  project.tracks[0].buffer = {
    sampleRate: 44100,
    channels: [new Float32Array(128).map((_, index) => Math.sin(index / 6) * 0.7)],
  };
  project.tracks[1].buffer = {
    sampleRate: 48000,
    channels: [new Float32Array(64).fill(0.25), new Float32Array(64).fill(-0.25)],
  };
  return project;
}

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 9, 8]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('round-trips an audio channel within 16-bit precision', () => {
    const channel = new Float32Array(300).map((_, index) => Math.sin(index / 9) * 0.9);
    const back = base64ToChannel(channelToBase64(channel));
    expect(back.length).toBe(channel.length);
    for (let i = 0; i < channel.length; i += 1) {
      expect(Math.abs(back[i] - channel[i])).toBeLessThan(1 / 32000);
    }
  });
});

describe('.lps.json round-trip', () => {
  it('keeps settings, tracks and loops', () => {
    const project = projectWithLoop();
    const parsed = parseProjectJson(projectToJson(project));
    expect(parsed.name).toBe('Night Loop');
    expect(parsed.bpm).toBe(118);
    expect(parsed.bars).toBe(4);
    expect(parsed.beatsPerBar).toBe(3);
    expect(parsed.tracks.length).toBe(2);
    expect(parsed.tracks[0].name).toBe('Bass DI');
    expect(parsed.tracks[0].fx.delayMix).toBeCloseTo(0.25, 3);
    expect(parsed.tracks[0].buffer?.sampleRate).toBe(44100);
    expect(parsed.tracks[0].buffer?.channels[0].length).toBe(128);
    expect(parsed.tracks[1].buffer?.channels.length).toBe(2);
    expect(parsed.tracks[1].buffer?.channels[1][10]).toBeCloseTo(-0.25, 3);
    expect(parsed.tracks[1].buffer).not.toBeNull();
  });

  it('writes a versioned envelope', () => {
    const file = serializeProject(projectWithLoop());
    expect(file.format).toBe('lyra-loop-studio');
    expect(file.version).toBe(1);
    expect(typeof file.savedAt).toBe('string');
  });

  it('rejects foreign or broken files', () => {
    expect(() => parseProjectJson('not json')).toThrow();
    expect(() => parseProjectFile({ format: 'other' })).toThrow();
    expect(() => parseProjectFile({ format: 'lyra-loop-studio', project: {} })).toThrow();
  });

  it('clamps out-of-range values from a hand-edited file', () => {
    const raw = JSON.parse(projectToJson(projectWithLoop()));
    raw.project.bpm = 900;
    raw.project.tracks[0].volume = 4;
    raw.project.latencyMs = -999;
    const parsed = parseProjectFile(raw);
    expect(parsed.bpm).toBe(220);
    expect(parsed.tracks[0].volume).toBe(1);
    expect(parsed.latencyMs).toBe(-150);
  });

  it('deep-clones buffers instead of aliasing them', () => {
    const project = projectWithLoop();
    const copy = cloneProject(project);
    copy.tracks[0].buffer!.channels[0][0] = 0.123;
    expect(project.tracks[0].buffer!.channels[0][0]).not.toBe(0.123);
  });
});
