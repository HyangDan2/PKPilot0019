import type { JSX } from 'react';
import { loopSeconds } from '../audio/clock';
import { SAMPLE_PROJECTS } from '../audio/sampleProjects';
import { MAX_TRACKS, MIN_TRACKS } from '../audio/types';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconMinus, IconPlus, IconSpark } from './Icons';

export function StageHeader(): JSX.Element {
  const state = useStudio();
  const { lang, project } = state;
  const seconds = loopSeconds(project.bpm, project.beatsPerBar, project.beatUnit, project.bars);
  const empty = project.tracks.every((track) => !track.buffer);

  return (
    <>
      <div className="stage-head">
        <div className="stage-title">
          <input
            className="project-name"
            value={project.name}
            onChange={(event) => studio.setProjectName(event.target.value)}
            aria-label={t(lang, 'project.name')}
          />
          <div className="stage-meta tabular">
            <span>{project.bars} {t(lang, 'common.bars')}</span>
            <span className="dot-sep" />
            <span>{seconds.toFixed(2)} {t(lang, 'common.seconds')}</span>
            <span className="dot-sep" />
            <span>{project.bpm} BPM</span>
            <span className="dot-sep" />
            <span>{project.beatsPerBar}/{project.beatUnit}</span>
          </div>
        </div>
        <div className="stage-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={() => studio.addTrack()}
            disabled={project.tracks.length >= MAX_TRACKS}
            title={t(lang, 'track.add')}
          >
            <IconPlus size={14} />
            {t(lang, 'track.add')}
          </button>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => studio.removeTrack()}
            disabled={project.tracks.length <= MIN_TRACKS}
            title={t(lang, 'track.remove')}
          >
            <IconMinus size={14} />
          </button>
        </div>
      </div>

      {empty && (
        <div className="sample-strip">
          <span className="sample-strip-title">
            <IconSpark size={14} />
            {t(lang, 'project.samples')}
            <span className="sample-strip-hint">{t(lang, 'project.samplesHint')}</span>
          </span>
          <div className="sample-chips">
            {SAMPLE_PROJECTS.map((sample) => (
              <button
                key={sample.key}
                type="button"
                className="sample-chip"
                onClick={() => void studio.loadSample(sample.key)}
                title={lang === 'ko' ? sample.blurbKo : sample.blurbEn}
              >
                <span className="sample-chip-name">{lang === 'ko' ? sample.nameKo : sample.name}</span>
                <span className="sample-chip-meta tabular">{sample.bpm} BPM · {sample.bars} {t(lang, 'common.bars')}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
