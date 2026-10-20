'use client';

import { createContext, useContext, type ReactNode } from 'react';

const OwnerAppSurfaceContext = createContext(false);

/** Marks the main-app tree so shared controls can use the owner standard. */
export function OwnerAppSurfaceProvider({ children }: { readonly children: ReactNode }) {
  return <OwnerAppSurfaceContext.Provider value={true}>{children}</OwnerAppSurfaceContext.Provider>;
}

export function useOwnerAppSurface(): boolean {
  return useContext(OwnerAppSurfaceContext);
}
