import { useEffect, useRef } from 'react';
import { engine } from '../audio/engine';
import { studio } from '../store/studio';

const NOTE_KEYS: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
};

const PAD_KEYS: Record<string, number> = {
  '1': 0,
  '2': 1,
  '3': 2,
  '4': 3,
  '5': 4,
  '6': 5,
  '7': 6,
  '8': 7,
};

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    element.isContentEditable === true
  );
}

/** QWERTY keys play the synth, 1–8 fire the drum pads, Space and R drive the transport. */
export function useInstrumentKeyboard(enabled: boolean): void {
  const held = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    const onDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) studio.toggleTransport();
        return;
      }
      if (key === 'r') {
        if (!event.repeat) void studio.recordTrack(studio.getSnapshot().selectedTrack);
        return;
      }
      if (PAD_KEYS[key] !== undefined) {
        if (!event.repeat) engine.triggerDrum(PAD_KEYS[key], 0.85);
        return;
      }
      if (NOTE_KEYS[key] !== undefined && !held.current.has(key)) {
        held.current.add(key);
        engine.noteOn(60 + NOTE_KEYS[key], 0.85);
      }
    };
    const onUp = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (NOTE_KEYS[key] !== undefined && held.current.has(key)) {
        held.current.delete(key);
        engine.noteOff(60 + NOTE_KEYS[key]);
      }
    };
    const onBlur = (): void => {
      for (const key of held.current) engine.noteOff(60 + NOTE_KEYS[key]);
      held.current.clear();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [enabled]);
}
