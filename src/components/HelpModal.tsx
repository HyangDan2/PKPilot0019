import type { JSX } from 'react';
import { t } from '../i18n';
import { useStudio } from '../store/studio';
import { Sheet } from './Overlay';

export function HelpModal({ onClose }: { onClose: () => void }): JSX.Element {
  const state = useStudio();
  const lang = state.lang;
  return (
    <Sheet
      title={t(lang, 'help.title')}
      subtitle={t(lang, 'app.subtitle')}
      variant="center"
      onClose={onClose}
    >
      <section className="io-block">
        <p className="help-text">{t(lang, 'help.intro')}</p>
        <p className="help-text">{t(lang, 'help.loop')}</p>
        <p className="help-text">{t(lang, 'help.samples')}</p>
      </section>
      <section className="io-block">
        <h3>{t(lang, 'help.keys')}</h3>
        <ul className="key-list">
          <li><kbd>Space</kbd><span>{t(lang, 'help.space')}</span></li>
          <li><kbd>R</kbd><span>{t(lang, 'help.rec')}</span></li>
          <li><kbd>A … K</kbd><span>{t(lang, 'help.qwerty')}</span></li>
          <li><kbd>1 – 8</kbd><span>{t(lang, 'help.pads')}</span></li>
        </ul>
      </section>
    </Sheet>
  );
}
