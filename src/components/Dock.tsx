import type { JSX } from 'react';
import { t } from '../i18n';
import { studio, useStudio, type Drawer } from '../store/studio';

const ITEMS: Array<{ drawer: Exclude<Drawer, null>; emoji: string; label: string; hint: string }> = [
  { drawer: 'instrument', emoji: '🎹', label: 'dock.instrument', hint: 'dock.instrumentTitle' },
  { drawer: 'fx', emoji: '🎛️', label: 'dock.fx', hint: 'dock.fxTitle' },
  { drawer: 'io', emoji: '🔌', label: 'dock.io', hint: 'dock.ioTitle' },
  { drawer: 'export', emoji: '💾', label: 'dock.export', hint: 'dock.exportTitle' },
];

export function Dock(): JSX.Element {
  const state = useStudio();
  const lang = state.lang;
  return (
    <nav className="dock" aria-label="tools">
      {ITEMS.map((item) => (
        <button
          key={item.drawer}
          type="button"
          className={`dock-btn ${state.drawer === item.drawer ? 'on' : ''}`}
          onClick={() => studio.openDrawer(item.drawer)}
          title={t(lang, item.hint)}
        >
          <span className="dock-emoji" aria-hidden>{item.emoji}</span>
          <span className="dock-label">{t(lang, item.label)}</span>
        </button>
      ))}
    </nav>
  );
}
