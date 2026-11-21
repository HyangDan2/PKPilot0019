import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { gainToDb } from '../audio/dsp';
import { tapTempo } from '../audio/clock';
import { SIGNATURES } from '../audio/types';
import { t } from '../i18n';
import { studio, useStudio, type StudioState } from '../store/studio';
import {
  IconDots,
  IconExternal,
  IconHelp,
  IconMetronome,
  IconMoon,
  IconPause,
  IconPlay,
  IconStop,
  IconSun,
  IconTap,
} from './Icons';

export interface HeaderProps {
  playing: boolean;
  master: number;
  lang: StudioState['lang'];
  onHelp: () => void;
}

export function Header({ playing, master, lang, onHelp }: HeaderProps): JSX.Element {
  const state = useStudio();
  const project = state.project;
  const [menuOpen, setMenuOpen] = useState(false);
  const taps = useRef<number[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const dark = state.theme === 'dark';
  const db = gainToDb(Math.max(0.0001, master));

  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const cycleBars = (): void => {
    const order = [1, 2, 4, 8];
    const index = order.indexOf(project.bars);
    studio.setBars(order[(index + 1) % order.length]);
  };

  const cycleSignature = (): void => {
    const index = SIGNATURES.findIndex(
      (entry) => entry.beatsPerBar === project.beatsPerBar && entry.beatUnit === project.beatUnit,
    );
    const next = SIGNATURES[(index + 1) % SIGNATURES.length];
    studio.setSignature(next.beatsPerBar, next.beatUnit);
  };

  const onTap = (): void => {
    const now = performance.now();
    taps.current = [...taps.current, now].slice(-8);
    const bpm = tapTempo(taps.current, now);
    if (bpm) studio.setBpm(bpm);
    else if (taps.current.length > 1) studio.toast(t(lang, 'toast.tapAgain'), 'warn');
  };

  return (
    <header className="transport-bar">
      <div className="brand">
        <span className="brand-mark" aria-hidden>
          <span className="mark" />
        </span>
        <span className="brand-name">HD2Lab</span>
        <span className="brand-div" aria-hidden />
        <span className="brand-app">Lýra</span>
        <span className="brand-badge">LOOP</span>
      </div>

      <div className="transport-main">
        <button
          type="button"
          className={`transport-play ${playing ? 'is-playing' : ''}`}
          onClick={() => studio.toggleTransport()}
          aria-label={t(lang, playing ? 'transport.pause' : 'transport.play')}
          title={`${t(lang, playing ? 'transport.pause' : 'transport.play')} (Space)`}
        >
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>
        <button
          type="button"
          className="transport-stop"
          onClick={() => studio.stopAll()}
          aria-label={t(lang, 'transport.stopAll')}
          title={t(lang, 'transport.stopAll')}
        >
          <IconStop size={16} />
        </button>

        <div className="sep" />

        <div className="bpm-group">
          <span className="field-label">{t(lang, 'transport.bpm')}</span>
          <div className="stepper">
            <button type="button" onClick={() => studio.setBpm(project.bpm - 1)} aria-label="-1">
              −
            </button>
            <input
              className="bpm-input tabular"
              type="number"
              min={40}
              max={220}
              value={project.bpm}
              onChange={(event) => studio.setBpm(Number(event.target.value))}
              aria-label={t(lang, 'transport.bpm')}
            />
            <button type="button" onClick={() => studio.setBpm(project.bpm + 1)} aria-label="+1">
              +
            </button>
          </div>
        </div>

        <button type="button" className="chip-btn" onClick={onTap} title={t(lang, 'transport.tapHint')}>
          <IconTap size={15} />
          <span>{t(lang, 'transport.tap')}</span>
        </button>

        <div className="field-group sig-group">
          <span className="field-label">{t(lang, 'transport.signature')}</span>
          <div className="seg">
            {SIGNATURES.map((signature) => (
              <button
                key={signature.label}
                type="button"
                className={
                  project.beatsPerBar === signature.beatsPerBar && project.beatUnit === signature.beatUnit
                    ? 'on'
                    : ''
                }
                onClick={() => studio.setSignature(signature.beatsPerBar, signature.beatUnit)}
              >
                {signature.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group bars-group">
          <span className="field-label">{t(lang, 'transport.bars')}</span>
          <div className="seg">
            {[1, 2, 4, 8].map((bars) => (
              <button
                key={bars}
                type="button"
                className={project.bars === bars ? 'on' : ''}
                onClick={() => studio.setBars(bars)}
              >
                {bars}
              </button>
            ))}
          </div>
        </div>

        <div className="mobile-fields">
          <button type="button" className="mobile-chip" onClick={cycleBars} title={t(lang, 'transport.bars')}>
            <span className="tabular">{project.bars}</span> {t(lang, 'transport.bars')}
          </button>
          <button
            type="button"
            className="mobile-chip tabular"
            onClick={cycleSignature}
            title={t(lang, 'transport.signature')}
          >
            {project.beatsPerBar}/{project.beatUnit}
          </button>
        </div>

        <button
          type="button"
          className={`toggle-btn ${project.metronome ? 'on' : ''}`}
          onClick={() => studio.setMetronome(!project.metronome)}
          title={t(lang, 'transport.metronome')}
          aria-pressed={project.metronome}
        >
          <IconMetronome size={16} />
          <span className="toggle-text">{t(lang, 'transport.metronome')}</span>
        </button>
        <button
          type="button"
          className={`toggle-btn countin ${project.countIn ? 'on' : ''}`}
          onClick={() => studio.setCountIn(!project.countIn)}
          title={t(lang, 'transport.countIn')}
          aria-pressed={project.countIn}
        >
          <span className="toggle-text">{t(lang, 'transport.countIn')}</span>
        </button>
      </div>

      <div className="transport-right">
        <div className="master-meter" title={`${t(lang, 'transport.master')} ${db.toFixed(1)} dB`}>
          <span className="field-label">{t(lang, 'transport.master')}</span>
          <div className="meter-track">
            <div className="meter-fill" style={{ width: `${Math.min(100, master * 118)}%` }} />
          </div>
          <span className="tabular meter-db">{Number.isFinite(db) ? db.toFixed(1) : '-∞'}</span>
        </div>

        <button
          type="button"
          className="icon-btn theme-btn"
          onClick={() => studio.toggleTheme()}
          title={t(lang, 'header.theme')}
          aria-label={t(lang, 'header.theme')}
        >
          {dark ? <IconSun size={17} /> : <IconMoon size={17} />}
        </button>
        <button
          type="button"
          className="lang-btn tabular"
          onClick={() => studio.toggleLang()}
          title={t(lang, 'header.lang')}
          aria-label={t(lang, 'header.lang')}
        >
          <span className={lang === 'ko' ? 'on' : ''}>KO</span>
          <span className="lang-div">|</span>
          <span className={lang === 'en' ? 'on' : ''}>EN</span>
        </button>

        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`icon-btn ${menuOpen ? 'open' : ''}`}
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={t(lang, 'header.menu')}
            aria-expanded={menuOpen}
          >
            <IconDots size={18} />
          </button>
          {menuOpen && (
            <div className="menu-pop">
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  onHelp();
                }}
              >
                <IconHelp size={15} />
                <span>{t(lang, 'header.help')}</span>
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  studio.toggleTheme();
                  setMenuOpen(false);
                }}
              >
                {dark ? <IconSun size={15} /> : <IconMoon size={15} />}
                <span>{t(lang, 'header.theme')}</span>
                <span className="menu-value tabular">{dark ? 'DARK' : 'LIGHT'}</span>
              </button>
              <button
                type="button"
                className="menu-item"
                onClick={() => {
                  studio.toggleLang();
                  setMenuOpen(false);
                }}
              >
                <span>{t(lang, 'header.lang')}</span>
                <span className="menu-value tabular">{lang === 'ko' ? 'KO' : 'EN'}</span>
              </button>
              <div className="menu-divider" />
              <span className="menu-label">{t(lang, 'header.navigation')}</span>
              <a
                className="menu-item"
                href="https://hyangdan2.github.io/"
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                <span>{t(lang, 'header.webHq')}</span>
                <IconExternal size={13} />
              </a>
              <a
                className="menu-item"
                href="https://hyangdan2.github.io/ApplicationHub/"
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                <span>{t(lang, 'header.applicationHub')}</span>
                <IconExternal size={13} />
              </a>
              <a
                className="menu-item"
                href="https://github.com/HyangDan2/PKPilot0019"
                target="_blank"
                rel="noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                <span>{t(lang, 'header.source')}</span>
                <IconExternal size={13} />
              </a>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
