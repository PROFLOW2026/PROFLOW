import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import type { OrgContext } from '@/shared/auth/context';
import type { StorageConnectionRecord } from '../domain/types';
import type { StorageProvisionProgress } from '../domain/project-folder-placement';
import { withStorageTreeHealth } from '../domain/storage-tree-health';
import { updateStorageConnection } from '../data/connections.repository';
import { loadStorageProvisionProgress } from './provision-progress';
import { kickStorageProvisionIfPreparing } from './kick-storage-provision';

export type StorageSettingsPageWarningKey =
  | 'errors.settingsHealthCheckFailed'
  | 'errors.settingsProvisionStatusUnavailable';

export type StorageSettingsPageData = {
  readonly connections: StorageConnectionRecord[];
  readonly provisionProgress: Readonly<Record<string, StorageProvisionProgress>>;
  readonly provisionProgressUnavailable: Readonly<Record<string, boolean>>;
  readonly pageWarnings: readonly StorageSettingsPageWarningKey[];
};

function logSettingsStorageError(scope: string, error: unknown): void {
  console.error(`[settings/storage] ${scope}`, error);
}

async function persistHealFailure(
  db: DbExecutor,
  organizationId: string,
  connection: StorageConnectionRecord,
  detail: string,
): Promise<StorageConnectionRecord> {
  const capabilities = withStorageTreeHealth(connection.capabilitiesJson, {
    status: 'needs_repair',
    reason: 'root_folder_missing',
    checkedAt: new Date().toISOString(),
  });
  const lastError = `storage_tree_invalid: ${detail}`.slice(0, 500);
  try {
    return (
      (await updateStorageConnection(db, organizationId, connection.id, {
        capabilitiesJson: capabilities as Record<string, unknown>,
        lastError,
      })) ?? {
        ...connection,
        capabilitiesJson: capabilities,
        lastError,
      }
    );
  } catch (persistError) {
    logSettingsStorageError('heal recovery persist failed', persistError);
    return {
      ...connection,
      capabilitiesJson: capabilities,
      lastError,
    };
  }
}

export async function loadStorageSettingsPageData(
  context: OrgContext,
  rawConnections: readonly StorageConnectionRecord[],
): Promise<StorageSettingsPageData> {
  const { reconcileProjectTemplateGateState } = await import('./project-template-service');
  const { healStorageConnectionTreeForSettings } = await import('./provider-tree-health');

  const pageWarnings: StorageSettingsPageWarningKey[] = [];
  const connections = await Promise.all(
    rawConnections.map(async (connection) => {
      if (connection.status !== 'connected') return connection;

      let next = connection;
      try {
        next = await reconcileProjectTemplateGateState(
          context.db,
          context.organizationId,
          connection,
        );
      } catch (error) {
        logSettingsStorageError('reconcileProjectTemplateGateState', error);
        pageWarnings.push('errors.settingsHealthCheckFailed');
        return connection;
      }

      try {
        next = await healStorageConnectionTreeForSettings(
          context.db,
          context.organizationId,
          next,
        );
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        logSettingsStorageError('healStorageConnectionTreeForSettings', error);
        next = await persistHealFailure(context.db, context.organizationId, next, detail);
        pageWarnings.push('errors.settingsHealthCheckFailed');
      }

      return next;
    }),
  );

  const connected = connections.filter((connection) => connection.status === 'connected');
  const provisionProgress: Record<string, StorageProvisionProgress> = {};
  const provisionProgressUnavailable: Record<string, boolean> = {};

  for (const connection of connected) {
    try {
      const progress = await loadStorageProvisionProgress(
        context.db,
        context.organizationId,
        connection.id,
      );
      provisionProgress[connection.id] = progress;
      kickStorageProvisionIfPreparing(progress);
    } catch (error) {
      logSettingsStorageError('loadStorageProvisionProgress', error);
      provisionProgressUnavailable[connection.id] = true;
      pageWarnings.push('errors.settingsProvisionStatusUnavailable');
    }
  }

  return {
    connections,
    provisionProgress,
    provisionProgressUnavailable,
    pageWarnings: [...new Set(pageWarnings)],
  };
}
