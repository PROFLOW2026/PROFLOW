'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { TakeoffClientApi } from '../domain/contracts';

const TakeoffApiContext = createContext<TakeoffClientApi | null>(null);

export function TakeoffApiProvider({
  api,
  children,
}: {
  api: TakeoffClientApi;
  children: ReactNode;
}) {
  const value = useMemo(() => api, [api]);
  return <TakeoffApiContext.Provider value={value}>{children}</TakeoffApiContext.Provider>;
}

export function useTakeoffApi(): TakeoffClientApi {
  const api = useContext(TakeoffApiContext);
  if (!api) {
    throw new Error('useTakeoffApi must be used within TakeoffApiProvider');
  }
  return api;
}