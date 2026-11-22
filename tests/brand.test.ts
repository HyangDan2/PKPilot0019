import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTS } from '../src/i18n';

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const css = readFileSync(resolve(root, 'src/styles/app.css'), 'utf8');
const header = readFileSync(resolve(root, 'src/components/Header.tsx'), 'utf8');
const meta = (attr: 'name' | 'property', key: string): string | null => {
  const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i');
  return html.match(pattern)?.[1] ?? null;
};

const FORMAL_NAME = 'Lýra — HD2Lab 멀티트랙 루프 스테이션';

describe('brand lockup', () => {
  it('uses one official name everywhere a title is written', () => {
    expect(html).toContain(`<title>${FORMAL_NAME}</title>`);
    expect(meta('property', 'og:title')).toBe(FORMAL_NAME);
    expect(meta('name', 'twitter:title')).toBe(FORMAL_NAME);
  });

  it('draws the header mark in pure CSS, never as an SVG logo', () => {
    // The web UI keeps no SVG logo: the brand mark is two skewed borders, the
    // same geometry as Web-HQ and Sigrún. Only the favicon stays an SVG file.
    expect(existsSync(resolve(root, 'src/components/BrandMark.tsx'))).toBe(false);
    expect(header).not.toContain('BrandMark');
    expect(header).not.toContain('brand-glyph');
    expect(header).toContain('<span className="brand-mark" aria-hidden>');
    expect(header).toContain('<span className="mark" />');

    const mark = /\.mark \{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
    expect(mark).toContain('width: 17px');
    expect(mark).toContain('height: 22px');
    expect(mark).toMatch(/border:\s*3px solid var\(--accent\)/);
    expect(mark).toContain('transform: skewY(-23deg)');
    const after = /\.mark::after \{([\s\S]*?)\}/.exec(css)?.[1] ?? '';
    expect(after).toContain('inset: 4px -8px -7px 4px');
  });

  it('keeps the manifest name in the same form', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.json'), 'utf8')) as {
      name: string;
      icons: Array<{ src: string }>;
    };
    expect(manifest.name).toBe(FORMAL_NAME);
    for (const icon of manifest.icons) {
      expect(existsSync(resolve(root, 'public', icon.src))).toBe(true);
    }
  });

  it('describes itself with the same sentence in meta, og and twitter', () => {
    const description = meta('name', 'description');
    expect(description).toBeTruthy();
    expect(meta('property', 'og:description')).toBe(description);
    expect(meta('name', 'twitter:description')).toBe(description);
  });

  it('ships the Open Graph locale and image alt text', () => {
    expect(meta('property', 'og:locale')).toBe('ko_KR');
    expect(meta('property', 'og:locale:alternate')).toBe('en_US');
    expect(meta('property', 'og:image:alt')).toBeTruthy();
    expect(meta('name', 'twitter:image:alt')).toBeTruthy();
    expect(meta('property', 'og:image')).toContain('?v=20261122-og2');
    expect(meta('name', 'twitter:image')).toContain('?v=20261122-og2');
  });

  it('links a complete favicon set with cache busting', () => {
    for (const file of ['favicon.ico', 'favicon.svg', 'favicon-32x32.png', 'apple-touch-icon.png']) {
      expect(existsSync(resolve(root, 'public', file)), file).toBe(true);
      expect(html, file).toContain(`./${file}?v=20261122-icons`);
    }
    expect(html).not.toContain('/PKPilot0019/favicon');
  });
});

describe('Korean copy policy', () => {
  it('keeps pro-audio terms in English in the Korean dictionary', () => {
    const ko = DICTS.ko;
    for (const key of ['fx.highPass', 'fx.lowPass', 'fx.time', 'fx.feedback', 'fx.mix', 'fx.reverb', 'fx.master']) {
      expect(ko[key], key).toMatch(/^[A-Za-z][A-Za-z -]*$/);
    }
    for (const key of ['track.recButton', 'track.playButton', 'track.overdubButton', 'track.stopButton', 'track.arm']) {
      expect(ko[key], key).toMatch(/^[A-Z][A-Z-]*$/);
    }
  });

  it('never points at a control the app does not have', () => {
    for (const lang of ['ko', 'en'] as const) {
      for (const [key, value] of Object.entries(DICTS[lang])) {
        expect(value.toLowerCase(), `${lang}:${key}`).not.toContain('play all');
      }
    }
  });
});
