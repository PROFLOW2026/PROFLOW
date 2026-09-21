import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ServiceUnavailableError } from '@/shared/errors';
import {
  grantsMapFromPreset,
  categoriesSetFromPreset,
} from '@/modules/employee-app/application/permission-editor';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import type { EmployeePresetKey } from '@/modules/employee-app/application/presets';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import { resolveEmployeeProjectFilesGate } from '@/modules/external-storage/application/project-files-gate';

vi.mock('@/modules/external-storage/application/org-storage-gate', () => ({
  isOrganizationStorageConfigured: vi.fn(),
}));

vi.mock('@/modules/external-storage/application/browser-service', () => ({
  getProjectStorageBrowserContext: vi.fn(),
}));

import { isOrganizationStorageConfigured } from '@/modules/external-storage/application/org-storage-gate';
import { getProjectStorageBrowserContext } from '@/modules/external-storage/application/browser-service';

function employeeContextFromPreset(key: EmployeePresetKey): OrgContext {
  const grantStates = grantsMapFromPreset(key);
  const grants = new Map(
    [...grantStates.entries()].map(([permissionKey, state]) => [
      permissionKey,
      { permissionKey, scope: state.scope, granted: state.granted },
    ]),
  );
  const permissions = resolveEmployeeAppEffectivePermissions(grants);

  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    locale: 'he-IL',
    db: {} as OrgContext['db'],
    organization: { id: 'org-1', name: 'Org', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
    permissions,
    roleKeys: ['employee'],
    employeeApp: {
      employeeId: 'emp-1',
      grants,
      allowedDocumentCategories: categoriesSetFromPreset(key),
      account: {
        id: 'acc-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        userId: 'user-1',
        username: 'worker',
        usernameNormalized: 'worker',
        authEmail: 'worker@employee.local',
        status: 'active',
        pinMustChange: false,
        temporaryPinExpiresAt: null,
        accessStartsAt: null,
        accessEndsAt: null,
        disabledAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
        firstLoginAt: null,
        lastLoginAt: null,
      },
    },
  };
}

describe('resolveEmployeeProjectFilesGate', () => {
  it('returns no_permission when documents.read is missing', async () => {
    const worker = employeeContextFromPreset('field_worker_time');
    await expect(resolveEmployeeProjectFilesGate(worker, 'proj-1')).resolves.toBe('no_permission');
  });

  it('returns no_permission instead of storage_disconnected when folder grants are empty', async () => {
    const foreman = employeeContextFromPreset('foreman');
    const blocked = {
      ...foreman,
      employeeApp: foreman.employeeApp
        ? { ...foreman.employeeApp, allowedDocumentCategories: new Set<DocumentCategory>() }
        : undefined,
    };
    vi.mocked(isOrganizationStorageConfigured).mockResolvedValue(false);
    await expect(resolveEmployeeProjectFilesGate(blocked, 'proj-1')).resolves.toBe('no_permission');
  });

  it('returns storage_disconnected only when storage is truly unavailable', async () => {
    const foreman = employeeContextFromPreset('foreman');
    vi.mocked(isOrganizationStorageConfigured).mockResolvedValue(false);
    await expect(resolveEmployeeProjectFilesGate(foreman, 'proj-1')).resolves.toBe('storage_disconnected');
  });

  it('returns project_not_provisioned when browser context fails with fileUnavailable', async () => {
    const foreman = employeeContextFromPreset('foreman');
    vi.mocked(isOrganizationStorageConfigured).mockResolvedValue(true);
    vi.mocked(getProjectStorageBrowserContext).mockRejectedValue(
      new ServiceUnavailableError('Project folders not provisioned', 'externalStorage.errors.fileUnavailable'),
    );
    await expect(resolveEmployeeProjectFilesGate(foreman, 'proj-1')).resolves.toBe('project_not_provisioned');
  });

  it('returns provider_error for reconnect failures', async () => {
    const foreman = employeeContextFromPreset('foreman');
    vi.mocked(isOrganizationStorageConfigured).mockResolvedValue(true);
    vi.mocked(getProjectStorageBrowserContext).mockRejectedValue(
      new ServiceUnavailableError('Storage reconnect required', 'externalStorage.errors.reconnectRequired'),
    );
    await expect(resolveEmployeeProjectFilesGate(foreman, 'proj-1')).resolves.toBe('provider_error');
  });

  it('returns available when storage and browser context succeed', async () => {
    const foreman = employeeContextFromPreset('foreman');
    vi.mocked(isOrganizationStorageConfigured).mockResolvedValue(true);
    vi.mocked(getProjectStorageBrowserContext).mockResolvedValue({
      provider: 'google_drive',
      projectRootFolderId: 'root',
      projectRootFolderName: 'Project',
      semanticShortcuts: [],
    });
    await expect(resolveEmployeeProjectFilesGate(foreman, 'proj-1')).resolves.toBe('available');
    expect(foreman.permissions.has(PERMISSIONS.DOCUMENTS_READ)).toBe(true);
  });
});
