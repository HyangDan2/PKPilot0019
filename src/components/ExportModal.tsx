import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { SAMPLE_PROJECTS } from '../audio/sampleProjects';
import { webmSupported } from '../audio/render';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconDownload, IconFolder, IconSave, IconSpark } from './Icons';

export function ExportModal(): JSX.Element {
  const state = useStudio();
  const { lang, exportState: es, project } = state;
  const [tab, setTab] = useState<'export' | 'project'>('export');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const webm = webmSupported();
  const loops = project.tracks.filter((track) => !!track.buffer).length;

  return (
    <>
      <div className="tabs modal-tabs">
        <button type="button" className={tab === 'export' ? 'on' : ''} onClick={() => setTab('export')}>
          {t(lang, 'dock.export')}
        </button>
        <button type="button" className={tab === 'project' ? 'on' : ''} onClick={() => setTab('project')}>
          {t(lang, 'project.title')}
        </button>
      </div>

      {tab === 'export' ? (
        <>
          <section className="io-block">
            <h3>{t(lang, 'export.format')}</h3>
            <div className="seg wide">
              {(['wav', 'mp3', 'webm'] as const).map((format) => (
                <button
                  key={format}
                  type="button"
                  className={es.format === format ? 'on' : ''}
                  disabled={format === 'webm' && !webm}
                  onClick={() => studio.setExportState({ format })}
                >
                  {format === 'wav' ? 'WAV' : format === 'mp3' ? 'MP3' : 'WebM'}
                </button>
              ))}
            </div>
            {es.format === 'webm' && !webm && <p className="hint warn">{t(lang, 'export.webmUnsupported')}</p>}

            {es.format === 'wav' && (
              <div className="inline-row">
                <span className="field-label">{t(lang, 'export.bitDepth')}</span>
                <div className="seg">
                  {([16, 24] as const).map((depth) => (
                    <button
                      key={depth}
                      type="button"
                      className={es.bitDepth === depth ? 'on' : ''}
                      onClick={() => studio.setExportState({ bitDepth: depth })}
                    >
                      {depth}-bit
                    </button>
                  ))}
                </div>
              </div>
            )}
            {es.format === 'mp3' && (
              <div className="inline-row">
                <span className="field-label">{t(lang, 'export.bitrate')}</span>
                <div className="seg">
                  {([128, 192, 320] as const).map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      className={es.bitrate === rate ? 'on' : ''}
                      onClick={() => studio.setExportState({ bitrate: rate })}
                    >
                      {rate}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="inline-row">
              <span className="field-label">{t(lang, 'export.sampleRate')}</span>
              <div className="seg">
                {([44100, 48000] as const).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={es.sampleRate === rate ? 'on' : ''}
                    onClick={() => studio.setExportState({ sampleRate: rate })}
                  >
                    {(rate / 1000).toFixed(1)} kHz
                  </button>
                ))}
              </div>
            </div>

            <div className="inline-row">
              <span className="field-label">{t(lang, 'export.mode')}</span>
              <div className="seg">
                <button
                  type="button"
                  className={!es.stems ? 'on' : ''}
                  onClick={() => studio.setExportState({ stems: false })}
                >
                  {t(lang, 'export.mix')}
                </button>
                <button
                  type="button"
                  className={es.stems ? 'on' : ''}
                  onClick={() => studio.setExportState({ stems: true })}
                >
                  {t(lang, 'export.stems')} ({loops})
                </button>
              </div>
            </div>
            <p className="hint">{t(lang, 'export.note')}</p>
          </section>

          <button
            type="button"
            className="primary-btn wide"
            onClick={() => void studio.renderExport()}
            disabled={es.rendering || loops === 0}
          >
            {es.rendering ? `${t(lang, 'export.rendering')} ${Math.round(es.progress * 100)}%` : t(lang, 'export.render')}
          </button>
          {es.rendering && (
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${Math.round(es.progress * 100)}%` }} />
            </div>
          )}
          {loops === 0 && <p className="hint warn">{t(lang, 'export.empty')}</p>}

          {es.files.length > 0 && (
            <section className="io-block">
              <h3>{t(lang, 'export.download')}</h3>
              <ul className="file-list">
                {es.files.map((file) => (
                  <li key={file.name}>
                    <span className="file-name">{file.name}</span>
                    <span className="tabular file-size">{Math.max(1, Math.round(file.blob.size / 1024))} KB</span>
                    <button
                      type="button"
                      className="ghost-btn"
                      onClick={() => {
                        const url = URL.createObjectURL(file.blob);
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = file.name;
                        anchor.click();
                        window.setTimeout(() => URL.revokeObjectURL(url), 4000);
                      }}
                      aria-label={file.name}
                    >
                      <IconDownload size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="primary-btn wide" onClick={() => studio.downloadAll()}>
                <IconDownload size={15} />
                {t(lang, 'export.download')}
              </button>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="io-block">
            <h3>{t(lang, 'project.title')}</h3>
            <label className="name-field">
              <span className="field-label">{t(lang, 'project.name')}</span>
              <input
                className="text-input"
                value={project.name}
                placeholder={t(lang, 'project.namePlaceholder')}
                onChange={(event) => studio.setProjectName(event.target.value)}
              />
            </label>
            <div className="button-row">
              <button type="button" className="ghost-btn" onClick={() => void studio.newProject()}>
                <IconSpark size={14} />
                {t(lang, 'project.new')}
              </button>
              <button type="button" className="ghost-btn" onClick={() => studio.saveProjectFile()}>
                <IconSave size={14} />
                {t(lang, 'project.save')}
              </button>
              <button type="button" className="ghost-btn" onClick={() => fileRef.current?.click()}>
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
            </div>
          </section>

          <section className="io-block">
            <h3>{t(lang, 'project.samples')}</h3>
            <p className="hint">{t(lang, 'project.samplesHint')}</p>
            <div className="sample-cards">
              {SAMPLE_PROJECTS.map((sample) => (
                <button
                  key={sample.key}
                  type="button"
                  className={`sample-card ${state.sampleKey === sample.key ? 'on' : ''}`}
                  onClick={() => void studio.loadSample(sample.key)}
                >
                  <span className="sample-name">{lang === 'ko' ? sample.nameKo : sample.name}</span>
                  <span className="sample-blurb">{lang === 'ko' ? sample.blurbKo : sample.blurbEn}</span>
                  <span className="sample-load">{t(lang, 'project.samples')} →</span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
