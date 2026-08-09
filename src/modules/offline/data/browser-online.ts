/** Browser online check — SSR / unknown environments treat as online (server path). */
export function isBrowserOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  // jsdom / some runtimes expose navigator without a boolean onLine.
  if (typeof navigator.onLine !== 'boolean') return true;
  return navigator.onLine;
}
