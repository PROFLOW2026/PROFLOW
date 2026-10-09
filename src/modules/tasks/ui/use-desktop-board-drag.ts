'use client';

import { useEffect, useState } from 'react';

/** Drag-and-drop on Kanban columns — desktop with fine pointer only. */
export function useDesktopBoardDrag(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px) and (pointer: fine)');
    const update = () => setEnabled(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return enabled;
}
