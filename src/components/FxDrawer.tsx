import type { JSX } from 'react';
import { DEFAULT_FX, TRACK_TINTS } from '../audio/types';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';

function FxSlider({
  label,
  value,
  min,
  max,
  step = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}): JSX.Element {
  return (
    <label className="fx-slider">
      <span className="fx-name">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label}
      />
      <span className="tabular fx-value">{format(value)}</span>
    </label>
  );
}

/**
 * Track FX only: filter, delay, reverb send and the master limiter. Volume,
 * pan, Mute/Solo and CLEAR used to be duplicated here from the strip and the
 * deck; they now live in exactly one place.
 */
export function FxDrawer(): JSX.Element {
  const state = useStudio();
  const { lang, project } = state;
  const track = project.tracks.find((entry) => entry.id === state.selectedTrack) ?? project.tracks[0];
  if (!track) return <p className="hint">{t(lang, 'common.empty')}</p>;
  const fx = track.fx;

  return (
    <>
      <div className="fx-tabs-row">
        <div className="track-tabs">
          {project.tracks.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`track-tab ${entry.id === track.id ? 'on' : ''}`}
              style={{ ['--tint' as string]: TRACK_TINTS[(entry.id - 1) % TRACK_TINTS.length] }}
              onClick={() => studio.selectTrack(entry.id)}
            >
              <span className="track-tab-dot" />
              T{entry.id}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => studio.setTrackFx(track.id, { ...DEFAULT_FX })}
        >
          {t(lang, 'fx.reset')}
        </button>
      </div>

      <div className="fx-title-row">
        <h3>
          T{track.id} · {track.name}
        </h3>
      </div>

      <div className="control-block">
        <span className="block-label">{t(lang, 'fx.filter')}</span>
        <FxSlider
          label={t(lang, 'fx.highPass')}
          value={fx.hp}
          min={20}
          max={2000}
          format={(value) => (value <= 20 ? t(lang, 'fx.off') : `${value} Hz`)}
          onChange={(value) => studio.setTrackFx(track.id, { hp: value })}
        />
        <FxSlider
          label={t(lang, 'fx.lowPass')}
          value={fx.lp}
          min={400}
          max={20000}
          step={50}
          format={(value) => (value >= 20000 ? t(lang, 'fx.off') : `${Math.round(value)} Hz`)}
          onChange={(value) => studio.setTrackFx(track.id, { lp: value })}
        />
      </div>

      <div className="control-block">
        <span className="block-label">{t(lang, 'fx.delay')}</span>
        <FxSlider
          label={t(lang, 'fx.time')}
          value={fx.delayTime}
          min={20}
          max={1200}
          format={(value) => `${value} ms`}
          onChange={(value) => studio.setTrackFx(track.id, { delayTime: value })}
        />
        <FxSlider
          label={t(lang, 'fx.feedback')}
          value={Math.round(fx.delayFeedback * 100)}
          min={0}
          max={85}
          format={(value) => `${value}%`}
          onChange={(value) => studio.setTrackFx(track.id, { delayFeedback: value / 100 })}
        />
        <FxSlider
          label={t(lang, 'fx.mix')}
          value={Math.round(fx.delayMix * 100)}
          min={0}
          max={90}
          format={(value) => `${value}%`}
          onChange={(value) => studio.setTrackFx(track.id, { delayMix: value / 100 })}
        />
      </div>

      <div className="control-block">
        <span className="block-label">{t(lang, 'fx.reverbBlock')}</span>
        <FxSlider
          label={t(lang, 'fx.reverb')}
          value={Math.round(fx.reverbSend * 100)}
          min={0}
          max={100}
          format={(value) => `${value}%`}
          onChange={(value) => studio.setTrackFx(track.id, { reverbSend: value / 100 })}
        />
      </div>

      <div className="control-block">
        <span className="block-label">{t(lang, 'fx.masterBlock')}</span>
        <FxSlider
          label={t(lang, 'fx.master')}
          value={Math.round(project.masterVolume * 100)}
          min={0}
          max={100}
          format={(value) => `${value}`}
          onChange={(value) => studio.setMasterVolume(value / 100)}
        />
        <p className="hint">{t(lang, 'export.includeFx')}</p>
      </div>

      <p className="hint">{t(lang, 'fx.hint')}</p>
    </>
  );
}
