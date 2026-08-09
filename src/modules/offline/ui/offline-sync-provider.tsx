'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { createProductSyncTransport } from '../data/product-sync-transport';
import { startReconnectSync, type OfflineSyncTransport } from '../data/sync-runner';
import { OfflineOrgProvider } from './use-offline-aware-form-action';

/**
 * Drains the offline queue when the browser reconnects.
 * Default transport submits via product application modules (server-validated).
 * Provides organizationId to descendant forms for offline enqueue.
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
  const transportRef = useRef(transport ?? createProductSyncTransport());

  useEffect(() => {
    transportRef.current = transport ?? createProductSyncTransport();
  }, [transport]);

  useEffect(() => {
    if (!organizationId) return;
    const controller = startReconnectSync({
      organizationId,
      transport: {
        fetchServerTruth: (action) => transportRef.current.fetchServerTruth(action),
        submit: (action, attachments) => transportRef.current.submit(action, attachments),
      },
    });
    return () => controller.stop();
  }, [organizationId]);

  return <OfflineOrgProvider organizationId={organizationId}>{children ?? null}</OfflineOrgProvider>;
}
