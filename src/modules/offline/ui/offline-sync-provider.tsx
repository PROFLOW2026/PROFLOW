'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import {
  startReconnectSync,
  type OfflineSyncTransport,
  type ReconnectSyncController,
} from '../data/sync-runner';
import { OfflineOrgProvider } from './use-offline-aware-form-action';

/**
 * Drains the offline queue when the browser reconnects.
 * Default transport submits via product application modules (server-validated).
 * Provides organizationId to descendant forms for offline enqueue.
 *
 * Product sync transport (document upload actions, etc.) is loaded on demand so
 * ordinary AppShell screens do not pay for that module graph at startup.
 */
export function OfflineSyncProvider({
  organizationId,
  transport,
  children,
}: {
  organizationId: string;
  transport?: OfflineSyncTransport;
  children?: ReactNode;
}) {
  const transportRef = useRef<OfflineSyncTransport | null>(transport ?? null);

  useEffect(() => {
    if (transport) {
      transportRef.current = transport;
    }
  }, [transport]);

  useEffect(() => {
    if (!organizationId) return;

    let cancelled = false;
    let controller: ReconnectSyncController | null = null;

    void (async () => {
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
  }, [organizationId, transport]);

  return <OfflineOrgProvider organizationId={organizationId}>{children ?? null}</OfflineOrgProvider>;
}
