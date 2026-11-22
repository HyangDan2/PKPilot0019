import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { t } from '../i18n';
import { useStudio } from '../store/studio';
import { IconClose } from './Icons';

export interface SheetProps {
  title: string;
  subtitle?: string;
  /**
   * `side`   — a tool you keep an eye on the session with (instrument, FX, I/O):
   *            right-hand sheet on desktop, bottom sheet on a phone.
   * `center` — a decision you make and close (export, help): centred dialog on
   *            desktop, same bottom sheet on a phone.
   * Both share one header, one ✕ and one scroll body, so a sheet always opens,
   * scrolls and closes the same way.
   */
  variant?: 'side' | 'center';
  wide?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function Sheet({
  title,
  subtitle,
  variant = 'side',
  wide = false,
  onClose,
  footer,
  children,
}: SheetProps): JSX.Element {
  const state = useStudio();
  const label = t(state.lang, 'common.close');

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={`overlay ${variant} ${wide ? 'wide' : ''}`}>
      <button type="button" className="overlay-scrim" aria-label={label} tabIndex={-1} onClick={onClose} />
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <span className="sheet-grip" aria-hidden />
        <header className="sheet-head">
          <div className="sheet-titles">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn sheet-close" onClick={onClose} aria-label={label} title={label}>
            <IconClose size={18} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}
