'use client';

import { useCallback, useContext, createContext, useMemo, type ReactNode } from 'react';
import type { DraftKind } from '../domain/types';
import { isBrowserOnline } from '../data/browser-online';
import { enqueueProductDraft } from '../data/enqueue-product-draft';

export interface OfflineOrgContextValue {
  readonly organizationId: string;
}

const OfflineOrgContext = createContext<OfflineOrgContextValue | null>(null);

export function OfflineOrgProvider({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ organizationId }), [organizationId]);
  return <OfflineOrgContext.Provider value={value}>{children}</OfflineOrgContext.Provider>;
}

export function useOfflineOrganizationId(): string | null {
  return useContext(OfflineOrgContext)?.organizationId ?? null;
}

export type OfflineDraftFormState = {
  error?: string;
  offlineQueued?: boolean;
  success?: boolean;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
  expenseId?: string;
};

/**
 * Wraps a server form action: when offline, enqueue a local draft instead of
 * calling the server. Never fabricates online sync success.
 */
export function useOfflineAwareFormAction<S extends OfflineDraftFormState>(options: {
  readonly kind: Exclude<DraftKind, 'capture'>;
  readonly onlineAction: (prev: S, formData: FormData) => Promise<S>;
  readonly buildPayload: (formData: FormData) => Record<string, unknown>;
  readonly resolveServerMeta?: (
    formData: FormData,
    payload: Record<string, unknown>,
  ) => {
    serverId?: string | null;
    serverUpdatedAt?: string | null;
    localId?: string;
  };
  readonly offlineSuccessState: S;
  readonly organizationId?: string | null;
  readonly missingOrgError?: string;
}): (prev: S, formData: FormData) => Promise<S> {
  const contextOrgId = useOfflineOrganizationId();
  const organizationId = options.organizationId ?? contextOrgId;
  const {
    kind,
    onlineAction,
    buildPayload,
    resolveServerMeta,
    offlineSuccessState,
    missingOrgError = 'offline_org_missing',
  } = options;

  return useCallback(
    async (prev: S, formData: FormData): Promise<S> => {
      if (!isBrowserOnline()) {
        if (!organizationId) {
          return { ...prev, error: missingOrgError, offlineQueued: false } as S;
        }
        const payload = buildPayload(formData);
        const meta = resolveServerMeta?.(formData, payload) ?? {};
        await enqueueProductDraft({
          organizationId,
          kind,
          payload,
          localId: meta.localId,
          serverId: meta.serverId ?? null,
          serverUpdatedAt: meta.serverUpdatedAt ?? null,
        });
        return offlineSuccessState;
      }
      return onlineAction(prev, formData);
    },
    [
      organizationId,
      kind,
      onlineAction,
      buildPayload,
      resolveServerMeta,
      offlineSuccessState,
      missingOrgError,
    ],
  );
}
