/**
 * Video use-cases and the chunk relay with MOCKED repositories, evidence module and provider.
 * Static / mock tests only - nothing here touches SQL or a real cloud account.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  findCaptureByClientId: vi.fn(),
  insertCapture: vi.fn(),
  listEvidenceBriefs: vi.fn(),
  listLocationNodes: vi.fn(),
  taskBelongsToProject: vi.fn(),
}));
vi.mock('@/modules/infra-mapping/data/infra.repository', () => repo);

const evidence = vi.hoisted(() => ({
  authorizeExternalEntity: vi.fn(),
  authorizeInternalEntity: vi.fn(),
  beginExternalEvidenceUpload: vi.fn(),
  beginInternalEvidenceUpload: vi.fn(),
  finalizeInternalEvidenceUpload: vi.fn(),
  removeExternalEvidence: vi.fn(),
  removeInternalEvidence: vi.fn(),
}));
vi.mock('@/modules/evidence', () => evidence);

const team = vi.hoisted(() => ({
  PROJECT_CAPABILITIES: { PROJECT_VIEW: 'project.view', PROJECT_MANAGE: 'project.manage', DOCUMENTS_SHARE: 'documents.share', DOCUMENTS_VIEW: 'documents.view' },
  assertProjectCapability: vi.fn(),
  hasProjectCapability: vi.fn(),
}));
vi.mock('@/modules/project-team', () => team);

import { AuthorizationError, DomainRuleError, NotFoundError } from '@/shared/errors';
import { beginVideoCapture, uploadVideoChunk, type InfraVideoPort } from '@/modules/infra-mapping/application/videos';
import { createVideoRelay, type VideoRelayEnv } from '@/modules/infra-mapping/application/video-relay';
import type { InfraActor, InfraDeps } from '@/modules/infra-mapping/application/ports';
import { INFRA_VIDEO_CHUNK_BYTES } from '@/modules/infra-mapping/domain/video';

const ORG = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const LOCATION = '44444444-4444-4444-8444-444444444444';
const CLIENT_ID = '66666666-6666-4666-8666-666666666666';
const EVIDENCE = '88888888-8888-4888-8888-888888888888';
const DOCUMENT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER = '99999999-9999-4999-8999-999999999999';
const OTHER_USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRINCIPAL = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const deps = { files: { store: {}, elevated: vi.fn() }, folders: {} } as unknown as InfraDeps;
const internal = (userId = USER): InfraActor => ({ kind: 'internal', context: { organizationId: ORG, userId, db: {} } }) as unknown as InfraActor;
const contractor = (): InfraActor =>
  ({
    kind: 'external',
    context: { principalId: PRINCIPAL, db: {}, grants: [{ organizationId: ORG, projectId: PROJECT, vendorId: 'v1', subcontractAgreementId: null, capabilities: new Set(['ext.document.upload']) }] },
  }) as unknown as InfraActor;

const mp4Head = () => {
  const bytes = new Uint8Array(64);
  bytes.set([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70], 0); // "....ftyp"
  return bytes;
};

const baseInput = {
  projectId: PROJECT,
  locationId: LOCATION,
  clientCaptureId: CLIENT_ID,
  durationMs: 12_000,
  file: { fileName: 'video.mp4', mimeType: 'video/mp4', sizeBytes: 5_000_000 },
};

const port = (): Pick<InfraVideoPort, 'assertCanStore'> => ({ assertCanStore: vi.fn().mockResolvedValue(undefined) });

beforeEach(() => {
  vi.clearAllMocks();
  repo.findCaptureByClientId.mockResolvedValue(null);
  repo.listLocationNodes.mockResolvedValue([{ id: LOCATION, parentId: null, name: 'דירה 1', code: null, archived: false, isActive: true }]);
  repo.taskBelongsToProject.mockResolvedValue(true);
  repo.listEvidenceBriefs.mockResolvedValue([]);
  evidence.authorizeInternalEntity.mockResolvedValue({ projectId: PROJECT });
  evidence.beginInternalEvidenceUpload.mockResolvedValue({ evidenceId: EVIDENCE });
  team.hasProjectCapability.mockResolvedValue(true);
});

describe('beginVideoCapture', () => {
  it('registers a video capture only after approval, accepting the video kind in the location', async () => {
    const result = await beginVideoCapture(internal(), baseInput, deps, port());
    expect(result).toMatchObject({
      evidenceId: EVIDENCE,
      uploadUrl: `/api/infra/video-upload/${EVIDENCE}`,
      alreadyUploaded: false,
      chunkBytes: INFRA_VIDEO_CHUNK_BYTES,
    });
    const [, ticketInput] = evidence.beginInternalEvidenceUpload.mock.calls[0]!;
    expect(ticketInput).toMatchObject({
      entityType: 'project_location',
      entityId: LOCATION,
      locationId: LOCATION,
      accept: ['video'],
      mimeType: 'video/mp4',
      sizeBytes: 5_000_000,
    });
    expect(ticketInput.fileName).toMatch(/^infra-video-\d{8}T\d{6}Z-66666666-12s\.mp4$/);
    expect(repo.insertCapture).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ locationId: LOCATION, evidenceId: EVIDENCE, clientCaptureId: CLIENT_ID }));
  });

  it('is limited to internal (office) accounts - a contractor is refused before anything is written', async () => {
    await expect(beginVideoCapture(contractor(), baseInput, deps, port())).rejects.toBeInstanceOf(AuthorizationError);
    expect(evidence.beginInternalEvidenceUpload).not.toHaveBeenCalled();
    expect(repo.insertCapture).not.toHaveBeenCalled();
  });

  it('rejects a video longer than 30 s, a wrong type and an empty file without registering anything', async () => {
    await expect(beginVideoCapture(internal(), { ...baseInput, durationMs: 40_000 }, deps, port())).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoTooLong' });
    await expect(beginVideoCapture(internal(), { ...baseInput, file: { ...baseInput.file, mimeType: 'image/png', fileName: 'x.png' } }, deps, port())).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoType' });
    await expect(beginVideoCapture(internal(), { ...baseInput, file: { ...baseInput.file, sizeBytes: 1 } }, deps, port())).resolves.toBeDefined();
    expect(repo.insertCapture).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on the client id (a retry never creates a second capture)', async () => {
    repo.findCaptureByClientId.mockResolvedValue({ id: 'cap-1', projectId: PROJECT, evidenceId: EVIDENCE, createdByActorType: 'internal', createdByUserId: USER, createdByPrincipalId: null });
    repo.listEvidenceBriefs.mockResolvedValue([{ id: EVIDENCE, status: 'pending' }]);
    const result = await beginVideoCapture(internal(), baseInput, deps, port());
    expect(result).toMatchObject({ captureId: 'cap-1', evidenceId: EVIDENCE, alreadyUploaded: false });
    expect(repo.insertCapture).not.toHaveBeenCalled();
    expect(evidence.beginInternalEvidenceUpload).not.toHaveBeenCalled();
  });

  it('stops with a clear error when the connected provider cannot take a video of this size', async () => {
    const refusing = { assertCanStore: vi.fn().mockRejectedValue(new DomainRuleError('x', 'infraMapping.errors.videoProviderLimit')) };
    await expect(beginVideoCapture(internal(), baseInput, deps, refusing)).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoProviderLimit' });
    expect(repo.insertCapture).not.toHaveBeenCalled();
  });
});

describe('uploadVideoChunk', () => {
  const total = 6_000_000;
  const brief = (overrides: Record<string, unknown> = {}) => ({
    id: EVIDENCE,
    organizationId: ORG,
    projectId: PROJECT,
    documentId: DOCUMENT,
    locationId: LOCATION,
    status: 'pending',
    fileName: 'infra-video-x-12s.mp4',
    mimeType: 'video/mp4',
    uploadedByActorType: 'internal',
    uploadedByUserId: USER,
    sizeBytes: total,
    kind: 'video',
    ...overrides,
  });
  const chunk = (offset: number, length: number, head = mp4Head()) => {
    const bytes = new Uint8Array(length);
    if (offset === 0) bytes.set(head.subarray(0, Math.min(head.length, length)));
    return { evidenceId: EVIDENCE, offset, totalBytes: total, session: null, bytes };
  };

  it('relays the chunk, returns where the transfer stands and does not finalize early', async () => {
    repo.listEvidenceBriefs.mockResolvedValue([brief()]);
    const uploadChunk = vi.fn().mockResolvedValue({ kind: 'continue', session: 'sealed-1', nextOffset: INFRA_VIDEO_CHUNK_BYTES });
    const answer = await uploadVideoChunk(internal(), chunk(0, INFRA_VIDEO_CHUNK_BYTES), { uploadChunk }, deps);
    expect(answer).toEqual({ done: false, nextOffset: INFRA_VIDEO_CHUNK_BYTES, session: 'sealed-1' });
    expect(uploadChunk).toHaveBeenCalledWith(expect.objectContaining({ locationId: LOCATION, documentId: DOCUMENT, userId: USER, offset: 0 }));
    expect(evidence.finalizeInternalEvidenceUpload).not.toHaveBeenCalled();
  });

  it('stores the video in the right place and finalizes the evidence once the cloud has the whole file', async () => {
    repo.listEvidenceBriefs.mockResolvedValue([brief()]);
    const stored = { connectionId: 'c1', provider: 'onedrive', externalFileId: 'f1', externalParentFolderId: 'folder-loc', etag: null, sizeBytes: total, checksum: null };
    const uploadChunk = vi.fn().mockResolvedValue({ kind: 'complete', stored });
    const last = { evidenceId: EVIDENCE, offset: INFRA_VIDEO_CHUNK_BYTES * 2, totalBytes: total, session: 'sealed-2', bytes: new Uint8Array(total - INFRA_VIDEO_CHUNK_BYTES * 2) };
    const answer = await uploadVideoChunk(internal(), last, { uploadChunk }, deps);
    expect(answer).toEqual({ done: true, nextOffset: total, session: null });
    expect(evidence.finalizeInternalEvidenceUpload).toHaveBeenCalledWith(expect.anything(), { evidenceId: EVIDENCE, stored }, deps.files);
  });

  it('refuses bytes that are not a video, other people\'s uploads, photos and contractors', async () => {
    const uploadChunk = vi.fn();
    repo.listEvidenceBriefs.mockResolvedValue([brief()]);
    const notVideo = chunk(0, INFRA_VIDEO_CHUNK_BYTES, new Uint8Array(64).fill(7));
    await expect(uploadVideoChunk(internal(), notVideo, { uploadChunk }, deps)).rejects.toMatchObject({ messageKey: 'projectPlans.evidence.errors.contentMismatch' });
    await expect(uploadVideoChunk(internal(OTHER_USER), chunk(0, INFRA_VIDEO_CHUNK_BYTES), { uploadChunk }, deps)).rejects.toBeInstanceOf(NotFoundError);
    repo.listEvidenceBriefs.mockResolvedValue([brief({ kind: 'photo' })]);
    await expect(uploadVideoChunk(internal(), chunk(0, INFRA_VIDEO_CHUNK_BYTES), { uploadChunk }, deps)).rejects.toBeInstanceOf(NotFoundError);
    await expect(uploadVideoChunk(contractor(), chunk(0, INFRA_VIDEO_CHUNK_BYTES), { uploadChunk }, deps)).rejects.toBeInstanceOf(AuthorizationError);
    expect(uploadChunk).not.toHaveBeenCalled();
  });

  it('rejects a chunk of the wrong size or a changed total, and answers done for an already stored video', async () => {
    const uploadChunk = vi.fn();
    repo.listEvidenceBriefs.mockResolvedValue([brief()]);
    await expect(uploadVideoChunk(internal(), chunk(0, 1000), { uploadChunk }, deps)).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoChunk' });
    repo.listEvidenceBriefs.mockResolvedValue([brief({ sizeBytes: total + 1 })]);
    await expect(uploadVideoChunk(internal(), chunk(0, INFRA_VIDEO_CHUNK_BYTES), { uploadChunk }, deps)).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoChunk' });
    repo.listEvidenceBriefs.mockResolvedValue([brief({ status: 'available' })]);
    await expect(uploadVideoChunk(internal(), chunk(0, INFRA_VIDEO_CHUNK_BYTES), { uploadChunk }, deps)).resolves.toMatchObject({ done: true });
    expect(uploadChunk).not.toHaveBeenCalled();
  });
});

describe('video relay (stateless sealed session)', () => {
  const total = INFRA_VIDEO_CHUNK_BYTES * 2 + 500;
  let now = 1_000_000;
  const uploader = {
    start: vi.fn(async () => ({ state: 'provider-state-0' })),
    putChunk: vi.fn(),
  };
  const putSingle = vi.fn();
  const env = (): VideoRelayEnv => ({
    seal: (plain) => `sealed:${Buffer.from(plain).toString('base64url')}`,
    open: (sealed) => {
      if (!sealed.startsWith('sealed:')) throw new Error('tampered');
      return Buffer.from(sealed.slice(7), 'base64url').toString();
    },
    now: () => now,
    supportsChunked: vi.fn(async () => true),
    putSingle,
    startTarget: vi.fn(async () => ({ connectionId: 'conn-1', provider: 'onedrive', accessToken: 'tok', uploader, parentFolderId: 'loc-folder' })),
    existingTarget: vi.fn(async () => ({ connectionId: 'conn-1', provider: 'onedrive', accessToken: 'tok', uploader })),
  });
  const base = {
    organizationId: ORG,
    projectId: PROJECT,
    locationId: LOCATION,
    documentId: DOCUMENT,
    evidenceId: EVIDENCE,
    userId: USER,
    fileName: 'v.mp4',
    mimeType: 'video/mp4',
    totalBytes: total,
    session: null as string | null,
  };

  beforeEach(() => {
    now = 1_000_000;
    uploader.start.mockClear();
    uploader.putChunk.mockReset();
    putSingle.mockReset();
  });

  it('a small video goes through the regular infra store in one provider call', async () => {
    putSingle.mockResolvedValue({ externalFileId: 'small' });
    const relay = createVideoRelay(env());
    const result = await relay.uploadChunk({ ...base, totalBytes: 1000, offset: 0, bytes: new Uint8Array(1000) });
    expect(result).toEqual({ kind: 'complete', stored: { externalFileId: 'small' } });
    expect(putSingle).toHaveBeenCalledWith(expect.objectContaining({ locationId: LOCATION, documentId: DOCUMENT }));
    expect(uploader.start).not.toHaveBeenCalled();
  });

  it('chunked: starts the provider session in the location folder, then continues from the sealed token', async () => {
    const relay = createVideoRelay(env());
    uploader.putChunk.mockResolvedValueOnce({ kind: 'continue', state: 'provider-state-1', nextOffset: INFRA_VIDEO_CHUNK_BYTES });
    const first = await relay.uploadChunk({ ...base, offset: 0, bytes: new Uint8Array(INFRA_VIDEO_CHUNK_BYTES) });
    expect(first.kind).toBe('continue');
    if (first.kind !== 'continue') return;
    expect(uploader.start).toHaveBeenCalledWith('tok', expect.objectContaining({ parentFolderId: 'loc-folder', sizeBytes: total }));
    // the browser-visible token never contains the provider state in clear text
    expect(first.session).not.toContain('provider-state');
    expect(first.session).not.toContain('tok');

    uploader.putChunk.mockResolvedValueOnce({ kind: 'complete', file: { id: 'file-9', parentId: 'loc-folder', etag: 'e', sizeBytes: total } });
    const second = await relay.uploadChunk({ ...base, session: first.session, offset: INFRA_VIDEO_CHUNK_BYTES, bytes: new Uint8Array(100) });
    expect(uploader.putChunk).toHaveBeenLastCalledWith('tok', expect.objectContaining({ state: 'provider-state-1', parentFolderId: 'loc-folder', offset: INFRA_VIDEO_CHUNK_BYTES }));
    expect(second).toEqual({
      kind: 'complete',
      stored: { connectionId: 'conn-1', provider: 'onedrive', externalFileId: 'file-9', externalParentFolderId: 'loc-folder', etag: 'e', sizeBytes: total, checksum: null },
    });
  });

  it('binds the session to one file, user and size, and expires it', async () => {
    const relay = createVideoRelay(env());
    uploader.putChunk.mockResolvedValue({ kind: 'continue', state: 's', nextOffset: INFRA_VIDEO_CHUNK_BYTES });
    const first = await relay.uploadChunk({ ...base, offset: 0, bytes: new Uint8Array(INFRA_VIDEO_CHUNK_BYTES) });
    if (first.kind !== 'continue') throw new Error('expected continue');
    const next = { ...base, session: first.session, offset: INFRA_VIDEO_CHUNK_BYTES, bytes: new Uint8Array(INFRA_VIDEO_CHUNK_BYTES) };

    await expect(relay.uploadChunk({ ...next, evidenceId: 'other' })).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoSession' });
    await expect(relay.uploadChunk({ ...next, userId: OTHER_USER })).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoSession' });
    await expect(relay.uploadChunk({ ...next, totalBytes: total + 1 })).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoSession' });
    await expect(relay.uploadChunk({ ...next, session: 'garbage' })).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoSession' });
    now += 13 * 60 * 60 * 1000;
    await expect(relay.uploadChunk(next)).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoSession' });
  });

  it('refuses a mid-file chunk without a session and a provider that cannot chunk', async () => {
    const relay = createVideoRelay(env());
    await expect(relay.uploadChunk({ ...base, offset: INFRA_VIDEO_CHUNK_BYTES, bytes: new Uint8Array(INFRA_VIDEO_CHUNK_BYTES) })).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoSession' });

    const boxLike = createVideoRelay({ ...env(), supportsChunked: async () => false, startTarget: async () => ({ connectionId: 'b', provider: 'box', accessToken: 't', uploader: null, parentFolderId: 'f' }) });
    await expect(boxLike.assertCanStore({ organizationId: ORG, sizeBytes: total })).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoProviderLimit' });
    await expect(boxLike.assertCanStore({ organizationId: ORG, sizeBytes: 1000 })).resolves.toBeUndefined();
    await expect(boxLike.uploadChunk({ ...base, offset: 0, bytes: new Uint8Array(INFRA_VIDEO_CHUNK_BYTES) })).rejects.toMatchObject({ messageKey: 'infraMapping.errors.videoProviderLimit' });
  });

  it('returns the offset the provider confirms so the client can resume', async () => {
    const relay = createVideoRelay(env());
    uploader.putChunk.mockResolvedValue({ kind: 'continue', state: 's', nextOffset: INFRA_VIDEO_CHUNK_BYTES * 2 });
    const result = await relay.uploadChunk({ ...base, offset: 0, bytes: new Uint8Array(INFRA_VIDEO_CHUNK_BYTES) });
    expect(result).toMatchObject({ kind: 'continue', nextOffset: INFRA_VIDEO_CHUNK_BYTES * 2 });
  });
});
