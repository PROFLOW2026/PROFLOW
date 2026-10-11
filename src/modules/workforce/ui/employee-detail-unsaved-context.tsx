'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

type UnsavedStore = {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => boolean;
  readonly setDirty: (key: string, dirty: boolean) => void;
};

const EmployeeDetailUnsavedContext = createContext<UnsavedStore | null>(null);

export function EmployeeDetailUnsavedProvider({ children }: { readonly children: ReactNode }) {
  const dirtyKeys = useMemo(() => new Set<string>(), []);
  const listeners = useMemo(() => new Set<() => void>(), []);

  const subscribe = useCallback(
    (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    [listeners],
  );

  const getSnapshot = useCallback(() => dirtyKeys.size > 0, [dirtyKeys]);

  const setDirty = useCallback(
    (key: string, dirty: boolean) => {
      const had = dirtyKeys.size > 0;
      if (dirty) dirtyKeys.add(key);
      else dirtyKeys.delete(key);
      const has = dirtyKeys.size > 0;
      if (had !== has) {
        listeners.forEach((listener) => listener());
      }
    },
    [dirtyKeys, listeners],
  );

  const store = useMemo(
    (): UnsavedStore => ({ subscribe, getSnapshot, setDirty }),
    [subscribe, getSnapshot, setDirty],
  );

  return (
    <EmployeeDetailUnsavedContext.Provider value={store}>{children}</EmployeeDetailUnsavedContext.Provider>
  );
}

export function useEmployeeDetailUnsaved(key: string, dirty: boolean) {
  const store = useContext(EmployeeDetailUnsavedContext);
  useEffect(() => {
    if (!store) return;
    store.setDirty(key, dirty);
    return () => store.setDirty(key, false);
  }, [store, key, dirty]);
}

export function useEmployeeDetailHasUnsaved(): boolean {
  const store = useContext(EmployeeDetailUnsavedContext);
  return useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => store?.getSnapshot() ?? false,
    () => false,
  );
}
