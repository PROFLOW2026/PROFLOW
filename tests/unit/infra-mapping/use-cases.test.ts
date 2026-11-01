/**
 * Infrastructure mapping use-cases with MOCKED repositories and evidence module.
 * These are static / mock tests: they verify permissions, organization isolation, idempotency and
 * the late-edit / move rules. They are NOT database tests - nothing here touches (or can touch) SQL.
 * Paths that need the real 0195 tables are marked "ממתינים לאימות DB" in the final report.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  captureEvidenceIds: vi.fn(),
  findComparisonByClientId: vi.fn(),
  findComparisonRow: vi.fn(),
  insertComparison: vi.fn(),
  listComparisonRows: vi.fn(),
  toComparisonDto: vi.fn(),
  updateComparisonRow: vi.fn(),
  findCaptureByClientId: vi.fn(),
  findCaptureJoin: vi.fn(),
  findCaptureRow: vi.fn(),
  insertCapture: vi.fn(),
  insertMarkings: vi.fn(),
  insertVersion: vi.fn(),
  latestAnnotatedByCapture: vi.fn(),
  listCaptureRows: vi.fn(),
  listDistinctDescriptors: vi.fn(),
  listEvidenceBriefs: vi.fn(),
  listLatestMarkings: vi.fn(),
  listLocationNodes: vi.fn(),
  listVersionRows: vi.fn(),
  maxVersionNumber: vi.fn(),
  syncEvidenceLocation: vi.fn(),
  taskBelongsToProject: vi.fn(),
  toCaptureDto: vi.fn(),
  updateCaptureRow: vi.fn(),
}));
vi.mock('@/modules/infra-mapping/data/infra.repository', () => repo);

const evidence = vi.hoisted(() => ({
  authorizeExternalEntity: vi.fn(),
  authorizeInternalEntity: vi.fn(),
  beginExternalEvidenceUpload: vi.fn(),
  beginInternalEvidenceUpload: vi.fn(),
  removeExternalEvidence: vi.fn(),
  removeInternalEvidence: vi.fn(),
}));
vi.mock('@/modules/evidence', () => evidence);

const team = vi.hoisted(() => ({
  PROJECT_CAPABILITIES: {
    PROJECT_VIEW: 'project.view',
    PROJECT_MANAGE: 'project.manage',
    DOCUMENTS_SHARE: 'documents.share',
    DOCUMENTS_VIEW: 'documents.view',
  },
  assertProjectCapability: vi.fn(),
  hasProjectCapability: vi.fn(),
}));
vi.mock('@/modules/project-team', () => team);

import { AuthorizationError, ConflictError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { deriveClientId } from '@/modules/infra-mapping/application/comparisons';
import { beginComparisonSave } from '@/modules/infra-mapping/application/comparisons';
import {
  beginCapture,
  openCaptureInCloud,
  removeCapture,
  saveMarkings,
  updateCapture,
} from '@/modules/infra-mapping/application/captures';
import type { InfraActor, InfraDeps } from '@/modules/infra-mapping/application/ports';

const ORG = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const LOCATION = '44444444-4444-4444-8444-444444444444';
const LOCATION_2 = '55555555-5555-4555-8555-555555555555';
const CLIENT_ID = '66666666-6666-4666-8666-666666666666';
const CAPTURE = '77777777-7777-4777-8777-777777777777';
const EVIDENCE = '88888888-8888-4888-8888-888888888888';
const USER = '99999999-9999-4999-8999-999999999999';
const OTHER_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRINCIPAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const deps = {
  files: {} as InfraDeps['files'],
  folders: {
    relocateFiles: vi.fn(),
    providerWebUrl: vi.fn(),
  } as unknown as InfraDeps['folders'],
} satisfies InfraDeps;

const internal = (userId = USER): InfraActor =>
  ({ kind: 'internal', context: { organizationId: ORG, userId, db: {} } }) as unknown as InfraActor;

const contractor = (grantOrg = ORG): InfraActor =>
  ({
    kind: 'external',
    context: {
      principalId: PRINCIPAL,
      db: {},
      grants: [{ organizationId: grantOrg, projectId: PROJECT, vendorId: 'v1', subcontractAgreementId: null, capabilities: new Set(['ext.document.upload', 'ext.document.view']) }],
    },
  }) as unknown as InfraActor;

const baseInput = {
  projectId: PROJECT,
  locationId: LOCATION,
  clientCaptureId: CLIENT_ID,
  file: { fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 },
};

function captureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CAPTURE,
    organizationId: ORG,
    projectId: PROJECT,
    locationId: LOCATION,
    evidenceId: EVIDENCE,
    removedAt: null,
    createdByActorType: 'internal',
    createdByUserId: USER,
    createdByPrincipalId: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.findCaptureByClientId.mockResolvedValue(null);
  repo.listLocationNodes.mockResolvedValue([
    { id: LOCATION, parentId: null, name: 'דירה 1', code: null, type: 'apartment', sortOrder: 0, isActive: true, archived: false },
    { id: LOCATION_2, parentId: null, name: 'דירה 2', code: null, type: 'apartment', sortOrder: 1, isActive: true, archived: false },
  ]);
  repo.taskBelongsToProject.mockResolvedValue(true);
  repo.insertCapture.mockResolvedValue(undefined);
  repo.updateCaptureRow.mockResolvedValue(true);
  repo.captureEvidenceIds.mockResolvedValue([EVIDENCE]);
  repo.listEvidenceBriefs.mockResolvedValue([
    { id: EVIDENCE, documentId: 'doc1', status: 'available', fileName: 'infra-1.jpg' },
  ]);
  repo.maxVersionNumber.mockResolvedValue(0);
  evidence.authorizeInternalEntity.mockResolvedValue({ projectId: PROJECT });
  evidence.authorizeExternalEntity.mockResolvedValue({ scope: { projectId: PROJECT }, vendorId: 'v1' });
  evidence.beginInternalEvidenceUpload.mockResolvedValue({ evidenceId: EVIDENCE });
  evidence.beginExternalEvidenceUpload.mockResolvedValue({ evidenceId: EVIDENCE });
  team.hasProjectCapability.mockResolvedValue(false);
  team.assertProjectCapability.mockResolvedValue(undefined);
});

describe('capture registration (called only after approval)', () => {
  it('needs only the location; every other field is stored as NULL', async () => {
    const result = await beginCapture(internal(), baseInput, deps);
    expect(result.uploadUrl).toBe(`/api/infra/upload/${EVIDENCE}`);
    expect(result.alreadyUploaded).toBe(false);
    const row = repo.insertCapture.mock.calls[0]![1];
    expect(row).toMatchObject({
      organizationId: ORG,
      locationId: LOCATION,
      description: null,
      room: null,
      wall: null,
      infraType: null,
      role: 'documentation',
      createdByActorType: 'internal',
      createdByUserId: USER,
    });
    // no caption anywhere: the metadata lives in real columns
    expect(JSON.stringify(row)).not.toContain('caption');
    expect(evidence.beginInternalEvidenceUpload.mock.calls[0]![1]).toMatchObject({
      entityType: 'project_location',
      entityId: LOCATION,
      locationId: LOCATION,
    });
  });

  it('is idempotent on clientCaptureId: a retry never creates a second capture', async () => {
    repo.findCaptureByClientId.mockResolvedValue(captureRow());
    repo.listEvidenceBriefs.mockResolvedValue([{ id: EVIDENCE, status: 'pending' }]);
    const result = await beginCapture(internal(), baseInput, deps);
    expect(result).toMatchObject({ captureId: CAPTURE, evidenceId: EVIDENCE, alreadyUploaded: false });
    expect(repo.insertCapture).not.toHaveBeenCalled();
    expect(evidence.beginInternalEvidenceUpload).not.toHaveBeenCalled();
  });

  it('reports an already finished upload so the client does not send the bytes twice', async () => {
    repo.findCaptureByClientId.mockResolvedValue(captureRow());
    repo.listEvidenceBriefs.mockResolvedValue([{ id: EVIDENCE, status: 'available' }]);
    expect((await beginCapture(internal(), baseInput, deps)).alreadyUploaded).toBe(true);
  });

  it("another user's client id is invisible (NotFound, not a leak)", async () => {
    repo.findCaptureByClientId.mockResolvedValue(captureRow({ createdByUserId: OTHER_USER }));
    await expect(beginCapture(internal(), baseInput, deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('refuses an archived location', async () => {
    repo.listLocationNodes.mockResolvedValue([
      { id: LOCATION, parentId: null, name: 'ישן', code: null, type: 'area', sortOrder: 0, isActive: true, archived: true },
    ]);
    await expect(beginCapture(internal(), baseInput, deps)).rejects.toBeInstanceOf(DomainRuleError);
    expect(repo.insertCapture).not.toHaveBeenCalled();
  });

  it('refuses a task from another project', async () => {
    repo.taskBelongsToProject.mockResolvedValue(false);
    await expect(beginCapture(internal(), { ...baseInput, taskId: '12121212-1212-4212-8212-121212121212' }, deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('links the capture to an existing task (no new task system)', async () => {
    const taskId = '12121212-1212-4212-8212-121212121212';
    await beginCapture(internal(), { ...baseInput, taskId }, deps);
    expect(repo.insertCapture.mock.calls[0]![1]).toMatchObject({ taskId });
  });
});

describe('contractor documenting on an assigned project (no personal cloud connection)', () => {
  it('uploads through the contractor route into the owning organization', async () => {
    const result = await beginCapture(contractor(), { ...baseInput, organizationId: ORG }, deps);
    expect(result.uploadUrl).toBe(`/api/contractor/infra/upload/${EVIDENCE}`);
    expect(evidence.beginExternalEvidenceUpload.mock.calls[0]![1]).toMatchObject({ organizationId: ORG, entityType: 'project_location' });
    expect(repo.insertCapture.mock.calls[0]![1]).toMatchObject({
      organizationId: ORG,
      createdByActorType: 'external',
      createdByUserId: null,
      createdByPrincipalId: PRINCIPAL,
      vendorId: 'v1',
    });
  });

  it('cannot reach an organization it has no grant for', async () => {
    await expect(beginCapture(contractor(), { ...baseInput, organizationId: OTHER_ORG }, deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.listLocationNodes).not.toHaveBeenCalled();
    expect(repo.insertCapture).not.toHaveBeenCalled();
  });

  it('is denied when the grant does not cover the project', async () => {
    evidence.authorizeExternalEntity.mockRejectedValue(new AuthorizationError('external:ext.document.upload'));
    await expect(beginCapture(contractor(), { ...baseInput, organizationId: ORG }, deps)).rejects.toBeInstanceOf(AuthorizationError);
    expect(repo.insertCapture).not.toHaveBeenCalled();
  });

  it('never gets a direct cloud link', async () => {
    await expect(openCaptureInCloud(contractor(), { captureId: CAPTURE }, deps)).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe('late editing and permissions', () => {
  it('the author edits description / room / wall / type without touching the file', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    await updateCapture(internal(), { captureId: CAPTURE, details: { description: 'צינור מים', room: 'מטבח', wall: 'צפון', infraType: 'plumbing' } }, deps);
    expect(repo.updateCaptureRow).toHaveBeenCalledWith({}, ORG, CAPTURE, {
      description: 'צינור מים',
      room: 'מטבח',
      wall: 'צפון',
      infraType: 'plumbing',
    });
    expect(deps.folders.relocateFiles).not.toHaveBeenCalled();
    expect(repo.syncEvidenceLocation).not.toHaveBeenCalled();
  });

  it("someone else's capture is hidden from a plain member", async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow({ createdByUserId: OTHER_USER }));
    await expect(updateCapture(internal(), { captureId: CAPTURE, details: { room: 'x' } }, deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.updateCaptureRow).not.toHaveBeenCalled();
  });

  it('a project manager may edit it', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow({ createdByUserId: OTHER_USER }));
    team.hasProjectCapability.mockResolvedValue(true);
    await updateCapture(internal(), { captureId: CAPTURE, details: { room: 'x' } }, deps);
    expect(repo.updateCaptureRow).toHaveBeenCalled();
  });

  it('a contractor cannot edit an internal capture', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    await expect(updateCapture(contractor(), { captureId: CAPTURE, organizationId: ORG, details: { room: 'x' } }, deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('moving a capture relocates the cloud files first, then re-points the evidence', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    const order: string[] = [];
    (deps.folders.relocateFiles as ReturnType<typeof vi.fn>).mockImplementation(async () => void order.push('relocate'));
    repo.syncEvidenceLocation.mockImplementation(async () => void order.push('sync'));
    await updateCapture(internal(), { captureId: CAPTURE, locationId: LOCATION_2, details: {} }, deps);
    expect(order).toEqual(['relocate', 'sync']);
    expect(deps.folders.relocateFiles).toHaveBeenCalledWith({
      organizationId: ORG,
      projectId: PROJECT,
      locationId: LOCATION_2,
      documentIds: ['doc1'],
    });
    expect(repo.updateCaptureRow).toHaveBeenCalledWith({}, ORG, CAPTURE, { locationId: LOCATION_2 });
  });

  it('cannot move into an archived location (nothing is relocated)', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    repo.listLocationNodes.mockResolvedValue([
      { id: LOCATION_2, parentId: null, name: 'ארכיון', code: null, type: 'area', sortOrder: 0, isActive: true, archived: true },
    ]);
    await expect(updateCapture(internal(), { captureId: CAPTURE, locationId: LOCATION_2, details: {} }, deps)).rejects.toBeInstanceOf(DomainRuleError);
    expect(deps.folders.relocateFiles).not.toHaveBeenCalled();
  });

  it('removal is a soft delete that hides the capture', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    await removeCapture(internal(), { captureId: CAPTURE }, deps);
    expect(repo.updateCaptureRow.mock.calls[0]![3]).toHaveProperty('removedAt');
    expect(evidence.removeInternalEvidence).toHaveBeenCalledWith(expect.anything(), EVIDENCE);
  });

  it('a removed capture cannot be edited again', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow({ removedAt: new Date() }));
    await expect(updateCapture(internal(), { captureId: CAPTURE, details: { room: 'x' } }, deps)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('markings keep the original untouched', () => {
  const markings = [{ kind: 'arrow', points: [[0.1, 0.1], [0.5, 0.5]], color: '#ef4444' }];
  const annotated = { fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 500 };

  it('creates a new version and a SEPARATE annotated file', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    evidence.beginInternalEvidenceUpload.mockResolvedValue({ evidenceId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
    const result = await saveMarkings(internal(), { captureId: CAPTURE, markings, annotated } as never, deps);
    expect(result.version).toBe(1);
    expect(result.annotatedEvidenceId).not.toBe(EVIDENCE);
    expect(repo.insertVersion.mock.calls[0]![1]).toMatchObject({ captureId: CAPTURE, version: 1, markingCount: 1 });
    expect(repo.updateCaptureRow).toHaveBeenCalledWith({}, ORG, CAPTURE, { markingVersion: 1 });
    // the original evidence is neither re-uploaded nor edited
    expect(repo.syncEvidenceLocation).not.toHaveBeenCalled();
    expect(evidence.beginInternalEvidenceUpload.mock.calls[0]![1].fileName).toBe('infra-1-marked-v1.jpg');
  });

  it('increments the version on every save', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    repo.maxVersionNumber.mockResolvedValue(3);
    const result = await saveMarkings(internal(), { captureId: CAPTURE, markings, annotated } as never, deps);
    expect(result.version).toBe(4);
  });

  it('waits until the original is in the cloud', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow());
    repo.listEvidenceBriefs.mockResolvedValue([{ id: EVIDENCE, documentId: 'doc1', status: 'pending', fileName: 'x.jpg' }]);
    await expect(saveMarkings(internal(), { captureId: CAPTURE, markings, annotated } as never, deps)).rejects.toBeInstanceOf(DomainRuleError);
    expect(repo.insertVersion).not.toHaveBeenCalled();
  });
});

describe('cloud link', () => {
  it('internal users get the provider URL of an uploaded photo', async () => {
    repo.findCaptureJoin.mockResolvedValue(captureRow());
    (deps.folders.providerWebUrl as ReturnType<typeof vi.fn>).mockResolvedValue('https://cloud.example/file');
    expect(await openCaptureInCloud(internal(), { captureId: CAPTURE }, deps)).toEqual({ url: 'https://cloud.example/file' });
  });

  it('returns no link while the photo is still pending', async () => {
    repo.findCaptureJoin.mockResolvedValue(captureRow());
    repo.listEvidenceBriefs.mockResolvedValue([{ id: EVIDENCE, documentId: 'doc1', status: 'pending' }]);
    expect(await openCaptureInCloud(internal(), { captureId: CAPTURE }, deps)).toEqual({ url: null });
  });
});

describe('comparison save ids (explicit save, retry-safe)', () => {
  it('derives stable, slot-specific ids so a retried save re-uses the same files', () => {
    const a = deriveClientId('cmp-1', 'before');
    expect(deriveClientId('cmp-1', 'before')).toBe(a);
    expect(deriveClientId('cmp-1', 'after')).not.toBe(a);
    expect(deriveClientId('cmp-2', 'before')).not.toBe(a);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('comparison save keeps every reference inside the comparison organization and project', () => {
  const pins: [number, number][] = [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]];
  const COMPARISON_CLIENT = 'cccccccc-0000-4000-8000-000000000001';
  const TASK = '12121212-1212-4212-8212-121212121212';
  const OTHER_PROJECT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const input = (extra: Record<string, unknown> = {}) => ({
    projectId: PROJECT,
    locationId: LOCATION,
    clientComparisonId: COMPARISON_CLIENT,
    mode: 'two_photos' as const,
    alignment: { version: 1 as const, kind: 'similarity' as const, beforePins: pins, afterPins: pins, opacity: 0.5 },
    files: { result: { fileName: 'r.jpg', mimeType: 'image/jpeg', sizeBytes: 900 } },
    ...extra,
  });

  beforeEach(() => {
    repo.findComparisonByClientId.mockResolvedValue(null);
    repo.insertComparison.mockResolvedValue(undefined);
    repo.updateComparisonRow.mockResolvedValue(true);
    repo.findCaptureRow.mockResolvedValue(captureRow());
  });

  it('stores the comparison under the authorized organization and project', async () => {
    await beginComparisonSave(internal(), input({ taskId: TASK }), deps);
    expect(repo.insertComparison.mock.calls[0]![1]).toMatchObject({
      organizationId: ORG,
      projectId: PROJECT,
      locationId: LOCATION,
      taskId: TASK,
      createdByActorType: 'internal',
    });
  });

  it('refuses a task that is not in this project BEFORE anything is registered', async () => {
    repo.taskBelongsToProject.mockResolvedValue(false);
    await expect(beginComparisonSave(internal(), input({ taskId: TASK }), deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.taskBelongsToProject).toHaveBeenCalledWith(expect.anything(), ORG, PROJECT, TASK);
    expect(repo.insertComparison).not.toHaveBeenCalled();
    expect(evidence.beginInternalEvidenceUpload).not.toHaveBeenCalled();
  });

  it('refuses a "before" photo from another project of the same organization', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow({ projectId: OTHER_PROJECT }));
    await expect(beginComparisonSave(internal(), input({ beforeCaptureId: CAPTURE }), deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.insertComparison).not.toHaveBeenCalled();
  });

  it('refuses a removed "before" photo', async () => {
    repo.findCaptureRow.mockResolvedValue(captureRow({ removedAt: new Date() }));
    await expect(beginComparisonSave(internal(), input({ beforeCaptureId: CAPTURE }), deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a retry can never re-target an existing comparison to another project or location', async () => {
    const existing = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      organizationId: ORG,
      createdByActorType: 'internal',
      createdByUserId: USER,
      createdByPrincipalId: null,
      removedAt: null,
      beforeCaptureId: null,
      afterCaptureId: null,
      resultEvidenceId: null,
    };
    repo.findComparisonByClientId.mockResolvedValue({ ...existing, projectId: OTHER_PROJECT, locationId: LOCATION });
    await expect(beginComparisonSave(internal(), input(), deps)).rejects.toBeInstanceOf(NotFoundError);
    repo.findComparisonByClientId.mockResolvedValue({ ...existing, projectId: PROJECT, locationId: LOCATION_2 });
    await expect(beginComparisonSave(internal(), input(), deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.updateComparisonRow).not.toHaveBeenCalled();
  });

  it('a contractor cannot save into an organization it has no grant for', async () => {
    await expect(
      beginComparisonSave(contractor(), input({ organizationId: OTHER_ORG }), deps),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.insertComparison).not.toHaveBeenCalled();
  });

  it('a contractor save is attributed to the principal and vendor of the active grant', async () => {
    await beginComparisonSave(contractor(), input({ organizationId: ORG }), deps);
    expect(repo.insertComparison.mock.calls[0]![1]).toMatchObject({
      organizationId: ORG,
      projectId: PROJECT,
      createdByActorType: 'external',
      createdByUserId: null,
      createdByPrincipalId: PRINCIPAL,
      vendorId: 'v1',
    });
  });
});

// A conflict from a removed capture surfaces as ConflictError (409) with its own message key.
describe('removed capture retry', () => {
  it('a retry after removal is a clear conflict', async () => {
    repo.findCaptureByClientId.mockResolvedValue(captureRow());
    repo.listEvidenceBriefs.mockResolvedValue([{ id: EVIDENCE, status: 'removed' }]);
    await expect(beginCapture(internal(), baseInput, deps)).rejects.toBeInstanceOf(ConflictError);
  });
});
