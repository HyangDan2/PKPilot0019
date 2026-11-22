import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('empty session', () => {
  it('offers the project, not the sample cards, as the way in', () => {
    expect(existsSync(resolve(root, 'src/components/SamplePrompt.tsx'))).toBe(false);
    const empty = read('src/components/EmptyStage.tsx');
    expect(empty).toContain("t(lang, 'empty.open')");
    expect(empty).toContain("studio.openDrawer('project')");
    expect(empty).not.toContain('SAMPLE_PROJECTS');
    expect(read('src/App.tsx')).toContain('<EmptyStage />');
    expect(read('src/components/MobileDeck.tsx')).toContain('<EmptyStage inDeck />');
  });
});

describe('project drawer', () => {
  it('puts the file above the track count and the samples last, folded', () => {
    const drawer = read('src/components/ProjectDrawer.tsx');
    const name = drawer.indexOf('pd-identity');
    const file = drawer.indexOf("t(lang, 'project.file')");
    const tracks = drawer.indexOf("t(lang, 'project.tracks')");
    const samples = drawer.indexOf("t(lang, 'project.samples')");
    expect(name).toBeGreaterThan(-1);
    expect(name).toBeLessThan(file);
    expect(file).toBeLessThan(tracks);
    expect(tracks).toBeLessThan(samples);
    expect(drawer).toContain('useState(false)');
    expect(drawer).toContain('aria-expanded={samplesOpen}');
  });
});
