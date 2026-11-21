import type { JSX } from 'react';
import { useStudio } from '../store/studio';

export function Toast(): JSX.Element | null {
  const state = useStudio();
  if (!state.toast) return null;
  return (
    <div className={`toast ${state.toast.tone}`} role="status">
      <span className="toast-dot" />
      {state.toast.message}
    </div>
  );
}
