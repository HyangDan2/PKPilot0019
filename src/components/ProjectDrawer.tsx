import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { loopSeconds } from '../audio/clock';
import { SAMPLE_PROJECTS } from '../audio/sampleProjects';
import { MAX_TRACKS, MIN_TRACKS } from '../audio/types';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconFolder, IconMinus, IconPlus, IconSave, IconSpark } from './Icons';

/**
 * Everything that is about the project itself, in the one drawer the folder
 * button opens. The order is the order a session is actually made in: name it,
 * then the file ({+ new · save · open}), then how many tracks, and only then the
 * sample projects — a shortcut you may never need, so they stay folded at the
 * bottom until the header is opened.
 */
export function ProjectDrawer(): JSX.Element {
  const state = useStudio();
  const { lang, project } = state;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [samplesOpen, setSamplesOpen] = useState(false);
  const seconds = loopSeconds(project.bpm, project.beatsPerBar, project.beatUnit, project.bars);

  const loadSample = (key: string): void => {
    void studio.loadSample(key);
    studio.closeDrawer();
  };

  return (
    <div className="project-drawer">
      <div className="pd-identity">
        <label className="pd-field">
          <span className="pd-label">{t(lang, 'project.name')}</span>
          <input
            className="pd-name"
            value={project.name}
            onChange={(event) => studio.setProjectName(event.target.value)}
            placeholder={t(lang, 'project.namePlaceholder')}
            aria-label={t(lang, 'project.name')}
          />
        </label>
        <p className="pd-meta tabular">
          <span>{project.bpm} BPM</span>
          <span className="pd-dot" />
          <span>
            {project.beatsPerBar}/{project.beatUnit}
          </span>
          <span className="pd-dot" />
          <span>
            {project.bars} {t(lang, 'common.bars')}
          </span>
          <span className="pd-dot" />
          <span>
            {seconds.toFixed(2)} {t(lang, 'common.seconds')}
          </span>
        </p>
      </div>

      <section className="pd-block">
        <header className="pd-block-head">
          <IconFolder size={14} />
          <h3>{t(lang, 'project.file')}</h3>
          <span className="pd-block-hint">{t(lang, 'project.fileHint')}</span>
        </header>
        <div className="pd-actions">
          <button
            type="button"
            className="pd-btn"
            onClick={() => {
              void studio.newProject();
              studio.closeDrawer();
            }}
            title={t(lang, 'project.newHint')}
          >
            <IconPlus size={14} />
            {t(lang, 'project.new')}
          </button>
          <button
            type="button"
            className="pd-btn"
            onClick={() => studio.saveProjectFile()}
            title={t(lang, 'project.saveHint')}
          >
            <IconSave size={14} />
            {t(lang, 'project.save')}
          </button>
          <button
            type="button"
            className="pd-btn"
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
            aria-label={t(lang, 'project.open')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void studio.openProjectFile(file);
              event.target.value = '';
              studio.closeDrawer();
            }}
          />
        </div>
      </section>

      <section className="pd-block pd-block-tracks">
        <header className="pd-block-head">
          <h3>{t(lang, 'project.tracks')}</h3>
          <span className="pd-block-hint">{t(lang, 'project.tracksHint')}</span>
        </header>
        <div className="pd-stepper">
          <button
            type="button"
            onClick={() => studio.removeTrack()}
            disabled={project.tracks.length <= MIN_TRACKS}
            aria-label={t(lang, 'track.remove')}
            title={t(lang, 'track.remove')}
          >
            <IconMinus size={15} />
          </button>
          <span className="pd-count tabular">{project.tracks.length}</span>
          <button
            type="button"
            onClick={() => studio.addTrack()}
            disabled={project.tracks.length >= MAX_TRACKS}
            aria-label={t(lang, 'track.add')}
            title={t(lang, 'track.add')}
          >
            <IconPlus size={15} />
          </button>
        </div>
      </section>

      <section className="pd-block pd-acc">
        <button
          type="button"
          className="pd-acc-head"
          onClick={() => setSamplesOpen((value) => !value)}
          aria-expanded={samplesOpen}
          aria-controls="pd-sample-list"
        >
          <span className={`pd-chev ${samplesOpen ? 'open' : ''}`} aria-hidden>
            ▸
          </span>
          <IconSpark size={14} />
          <span className="pd-acc-title">{t(lang, 'project.samples')}</span>
          <span className="pd-block-hint">{t(lang, 'project.samplesHint')}</span>
        </button>
        {samplesOpen && (
          <div className="pd-samples" id="pd-sample-list">
            {SAMPLE_PROJECTS.map((sample) => (
              <button
                key={sample.key}
                type="button"
                className={`pd-sample ${state.sampleKey === sample.key ? 'on' : ''}`}
                onClick={() => loadSample(sample.key)}
              >
                <span className="pd-sample-name">{lang === 'ko' ? sample.nameKo : sample.name}</span>
                <span className="pd-sample-meta tabular">
                  {sample.bpm} BPM · {sample.bars} {t(lang, 'common.bars')} · {sample.trackCount}{' '}
                  {t(lang, 'sample.tracks')}
                </span>
                <span className="pd-sample-blurb">
                  {lang === 'ko' ? sample.blurbKo : sample.blurbEn}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
