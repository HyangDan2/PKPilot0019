import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { JSX } from 'react';
import { engine, type TrackRuntime } from './audio/engine';
import { studio, useStudio } from './store/studio';
import { t } from './i18n';
import { useMediaQuery } from './hooks/useMedia';
import { useInstrumentKeyboard } from './hooks/useInstrumentKeyboard';
import { Header } from './components/Header';
import { ProjectDrawer } from './components/ProjectDrawer';
import { SamplePrompt } from './components/SamplePrompt';
import { ChannelStrip } from './components/ChannelStrip';
import { MobileDeck } from './components/MobileDeck';
import { Dock } from './components/Dock';
import { Sheet } from './components/Overlay';
import { InstrumentDrawer } from './components/InstrumentDrawer';
import { FxDrawer } from './components/FxDrawer';
import { IoSheet } from './components/IoSheet';
import { ExportSheet } from './components/ExportSheet';
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
  // 768px and up gets the channel-strip workspace (2 columns on a tablet),
  // below that the single-ring mobile deck.
  const desktop = useMediaQuery('(min-width: 768px)');
  const [frame, setFrame] = useState<Frame>(EMPTY_FRAME);
  const stripsRef = useRef<HTMLElement | null>(null);
  const [stripMore, setStripMore] = useState(false);

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

  // Six tracks on a 1024px laptop scroll sideways; fade the right edge so the
  // row reads as "more to the right" instead of "cut off".
  useEffect(() => {
    const element = stripsRef.current;
    if (!element) return;
    const check = (): void => {
      const more = element.scrollWidth - element.clientWidth - element.scrollLeft > 4;
      setStripMore(more && element.scrollWidth > element.clientWidth + 4);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(element);
    element.addEventListener('scroll', check);
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', check);
    };
  }, [desktop, state.project.tracks.length]);

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

  const emptyProject = state.project.tracks.every((track) => !track.buffer);

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
            {emptyProject && <SamplePrompt />}
            <section
              ref={stripsRef}
              className={`strips ${stripMore ? 'has-more' : ''}`}
              aria-label={t(lang, 'track.label')}
              style={{ ['--n' as string]: state.project.tracks.length }}
            >
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

      {state.drawer === 'project' && (
        <Sheet
          title={t(lang, 'project.title')}
          subtitle={t(lang, 'project.drawerHint')}
          variant="center"
          onClose={() => studio.closeDrawer()}
        >
          <ProjectDrawer />
        </Sheet>
      )}
      {state.drawer === 'instrument' && (
        <Sheet
          title={t(lang, 'dock.instrumentTitle')}
          subtitle={t(lang, 'inst.touchHint')}
          onClose={() => studio.closeDrawer()}
        >
          <InstrumentDrawer />
        </Sheet>
      )}
      {state.drawer === 'fx' && (
        <Sheet title={t(lang, 'dock.fxTitle')} onClose={() => studio.closeDrawer()}>
          <FxDrawer />
        </Sheet>
      )}
      {state.drawer === 'io' && (
        <Sheet
          title={t(lang, 'dock.ioTitle')}
          subtitle={t(lang, 'io.inputHint')}
          onClose={() => studio.closeDrawer()}
        >
          <IoSheet inputLevel={frame.input} />
        </Sheet>
      )}
      {state.drawer === 'export' && <ExportSheet onClose={() => studio.closeDrawer()} />}
      {state.helpOpen && <HelpModal onClose={() => studio.setHelp(false)} />}

      <Toast />
    </div>
  );
}
