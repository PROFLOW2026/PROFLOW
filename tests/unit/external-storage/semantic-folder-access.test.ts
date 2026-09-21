import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  canAccessSemanticFolder,
  categoriesForSemanticFolder,
  employeeHasAnyAllowedSemanticFolder,
  resolveSemanticFolderForPath,
  SEMANTIC_FOLDER_DOCUMENT_CATEGORIES,
} from '@/modules/external-storage/domain/semantic-folder-access';
import {
  grantsMapFromPreset,
  categoriesSetFromPreset,
} from '@/modules/employee-app/application/permission-editor';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import type { EmployeePresetKey } from '@/modules/employee-app/application/presets';
import { canEmployeeReadDocumentCategory } from '@/modules/employee-app/application/document-access';

function employeeContextFromPreset(key: EmployeePresetKey): OrgContext {
  const grantStates = grantsMapFromPreset(key);
  const grants = new Map(
    [...grantStates.entries()].map(([permissionKey, state]) => [
      permissionKey,
      {
        permissionKey,
        scope: state.scope,
        granted: state.granted,
      },
    ]),
  );
  const categories = categoriesSetFromPreset(key);
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
      allowedDocumentCategories: categories.size > 0 ? categories : null,
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

describe('semantic folder access mapping', () => {
  it('maps project semantic folders to document categories', () => {
    expect(categoriesForSemanticFolder('quotes')).toEqual(['quote']);
    expect(categoriesForSemanticFolder('photos')).toEqual(['photo', 'drawing']);
    expect(SEMANTIC_FOLDER_DOCUMENT_CATEGORIES.vendor_invoices).toContain('invoice');
  });

  it('resolves mapped folder ids to semantic folder types', () => {
    const mappings = [
      {
        semanticFolderType: 'project_root' as const,
        externalFolderId: 'root-1',
        externalParentId: null,
        status: 'ready' as const,
      },
      {
        semanticFolderType: 'photos' as const,
        externalFolderId: 'photos-1',
        externalParentId: 'root-1',
        status: 'ready' as const,
      },
    ];

    expect(resolveSemanticFolderForPath('photos-1', mappings)).toBe('photos');
    expect(resolveSemanticFolderForPath('root-1', mappings)).toBeNull();
    expect(resolveSemanticFolderForPath('unknown', mappings)).toBeNull();
  });

  it('allows owner users all semantic folders', () => {
    const ownerContext = {
      userId: 'owner-1',
      organizationId: 'org-1',
      membershipId: 'mem-owner',
      locale: 'he-IL',
      db: {} as OrgContext['db'],
      organization: { id: 'org-1', name: 'Org', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
      roleKeys: ['owner'],
      permissions: new Set([PERMISSIONS.DOCUMENTS_READ]),
    } as OrgContext;

    expect(canAccessSemanticFolder(ownerContext, 'billing')).toBe(true);
    expect(canAccessSemanticFolder(ownerContext, 'photos')).toBe(true);
  });

  it('filters semantic folders by employee category grants', () => {
    const foreman = employeeContextFromPreset('foreman');

    expect(canAccessSemanticFolder(foreman, 'photos')).toBe(true);
    expect(canAccessSemanticFolder(foreman, 'quotes')).toBe(false);
    expect(canAccessSemanticFolder(foreman, 'vendor_invoices')).toBe(false);
    expect(employeeHasAnyAllowedSemanticFolder(foreman)).toBe(true);
  });

  it('denies all folders when documents.read is missing', () => {
    const worker = employeeContextFromPreset('field_worker');
    expect(employeeHasAnyAllowedSemanticFolder(worker)).toBe(false);
    expect(canAccessSemanticFolder(worker, 'photos')).toBe(false);
  });
});

describe('employee document category null handling', () => {
  it('allows null category in project scope for standard privacy', () => {
    const foreman = employeeContextFromPreset('foreman');
    expect(
      canEmployeeReadDocumentCategory(foreman, null, {
        inProjectScope: true,
        privacyClass: 'standard',
      }),
    ).toBe(true);
  });

  it('denies null category outside project scope', () => {
    const foreman = employeeContextFromPreset('foreman');
    expect(canEmployeeReadDocumentCategory(foreman, null)).toBe(false);
  });

  it('denies compensation privacy even with null category in project scope', () => {
    const foreman = employeeContextFromPreset('foreman');
    expect(
      canEmployeeReadDocumentCategory(foreman, null, {
        inProjectScope: true,
        privacyClass: 'compensation',
      }),
    ).toBe(false);
  });

  it('still enforces explicit category grants', () => {
    const foreman = employeeContextFromPreset('foreman');
    expect(canEmployeeReadDocumentCategory(foreman, 'photo')).toBe(true);
    expect(canEmployeeReadDocumentCategory(foreman, 'invoice')).toBe(false);
  });
});
