import { type StylePreference } from './config';

export function applyStyleToDocument(style: StylePreference): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.pfStyle = style;
  root.dataset.pfSwitching = '';
  window.setTimeout(() => {
    delete root.dataset.pfSwitching;
  }, 32);
}