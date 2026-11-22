import type { JSX } from 'react';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';
import { IconFolder } from './Icons';

/**
 * The empty session's one way in. It used to list the three sample projects,
 * which made the shortcut look like the main road: the stage now says what the
 * project is waiting for and opens the project drawer, where the sample
 * projects sit folded at the bottom. It disappears the moment a track has audio.
 */
export function EmptyStage({ inDeck = false }: { inDeck?: boolean }): JSX.Element {
  const lang = useStudio().lang;

  return (
    <section className={`empty-stage ${inDeck ? 'in-deck' : ''}`} aria-label={t(lang, 'empty.open')}>
      <p className="empty-title">{t(lang, 'empty.title')}</p>
      <button type="button" className="empty-cta" onClick={() => studio.openDrawer('project')}>
        <IconFolder size={16} />
        <span>{t(lang, 'empty.open')}</span>
      </button>
      <p className="empty-hint">{t(lang, 'empty.hint')}</p>
    </section>
  );
}
