'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  startReconnectSync,
  type OfflineSyncTransport,
  type ReconnectSyncController,
} from '../data/sync-runner';
import { getDraftQueue } from '../data/draft-queue';
import { OfflineOrgProvider } from './use-offline-aware-form-action';

/**
 * Drains the offline queue when the browser reconnects.
 * Default transport submits via product application modules (server-validated).
 * Provides organizationId + userId to descendant forms for offline enqueue.
 *
 * Product sync transport (document upload actions, etc.) is loaded on demand so
 * ordinary AppShell screens do not pay for that module graph at startup.
 */
export function OfflineSyncProvider({
  organizationId: organizationIdProp,
  userId: userIdProp,
  transport,
  children,
}: {
  /** Optional - resolved via getOfflineActorScopeAction so AppShell need not block on org. */
  organizationId?: string;
  /** Optional - resolved via getOfflineActorScopeAction when omitted (AppShell is Lead-owned). */
  userId?: string;
  transport?: OfflineSyncTransport;
  children?: ReactNode;
}) {
  const transportRef = useRef<OfflineSyncTransport | null>(transport ?? null);
  const [resolvedScope, setResolvedScope] = useState<{
    organizationId: string;
    userId: string;
  } | null>(null);
  const organizationId = organizationIdProp ?? resolvedScope?.organizationId ?? '';
  const userId = userIdProp ?? resolvedScope?.userId ?? null;

  useEffect(() => {
    if (organizationIdProp && userIdProp) return;
    let cancelled = false;
    void (async () => {
      const { getOfflineActorScopeAction } = await import('../application/offline-scope');
      const scope = await getOfflineActorScopeAction();
      if (cancelled || !scope) return;
      if (organizationIdProp && scope.organizationId !== organizationIdProp) return;
      setResolvedScope(scope);
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationIdProp, userIdProp]);

  useEffect(() => {
    if (transport) {
      transportRef.current = transport;
    }
  }, [transport]);

  useEffect(() => {
    if (!organizationId || !userId) return;

    let cancelled = false;
    let controller: ReconnectSyncController | null = null;

    void (async () => {
      // Claim legacy unscoped drafts so they are not silently invisible.
      try {
        await getDraftQueue().claimUnscopedDrafts({ organizationId, userId });
      } catch {
        // Non-fatal - queue may be unavailable during SSR/hydration.
      }

      let active = transportRef.current;
      if (!active) {
        const { createProductSyncTransport } = await import('../data/product-sync-transport');
        if (cancelled) return;
        active = transport ?? createProductSyncTransport();
        transportRef.current = active;
      }

      if (cancelled) return;

      controller = startReconnectSync({
        organizationId,
        userId,
        transport: {
          fetchServerTruth: (action) => {
            const current = transportRef.current ?? active;
            return current.fetchServerTruth(action);
          },
          submit: (action, attachments) => {
            const current = transportRef.current ?? active;
            return current.submit(action, attachments);
          },
        },
      });

      // ── Background Sync registration (forward-compatible) ────────────────
      // Registers a sync tag so the browser can call our SW `sync` handler
      // even when the tab is inactive. The `window.online` listener above is
      // the primary fallback when the SW handler is absent.
      //
      // PENDING (sw.js): add a `sync` event handler for tag 'draft-sync' that
      // posts `{ type: 'BACKGROUND_SYNC_DRAFT' }` to all window clients, then
      // listen for that message here and call `controller.flush()`.
      // Do NOT bump SHELL_CACHE in the same PR — change the pf-sw-release
      // comment only, which triggers a new worker install without clearing caches.
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          if ('sync' in reg) {
            (reg.sync as unknown as { register(tag: string): Promise<void> })
              .register('draft-sync')
              .catch(() => {
                // Background Sync unavailable in this browser; window.online is the fallback.
              });
          }
        }).catch(() => {
          // SW not yet active — window.online listener remains the fallback.
        });
      }

      if (cancelled) {
        controller.stop();
        controller = null;
      }
    })();

    return () => {
      cancelled = true;
      controller?.stop();
      controller = null;
    };
  }, [organizationId, userId, transport]);

  if (!userId) {
    // Still provide org-only context until user resolves - forms show missing-scope errors offline.
    return (
      <OfflineOrgProvider organizationId={organizationId} userId="">
        {children ?? null}
      </OfflineOrgProvider>
    );
  }

  return (
    <OfflineOrgProvider organizationId={organizationId} userId={userId}>
      {children ?? null}
    </OfflineOrgProvider>
  );
}
