import type { WheelEvent } from 'react';

/** A focused select changes its value when the wheel scrolls. Blur it so the page scrolls instead. */
export function blurSelectOnWheel(event: WheelEvent<HTMLSelectElement>): void {
  if (event.ctrlKey || event.metaKey) return;
  event.currentTarget.blur();
}
