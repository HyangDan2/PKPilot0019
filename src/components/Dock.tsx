import type { JSX } from 'react';
import { t } from '../i18n';
import { studio, useStudio, type Drawer } from '../store/studio';
import { IconDownload, IconKeyboard, IconPlug, IconSliders } from './Icons';

const ITEMS: Array<{
  drawer: Exclude<Drawer, null>;
  label: string;
  hint: string;
  icon: (props: { size?: number }) => JSX.Element;
}> = [
  { drawer: 'instrument', label: 'dock.instrument', hint: 'dock.instrumentTitle', icon: IconKeyboard },
  { drawer: 'fx', label: 'dock.fx', hint: 'dock.fxTitle', icon: IconSliders },
  { drawer: 'io', label: 'dock.io', hint: 'dock.ioTitle', icon: IconPlug },
  { drawer: 'export', label: 'dock.export', hint: 'dock.exportTitle', icon: IconDownload },
];

export function Dock(): JSX.Element {
  const state = useStudio();
  const lang = state.lang;
  return (
    <nav className="dock" aria-label={t(lang, 'dock.label')}>
      {ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.drawer}
            type="button"
            className={`dock-btn ${state.drawer === item.drawer ? 'on' : ''}`}
            onClick={() => studio.openDrawer(item.drawer)}
            title={t(lang, item.hint)}
            aria-pressed={state.drawer === item.drawer}
          >
            <Icon size={17} />
            <span className="dock-label">{t(lang, item.label)}</span>
          </button>
        );
      })}
    </nav>
  );
}
