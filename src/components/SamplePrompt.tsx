import type { JSX } from 'react';
import { SAMPLE_PROJECTS } from '../audio/sampleProjects';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconSpark } from './Icons';

/**
 * The empty-session first step, identical on desktop and phone: one compact row
 * of the three sample projects, one tap each. It sits in the stage's blank
 * space and disappears the moment a track has audio, so the loop ring gets the
 * whole stage. The full name/save/open drawer is one folder tap away.
 */
export function SamplePrompt({ inDeck = false }: { inDeck?: boolean }): JSX.Element {
  const state = useStudio();
  const lang = state.lang;

  return (
    <section className={`sample-quick ${inDeck ? 'in-deck' : ''}`} aria-label={t(lang, 'project.samples')}>
      <div className="sample-quick-head">
        <IconSpark size={14} />
        <h2>{t(lang, 'sample.cta')}</h2>
      </div>
      <div className="sample-quick-chips">
        {SAMPLE_PROJECTS.map((sample) => (
          <button
            key={sample.key}
            type="button"
            className={`sample-chip ${state.sampleKey === sample.key ? 'on' : ''}`}
            onClick={() => void studio.loadSample(sample.key)}
            title={lang === 'ko' ? sample.blurbKo : sample.blurbEn}
            aria-label={`${lang === 'ko' ? sample.nameKo : sample.name} — ${sample.bpm} BPM, ${sample.bars} ${t(lang, 'common.bars')}`}
          >
            <span className="sample-chip-name">{lang === 'ko' ? sample.nameKo : sample.name}</span>
            <span className="sample-chip-meta tabular">
              {sample.bpm} BPM · {sample.bars} {t(lang, 'common.bars')}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
