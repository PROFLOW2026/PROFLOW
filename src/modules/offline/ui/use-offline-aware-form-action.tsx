'use client';

import { useCallback, useContext, createContext, useMemo, type ReactNode } from 'react';
import { collectCreatePhotoFiles } from '@/modules/documents/domain/create-form-files';
import { normalizeUploadMime } from '@/modules/documents/domain/file-rules';
import type { DraftKind, DraftScope } from '../domain/types';
import { captureOwnerTypeForProductKind } from '../domain/sync-order';
import { isBrowserOnline } from '../data/browser-online';
import { enqueueCaptureDraft } from '../data/enqueue-capture';
import { enqueueProductDraft } from '../data/enqueue-product-draft';

export interface OfflineScopeContextValue {
  readonly organizationId: string;
  readonly userId: string;
}

const OfflineScopeContext = createContext<OfflineScopeContextValue | null>(null);

export function OfflineOrgProvider({
  organizationId,
  userId,
  children,
}: {
  organizationId: string;
  userId: string;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ organizationId, userId }), [organizationId, userId]);
  return <OfflineScopeContext.Provider value={value}>{children}</OfflineScopeContext.Provider>;
}

/** @deprecated Prefer OfflineOrgProvider with userId — alias kept for call-site clarity. */
export const OfflineScopeProvider = OfflineOrgProvider;

export function useOfflineOrganizationId(): string | null {
  return useContext(OfflineScopeContext)?.organizationId ?? null;
}

export function useOfflineUserId(): string | null {
  return useContext(OfflineScopeContext)?.userId ?? null;
}

export function useOfflineScope(): DraftScope | null {
  const ctx = useContext(OfflineScopeContext);
  if (!ctx?.organizationId || !ctx.userId) return null;
  return { organizationId: ctx.organizationId, userId: ctx.userId };
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
  readonly userId?: string | null;
  readonly missingOrgError?: string;
}): (prev: S, formData: FormData) => Promise<S> {
  const contextScope = useOfflineScope();
  const organizationId = options.organizationId ?? contextScope?.organizationId ?? null;
  const userId = options.userId ?? contextScope?.userId ?? null;
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
        if (!organizationId || !userId) {
          return { ...prev, error: missingOrgError, offlineQueued: false } as S;
        }
        const payload = buildPayload(formData);
        const meta = resolveServerMeta?.(formData, payload) ?? {};
        const draft = await enqueueProductDraft({
          organizationId,
          userId,
          kind,
          payload,
          localId: meta.localId,
          serverId: meta.serverId ?? null,
          serverUpdatedAt: meta.serverUpdatedAt ?? null,
        });
        const captureOwnerType = captureOwnerTypeForProductKind(kind);
        if (captureOwnerType) {
          for (const file of collectCreatePhotoFiles(formData)) {
            const mime = normalizeUploadMime(file.type, file.name);
            if (!mime.ok) continue;
            await enqueueCaptureDraft({
              organizationId,
              userId,
              file,
              fileName: file.name,
              mimeType: mime.mimeType,
              ownerType: captureOwnerType,
              ownerId: null,
              pendingOwnerDraftLocalId: draft.localId,
            });
          }
        }
        return offlineSuccessState;
      }
      return onlineAction(prev, formData);
    },
    [
      organizationId,
      userId,
      kind,
      onlineAction,
      buildPayload,
      resolveServerMeta,
      offlineSuccessState,
      missingOrgError,
    ],
  );
}
