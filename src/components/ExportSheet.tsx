import type { JSX } from 'react';
import { webmSupported } from '../audio/render';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { Sheet } from './Overlay';
import { IconDownload } from './Icons';

/**
 * Export only. New project / save / open / samples moved out to the project bar,
 * so this sheet no longer hides project management behind a second tab.
 */
export function ExportSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const state = useStudio();
  const { lang, exportState: es, project } = state;
  const webm = webmSupported();
  const loops = project.tracks.filter((track) => !!track.buffer).length;
  const ready = es.files.length > 0;

  return (
    <Sheet
      title={t(lang, 'dock.exportTitle')}
      variant="center"
      wide
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary-btn wide"
          onClick={() => void studio.renderExport()}
          disabled={es.rendering || loops === 0}
        >
          {es.rendering
            ? `${t(lang, 'export.rendering')} ${Math.round(es.progress * 100)}%`
            : t(lang, 'export.render')}
        </button>
      }
    >
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
        {loops === 0 && <p className="hint warn">{t(lang, 'export.empty')}</p>}
      </section>

      {es.rendering && (
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.round(es.progress * 100)}%` }} />
        </div>
      )}

      {ready && (
        <section className="io-block">
          <h3>{t(lang, 'export.files')}</h3>
          <p className="hint">{t(lang, 'export.doneHint')}</p>
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
                  aria-label={`${t(lang, 'export.download')} ${file.name}`}
                >
                  <IconDownload size={14} />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="primary-btn wide" onClick={() => studio.downloadAll()}>
            <IconDownload size={15} />
            {t(lang, 'export.downloadAll')}
          </button>
        </section>
      )}
    </Sheet>
  );
}
