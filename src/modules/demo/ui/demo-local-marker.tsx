'use client';

import { useEffect } from 'react';

export function DemoLocalMarker() {
  useEffect(() => {
    document.documentElement.dataset.exlfyDemo = 'session';
    return () => {
      delete document.documentElement.dataset.exlfyDemo;
    };
  }, []);
  return null;
}
