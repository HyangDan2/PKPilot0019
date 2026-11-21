import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import type { JSX } from 'react';
import { engine, type TrackRuntime } from './audio/engine';
import { studio, useStudio } from './store/studio';
import { t } from './i18n';
import { useMediaQuery } from './hooks/useMedia';
import { useInstrumentKeyboard } from './hooks/useInstrumentKeyboard';
import { Header } from './components/Header';
import { StageHeader } from './components/StageHeader';
import { ChannelStrip } from './components/ChannelStrip';
import { MobileDeck } from './components/MobileDeck';
import { Dock } from './components/Dock';
import { DrawerShell, Modal } from './components/Overlay';
import { InstrumentDrawer } from './components/InstrumentDrawer';
import { FxDrawer } from './components/FxDrawer';
import { IoModal } from './components/IoModal';
import { ExportModal } from './components/ExportModal';
import { HelpModal } from './components/HelpModal';
import { Toast } from './components/Toast';

interface Frame {
  playing: boolean;
  phase: number;
  bar: number;
  beat: number;
  fraction: number;
  runtime: TrackRuntime[];
  master: number;
  input: number;
  trackLevels: Record<number, number>;
}

const EMPTY_FRAME: Frame = {
  playing: false,
  phase: 0,
  bar: 1,
  beat: 1,
  fraction: 0,
  runtime: [],
  master: 0,
  input: 0,
  trackLevels: {},
};

export default function App(): JSX.Element {
  const state = useStudio();
  const lang = state.lang;
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [frame, setFrame] = useState<Frame>(EMPTY_FRAME);

  useEffect(() => {
    void studio.boot();
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (time: number): void => {
      raf = requestAnimationFrame(loop);
      if (time - last < 33) return;
      last = time;
      const position = engine.position();
      const levels = engine.levels();
      setFrame({
        playing: engine.isPlaying,
        ...position,
        runtime: engine.trackRuntime(),
        master: levels.master,
        input: levels.input,
        trackLevels: levels.tracks,
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useInstrumentKeyboard(state.booted);

  useEffect(() => {
    const api = {
      engine,
      studio,
      snapshot: () => studio.getSnapshot(),
    };
    (window as unknown as { __LYRA__: typeof api }).__LYRA__ = api;
  }, []);

  const runtimes = useMemo(() => {
    const map = new Map<number, TrackRuntime>();
    for (const item of frame.runtime) map.set(item.id, item);
    return map;
  }, [frame.runtime]);

  const runtimeFor = (id: number, hasLoop: boolean): TrackRuntime =>
    runtimes.get(id) ?? {
      id,
      status: hasLoop ? 'STOPPED' : 'EMPTY',
      progress: 0,
      hasLoop,
      canUndo: false,
    };

  const drawerTitle =
    state.drawer === 'instrument'
      ? t(lang, 'dock.instrumentTitle')
      : state.drawer === 'fx'
        ? t(lang, 'dock.fxTitle')
        : state.drawer === 'io'
          ? t(lang, 'dock.ioTitle')
          : t(lang, 'dock.exportTitle');

  const onStageDrop = (event: DragEvent): void => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const target = state.selectedTrack ?? state.project.tracks[0]?.id;
    if (target) void studio.importFile(target, file);
  };

  return (
    <div className={`app ${desktop ? 'is-desktop' : 'is-mobile'}`}>
      <Header playing={frame.playing} master={frame.master} lang={lang} onHelp={() => studio.setHelp(true)} />

      <main className="stage" onDragOver={(event) => event.preventDefault()} onDrop={onStageDrop}>
        {state.bootError === 'no-web-audio' && (
          <div className="error-banner">{t(lang, 'toast.noAudio')}</div>
        )}

        {desktop ? (
          <>
            <StageHeader />
            <section className="strips" aria-label="tracks">
              {state.project.tracks.map((track) => (
                <ChannelStrip
                  key={track.id}
                  track={track}
                  runtime={runtimeFor(track.id, !!track.buffer)}
                  selected={state.selectedTrack === track.id}
                  lang={lang}
                  level={frame.trackLevels[track.id] ?? 0}
                />
              ))}
            </section>
          </>
        ) : (
          <MobileDeck
            runtime={state.project.tracks.map((track) => runtimeFor(track.id, !!track.buffer))}
            playing={frame.playing}
          />
        )}

        <Dock />
      </main>

      {state.drawer === 'instrument' && (
        <DrawerShell title={drawerTitle} subtitle={t(lang, 'inst.touchHint')} onClose={() => studio.closeDrawer()}>
          <InstrumentDrawer onClose={() => studio.closeDrawer()} />
        </DrawerShell>
      )}
      {state.drawer === 'fx' && (
        <DrawerShell title={drawerTitle} onClose={() => studio.closeDrawer()} side={desktop ? 'right' : 'bottom'}>
          <FxDrawer />
        </DrawerShell>
      )}
      {state.drawer === 'io' && (
        <Modal title={drawerTitle} subtitle={t(lang, 'io.inputHint')} onClose={() => studio.closeDrawer()}>
          <IoModal inputLevel={frame.input} />
        </Modal>
      )}
      {state.drawer === 'export' && (
        <Modal title={drawerTitle} onClose={() => studio.closeDrawer()} wide>
          <ExportModal />
        </Modal>
      )}
      {state.helpOpen && <HelpModal onClose={() => studio.setHelp(false)} />}

      <Toast />
    </div>
  );
}
