'use client';

import * as React from 'react';
import { localStorageStyleKey, type StylePreference } from './config';
import { applyStyleToDocument } from './apply-style-dom';
import { persistStylePreference } from './persist-style-client';
import { writeClientStyleCookie } from './style-cookie';
import { StylePreferenceContext } from './style-context';
import { DEFAULT_STYLE_PREFERENCE } from './config';

export function StyleProvider({
  style: serverStyle,
  userId,
  children,
}: {
  style: StylePreference;
  userId: string | null;
  children: React.ReactNode;
}) {
  const [style, setStyleState] = React.useState<StylePreference>(serverStyle);
  const [pending, startTransition] = React.useTransition();
  const [seenServerStyle, setSeenServerStyle] = React.useState(serverStyle);
  if (serverStyle !== seenServerStyle) {
    setSeenServerStyle(serverStyle);
    setStyleState(serverStyle);
  }

  React.useEffect(() => {
    applyStyleToDocument(style);
    if (!userId) return;
    try {
      localStorage.setItem(localStorageStyleKey(userId), style);
    } catch {
      /* ignore */
    }
  }, [style, userId]);

  React.useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('pf-ui');
      channel.onmessage = (event: MessageEvent<{ style?: StylePreference }>) => {
        if (!event.data?.style) return;
        setStyleState(event.data.style);
        writeClientStyleCookie(event.data.style);
        applyStyleToDocument(event.data.style);
      };
    } catch {
      channel = null;
    }
    return () => channel?.close();
  }, []);

  const setStyle = React.useCallback((next: StylePreference) => {
    setStyleState(next);
    writeClientStyleCookie(next);
    applyStyleToDocument(next);
    try {
      const channel = new BroadcastChannel('pf-ui');
      channel.postMessage({ style: next });
      channel.close();
    } catch {
      /* ignore */
    }
    startTransition(() => {
      void persistStylePreference(next);
    });
  }, []);

  const value = React.useMemo(() => ({ style, setStyle, pending }), [style, setStyle, pending]);
  return <StylePreferenceContext.Provider value={value}>{children}</StylePreferenceContext.Provider>;
}

export function clearStyleClientState(userId: string | null): void {
  writeClientStyleCookie(DEFAULT_STYLE_PREFERENCE);
  if (userId) {
    try {
      localStorage.removeItem(localStorageStyleKey(userId));
    } catch {
      /* ignore */
    }
  }
  applyStyleToDocument(DEFAULT_STYLE_PREFERENCE);
}