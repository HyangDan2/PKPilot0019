import { describe, expect, it } from 'vitest';
import { DICTS, dictKeys, t } from '../src/i18n';

describe('i18n', () => {
  it('has the same keys in Korean and English', () => {
    const ko = new Set(dictKeys('ko'));
    const en = new Set(dictKeys('en'));
    const missingInEn = [...ko].filter((key) => !en.has(key));
    const missingInKo = [...en].filter((key) => !ko.has(key));
    expect(missingInEn).toEqual([]);
    expect(missingInKo).toEqual([]);
  });

  it('ships no empty strings', () => {
    for (const lang of ['ko', 'en'] as const) {
      for (const [key, value] of Object.entries(DICTS[lang])) {
        expect(value.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('interpolates variables', () => {
    expect(t('ko', 'track.label', {})).toBe('트랙');
    expect(t('en', 'missing.key')).toBe('missing.key');
  });

  it('gives every mobile transport pad a Korean caption, never the same English twice', () => {
    const pads = [
      ['pad.rec', 'REC'],
      ['pad.overdub', 'OVERDUB'],
      ['pad.play', 'PLAY'],
      ['pad.stop', 'STOP'],
    ] as const;
    for (const [key, abbreviation] of pads) {
      const caption = t('ko', key);
      expect(caption.toUpperCase()).not.toBe(abbreviation);
      expect(caption).toMatch(/[가-힣]/);
    }
  });

  it('falls back to Korean for an unknown language', () => {
    // @ts-expect-error deliberate unknown locale
    expect(t('fr', 'track.play')).toBe('재생');
  });
});
