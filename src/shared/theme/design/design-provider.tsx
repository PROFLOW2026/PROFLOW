'use client';

import * as React from 'react';
import { applyDesignToDocument } from './apply-design-dom';
import { DEFAULT_DESIGN_PREFERENCE, type DesignPreference } from './config';
import { writeClientDesignCookie } from './cookie';
import { DesignPreferenceContext } from './design-context';
import { persistDesignPreference } from './persist-design-client';

export function DesignProvider({
  design: serverDesign,
  children,
}: {
  design: DesignPreference;
  children: React.ReactNode;
}) {
  const [design, setDesignState] = React.useState<DesignPreference>(serverDesign);
  const [pending, startTransition] = React.useTransition();
  const [seenServerDesign, setSeenServerDesign] = React.useState(serverDesign);
  if (serverDesign !== seenServerDesign) {
    setSeenServerDesign(serverDesign);
    setDesignState(serverDesign);
  }

  React.useEffect(() => {
    applyDesignToDocument(design);
  }, [design]);

  React.useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('pf-ui-design');
      channel.onmessage = (event: MessageEvent<{ design?: DesignPreference }>) => {
        if (!event.data?.design) return;
        setDesignState(event.data.design);
        writeClientDesignCookie(event.data.design);
        applyDesignToDocument(event.data.design);
      };
    } catch {
      channel = null;
    }
    return () => channel?.close();
  }, []);

  const setDesign = React.useCallback((next: DesignPreference) => {
    setDesignState(next);
    writeClientDesignCookie(next);
    applyDesignToDocument(next);
    try {
      const channel = new BroadcastChannel('pf-ui-design');
      channel.postMessage({ design: next });
      channel.close();
    } catch {
      /* ignore */
    }
    startTransition(() => {
      void persistDesignPreference(next);
    });
  }, []);

  const value = React.useMemo(() => ({ design, setDesign, pending }), [design, setDesign, pending]);
  return <DesignPreferenceContext.Provider value={value}>{children}</DesignPreferenceContext.Provider>;
}

export function clearDesignClientState(): void {
  writeClientDesignCookie(DEFAULT_DESIGN_PREFERENCE);
  applyDesignToDocument(DEFAULT_DESIGN_PREFERENCE);
}
