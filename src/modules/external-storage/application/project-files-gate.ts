import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { AppError, ServiceUnavailableError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  employeeHasPermission,
} from '@/modules/employee-app/application/load-employee-app-context';
import { employeeHasAnyAllowedSemanticFolder } from '../domain/semantic-folder-access';
import { isOrganizationStorageConfigured } from './org-storage-gate';
import { getProjectStorageBrowserContext } from './browser-service';

/** Distinct Employee Project Files browser gate states (Parts 17–21 addendum). */
export type EmployeeProjectFilesGateState =
  | 'no_permission'
  | 'storage_disconnected'
  | 'project_not_provisioned'
  | 'provider_error'
  | 'available';

function mapStorageErrorToGate(error: unknown): EmployeeProjectFilesGateState {
  if (error instanceof ServiceUnavailableError) {
    const key = error.messageKey ?? '';
    if (key.includes('fileUnavailable') || error.message.includes('not provisioned')) {
      return 'project_not_provisioned';
    }
    if (
      key.includes('notConnected') ||
      key.includes('reconnectRequired') ||
      key.includes('quotaFull') ||
      key.includes('providerNotConfigured')
    ) {
      return 'provider_error';
    }
    return 'provider_error';
  }
  if (error instanceof AppError) {
    return 'provider_error';
  }
  throw error;
}

/**
 * Resolves which empty/error state to show before browsing project files.
 * Never returns `storage_disconnected` when folder permission or provision errors apply.
 */
export async function resolveEmployeeProjectFilesGate(
  context: OrgContext,
  projectId: string,
): Promise<EmployeeProjectFilesGateState> {
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ)) {
    return 'no_permission';
  }
  if (!employeeHasAnyAllowedSemanticFolder(context)) {
    return 'no_permission';
  }

  const storageConfigured = await isOrganizationStorageConfigured(context);
  if (!storageConfigured) {
    return 'storage_disconnected';
  }

  try {
    await getProjectStorageBrowserContext(context, projectId);
    return 'available';
  } catch (error) {
    return mapStorageErrorToGate(error);
  }
}
