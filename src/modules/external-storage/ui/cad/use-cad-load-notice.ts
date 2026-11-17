'use client';

import { useEffect, useState } from 'react';
import { classifyLoadWait, type LoadWait } from './cad-load-activity';

/** Resets when `progressToken` changes, so a moving download stays "working". */
export function useCadLoadNotice(active: boolean, progressToken: number | string | null, failed: boolean): LoadWait {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const reset = window.setTimeout(() => setElapsed(0), 0);
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 1000);
    return () => {
      window.clearTimeout(reset);
      window.clearInterval(timer);
    };
  }, [active, progressToken]);
  if (!active) return failed ? 'failed' : 'working';
  return classifyLoadWait(elapsed, failed);
}
