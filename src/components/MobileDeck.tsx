import type { JSX } from 'react';
import { MIN_TRACKS, TRACK_TINTS, type TrackStatus } from '../audio/types';
import type { TrackRuntime } from '../audio/engine';
import { peaksFor } from '../lib/peaks';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { LoopRing } from './LoopRing';
import { SamplePrompt } from './SamplePrompt';
import { IconFile, IconMinus } from './Icons';
import { useViewportWidth } from '../hooks/useMedia';

const DOT: Record<TrackStatus, string> = {
  EMPTY: 'var(--muted)',
  ARMED: 'var(--accent)',
  'COUNT-IN': 'var(--accent)',
  REC: '#e0524a',
  PLAY: 'var(--tint)',
  OVERDUB: '#d98a4b',
  STOPPED: 'var(--text-secondary)',
};

export function MobileDeck({
  runtime,
  playing,
}: {
  runtime: TrackRuntime[];
  playing: boolean;
}): JSX.Element {
  const state = useStudio();
  const { lang, project } = state;
  const width = useViewportWidth();
  const track = project.tracks.find((entry) => entry.id === state.selectedTrack) ?? project.tracks[0];
  if (!track) return <div className="mobile-deck" />;
  const info = runtime.find((entry) => entry.id === track.id);
  const status = info?.status ?? 'EMPTY';
  const recording = status === 'REC' || status === 'OVERDUB' || status === 'COUNT-IN';
  const tint = TRACK_TINTS[(track.id - 1) % TRACK_TINTS.length];
  const ringSize = Math.max(168, Math.min(272, Math.round(width * 0.56)));
  const peaks = peaksFor(track.buffer, 64);
  const emptyProject = project.tracks.every((entry) => !entry.buffer);

  return (
    <div className="mobile-deck">
      <div className="chip-scroll">
        {project.tracks.map((entry) => {
          const entryInfo = runtime.find((item) => item.id === entry.id);
          const entryStatus = entryInfo?.status ?? 'EMPTY';
          return (
            <button
              key={entry.id}
              type="button"
              className={`track-chip ${entry.id === track.id ? 'on' : ''}`}
              style={{
                ['--tint' as string]: TRACK_TINTS[(entry.id - 1) % TRACK_TINTS.length],
                ['--dot' as string]: DOT[entryStatus],
              }}
              onClick={() => studio.selectTrack(entry.id)}
            >
              <span className="chip-dot" />
              <span className="chip-id">T{entry.id}</span>
              <span className="chip-name">{entry.name}</span>
              {(entry.mute || entry.solo) && (
                <span className="chip-flags">{entry.mute ? 'M' : ''}{entry.solo ? 'S' : ''}</span>
              )}
            </button>
          );
        })}
        <button type="button" className="track-chip add" onClick={() => studio.addTrack()} aria-label={t(lang, 'track.add')}>
          +
        </button>
        <button
          type="button"
          className="track-chip add"
          onClick={() => studio.removeTrack()}
          disabled={project.tracks.length <= MIN_TRACKS}
          aria-label={t(lang, 'track.remove')}
        >
          <IconMinus size={13} />
        </button>
      </div>

      {emptyProject && status === 'EMPTY' ? (
        <SamplePrompt inDeck />
      ) : (
        <div className="mobile-stage">
          <LoopRing
            size={ringSize}
            progress={info?.progress ?? 0}
            status={status}
            peaks={peaks}
            trackId={track.id}
            bars={project.beatsPerBar}
          />
          <div className="mobile-track-line">
            <span className="mobile-track-name" style={{ color: tint }}>
              T{track.id} · {track.name}
            </span>
            <span className={`state-pill state-${status.toLowerCase()}`}>
              {t(lang, { EMPTY: 'track.empty', ARMED: 'track.armed', 'COUNT-IN': 'track.countIn', REC: 'track.rec', PLAY: 'track.play', OVERDUB: 'track.overdub', STOPPED: 'track.stopped' }[status])}
            </span>
          </div>
          <div className="mobile-beat tabular">
            {playing ? `${project.bpm} BPM · ${project.bars} ${t(lang, 'common.bars')}` : t(lang, 'transport.ready')}
          </div>
        </div>
      )}

      <div className="mobile-pads">
        <button
          type="button"
          className={`mobile-pad rec ${status === 'REC' ? 'live' : ''}`}
          onClick={() => void (recording ? studio.stopRecording(track.id) : studio.recordTrack(track.id))}
        >
          <span className="pad-main">REC</span>
          <span className="pad-sub">{t(lang, 'track.rec')}</span>
        </button>
        <button
          type="button"
          className={`mobile-pad overdub ${status === 'OVERDUB' ? 'live' : ''}`}
          onClick={() => void (recording ? studio.stopRecording(track.id) : studio.recordTrack(track.id))}
          disabled={!track.buffer}
        >
          <span className="pad-main">OVERDUB</span>
          <span className="pad-sub">{t(lang, 'track.overdub')}</span>
        </button>
        <button
          type="button"
          className={`mobile-pad play ${status === 'PLAY' ? 'live' : ''}`}
          onClick={() => void studio.toggleTrackPlay(track.id)}
          disabled={!track.buffer}
        >
          <span className="pad-main">PLAY</span>
          <span className="pad-sub">{t(lang, 'track.play')}</span>
        </button>
        <button
          type="button"
          className="mobile-pad stop"
          onClick={() => {
            if (recording) studio.stopRecording(track.id);
            else studio.stopTrack(track.id);
          }}
        >
          <span className="pad-main">STOP</span>
          <span className="pad-sub">{t(lang, 'track.stopped')}</span>
        </button>
      </div>

      <div className="mobile-mixer">
        <label className="mobile-slider">
          <span>{t(lang, 'track.volume')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(track.volume * 100)}
            onChange={(event) => studio.setTrackVolume(track.id, Number(event.target.value) / 100)}
            aria-label={`${track.name} ${t(lang, 'track.volume')}`}
          />
          <span className="tabular">{Math.round(track.volume * 100)}</span>
        </label>
        <label className="mobile-slider">
          <span>{t(lang, 'track.pan')}</span>
          <input
            type="range"
            min={-100}
            max={100}
            value={Math.round(track.pan * 100)}
            onChange={(event) => studio.setTrackPan(track.id, Number(event.target.value) / 100)}
            aria-label={`${track.name} ${t(lang, 'track.pan')}`}
          />
          <span className="tabular">{Math.abs(track.pan) < 0.02 ? 'C' : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}</span>
        </label>
      </div>

      <div className="mobile-utility">
        <button
          type="button"
          className={`ms-btn ${track.armed ? 'on' : ''}`}
          onClick={() => studio.armTrack(track.id, !track.armed)}
          aria-pressed={track.armed}
        >
          ARM
        </button>
        <button type="button" className={`ms-btn ${track.mute ? 'on mute' : ''}`} onClick={() => studio.setTrackMute(track.id, !track.mute)} title={t(lang, 'track.mute')} aria-pressed={track.mute}>
          M
        </button>
        <button type="button" className={`ms-btn ${track.solo ? 'on solo' : ''}`} onClick={() => studio.setTrackSolo(track.id, !track.solo)} title={t(lang, 'track.solo')} aria-pressed={track.solo}>
          S
        </button>
        <button type="button" className="ghost-btn" onClick={() => studio.undoOverdub(track.id)} disabled={!info?.canUndo}>
          Undo
        </button>
        <button type="button" className="ghost-btn danger" onClick={() => void studio.clearTrack(track.id)} disabled={!track.buffer}>
          CLEAR
        </button>
        <button type="button" className="icon-btn file-btn" onClick={() => document.getElementById('mobile-file')?.click()} aria-label={t(lang, 'toast.dropHint')}>
          <IconFile size={17} />
        </button>
        <input
          id="mobile-file"
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void studio.importFile(track.id, file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
