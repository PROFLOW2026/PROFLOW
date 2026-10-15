const MOBILE_MAX_DPR = 2;

/** Cap DPR on narrow viewports to reduce GPU + text overlay cost on mobile. */
export function cadViewportDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  const raw = window.devicePixelRatio || 1;
  const narrow = window.matchMedia('(max-width: 768px)').matches;
  if (!narrow) return raw;
  return Math.min(raw, MOBILE_MAX_DPR);
}
