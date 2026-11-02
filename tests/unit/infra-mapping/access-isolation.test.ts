/**
 * Infrastructure mapping authorization: organization isolation and contractor limits.
 * Pure checks of the authorization surface (project capability + external grants); no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthorizationError, NotFoundError } from '@/shared/errors';

const assertProjectCapability = vi.hoisted(() => vi.fn());
const hasProjectCapability = vi.hoisted(() => vi.fn());
const authorizeExternalEntity = vi.hoisted(() => vi.fn());
const authorizeInternalEntity = vi.hoisted(() => vi.fn());

vi.mock('@/modules/project-team', () => ({
  PROJECT_CAPABILITIES: {
    PROJECT_VIEW: 'project.view',
    PROJECT_MANAGE: 'project.manage',
    DOCUMENTS_SHARE: 'documents.share',
  },
  assertProjectCapability,
  hasProjectCapability,
}));
vi.mock('@/modules/evidence', () => ({ authorizeExternalEntity, authorizeInternalEntity }));

import {
  assertCanManageLocations,
  authorizeLocation,
  authorizeProject,
  organizationFor,
  viewerCanManageLocations,
} from '@/modules/infra-mapping/application/access';
import type { InfraActor } from '@/modules/infra-mapping/application/ports';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const OTHER_PROJECT = '44444444-4444-4444-8444-444444444444';
const VENDOR = '55555555-5555-4555-8555-555555555555';
const LOCATION = '66666666-6666-4666-8666-666666666666';

function grant(over: Partial<{ organizationId: string; projectId: string | null; capabilities: string[]; expiresAt: Date | null }> = {}) {
  return {
    grantId: 'g1',
    organizationId: over.organizationId ?? ORG_A,
    vendorId: VENDOR,
    projectId: over.projectId === undefined ? PROJECT : over.projectId,
    subcontractAgreementId: null,
    capabilities: new Set(over.capabilities ?? ['ext.document.upload', 'ext.document.view']),
    expiresAt: over.expiresAt ?? null,
  };
}

const contractor = (grants: ReturnType<typeof grant>[]): InfraActor =>
  ({ kind: 'external', context: { principalId: 'pr1', authUserId: 'au1', displayName: null, locale: 'he', grants, db: {} } }) as unknown as InfraActor;
const employee = (organizationId = ORG_A): InfraActor =>
  ({ kind: 'internal', context: { organizationId, userId: 'u1', db: {} } }) as unknown as InfraActor;

beforeEach(() => {
  assertProjectCapability.mockReset();
  hasProjectCapability.mockReset();
  authorizeExternalEntity.mockReset();
  authorizeInternalEntity.mockReset();
});

describe('organization isolation', () => {
  it('an internal user always works in their own organization, whatever organization id is passed', async () => {
    expect(await organizationFor(employee(ORG_A), ORG_B)).toBe(ORG_A);
    expect(await organizationFor(employee(ORG_A), null)).toBe(ORG_A);
  });

  it('a contractor can only act in an organization they hold a grant for', async () => {
    const actor = contractor([grant({ organizationId: ORG_A })]);
    expect(await organizationFor(actor, ORG_A)).toBe(ORG_A);
    await expect(organizationFor(actor, ORG_B)).rejects.toBeInstanceOf(NotFoundError);
    await expect(organizationFor(actor, null)).rejects.toBeInstanceOf(NotFoundError);
    await expect(organizationFor(actor, 'not-a-uuid')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('locations and cloud folders are manager-only', () => {
  it('a contractor can never manage locations or folders', async () => {
    const actor = contractor([grant()]);
    await expect(assertCanManageLocations(actor, PROJECT)).rejects.toBeInstanceOf(AuthorizationError);
    expect(await viewerCanManageLocations(actor, PROJECT)).toBe(false);
    expect(assertProjectCapability).not.toHaveBeenCalled();
  });

  it('an employee needs project.manage on that project', async () => {
    assertProjectCapability.mockResolvedValue(undefined);
    await assertCanManageLocations(employee(), PROJECT);
    expect(assertProjectCapability).toHaveBeenCalledWith(expect.anything(), PROJECT, 'project.manage');

    assertProjectCapability.mockRejectedValue(new AuthorizationError('project:project.manage'));
    await expect(assertCanManageLocations(employee(), PROJECT)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe('contractor access to a project (documentation and files)', () => {
  it('needs a grant of the same organization and project with the right capability', async () => {
    const ok = await authorizeProject(contractor([grant()]), { organizationId: ORG_A, projectId: PROJECT, need: 'document' });
    expect(ok).toMatchObject({ organizationId: ORG_A, projectId: PROJECT, vendorId: VENDOR, canManageCaptures: false });

    await expect(authorizeProject(contractor([grant({ organizationId: ORG_B })]), { organizationId: ORG_A, projectId: PROJECT, need: 'view' })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(authorizeProject(contractor([grant({ projectId: OTHER_PROJECT })]), { organizationId: ORG_A, projectId: PROJECT, need: 'view' })).rejects.toBeInstanceOf(AuthorizationError);
    await expect(authorizeProject(contractor([]), { organizationId: ORG_A, projectId: PROJECT, need: 'view' })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('a view-only grant cannot document, and an expired grant allows nothing', async () => {
    const viewOnly = contractor([grant({ capabilities: ['ext.document.view'] })]);
    await expect(authorizeProject(viewOnly, { organizationId: ORG_A, projectId: PROJECT, need: 'document' })).rejects.toBeInstanceOf(AuthorizationError);
    const expired = contractor([grant({ expiresAt: new Date(Date.now() - 1000) })]);
    await expect(authorizeProject(expired, { organizationId: ORG_A, projectId: PROJECT, need: 'view' })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('a location is authorized through the entity scope (same project and organization) with the matching capability', async () => {
    authorizeExternalEntity.mockResolvedValue({ scope: { projectId: PROJECT }, vendorId: VENDOR });
    const actor = contractor([grant()]);
    const access = await authorizeLocation(actor, { organizationId: ORG_A, projectId: PROJECT, locationId: LOCATION, need: 'document' });
    expect(access).toMatchObject({ projectId: PROJECT, vendorId: VENDOR, canManageCaptures: false });
    expect(authorizeExternalEntity).toHaveBeenCalledWith(
      actor.kind === 'external' ? actor.context : null,
      expect.objectContaining({ organizationId: ORG_A, entityId: LOCATION, projectId: PROJECT, capability: 'ext.document.upload' }),
    );

    authorizeExternalEntity.mockRejectedValue(new NotFoundError('Entity'));
    await expect(authorizeLocation(actor, { organizationId: ORG_A, projectId: PROJECT, locationId: LOCATION, need: 'view' })).rejects.toBeInstanceOf(NotFoundError);
  });
});
