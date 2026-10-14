'use client';

import { useEffect } from 'react';

export interface TaskShortcutHandlers {
  readonly onNew?: () => void;
  readonly onFocusSearch?: () => void;
  readonly onEditSelected?: () => void;
  readonly onNext?: () => void;
  readonly onPrevious?: () => void;
  readonly onClose?: () => void;
  readonly onShowHelp?: () => void;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable === true;
}

export function useTaskShortcuts(handlers: TaskShortcutHandlers, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key === '?' && handlers.onShowHelp) {
        event.preventDefault();
        handlers.onShowHelp();
        return;
      }
      if (event.key === 'Escape' && handlers.onClose) {
        handlers.onClose();
        return;
      }
      if (key === 'n' && handlers.onNew) {
        event.preventDefault();
        handlers.onNew();
        return;
      }
      if (key === '/' && handlers.onFocusSearch) {
        event.preventDefault();
        handlers.onFocusSearch();
        return;
      }
      if (key === 'e' && handlers.onEditSelected) {
        event.preventDefault();
        handlers.onEditSelected();
        return;
      }
      if (key === 'j' && handlers.onNext) {
        event.preventDefault();
        handlers.onNext();
        return;
      }
      if (key === 'k' && handlers.onPrevious) {
        event.preventDefault();
        handlers.onPrevious();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, handlers]);
}
