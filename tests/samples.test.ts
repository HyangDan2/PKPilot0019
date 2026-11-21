import { describe, expect, it } from 'vitest';
import { SAMPLE_PROJECTS, sampleByKey, sampleProjectNames } from '../src/audio/sampleProjects';
import { loopSeconds } from '../src/audio/clock';
import { loopPeaks } from '../src/audio/dsp';

describe('built-in sample projects', () => {
  it('ships exactly three demos', () => {
    expect(SAMPLE_PROJECTS.map((sample) => sample.key)).toEqual(['lofi', 'synthwave', 'waltz']);
  });

  it('gives every sample a Korean and English name', () => {
    for (const sample of SAMPLE_PROJECTS) {
      expect(sample.name.length).toBeGreaterThan(2);
      expect(sample.nameKo.length).toBeGreaterThan(1);
      expect(sample.blurbKo.length).toBeGreaterThan(5);
      expect(sample.blurbEn.length).toBeGreaterThan(5);
    }
    expect(sampleProjectNames('ko')[0]).toBe('로파이 칠 그루브');
  });

  it('lays every loop exactly on the bar grid', () => {
    for (const sample of SAMPLE_PROJECTS) {
      const project = sample.build();
      const frames = Math.round(
        loopSeconds(project.bpm, project.beatsPerBar, project.beatUnit, project.bars) * 44100,
      );
      expect(project.bpm).toBe(sample.bpm);
      expect(project.tracks.length).toBe(sample.trackCount);
      for (const track of project.tracks) {
        expect(track.buffer).not.toBeNull();
        expect(track.buffer!.sampleRate).toBe(44100);
        expect(track.buffer!.channels[0].length).toBe(frames);
      }
    }
  });

  it('renders audible, unclipped material', () => {
    for (const sample of SAMPLE_PROJECTS) {
      const project = sample.build();
      for (const track of project.tracks) {
        const peaks = loopPeaks(track.buffer, 64);
        const loudest = Math.max(...peaks);
        expect(loudest, `${sample.key} ${track.name}`).toBeGreaterThan(0.03);
        expect(loudest, `${sample.key} ${track.name}`).toBeLessThanOrEqual(0.92);
      }
    }
  });

  it('renders deterministically, so save/load and tests agree', () => {
    const a = sampleByKey('lofi')!.build();
    const b = sampleByKey('lofi')!.build();
    for (let index = 0; index < a.tracks.length; index += 1) {
      const left = a.tracks[index].buffer!.channels[0];
      const right = b.tracks[index].buffer!.channels[0];
      for (let i = 0; i < 4000; i += 1) expect(left[i]).toBe(right[i]);
    }
  });

  it('uses the signatures the demos promise', () => {
    expect(sampleByKey('waltz')!.build().beatsPerBar).toBe(3);
    expect(sampleByKey('synthwave')!.build().beatsPerBar).toBe(4);
    expect(sampleByKey('lofi')!.build().bars).toBe(2);
  });

  it('returns undefined for an unknown key', () => {
    expect(sampleByKey('none')).toBeUndefined();
  });
});
