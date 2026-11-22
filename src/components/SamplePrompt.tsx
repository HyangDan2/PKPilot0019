import type { JSX } from 'react';
import { SAMPLE_PROJECTS } from '../audio/sampleProjects';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconSpark } from './Icons';

/**
 * The empty-session CTA, identical on desktop and phone: three sample projects
 * with what each one contains, one tap to load. It replaces the old
 * desktop-only sample strip, which hid itself the moment there was audio and
 * never appeared on mobile at all.
 */
export function SamplePrompt({ inDeck = false }: { inDeck?: boolean }): JSX.Element {
  const state = useStudio();
  const lang = state.lang;

  return (
    <section className={`sample-hero ${inDeck ? 'in-deck' : ''}`} aria-label={t(lang, 'project.samples')}>
      <header className="sample-hero-head">
        <IconSpark size={14} />
        <h2>{t(lang, 'sample.cta')}</h2>
        <span className="sample-hero-hint">{t(lang, 'sample.ctaHint')}</span>
      </header>
      <div className="sample-hero-cards">
        {SAMPLE_PROJECTS.map((sample) => (
          <button
            key={sample.key}
            type="button"
            className={`sample-card ${state.sampleKey === sample.key ? 'on' : ''}`}
            onClick={() => void studio.loadSample(sample.key)}
            aria-label={`${lang === 'ko' ? sample.nameKo : sample.name} — ${sample.bpm} BPM, ${sample.bars} ${t(lang, 'common.bars')}`}
          >
            <span className="sample-card-name">{lang === 'ko' ? sample.nameKo : sample.name}</span>
            <span className="sample-card-meta tabular">
              {sample.bpm} BPM · {sample.bars} {t(lang, 'common.bars')} · {sample.trackCount}{' '}
              {t(lang, 'sample.tracks')}
            </span>
            <span className="sample-card-blurb">
              {lang === 'ko' ? sample.blurbKo : sample.blurbEn}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
