import { type DesignPreference } from './config';

export function applyDesignToDocument(design: DesignPreference): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.pfDesign = design;
}
