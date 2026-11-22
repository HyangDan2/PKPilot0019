import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { loopSeconds } from '../audio/clock';
import { SAMPLE_PROJECTS } from '../audio/sampleProjects';
import { MAX_TRACKS, MIN_TRACKS } from '../audio/types';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconFolder, IconMinus, IconPlus, IconSave, IconSpark } from './Icons';

/**
 * The project bar: the surface home of everything that is about the project
 * itself — name, sample projects, new/save/open, track count. These used to be
 * buried two levels deep inside the export modal, so a first-time user could
 * not even find the samples on a phone.
 */
export function ProjectBar(): JSX.Element {
  const state = useStudio();
  const { lang, project } = state;
  const seconds = loopSeconds(project.bpm, project.beatsPerBar, project.beatUnit, project.bars);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setSamplesOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setSamplesOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div className="project-bar">
      <div className="project-id">
        <input
          className="project-name"
          value={project.name}
          onChange={(event) => studio.setProjectName(event.target.value)}
          placeholder={t(lang, 'project.namePlaceholder')}
          aria-label={t(lang, 'project.name')}
        />
        <span className="project-meta tabular">
          <span className="meta-bpm">{project.bpm} BPM</span>
          <span className="dot-sep" />
          <span className="meta-sig">
            {project.beatsPerBar}/{project.beatUnit}
          </span>
          <span className="dot-sep" />
          <span className="meta-bars">
            {project.bars} {t(lang, 'common.bars')}
          </span>
          <span className="dot-sep meta-extra" />
          <span className="meta-extra">
            {seconds.toFixed(2)} {t(lang, 'common.seconds')}
          </span>
          <span className="dot-sep meta-tracks" />
          <span className="meta-tracks">
            {project.tracks.length} {t(lang, 'sample.tracks')}
          </span>
        </span>
      </div>

      <div className="project-actions">
        <div className="samples-wrap" ref={wrapRef}>
          <button
            type="button"
            className={`pb-btn primary ${samplesOpen ? 'on' : ''}`}
            onClick={() => setSamplesOpen((value) => !value)}
            aria-expanded={samplesOpen}
            title={t(lang, 'project.samplesHint')}
          >
            <IconSpark size={14} />
            {t(lang, 'project.samples')}
          </button>
          {samplesOpen && (
            <div className="samples-pop" role="dialog" aria-label={t(lang, 'project.samples')}>
              <div className="pop-head">
                <h3>{t(lang, 'project.samples')}</h3>
                <p>{t(lang, 'project.samplesHint')}</p>
              </div>
              <div className="samples-list">
                {SAMPLE_PROJECTS.map((sample) => (
                  <button
                    key={sample.key}
                    type="button"
                    className={`sample-option ${state.sampleKey === sample.key ? 'on' : ''}`}
                    onClick={() => {
                      void studio.loadSample(sample.key);
                      setSamplesOpen(false);
                    }}
                  >
                    <span className="sample-option-name">
                      {lang === 'ko' ? sample.nameKo : sample.name}
                    </span>
                    <span className="sample-option-meta tabular">
                      {sample.bpm} BPM · {sample.bars} {t(lang, 'common.bars')} · {sample.trackCount}{' '}
                      {t(lang, 'sample.tracks')}
                    </span>
                    <span className="sample-option-blurb">
                      {lang === 'ko' ? sample.blurbKo : sample.blurbEn}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="pb-btn"
          onClick={() => void studio.newProject()}
          title={t(lang, 'project.newHint')}
        >
          <IconPlus size={14} />
          {t(lang, 'project.new')}
        </button>
        <button
          type="button"
          className="pb-btn"
          onClick={() => studio.saveProjectFile()}
          title={t(lang, 'project.saveHint')}
        >
          <IconSave size={14} />
          {t(lang, 'project.save')}
        </button>
        <button
          type="button"
          className="pb-btn"
          onClick={() => fileRef.current?.click()}
          title={t(lang, 'project.openHint')}
        >
          <IconFolder size={14} />
          {t(lang, 'project.open')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.lps.json,application/json"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void studio.openProjectFile(file);
            event.target.value = '';
          }}
        />

        <div className="pb-tracks d-only">
          <button
            type="button"
            className="pb-icon"
            onClick={() => studio.addTrack()}
            disabled={project.tracks.length >= MAX_TRACKS}
            title={t(lang, 'track.add')}
            aria-label={t(lang, 'track.add')}
          >
            <IconPlus size={15} />
          </button>
          <button
            type="button"
            className="pb-icon"
            onClick={() => studio.removeTrack()}
            disabled={project.tracks.length <= MIN_TRACKS}
            title={t(lang, 'track.remove')}
            aria-label={t(lang, 'track.remove')}
          >
            <IconMinus size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
