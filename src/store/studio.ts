/** Single source of truth for UI state, backed by the audio engine. */

import { useSyncExternalStore } from 'react';
import { engine } from '../audio/engine';
import { parseProjectJson, projectToJson } from '../audio/project';
import {
  downloadFile,
  renderProject,
  webmSupported,
  type ExportFile,
  type ExportOptions,
} from '../audio/render';
import { sampleByKey } from '../audio/sampleProjects';
import type { DrumKitName } from '../audio/drums';
import type { SynthPresetName } from '../audio/synth';
import { peaksFor } from '../lib/peaks';
import {
  MAX_TRACKS,
  MIN_TRACKS,
  createProject,
  defaultTrack,
  type Lang,
  type ProjectState,
  type Theme,
  type TrackData,
  type TrackFx,
} from '../audio/types';
import { t } from '../i18n';
import { loadSession, saveSession } from './storage';

export type Drawer = null | 'project' | 'instrument' | 'fx' | 'io' | 'export';

export interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'warn';
}

export interface ExportState {
  format: 'wav' | 'mp3' | 'webm';
  bitDepth: 16 | 24;
  bitrate: 128 | 192 | 320;
  sampleRate: 44100 | 48000;
  stems: boolean;
  rendering: boolean;
  progress: number;
  files: ExportFile[];
}

export interface IoState {
  devices: MediaDeviceInfo[];
  mic: 'idle' | 'granted' | 'denied';
  inputDeviceId: string;
  outputDeviceId: string;
  contextRate: number;
  outputSupported: boolean;
  sampleRateChoice: 44100 | 48000;
  channelMode: 'mono' | 'stereo';
  inputGain: number;
  processing: { echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean };
}

export interface InstrumentState {
  preset: SynthPresetName;
  kit: DrumKitName;
  octave: number;
  sustain: boolean;
  tab: 'synth' | 'drums';
}

export interface StudioState {
  booted: boolean;
  bootError: string | null;
  lang: Lang;
  theme: Theme;
  project: ProjectState;
  selectedTrack: number;
  drawer: Drawer;
  helpOpen: boolean;
  instrument: InstrumentState;
  io: IoState;
  exportState: ExportState;
  toast: Toast | null;
  sampleKey: string | null;
  busy: boolean;
}

const THEME_KEY = 'lyra.theme';
const LANG_KEY = 'lyra.lang';

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'dark' || value === 'light') return value;
  } catch {
    // ignore
  }
  return 'light';
}

function readLang(): Lang {
  try {
    const value = localStorage.getItem(LANG_KEY);
    if (value === 'en' || value === 'ko') return value;
  } catch {
    // ignore
  }
  return 'ko';
}

function applyDocumentTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0b1020' : '#fafafd');
}

class Studio {
  private state: StudioState;
  private listeners = new Set<() => void>();
  private saveTimer: number | null = null;
  private toastTimer: number | null = null;
  private toastId = 0;

