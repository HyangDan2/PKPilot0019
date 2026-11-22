import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DICTS } from '../src/i18n';

const root = resolve(__dirname, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const meta = (attr: 'name' | 'property', key: string): string | null => {
  const pattern = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i');
  return html.match(pattern)?.[1] ?? null;
};

const FORMAL_NAME = 'Lýra — HD2Lab Multi-Track Loop Station';

describe('brand lockup', () => {
  it('uses one official name everywhere a title is written', () => {
    expect(html).toContain(`<title>${FORMAL_NAME}</title>`);
    expect(meta('property', 'og:title')).toBe(FORMAL_NAME);
    expect(meta('name', 'twitter:title')).toBe(FORMAL_NAME);
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
    expect(meta('property', 'og:image')).toContain('?v=20261122-og');
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
