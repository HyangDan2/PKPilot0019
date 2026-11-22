import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { engine } from '../audio/engine';
import { DRUM_PADS } from '../audio/drums';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconMinus, IconPlus } from './Icons';

const PRESETS: Array<{ key: 'electric' | 'pad' | 'pluck' | 'sub'; label: string }> = [
  { key: 'electric', label: 'inst.preset.electric' },
  { key: 'pad', label: 'inst.preset.pad' },
  { key: 'pluck', label: 'inst.preset.pluck' },
  { key: 'sub', label: 'inst.preset.sub' },
];
const KITS: Array<{ key: '808' | 'lofi' | 'acoustic'; label: string }> = [
  { key: '808', label: 'inst.kit.808' },
  { key: 'lofi', label: 'inst.kit.lofi' },
  { key: 'acoustic', label: 'inst.kit.acoustic' },
];
const WHITE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const BLACK_SEMITONES = [1, 3, 6, 8, 10];
const BLACK_AFTER_WHITE = [0, 1, 3, 4, 5];

export function useMidi(): 'unsupported' | 'ready' | 'connected' {
  const [status, setStatus] = useState<'unsupported' | 'ready' | 'connected'>('ready');
  useEffect(() => {
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> };
    if (!nav.requestMIDIAccess) {
      setStatus('unsupported');
      return;
    }
    let access: MIDIAccess | null = null;
    let cancelled = false;
    void nav
      .requestMIDIAccess()
      .then((midiAccess) => {
        if (cancelled) return;
        access = midiAccess;
        const bind = (): void => {
          const inputs = [...midiAccess.inputs.values()];
          for (const input of inputs) {
            input.onmidimessage = (event: MIDIMessageEvent) => {
              const data = event.data;
              if (!data || data.length < 2) return;
              const command = data[0] & 0xf0;
              const channel = data[0] & 0x0f;
              const note = data[1];
              const velocity = data[2] ?? 0;
              if (channel === 9) {
                if (command === 0x90 && velocity > 0) engine.triggerDrum(note - 36, velocity / 127);
                return;
              }
              if (command === 0x90 && velocity > 0) engine.noteOn(note, velocity / 127);
              else if (command === 0x80 || (command === 0x90 && velocity === 0)) engine.noteOff(note);
            };
          }
          setStatus(inputs.length ? 'connected' : 'ready');
        };
        bind();
        midiAccess.onstatechange = bind;
      })
      .catch(() => setStatus('unsupported'));
    return () => {
      cancelled = true;
      if (access) {
        for (const input of access.inputs.values()) input.onmidimessage = null;
        access.onstatechange = null;
      }
    };
  }, []);
  return status;
}

function Keybed({
  octave,
  velocity,
}: {
  octave: number;
  velocity: number;
}): JSX.Element {
  const [held, setHeld] = useState<Set<number>>(new Set());
  const pressing = useRef<Set<number>>(new Set());

  const press = (midi: number): void => {
    if (pressing.current.has(midi)) return;
    pressing.current.add(midi);
    engine.noteOn(midi, velocity);
    setHeld(new Set(pressing.current));
  };
  const release = (midi: number): void => {
    if (!pressing.current.has(midi)) return;
    pressing.current.delete(midi);
    engine.noteOff(midi);
    setHeld(new Set(pressing.current));
  };

  const whiteCount = 14;
  const whiteWidth = 100 / whiteCount;
  const octaveOffset = octave * 12;

  return (
    <div className="keybed" role="group" aria-label="keyboard">
      {[0, 1].map((oct) =>
        WHITE_SEMITONES.map((semitone, index) => {
          const midi = 60 + octaveOffset + oct * 12 + semitone;
          return (
            <button
              key={`w-${oct}-${semitone}`}
              type="button"
              className={`white-key ${held.has(midi) ? 'down' : ''}`}
              style={{ left: `${(oct * 7 + index) * whiteWidth}%`, width: `${whiteWidth}%` }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                press(midi);
              }}
              onPointerUp={() => release(midi)}
              onPointerCancel={() => release(midi)}
              onPointerLeave={() => release(midi)}
              aria-label={`key ${midi}`}
            />
          );
        }),
      )}
      {[0, 1].map((oct) =>
        BLACK_AFTER_WHITE.map((afterWhite, index) => {
          const semitone = BLACK_SEMITONES[index];
          const midi = 60 + octaveOffset + oct * 12 + semitone;
          return (
            <button
              key={`b-${oct}-${semitone}`}
              type="button"
              className={`black-key ${held.has(midi) ? 'down' : ''}`}
              style={{
                left: `${(oct * 7 + afterWhite) * whiteWidth + whiteWidth * 0.74}%`,
                width: `${whiteWidth * 0.52}%`,
              }}
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                press(midi);
              }}
              onPointerUp={() => release(midi)}
              onPointerCancel={() => release(midi)}
              onPointerLeave={() => release(midi)}
              aria-label={`key ${midi}`}
            />
          );
        }),
      )}
    </div>
  );
}

