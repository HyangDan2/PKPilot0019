import { useEffect, useRef, useState } from 'react';
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
  const deckRef = useRef<HTMLDivElement | null>(null);
  const [stageSpace, setStageSpace] = useState(0);
  const info = track ? runtime.find((entry) => entry.id === track.id) : undefined;
  const status = info?.status ?? 'EMPTY';
  const emptyProject = project.tracks.every((entry) => !entry.buffer);
  const stageVisible = !(emptyProject && status === 'EMPTY');

  // Whatever a phone browser leaves after its own bars (an iPhone in Safari is
  // ~660px, an SE ~635px) has to hold the chips, the ring with its status row,
  // the pads, the mixer and the utility row without scrolling. The ring is the
  // only part that gives, so it is sized from the space the deck really has —
  // measured as the deck minus its fixed rows, never from the ring's own box,
  // so the measurement can never feed back into itself.
  useEffect(() => {
    const deck = deckRef.current;
    if (!deck) return;
    const measure = (): void => {
      const stage = deck.querySelector('.mobile-stage');
      if (!(stage instanceof HTMLElement)) {
        setStageSpace(0);
        return;
      }
      const deckStyle = getComputedStyle(deck);
      const gap = parseFloat(deckStyle.rowGap || deckStyle.gap || '0') || 0;
      const rows = [...deck.children].filter((child) => child !== stage) as HTMLElement[];
      const used = rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0);
      const stageStyle = getComputedStyle(stage);
      const padding = (parseFloat(stageStyle.paddingTop) || 0) + (parseFloat(stageStyle.paddingBottom) || 0);
      setStageSpace(Math.max(0, Math.round(deck.clientHeight - used - gap * rows.length - padding)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(deck);
    return () => observer.disconnect();
  }, [width, lang, stageVisible, project.tracks.length]);

  if (!track) return <div className="mobile-deck" ref={deckRef} />;
  const recording = status === 'REC' || status === 'OVERDUB' || status === 'COUNT-IN';
  const tint = TRACK_TINTS[(track.id - 1) % TRACK_TINTS.length];
  const ringCap = Math.max(168, Math.min(272, Math.round(width * 0.56)));
  const statusRow = 27; // track name + state badge, and the 4px gap above it
  const beatRow = 22; // BPM caption and its gap, dropped when the box is short
  const showBeat = stageSpace === 0 || stageSpace >= ringCap + statusRow + beatRow;
  const ringFloor = 88;
  const ringFit = stageSpace > 0 ? stageSpace - statusRow - (showBeat ? beatRow : 0) : ringCap;
  const ringSize = Math.min(ringCap, Math.max(ringFloor, ringFit));
  // A phone with no room at all (320x568) keeps a usable ring and lets the deck
  // scroll instead of letting the ring ride up over the track chips.
  const stageMinHeight = ringFit < ringFloor ? ringFloor + statusRow : undefined;
  const peaks = peaksFor(track.buffer, 64);

  return (
    <div className="mobile-deck" ref={deckRef}>
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
        <div className="mobile-empty">
          <SamplePrompt inDeck />
        </div>
      ) : (
        <div className="mobile-stage" style={stageMinHeight ? { minHeight: stageMinHeight } : undefined}>
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
          {showBeat && (
            <div className="mobile-beat tabular">
              {playing ? `${project.bpm} BPM · ${project.bars} ${t(lang, 'common.bars')}` : t(lang, 'transport.ready')}
            </div>
          )}
        </div>
      )}

      <div className="mobile-pads">
        <button
          type="button"
          className={`mobile-pad rec ${status === 'REC' ? 'live' : ''}`}
          aria-label={`${t(lang, 'pad.rec')} — ${track.name}`}
          onClick={() => void (recording ? studio.stopRecording(track.id) : studio.recordTrack(track.id))}
        >
          <span className="pad-main">REC</span>
          {lang === 'ko' && <span className="pad-sub">{t(lang, 'pad.rec')}</span>}
        </button>
        <button
          type="button"
          className={`mobile-pad overdub ${status === 'OVERDUB' ? 'live' : ''}`}
          aria-label={`${t(lang, 'pad.overdub')} — ${track.name}`}
          onClick={() => void (recording ? studio.stopRecording(track.id) : studio.recordTrack(track.id))}
          disabled={!track.buffer}
        >
          <span className="pad-main">OVERDUB</span>
          {lang === 'ko' && <span className="pad-sub">{t(lang, 'pad.overdub')}</span>}
        </button>
        <button
          type="button"
          className={`mobile-pad play ${status === 'PLAY' ? 'live' : ''}`}
          aria-label={`${t(lang, 'pad.play')} — ${track.name}`}
          onClick={() => void studio.toggleTrackPlay(track.id)}
          disabled={!track.buffer}
        >
          <span className="pad-main">PLAY</span>
          {lang === 'ko' && <span className="pad-sub">{t(lang, 'pad.play')}</span>}
        </button>
        <button
          type="button"
          className="mobile-pad stop"
          aria-label={`${t(lang, 'pad.stop')} — ${track.name}`}
          onClick={() => {
            if (recording) studio.stopRecording(track.id);
            else studio.stopTrack(track.id);
          }}
        >
          <span className="pad-main">STOP</span>
          {lang === 'ko' && <span className="pad-sub">{t(lang, 'pad.stop')}</span>}
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
