/**
 * finalizeExternalEvidenceUpload with MOCKED repository / audit / events: the chunked video path for a
 * contractor must obey the same ownership rules as the single-request photo path. No SQL, no cloud.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  findEvidenceById: vi.fn(),
  findVisibleEvidence: vi.fn(),
  insertEvidence: vi.fn(),
  markEvidenceAvailable: vi.fn(),
  markEvidenceRemoved: vi.fn(),
}));
vi.mock('@/modules/evidence/data/evidence.repository', () => repo);

const docs = vi.hoisted(() => ({ createPendingProjectDocument: vi.fn(), markProjectDocumentStored: vi.fn() }));
vi.mock('@/modules/evidence/application/document-records', () => docs);

const audit = vi.hoisted(() => ({
  AUDIT_ACTIONS: { EVIDENCE_UPLOADED: 'evidence.uploaded' },
  recordAuditEvent: vi.fn(),
  writeAuditEvent: vi.fn(),
}));
vi.mock('@/shared/audit', () => audit);

const events = vi.hoisted(() => ({ DOMAIN_EVENTS: { EVIDENCE_UPLOADED: 'evidence.uploaded' }, emitDomainEvent: vi.fn() }));
vi.mock('@/shared/domain-events', () => events);

vi.mock('@/modules/project-team', () => ({ PROJECT_CAPABILITIES: {}, hasProjectCapability: vi.fn() }));

import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { finalizeExternalEvidenceUpload } from '@/modules/evidence/application/upload-evidence';
import type { ProjectFileDeps } from '@/modules/evidence/application/file-store';
import type { ExternalContext } from '@/shared/external';

const ORG = '11111111-1111-4111-8111-111111111111';
const PRINCIPAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const context = (vendorId = 'v1'): ExternalContext =>
  ({ principalId: PRINCIPAL, db: {}, grants: [{ organizationId: ORG, projectId: null, vendorId, capabilities: new Set(['ext.document.upload']) }] }) as unknown as ExternalContext;

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'ev-1',
  organizationId: ORG,
  projectId: 'p-1',
  documentId: 'doc-1',
  fileName: 'v.mp4',
  mimeType: 'video/mp4',
  kind: 'video',
  status: 'pending',
  vendorId: 'v1',
  uploadedByActorType: 'external',
  uploadedByPrincipalId: PRINCIPAL,
  ...overrides,
});
const stored = { connectionId: 'c', provider: 'onedrive', externalFileId: 'f', externalParentFolderId: 'x', etag: null, sizeBytes: 5_000_000, checksum: null };
const deps = { elevated: vi.fn(async (fn: (db: unknown) => Promise<unknown>) => fn({})) } as unknown as Pick<ProjectFileDeps, 'elevated'>;

beforeEach(() => {
  vi.clearAllMocks();
  repo.findVisibleEvidence.mockResolvedValue(row());
  repo.markEvidenceAvailable.mockResolvedValue(true);
});

describe('finalizeExternalEvidenceUpload', () => {
  it('records the stored file, audit and event for the uploading contractor', async () => {
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored }, deps)).resolves.toEqual({ evidenceId: 'ev-1' });
    expect(docs.markProjectDocumentStored).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ documentId: 'doc-1', uploadedByUserId: null }));
    expect(audit.writeAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ metadata: { actor: { type: 'external', principalId: PRINCIPAL } } }));
    expect(repo.markEvidenceAvailable).toHaveBeenCalledWith(expect.anything(), ORG, 'ev-1', stored.sizeBytes);
    expect(events.emitDomainEvent).toHaveBeenCalledTimes(1);
  });

  it('refuses another principal, an internal upload, and a vendor outside the contractor\'s grants', async () => {
    repo.findVisibleEvidence.mockResolvedValue(row({ uploadedByPrincipalId: OTHER }));
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored }, deps)).rejects.toBeInstanceOf(NotFoundError);
    repo.findVisibleEvidence.mockResolvedValue(row({ uploadedByActorType: 'internal' }));
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored }, deps)).rejects.toBeInstanceOf(NotFoundError);
    repo.findVisibleEvidence.mockResolvedValue(row({ vendorId: 'v-other' }));
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored }, deps)).rejects.toBeInstanceOf(NotFoundError);
    repo.findVisibleEvidence.mockResolvedValue(null);
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored }, deps)).rejects.toBeInstanceOf(NotFoundError);
    expect(docs.markProjectDocumentStored).not.toHaveBeenCalled();
    expect(repo.markEvidenceAvailable).not.toHaveBeenCalled();
  });

  it('refuses an evidence that is not pending and an empty or oversized stored file', async () => {
    repo.findVisibleEvidence.mockResolvedValue(row({ status: 'available' }));
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored }, deps)).rejects.toBeInstanceOf(DomainRuleError);
    repo.findVisibleEvidence.mockResolvedValue(row());
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored: { ...stored, sizeBytes: 0 } }, deps)).rejects.toBeInstanceOf(DomainRuleError);
    await expect(finalizeExternalEvidenceUpload(context(), { evidenceId: 'ev-1', stored: { ...stored, sizeBytes: 10 * 1024 * 1024 * 1024 } }, deps)).rejects.toBeInstanceOf(DomainRuleError);
    expect(docs.markProjectDocumentStored).not.toHaveBeenCalled();
  });
});