export function InstrumentDrawer(): JSX.Element {
  const state = useStudio();
  const lang = state.lang;
  const instrument = state.instrument;
  const midi = useMidi();
  const [velocity, setVelocity] = useState(0.85);
  const armed = state.project.tracks.find((track) => track.armed);

  return (
    <>
      <div className="tabs">
        <button
          type="button"
          className={instrument.tab === 'synth' ? 'on' : ''}
          onClick={() => studio.setInstrument({ tab: 'synth' })}
        >
          {t(lang, 'inst.synth')}
        </button>
        <button
          type="button"
          className={instrument.tab === 'drums' ? 'on' : ''}
          onClick={() => studio.setInstrument({ tab: 'drums' })}
        >
          {t(lang, 'inst.drums')}
        </button>
      </div>
      <div className={`midi-row midi-${midi}`}>
        <span className="dot" />
        {t(
          lang,
          midi === 'unsupported'
            ? 'inst.midiUnsupported'
            : midi === 'connected'
              ? 'inst.midiConnected'
              : 'inst.midiReady',
        )}
      </div>

      <div className="target-line">
        <span className="field-label">{t(lang, 'inst.target')}</span>
        <span className={`target-chip ${armed ? 'on' : ''}`}>
          {armed ? `T${armed.id} · ${armed.name}` : t(lang, 'inst.targetHint')}
        </span>
      </div>

      {instrument.tab === 'synth' ? (
        <>
          <div className="control-block">
            <span className="block-label">{t(lang, 'inst.preset')}</span>
            <div className="chip-grid">
              {PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  className={`pick-chip ${instrument.preset === preset.key ? 'on' : ''}`}
                  onClick={() => studio.setInstrument({ preset: preset.key })}
                >
                  {t(lang, preset.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="inline-row">
            <div className="octave-group">
              <span className="block-label">{t(lang, 'inst.octave')}</span>
              <div className="stepper compact">
                <button type="button" onClick={() => studio.setInstrument({ octave: Math.max(-2, instrument.octave - 1) })} aria-label="-">
                  <IconMinus size={13} />
                </button>
                <span className="tabular">{instrument.octave > 0 ? `+${instrument.octave}` : instrument.octave}</span>
                <button type="button" onClick={() => studio.setInstrument({ octave: Math.min(3, instrument.octave + 1) })} aria-label="+">
                  <IconPlus size={13} />
                </button>
              </div>
            </div>
            <button
              type="button"
              className={`toggle-btn wide ${instrument.sustain ? 'on' : ''}`}
              onClick={() => studio.setInstrument({ sustain: !instrument.sustain })}
              aria-pressed={instrument.sustain}
            >
              {t(lang, 'inst.sustain')}
            </button>
          </div>

          <div className="control-block">
            <span className="block-label">{t(lang, 'inst.keyboard')}</span>
            <div className="keybed-scroll">
              <Keybed octave={instrument.octave} velocity={velocity} />
            </div>
            <p className="hint">{t(lang, 'inst.qwertyHint')}</p>
          </div>
        </>
      ) : (
        <>
          <div className="control-block">
            <span className="block-label">{t(lang, 'inst.kit')}</span>
            <div className="chip-grid three">
              {KITS.map((kit) => (
                <button
                  key={kit.key}
                  type="button"
                  className={`pick-chip ${instrument.kit === kit.key ? 'on' : ''}`}
                  onClick={() => studio.setInstrument({ kit: kit.key })}
                >
                  {t(lang, kit.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="drum-grid">
            {DRUM_PADS.map((pad, index) => (
              <button
                key={pad}
                type="button"
                className="drum-pad"
                onPointerDown={() => engine.triggerDrum(index, velocity)}
              >
                <span className="pad-key tabular">{index + 1}</span>
                <span className="pad-name">{t(lang, `drum.${pad}`)}</span>
              </button>
            ))}
          </div>
          <p className="hint">{t(lang, 'inst.touchHint')}</p>
        </>
      )}

      <div className="control-block">
        <label className="slider-row">
          <span className="block-label">{t(lang, 'inst.velocity')}</span>
          <input
            type="range"
            min={10}
            max={100}
            value={Math.round(velocity * 100)}
            onChange={(event) => setVelocity(Number(event.target.value) / 100)}
          />
          <span className="tabular value">{Math.round(velocity * 100)}</span>
        </label>
      </div>

    </>
  );
}
