'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  const dirtyKeysRef = useRef(new Set<string>());
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const getSnapshot = useCallback(() => dirtyKeysRef.current.size > 0, []);

  const setDirty = useCallback((key: string, dirty: boolean) => {
    const dirtyKeys = dirtyKeysRef.current;
    const had = dirtyKeys.size > 0;
    if (dirty) dirtyKeys.add(key);
    else dirtyKeys.delete(key);
    const has = dirtyKeys.size > 0;
    if (had !== has) {
      for (const listener of listenersRef.current) listener();
    }
  }, []);

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