  constructor() {
    const lang = readLang();
    const theme = readTheme();
    this.state = {
      booted: false,
      bootError: null,
      lang,
      theme,
      project: createProject(),
      selectedTrack: 1,
      drawer: null,
      helpOpen: false,
      instrument: { preset: 'electric', kit: '808', octave: 0, sustain: false, tab: 'synth' },
      io: {
        devices: [],
        mic: 'idle',
        inputDeviceId: '',
        outputDeviceId: '',
        contextRate: 44100,
        outputSupported: false,
        sampleRateChoice: 44100,
        channelMode: 'mono',
        inputGain: 0.9,
        processing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      },
      exportState: {
        format: 'wav',
        bitDepth: 16,
        bitrate: 192,
        sampleRate: 44100,
        stems: false,
        rendering: false,
        progress: 0,
        files: [],
      },
      toast: null,
      sampleKey: null,
      busy: false,
    };
    applyDocumentTheme(theme);
    document.documentElement.lang = lang;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioState => this.state;

  private set(patch: Partial<StudioState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }

  private setProject(project: ProjectState, patch: Partial<StudioState> = {}): void {
    this.state = { ...this.state, ...patch, project };
    for (const listener of this.listeners) listener();
    this.scheduleSave();
  }

  toast(message: string, tone: 'ok' | 'warn' = 'ok'): void {
    this.toastId += 1;
    const toast = { id: this.toastId, message, tone };
    this.set({ toast });
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      if (this.state.toast?.id === toast.id) this.set({ toast: null });
    }, 3600);
  }

  tr(key: string, vars?: Record<string, string | number>): string {
    return t(this.state.lang, key, vars);
  }

  // ── boot ────────────────────────────────────────────────────────────────

  async boot(): Promise<void> {
    if (this.state.booted) return;
    let project = this.state.project;
    let restored = false;
    try {
      const stored = await loadSession();
      if (stored) {
        project = stored;
        restored = true;
      }
    } catch {
      restored = false;
    }
    try {
      await engine.init({
        bpm: project.bpm,
        beatsPerBar: project.beatsPerBar,
        beatUnit: project.beatUnit,
        bars: project.bars,
        masterVolume: project.masterVolume,
        metronome: project.metronome,
        countIn: project.countIn,
        latencyMs: project.latencyMs,
      });
    } catch {
      this.set({ bootError: 'no-web-audio', booted: true, project });
      return;
    }
    engine.on('change', () => this.syncFromEngine());
    engine.onError((error) => {
      if (error.code === 'recorder-flush') this.toast(this.tr('toast.flushFailed'), 'warn');
      else if (error.code === 'input-switch-failed') this.toast(this.tr('toast.inputSwitchFailed'), 'warn');
    });
    await engine.loadProject(project);
    this.set({
      booted: true,
      project,
      selectedTrack: project.tracks[0]?.id ?? 1,
      io: {
        ...this.state.io,
        contextRate: engine.sampleRate,
        sampleRateChoice: (engine.sampleRate >= 48000 ? 48000 : 44100) as 44100 | 48000,
        outputSupported: engine.supportsOutputSelection(),
      },
    });
    if (restored) this.toast(this.tr('project.restored'));
    void this.refreshDevices();
  }

  private syncFromEngine(): void {
    let changed = false;
    const tracks = this.state.project.tracks.map((track) => {
      const buffer = engine.getTrackBuffer(track.id);
      const active = engine.isTrackActive(track.id);
      const source = engine.getTrackSource(track.id) ?? track.source;
      if (buffer !== track.buffer || active !== track.active || source !== track.source) {
        changed = true;
        if (buffer) peaksFor(buffer);
        return { ...track, buffer, active, source };
      }
      return track;
    });
    if (changed) this.setProject({ ...this.state.project, tracks });
  }

  private scheduleSave(): void {
    if (!this.state.booted) return;
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      try {
        // Binary IndexedDB snapshot: no sample is converted to text here.
        void saveSession(this.state.project);
      } catch {
        // autosave is best effort
      }
    }, 1600);
  }

  // ── ui ─────────────────────────────────────────────────────────────────

  setLang(lang: Lang): void {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore
    }
    this.set({ lang });
  }

  toggleLang(): void {
    this.setLang(this.state.lang === 'ko' ? 'en' : 'ko');
  }

  setTheme(theme: Theme): void {
    applyDocumentTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
    this.set({ theme });
  }

  toggleTheme(): void {
    this.setTheme(this.state.theme === 'dark' ? 'light' : 'dark');
  }

  openDrawer(drawer: Drawer): void {
    this.set({ drawer: this.state.drawer === drawer ? null : drawer });
    if (drawer === 'io') void this.refreshDevices();
  }

  closeDrawer(): void {
    this.set({ drawer: null });
  }

  setHelp(open: boolean): void {
    this.set({ helpOpen: open });
  }

  selectTrack(id: number): void {
    this.set({ selectedTrack: id });
  }

  setInstrument(patch: Partial<InstrumentState>): void {
    const instrument = { ...this.state.instrument, ...patch };
    if (patch.preset) engine.setSynthPreset(patch.preset);
    if (patch.kit) engine.setDrumKit(patch.kit);
    if (patch.octave !== undefined) engine.synth?.setOctave(patch.octave);
    if (patch.sustain !== undefined) engine.synth?.setSustain(patch.sustain);
    this.set({ instrument });
  }

  // ── transport / project settings ───────────────────────────────────────

  setBpm(bpm: number): void {
    const next = Math.max(40, Math.min(220, Math.round(bpm)));
    if (next === this.state.project.bpm) return;
    const repitched = engine.hasLoops();
    engine.setBpm(next);
    this.setProject({ ...this.state.project, bpm: next });
    if (repitched) this.toast(this.tr('toast.tempoShifted'));
  }

  setBars(bars: number): void {
    engine.setBars(bars);
    this.setProject({ ...this.state.project, bars });
  }

  setSignature(beatsPerBar: number, beatUnit: number): void {
    engine.setSignature(beatsPerBar, beatUnit);
    this.setProject({ ...this.state.project, beatsPerBar, beatUnit });
  }

  setMetronome(on: boolean): void {
    engine.setMetronome(on);
    this.setProject({ ...this.state.project, metronome: on });
  }

  setCountIn(on: boolean): void {
    engine.setCountIn(on);
    this.setProject({ ...this.state.project, countIn: on });
  }

  setLatency(ms: number): void {
    engine.setLatency(ms);
    this.setProject({ ...this.state.project, latencyMs: Math.max(-150, Math.min(150, Math.round(ms))) });
  }

  setMasterVolume(value: number): void {
    engine.setMasterVolume(value);
    this.setProject({ ...this.state.project, masterVolume: Math.max(0, Math.min(1, value)) });
  }

  setProjectName(name: string): void {
    this.setProject({ ...this.state.project, name });
  }

  toggleTransport(): void {
    engine.togglePlay();
  }

  stopAll(): void {
    engine.stop();
  }

  // ── tracks ─────────────────────────────────────────────────────────────

  private patchTrack(id: number, patch: Partial<TrackData>): void {
    const tracks = this.state.project.tracks.map((track) =>
      track.id === id ? { ...track, ...patch } : track,
    );
    this.setProject({ ...this.state.project, tracks });
  }

  setTrackVolume(id: number, volume: number): void {
    engine.setTrackSettings(id, { volume });
    this.patchTrack(id, { volume });
  }

  setTrackPan(id: number, pan: number): void {
    engine.setTrackSettings(id, { pan });
    this.patchTrack(id, { pan });
  }

  setTrackMute(id: number, mute: boolean): void {
    engine.setTrackSettings(id, { mute });
    this.patchTrack(id, { mute });
  }

  setTrackSolo(id: number, solo: boolean): void {
    engine.setTrackSettings(id, { solo });
    this.patchTrack(id, { solo });
  }

  setTrackName(id: number, name: string): void {
    this.patchTrack(id, { name });
  }

  armTrack(id: number, armed: boolean): void {
    engine.armTrack(id, armed);
    const tracks = this.state.project.tracks.map((track) => ({
      ...track,
      armed: track.id === id ? armed : false,
    }));
    this.setProject({ ...this.state.project, tracks });
  }

  setTrackFx(id: number, patch: Partial<TrackFx>): void {
    const track = this.state.project.tracks.find((entry) => entry.id === id);
    if (!track) return;
    const fx = { ...track.fx, ...patch };
    engine.setTrackSettings(id, { fx });
    this.patchTrack(id, { fx });
  }

  addTrack(): void {
    if (this.state.project.tracks.length >= MAX_TRACKS) return;
    const id = Math.max(0, ...this.state.project.tracks.map((track) => track.id)) + 1;
    const track = defaultTrack(id);
    engine.createTrack(id);
    engine.setTrackSettings(id, {
      volume: track.volume,
      pan: track.pan,
      mute: track.mute,
      solo: track.solo,
      armed: false,
      active: true,
      fx: track.fx,
    });
    this.setProject({ ...this.state.project, tracks: [...this.state.project.tracks, track] });
  }

  removeTrack(): void {
    if (this.state.project.tracks.length <= MIN_TRACKS) return;
    const last = this.state.project.tracks[this.state.project.tracks.length - 1];
    engine.removeTrack(last.id);
    const tracks = this.state.project.tracks.filter((track) => track.id !== last.id);
    this.setProject(
      { ...this.state.project, tracks },
      { selectedTrack: tracks[tracks.length - 1].id },
    );
  }

  async recordTrack(id: number): Promise<void> {
    this.selectTrack(id);
    if (!engine.ready) await this.boot();
    await engine.ensure();
    const ok = await engine.record(id);
    if (!ok) this.toast(this.tr('toast.armFirst'), 'warn');
    else this.toast(this.tr('toast.recording'));
  }

  async stopRecording(id: number): Promise<void> {
    engine.stopRecording(id);
  }

  stopTrack(id: number): void {
    engine.setTrackActive(id, false);
    this.patchTrack(id, { active: false });
  }

  /**
   * Track PLAY / STOP. The target state is decided from the project before the
   * transport is touched: starting the transport first created the track source
   * and the old toggle then read that as "already playing" and stopped it again.
   */
  async toggleTrackPlay(id: number): Promise<void> {
    await engine.ensure();
    if (!engine.getTrackBuffer(id)) return;
    if (!engine.isPlaying) {
      // With the transport stopped this button means "play this track": arm it
      // and roll the transport. Telling the engine to start the transport first
      // and toggling afterwards stopped the freshly created source again.
      engine.setTrackActive(id, true);
      this.patchTrack(id, { active: true });
      engine.play();
      return;
    }
    const current = this.state.project.tracks.find((track) => track.id === id)?.active ?? true;
    const next = !current;
    engine.setTrackActive(id, next);
    this.patchTrack(id, { active: next });
  }

  async clearTrack(id: number): Promise<void> {
    engine.clearTrack(id);
    this.patchTrack(id, { buffer: null, active: true });
    this.toast(this.tr('track.cleared'));
  }

  undoOverdub(id: number): void {
    const done = engine.undoOverdub(id);
    this.toast(done ? this.tr('track.undoDone') : this.tr('track.noUndo'), done ? 'ok' : 'warn');
  }

  async importFile(id: number, file: File): Promise<void> {
    await engine.ensure();
    const buffer = await file.arrayBuffer();
    const ok = await engine.importFile(id, buffer);
    this.toast(ok ? this.tr('toast.imported') : this.tr('toast.importFailed'), ok ? 'ok' : 'warn');
  }

  // ── project load / save ────────────────────────────────────────────────

  private hasAudio(): boolean {
    return this.state.project.tracks.some((track) => !!track.buffer);
  }

  async newProject(): Promise<void> {
    if (this.hasAudio() && !window.confirm(this.tr('project.replaceConfirm'))) return;
    const project = createProject();
    await engine.loadProject(project);
    this.setProject(project, { selectedTrack: 1, sampleKey: null });
    this.toast(this.tr('project.loaded'));
  }

  async loadSample(key: string): Promise<void> {
    const sample = sampleByKey(key);
    if (!sample) return;
    if (this.hasAudio() && !window.confirm(this.tr('project.replaceConfirm'))) return;
    const project = sample.build();
    await this.boot();
    await engine.loadProject(project);
    this.setProject(project, { selectedTrack: project.tracks[0]?.id ?? 1, sampleKey: key });
    this.toast(this.tr('project.sampleLoaded'));
  }

  saveProjectFile(): void {
    const json = projectToJson(this.state.project, true);
    const blob = new Blob([json], { type: 'application/json' });
    const name = (this.state.project.name || 'lyra-loop').trim().replace(/[\\/:*?"<>|]+/g, '');
    downloadFile({ name: `${name || 'lyra-loop'}.lps.json`, blob });
    this.toast(this.tr('project.saved'));
  }

  async openProjectFile(file: File): Promise<void> {
    try {
      const text = await file.text();
      const project = parseProjectJson(text);
      await this.boot();
      await engine.loadProject(project);
      this.setProject(project, { selectedTrack: project.tracks[0]?.id ?? 1, sampleKey: null });
      this.toast(this.tr('project.loaded'));
    } catch {
      this.toast(this.tr('project.invalid'), 'warn');
    }
  }

  // ── export ─────────────────────────────────────────────────────────────

  setExportState(patch: Partial<ExportState>): void {
    this.set({ exportState: { ...this.state.exportState, ...patch } });
  }

  async renderExport(): Promise<void> {
    if (this.state.exportState.rendering) return;
    if (!this.hasAudio()) {
      this.toast(this.tr('export.empty'), 'warn');
      return;
    }
    if (this.state.exportState.format === 'webm' && !webmSupported()) {
      this.toast(this.tr('export.webmUnsupported'), 'warn');
      return;
    }
    this.setExportState({ rendering: true, progress: 0, files: [] });
    this.set({ busy: true });
    const options: ExportOptions = {
      format: this.state.exportState.format,
      bitDepth: this.state.exportState.bitDepth,
      bitrate: this.state.exportState.bitrate,
      sampleRate: this.state.exportState.sampleRate,
      stems: this.state.exportState.stems,
    };
    try {
      const files = await renderProject(this.state.project, options, (progress) =>
        this.setExportState({ progress }),
      );
      this.setExportState({ rendering: false, progress: 1, files });
      this.toast(this.tr('export.done'));
    } catch {
      this.setExportState({ rendering: false, progress: 0 });
      this.toast(this.tr('export.webmUnsupported'), 'warn');
    } finally {
      this.set({ busy: false });
    }
  }

  downloadAll(): void {
    for (const file of this.state.exportState.files) downloadFile(file);
    this.toast(this.tr('toast.exported'));
  }

  // ── io ─────────────────────────────────────────────────────────────────

  async refreshDevices(): Promise<void> {
    const devices = await engine.listDevices();
    this.set({
      io: {
        ...this.state.io,
        devices,
        contextRate: engine.sampleRate,
        outputSupported: engine.supportsOutputSelection(),
      },
    });
  }

  async requestMic(): Promise<void> {
    await this.boot();
    const granted = await engine.requestMicrophone(this.state.io.inputDeviceId || undefined);
    this.set({ io: { ...this.state.io, mic: granted ? 'granted' : 'denied' } });
    if (granted) await this.refreshDevices();
    else this.toast(this.tr('toast.micDenied'), 'warn');
  }

  async setInputDevice(deviceId: string): Promise<void> {
    if (this.state.io.mic !== 'granted') {
      // Only remember the choice; the device is opened on the next permission ask.
      this.set({ io: { ...this.state.io, inputDeviceId: deviceId } });
      return;
    }
    const ok = await engine.requestMicrophone(deviceId || undefined);
    if (!ok) {
      // The switch failed: keep the old device selected and the mic granted.
      this.toast(this.tr('toast.inputSwitchFailed'), 'warn');
      return;
    }
    this.set({ io: { ...this.state.io, inputDeviceId: deviceId, mic: 'granted' } });
    await this.refreshDevices();
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    const ok = await engine.setOutputDevice(deviceId);
    this.set({
      io: {
        ...this.state.io,
        outputDeviceId: deviceId,
        outputSupported: engine.supportsOutputSelection() && (ok || deviceId === ''),
      },
    });
  }

  setInputGain(value: number): void {
    engine.setInputGain(value);
    this.set({ io: { ...this.state.io, inputGain: value } });
  }

  async setProcessing(patch: Partial<IoState['processing']>): Promise<void> {
    const previous = this.state.io.processing;
    const processing = { ...previous, ...patch };
    this.set({ io: { ...this.state.io, processing } });
    const ok = await engine.setProcessing(patch);
    if (!ok) {
      // The browser rejected the constraints; show what is actually in force.
      this.set({ io: { ...this.state.io, processing: previous } });
      this.toast(this.tr('toast.inputSwitchFailed'), 'warn');
    }
  }

  async setChannelMode(mode: 'mono' | 'stereo'): Promise<void> {
    const previous = this.state.io.channelMode;
    this.set({ io: { ...this.state.io, channelMode: mode } });
    const ok = await engine.setInputChannelMode(mode);
    if (!ok) {
      this.set({ io: { ...this.state.io, channelMode: previous } });
      this.toast(this.tr('toast.inputSwitchFailed'), 'warn');
    }
  }

  setSampleRateChoice(rate: 44100 | 48000): void {
    this.set({ io: { ...this.state.io, sampleRateChoice: rate } });
  }

  async restartEngine(): Promise<void> {
    await engine.restart(this.state.io.sampleRateChoice);
    this.set({
      io: {
        ...this.state.io,
        contextRate: engine.sampleRate,
        outputSupported: engine.supportsOutputSelection(),
      },
    });
  }
}

export const studio = new Studio();

export function useStudio(): StudioState {
  return useSyncExternalStore(studio.subscribe, studio.getSnapshot, studio.getSnapshot);
}
