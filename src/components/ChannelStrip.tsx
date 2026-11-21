import { useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { JSX } from 'react';
import { engine } from '../audio/engine';
import type { TrackData } from '../audio/types';
import type { TrackRuntime } from '../audio/engine';
import { TRACK_TINTS } from '../audio/types';
import { peaksFor } from '../lib/peaks';
import { studio } from '../store/studio';
import { t } from '../i18n';
import { LoopRing } from './LoopRing';
import { IconOverdub, IconPlay, IconRecord, IconStop, IconUndo } from './Icons';

export interface ChannelStripProps {
  track: TrackData;
  runtime: TrackRuntime;
  selected: boolean;
  lang: 'ko' | 'en';
}

export function ChannelStrip({ track, runtime, selected, lang }: ChannelStripProps): JSX.Element {
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const tint = TRACK_TINTS[(track.id - 1) % TRACK_TINTS.length];
  const peaks = peaksFor(track.buffer, 64);
  const recording = runtime.status === 'REC' || runtime.status === 'OVERDUB' || runtime.status === 'COUNT-IN';
  const hasLoop = !!track.buffer;

  const onDrop = (event: DragEvent): void => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void studio.importFile(track.id, file);
  };

  return (
    <article
      className={`strip ${selected ? 'is-selected' : ''} ${dragging ? 'is-dropping' : ''}`}
      style={{ ['--tint' as string]: tint }}
      onPointerDown={() => studio.selectTrack(track.id)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      data-track={track.id}
    >
      <div className="strip-head">
        <span className="strip-index">T{track.id}</span>
        <input
          className="strip-name"
          value={track.name}
          aria-label={`${t(lang, 'track.label')} ${track.id}`}
          onChange={(event) => studio.setTrackName(track.id, event.target.value)}
        />
        <span className="strip-source" title={t(lang, 'track.input')}>
          {track.source}
        </span>
      </div>

      <div className="strip-stage">
        <LoopRing
          size={188}
          progress={runtime.progress}
          status={runtime.status}
          peaks={peaks}
          trackId={track.id}
          bars={engine.getTimeSignature().beatsPerBar}
        />
        <div className="strip-state-line">
          <span className={`state-pill state-${runtime.status.toLowerCase()}`}>
            {t(lang, {
              EMPTY: 'track.empty',
              ARMED: 'track.armed',
              'COUNT-IN': 'track.countIn',
              REC: 'track.rec',
              PLAY: 'track.play',
              OVERDUB: 'track.overdub',
              STOPPED: 'track.stopped',
            }[runtime.status])}
          </span>
          <button
            type="button"
            className={`arm-toggle ${track.armed ? 'on' : ''}`}
            onClick={() => studio.armTrack(track.id, !track.armed)}
            title={track.armed ? t(lang, 'track.disarm') : t(lang, 'track.arm')}
          >
            {t(lang, 'track.arm')}
          </button>
        </div>
      </div>

      <div className="strip-transport">
        <button
          type="button"
          className={`pad-btn rec ${runtime.status === 'REC' ? 'live' : ''}`}
          onClick={() => void (recording ? studio.stopRecording(track.id) : studio.recordTrack(track.id))}
          title={t(lang, 'track.recButton')}
        >
          <IconRecord size={14} />
          <span>REC</span>
        </button>
        <button
          type="button"
          className={`pad-btn play ${runtime.status === 'PLAY' ? 'live' : ''}`}
          onClick={() => void studio.toggleTrackPlay(track.id)}
          disabled={!hasLoop}
          title={t(lang, 'track.playButton')}
        >
          <IconPlay size={14} />
          <span>PLAY</span>
        </button>
        <button
          type="button"
          className={`pad-btn overdub ${runtime.status === 'OVERDUB' ? 'live' : ''}`}
          onClick={() => void (recording ? studio.stopRecording(track.id) : studio.recordTrack(track.id))}
          disabled={!hasLoop}
          title={t(lang, 'track.overdubButton')}
        >
          <IconOverdub size={14} />
          <span>OVERDUB</span>
        </button>
        <button
          type="button"
          className="pad-btn stop"
          onClick={() => {
            if (recording) studio.stopRecording(track.id);
            else studio.stopTrack(track.id);
          }}
          title={t(lang, 'track.stopButton')}
        >
          <IconStop size={14} />
          <span>STOP</span>
        </button>
      </div>

      <div className="strip-tools">
        <button
          type="button"
          className="ghost-btn"
          onClick={() => studio.undoOverdub(track.id)}
          disabled={!runtime.canUndo}
          title={t(lang, 'track.undoButton')}
        >
          <IconUndo size={14} />
          <span>Undo</span>
        </button>
        <button
          type="button"
          className="ghost-btn danger"
          onClick={() => void studio.clearTrack(track.id)}
          disabled={!hasLoop && runtime.status === 'EMPTY'}
          title={t(lang, 'track.clearButton')}
        >
          CLEAR
        </button>
        <div className="ms-group">
          <button
            type="button"
            className={`ms-btn ${track.mute ? 'on mute' : ''}`}
            onClick={() => studio.setTrackMute(track.id, !track.mute)}
            title={t(lang, 'track.mute')}
          >
            M
          </button>
          <button
            type="button"
            className={`ms-btn ${track.solo ? 'on solo' : ''}`}
            onClick={() => studio.setTrackSolo(track.id, !track.solo)}
            title={t(lang, 'track.solo')}
          >
            S
          </button>
        </div>
      </div>

      <div className="strip-level">
        <div className="fader-wrap">
          <span className="fader-label">{t(lang, 'track.volume')}</span>
          <input
            type="range"
            className="fader"
            min={0}
            max={100}
            value={Math.round(track.volume * 100)}
            onChange={(event) => studio.setTrackVolume(track.id, Number(event.target.value) / 100)}
            aria-label={`${track.name} ${t(lang, 'track.volume')}`}
          />
          <span className="tabular fader-value">{Math.round(track.volume * 100)}</span>
        </div>
        <div className="pan-wrap">
          <span className="fader-label">{t(lang, 'track.pan')}</span>
          <input
            type="range"
            className="pan"
            min={-100}
            max={100}
            value={Math.round(track.pan * 100)}
            onChange={(event) => studio.setTrackPan(track.id, Number(event.target.value) / 100)}
            aria-label={`${track.name} ${t(lang, 'track.pan')}`}
          />
          <span className="tabular fader-value">
            {Math.abs(track.pan) < 0.02 ? 'C' : track.pan < 0 ? `L${Math.round(-track.pan * 100)}` : `R${Math.round(track.pan * 100)}`}
          </span>
        </div>
      </div>

      <button
        type="button"
        className="strip-file"
        onClick={() => fileInput.current?.click()}
        title={t(lang, 'toast.dropHint')}
      >
        {track.buffer ? `${t(lang, 'common.sample')} · ${track.buffer.channels.length}ch` : t(lang, 'toast.dropHint')}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,.wav,.mp3,.ogg,.m4a,.flac"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void studio.importFile(track.id, file);
          event.target.value = '';
        }}
      />
    </article>
  );
}
