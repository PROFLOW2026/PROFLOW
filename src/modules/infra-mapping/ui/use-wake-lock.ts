'use client';

import { useEffect, useState } from 'react';

export type WakeLockStatus = 'idle' | 'held' | 'unsupported' | 'denied';

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
}
interface WakeLockApi {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/**
 * Keeps the screen awake while `active` (tripod mode, so the broadcasting phone does not go dark). The browser
 * drops the lock whenever the page is hidden, so it is asked for again when the page comes back.
 * Where the browser does not support it, or refuses, the status says so and the screen is simply left alone.
 */
export function useWakeLock(active: boolean): WakeLockStatus {
  const [status, setStatus] = useState<WakeLockStatus>('idle');

  useEffect(() => {
    if (!active) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reflects the external wake-lock request
      setStatus('idle');
      return undefined;
    }
    const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
    if (!api) {
      setStatus('unsupported');
      return undefined;
    }

    let cancelled = false;
    let sentinel: WakeLockSentinelLike | null = null;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== 'visible') return;
      try {
        const next = await api.request('screen');
        if (cancelled) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
        setStatus('held');
        next.addEventListener('release', () => {
          if (!cancelled) setStatus('idle');
        });
      } catch {
        if (!cancelled) setStatus('denied');
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel) void acquire();
      if (document.visibilityState !== 'visible') sentinel = null;
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active]);

  return status;
}
