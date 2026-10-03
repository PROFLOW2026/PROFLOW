import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  documentLinks,
  documentShares,
  documents,
  domainEvents,
  drawingRevisionAcknowledgements,
  drawingRevisions,
  drawings,
  evidenceItems,
  storageFiles,
} from '@drizzle/schema';
import {
  beginExternalEvidenceUpload,
  beginInternalEvidenceUpload,
  completeExternalEvidenceUpload,
  completeInternalEvidenceUpload,
  countEvidence,
  listEvidence,
  openExternalEvidenceFile,
  removeExternalEvidence,
} from '@/modules/evidence';
import { addProjectMember } from '@/modules/project-team';
import {
  acknowledgeDrawingRevision,
  acknowledgeSharedDocument,
  addDrawingRevisionFromDocument,
  beginDrawingRevisionUpload,
  completeDrawingRevisionUpload,
  createDrawing,
  getContractorDrawing,
  getContractorPlansPortalSummary,
  getDrawingDetail,
  listContractorPlans,
  listContractorSharedDocuments,
  listProjectDrawings,
  openExternalSharedDocumentFile,
  publishDrawingRevision,
  revokeDocumentShare,
  setDrawingDistribution,
  shareDocumentWithContractors,
  updateDrawing,
} from '@/modules/project-plans';
import { resolveEntityScope } from '@/shared/entity-access';
import { EXTERNAL_CAPABILITIES as X } from '@/shared/external';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  externalContextFor,
  orgContextFor,
  type ContractorFixture,
} from '@tests/setup/dg-fixtures';
import {
  HTML_BYTES,
  JPEG_BYTES,
  PDF_BYTES,
  createFakeFileStore,
  depsFor,
  elevatedFor,
  streamToBytes,
  type FakeFileStore,
} from '@tests/setup/dg-fixtures-documents';
import { seedOrganizationStorageConnection } from '@tests/setup/external-storage-fixture';
import { provisionTwoTenants } from '../projects/setup';

describe('Track IJ: evidence, contractor sharing, drawings (migration 0162)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
  });

  async function scenario() {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
    const otherProjectId = await createProjectAs(database, userA.id, orgId, 'Other');
    const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
    const pm = await addOrgMember(database, orgId, 'pm');
    const viewer = await addOrgMember(database, orgId, 'viewer');
    const outsider = await addOrgMember(database, orgId, 'outsider');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: pm.id, templateKey: 'project_manager_operational' });
      await addProjectMember(context, { projectId, userId: viewer.id, templateKey: 'viewer' });
    });
    const connectionId = await database.asService((db) => seedOrganizationStorageConnection(db, orgId, userA.id));
    const store = createFakeFileStore({ connectionId });
    return { orgId, userA, projectId, otherProjectId, contractorA, contractorB, pm, viewer, outsider, store };
  }

  type Scenario = Awaited<ReturnType<typeof scenario>>;

  async function asInternal<T>(s: Scenario, userId: string, fn: (ctx: Awaited<ReturnType<typeof orgContextFor>>, tx: Parameters<Parameters<TestDatabase['asUser']>[1]>[0]) => Promise<T>) {
    return database.asUser(userId, async (tx) => fn(await orgContextFor(tx, userId, s.orgId), tx));
  }

  async function asContractor<T>(s: Scenario, contractor: ContractorFixture, fn: (ctx: Awaited<ReturnType<typeof externalContextFor>>, tx: Parameters<Parameters<TestDatabase['asUser']>[1]>[0]) => Promise<T>) {
    // Grants are read before the RLS transaction opens (PGlite has a single connection).
    const base = await externalContextFor(database, null as never, contractor, s.orgId);
    return database.asUser(contractor.authUser.id, async (tx) => fn({ ...base, db: tx }, tx));
  }

  /** Drawing with Rev `label` published from a fresh upload. */
  async function publishedDrawing(
    s: Scenario,
    options: { number?: string; visibility?: 'internal' | 'all_contractors' | 'distribution'; label?: string } = {},
  ) {
    return asInternal(s, s.pm.id, async (ctx, tx) => {
      const deps = depsFor(tx, s.store);
      const { drawingId } = await createDrawing(ctx, {
        projectId: s.projectId,
        drawingNumber: options.number ?? 'A-101',
        title: 'Ground floor plan',
        discipline: 'architecture',
        contractorVisibility: options.visibility ?? 'all_contractors',
      });
      const ticket = await beginDrawingRevisionUpload(
        ctx,
        { drawingId, revisionLabel: options.label ?? '3', fileName: 'A-101.pdf', mimeType: 'application/pdf', sizeBytes: PDF_BYTES.length },
        deps,
      );
      await completeDrawingRevisionUpload(ctx, { revisionId: ticket.revisionId, contentType: 'application/pdf', bytes: PDF_BYTES }, deps);
      await publishDrawingRevision(ctx, ticket.revisionId);
      return { drawingId, revisionId: ticket.revisionId };
    });
  }

  async function uploadInternal(s: Scenario, userId: string, entityType: string, entityId: string, visibility: 'internal' | 'contractor') {
    return asInternal(s, userId, async (ctx, tx) => {
      const deps = depsFor(tx, s.store);
      const ticket = await beginInternalEvidenceUpload(
        ctx,
        { entityType, entityId, fileName: 'site.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG_BYTES.length, caption: 'Rebar check', visibility },
        deps,
      );
      await completeInternalEvidenceUpload(ctx, { evidenceId: ticket.evidenceId, contentType: 'image/jpeg', bytes: JPEG_BYTES }, deps);
      return ticket;
    });
  }

  it('stores internal evidence once through documents + document_links + storage_files', async () => {
    const s = await scenario();
    const { drawingId } = await publishedDrawing(s);
    const ticket = await uploadInternal(s, s.pm.id, 'drawing', drawingId, 'internal');
    expect(ticket.uploadUrl).toBe(`/api/dg-files/upload/evidence/${ticket.evidenceId}`);

    await database.asService(async (db) => {
      const [doc] = await db.select().from(documents).where(eq(documents.id, ticket.documentId));
      expect(doc!.status).toBe('available');
      expect(doc!.storageBackend).toBe('external');
      expect(doc!.currentVersionId).not.toBeNull();
      const links = await db.select().from(documentLinks).where(eq(documentLinks.documentId, ticket.documentId));
      expect(links.map((link) => [link.ownerType, link.ownerId])).toEqual([['project', s.projectId]]);
      expect(await db.select().from(storageFiles).where(eq(storageFiles.documentId, ticket.documentId))).toHaveLength(1);
      const [row] = await db.select().from(evidenceItems).where(eq(evidenceItems.id, ticket.evidenceId));
      expect(row).toMatchObject({ status: 'available', uploadedByActorType: 'internal', uploadedByUserId: s.pm.id, caption: 'Rebar check' });
      const events = await db.select().from(domainEvents).where(eq(domainEvents.entityId, ticket.evidenceId));
      expect(events.map((event) => event.eventType)).toEqual(['evidence.item.uploaded']);
    });
    expect(s.store.files.get(ticket.documentId)?.folder).toBe('photos');

    await asInternal(s, s.viewer.id, async (ctx) => {
      const items = await listEvidence(ctx.db, { organizationId: s.orgId, entityType: 'drawing', entityId: drawingId, audience: 'internal' });
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: 'photo', fileName: 'site.jpg', visibility: 'internal', uploader: { type: 'internal' } });
      expect(await countEvidence(ctx.db, { organizationId: s.orgId, entityType: 'drawing', entityId: drawingId })).toBe(1);
    });
  });

  it('rejects disallowed types, spoofed content and callers without project access', async () => {
    const s = await scenario();
    const { drawingId } = await publishedDrawing(s);
    await asInternal(s, s.pm.id, async (ctx, tx) => {
      const deps = depsFor(tx, s.store);
      await expect(
        beginInternalEvidenceUpload(ctx, { entityType: 'drawing', entityId: drawingId, fileName: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }, deps),
      ).rejects.toMatchObject({ messageKey: 'projectPlans.evidence.errors.fileType' });
      await expect(
        beginInternalEvidenceUpload(ctx, { entityType: 'drawing', entityId: drawingId, fileName: 'huge.jpg', mimeType: 'image/jpeg', sizeBytes: 500 * 1024 * 1024 }, deps),
      ).rejects.toMatchObject({ messageKey: 'projectPlans.evidence.errors.tooLarge' });
      const ticket = await beginInternalEvidenceUpload(
        ctx,
        { entityType: 'drawing', entityId: drawingId, fileName: '../../etc/photo.jpg', mimeType: 'image/jpeg', sizeBytes: HTML_BYTES.length },
        deps,
      );
      expect(ticket.fileName).toBe('photo.jpg');
      await expect(
        completeInternalEvidenceUpload(ctx, { evidenceId: ticket.evidenceId, contentType: 'image/jpeg', bytes: HTML_BYTES }, deps),
      ).rejects.toMatchObject({ messageKey: 'projectPlans.evidence.errors.contentMismatch' });
    });
    await database.asUser(s.outsider.id, async (tx) => {
      const ctx = await orgContextFor(tx, s.outsider.id, s.orgId);
      await expect(
        beginInternalEvidenceUpload(ctx, { entityType: 'drawing', entityId: drawingId, fileName: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }, depsFor(tx, s.store)),
      ).rejects.toBeDefined();
    });
  });

  it('isolates contractor A evidence from contractor B and hides internal-only items', async () => {
    const s = await scenario();
    const { drawingId } = await publishedDrawing(s);
    await uploadInternal(s, s.pm.id, 'drawing', drawingId, 'internal');
    await uploadInternal(s, s.pm.id, 'drawing', drawingId, 'contractor');

    const ticketA = await asContractor(s, s.contractorA, async (ctx, tx) => {
      const deps = depsFor(tx, s.store);
      const ticket = await beginExternalEvidenceUpload(
        ctx,
        { organizationId: s.orgId, entityType: 'drawing', entityId: drawingId, fileName: 'IMG_0001.HEIC', mimeType: 'image/jpeg', sizeBytes: JPEG_BYTES.length, visibility: 'internal' },
        deps,
      );
      expect(ticket.uploadUrl).toBe(`/api/contractor/dg-files/upload/evidence/${ticket.evidenceId}`);
      await completeExternalEvidenceUpload(ctx, { evidenceId: ticket.evidenceId, contentType: 'image/jpeg', bytes: JPEG_BYTES }, deps);
      return ticket;
    });

    await database.asService(async (db) => {
      const [row] = await db.select().from(evidenceItems).where(eq(evidenceItems.id, ticketA.evidenceId));
      expect(row).toMatchObject({ vendorId: s.contractorA.vendorId, visibility: 'contractor', uploadedByActorType: 'external', uploadedByPrincipalId: s.contractorA.principalId });
    });

    const seenBy = async (contractor: ContractorFixture) =>
      asContractor(s, contractor, async (ctx) =>
        (await listEvidence(ctx.db, { organizationId: s.orgId, entityType: 'drawing', entityId: drawingId, audience: 'contractor' })).map((item) => item.vendorId ?? 'project'),
      );
    expect((await seenBy(s.contractorA)).sort()).toEqual(['project', s.contractorA.vendorId].sort());
    expect(await seenBy(s.contractorB)).toEqual(['project']);

    // B cannot open A's file even with its id (no cross-contractor path access).
    await asContractor(s, s.contractorB, async (ctx) => {
      await expect(openExternalEvidenceFile(ctx, { evidenceId: ticketA.evidenceId }, { store: s.store })).rejects.toMatchObject({ code: 'not_found' });
    });
    await asContractor(s, s.contractorA, async (ctx, tx) => {
      const file = await openExternalEvidenceFile(ctx, { evidenceId: ticketA.evidenceId }, { store: s.store });
      expect(await streamToBytes(file.stream)).toEqual(JPEG_BYTES);
      await removeExternalEvidence(ctx, { organizationId: s.orgId, evidenceId: ticketA.evidenceId }, { elevated: elevatedFor(tx) });
    });

    await asInternal(s, s.pm.id, async (ctx) => {
      const items = await listEvidence(ctx.db, { organizationId: s.orgId, entityType: 'drawing', entityId: drawingId, audience: 'internal' });
      expect(items).toHaveLength(2);
    });
  });

  it('keeps contractor-scoped entities away from other contractors (shared document to agreement A)', async () => {
    const s = await scenario();
    const documentId = await asInternal(s, s.pm.id, async (ctx, tx) => {
      const deps = depsFor(tx, s.store);
      const { drawingId } = await createDrawing(ctx, { projectId: s.projectId, drawingNumber: 'S-1', title: 'Spec', discipline: 'structure' });
      const ticket = await beginDrawingRevisionUpload(ctx, { drawingId, revisionLabel: '1', fileName: 'spec.pdf', mimeType: 'application/pdf', sizeBytes: PDF_BYTES.length }, deps);
      await completeDrawingRevisionUpload(ctx, { revisionId: ticket.revisionId, contentType: 'application/pdf', bytes: PDF_BYTES }, deps);
      return ticket.documentId;
    });
    const { shareId } = await asInternal(s, s.pm.id, (ctx, tx) =>
      shareDocumentWithContractors(
        ctx,
        { projectId: s.projectId, documentId, audience: 'agreement', agreementId: s.contractorA.agreementId, acknowledgementRequired: true, note: 'Please confirm' },
        { elevated: elevatedFor(tx) },
      ),
    );

    await asContractor(s, s.contractorA, async (ctx, tx) => {
      const listed = await listContractorSharedDocuments(ctx, { organizationId: s.orgId, projectId: s.projectId });
      expect(listed.items.map((item) => item.shareId)).toEqual([shareId]);
      expect(listed.items[0]!.acknowledgedAt).toBeNull();
      expect(await acknowledgeSharedDocument(ctx, { organizationId: s.orgId, shareId }, { elevated: elevatedFor(tx) })).toEqual({ acknowledged: true });
      expect(await acknowledgeSharedDocument(ctx, { organizationId: s.orgId, shareId }, { elevated: elevatedFor(tx) })).toEqual({ acknowledged: false });
      const file = await openExternalSharedDocumentFile(ctx, { shareId }, { store: s.store });
      expect(await streamToBytes(file.stream)).toEqual(PDF_BYTES);
      const scope = await resolveEntityScope(ctx.db, 'shared_document', s.orgId, shareId);
      expect(scope).toMatchObject({ vendorId: s.contractorA.vendorId, subcontractAgreementId: s.contractorA.agreementId });
    });

    await asContractor(s, s.contractorB, async (ctx, tx) => {
      expect((await listContractorSharedDocuments(ctx, { organizationId: s.orgId, projectId: s.projectId })).items).toEqual([]);
      expect(await resolveEntityScope(ctx.db, 'shared_document', s.orgId, shareId)).toBeNull();
      await expect(
        beginExternalEvidenceUpload(ctx, { organizationId: s.orgId, entityType: 'shared_document', entityId: shareId, fileName: 'x.jpg', mimeType: 'image/jpeg', sizeBytes: 10 }, depsFor(tx, s.store)),
      ).rejects.toMatchObject({ code: 'not_found' });
      await expect(openExternalSharedDocumentFile(ctx, { shareId }, { store: s.store })).rejects.toMatchObject({ code: 'not_found' });
    });

    // Internal view shows the acknowledgement; revoke hides it and is final.
    await asInternal(s, s.pm.id, async (ctx) => {
      await revokeDocumentShare(ctx, shareId);
    });
    await asInternal(s, s.pm.id, async (ctx) => {
      await expect(
        ctx.db.update(documentShares).set({ note: 'tamper' }).where(eq(documentShares.id, shareId)),
      ).rejects.toBeDefined();
    });
    await asContractor(s, s.contractorA, async (ctx) => {
      expect((await listContractorSharedDocuments(ctx, { organizationId: s.orgId, projectId: s.projectId })).items).toEqual([]);
    });
  });

  it('publishing Rev 4 supersedes Rev 3, which stays as history; contractors acknowledge only the current revision', async () => {
    const s = await scenario();
    const { drawingId, revisionId: rev3 } = await publishedDrawing(s, { label: '3' });

    const rev4 = await asInternal(s, s.pm.id, async (ctx, tx) => {
      const deps = depsFor(tx, s.store);
      const detail = await getDrawingDetail(ctx, drawingId, deps);
      expect(detail.suggestedNextLabel).toBe('4');
      const ticket = await beginDrawingRevisionUpload(ctx, { drawingId, revisionLabel: '4', fileName: 'A-101 rev4.pdf', mimeType: 'application/pdf', sizeBytes: PDF_BYTES.length, description: 'Moved stair core' }, deps);
      await expect(publishDrawingRevision(ctx, ticket.revisionId)).rejects.toMatchObject({ messageKey: 'projectPlans.errors.fileNotReady' });
      await completeDrawingRevisionUpload(ctx, { revisionId: ticket.revisionId, contentType: 'application/pdf', bytes: PDF_BYTES }, deps);
      const result = await publishDrawingRevision(ctx, ticket.revisionId);
      expect(result.supersededRevisionId).toBe(rev3);
      return ticket.revisionId;
    });

    await database.asService(async (db) => {
      const rows = await db.select().from(drawingRevisions).where(eq(drawingRevisions.drawingId, drawingId));
      const byId = new Map(rows.map((row) => [row.id, row]));
      expect(byId.get(rev3)).toMatchObject({ status: 'superseded', supersededByRevisionId: rev4 });
      expect(byId.get(rev4)).toMatchObject({ status: 'current', supersedesRevisionId: rev3 });
      const [drawing] = await db.select().from(drawings).where(eq(drawings.id, drawingId));
      expect(drawing!.currentRevisionId).toBe(rev4);
      const events = await db.select().from(domainEvents).where(eq(domainEvents.eventType, 'plan.revision.published'));
      expect(events).toHaveLength(2);
    });

    await asInternal(s, s.pm.id, async (ctx, tx) => {
      // Re-using an existing project file as a new draft revision does not copy it.
      const [rev4Row] = await tx.select().from(drawingRevisions).where(eq(drawingRevisions.id, rev4));
      const reuse = await addDrawingRevisionFromDocument(
        ctx,
        { drawingId, revisionLabel: '5', documentId: rev4Row!.documentId },
        { elevated: elevatedFor(tx) },
      );
      const [reused] = await tx.select().from(drawingRevisions).where(eq(drawingRevisions.id, reuse.revisionId));
      expect(reused).toMatchObject({ status: 'draft', documentId: rev4Row!.documentId, fileReady: true });
      await expect(
        addDrawingRevisionFromDocument(ctx, { drawingId, revisionLabel: '4', documentId: rev4Row!.documentId }, { elevated: elevatedFor(tx) }),
      ).rejects.toMatchObject({ messageKey: 'projectPlans.errors.revisionTaken' });
    });
    await asInternal(s, s.pm.id, async (_ctx, tx) => {
      // Superseded history is frozen at the DB level.
      await expect(
        tx.update(drawingRevisions).set({ status: 'current' }).where(eq(drawingRevisions.id, rev3)),
      ).rejects.toBeDefined();
    });
    await asInternal(s, s.pm.id, async (_ctx, tx) => {
      await expect(
        tx.update(drawingRevisions).set({ fileName: 'swapped.pdf' }).where(eq(drawingRevisions.id, rev4)),
      ).rejects.toBeDefined();
    });

    await asContractor(s, s.contractorA, async (ctx, tx) => {
      const plans = await listContractorPlans(ctx, { organizationId: s.orgId, projectId: s.projectId });
      expect(plans.items).toHaveLength(1);
      expect(plans.items[0]).toMatchObject({ currentRevisionId: rev4, revisionLabel: '4', acknowledgementPending: true });
      const detail = await getContractorDrawing(ctx, { organizationId: s.orgId, drawingId });
      expect(detail.revisions.map((revision) => [revision.revisionLabel, revision.status])).toEqual([
        ['4', 'current'],
        ['3', 'superseded'],
      ]);
      await expect(
        acknowledgeDrawingRevision(ctx, { organizationId: s.orgId, revisionId: rev3 }, { elevated: elevatedFor(tx) }),
      ).rejects.toMatchObject({ messageKey: 'projectPlans.errors.notCurrent' });
      expect(await acknowledgeDrawingRevision(ctx, { organizationId: s.orgId, revisionId: rev4 }, { elevated: elevatedFor(tx) })).toEqual({ acknowledged: true });
      const summary = await getContractorPlansPortalSummary(ctx, { organizationId: s.orgId, projectId: s.projectId });
      expect(summary.plansAwaitingAcknowledgement).toEqual([]);
      expect(summary.visibleDrawings).toBe(1);
    });

    await asContractor(s, s.contractorB, async (ctx) => {
      const summary = await getContractorPlansPortalSummary(ctx, { organizationId: s.orgId, projectId: s.projectId });
      expect(summary.plansAwaitingAcknowledgement.map((item) => item.currentRevisionId)).toEqual([rev4]);
      // B never sees A's acknowledgement rows.
      expect(await ctx.db.select().from(drawingRevisionAcknowledgements)).toEqual([]);
    });

    await database.asService(async (db) => {
      const [ack] = await db.select().from(drawingRevisionAcknowledgements);
      expect(ack).toMatchObject({ revisionId: rev4, principalId: s.contractorA.principalId, vendorId: s.contractorA.vendorId });
      await expect(
        db.delete(drawingRevisionAcknowledgements).where(eq(drawingRevisionAcknowledgements.id, ack!.id)),
      ).rejects.toBeDefined();
    });

    await asInternal(s, s.viewer.id, async (ctx, tx) => {
      const detail = await getDrawingDetail(ctx, drawingId, { elevated: elevatedFor(tx) });
      expect(detail.canManage).toBe(false);
      expect(detail.revisions.find((revision) => revision.id === rev4)!.acknowledgements).toHaveLength(1);
      await expect(publishDrawingRevision(ctx, rev4)).rejects.toBeDefined();
    });
  });

  it('distribution list controls which contractors see a drawing', async () => {
    const s = await scenario();
    const { drawingId } = await publishedDrawing(s, { visibility: 'internal' });
    const visible = async (contractor: ContractorFixture) =>
      asContractor(s, contractor, async (ctx) =>
        (await listContractorPlans(ctx, { organizationId: s.orgId, projectId: s.projectId })).items.length,
      );
    expect(await visible(s.contractorA)).toBe(0);

    await asInternal(s, s.pm.id, async (ctx, tx) => {
      await updateDrawing(ctx, { drawingId, contractorVisibility: 'distribution' });
      await setDrawingDistribution(ctx, { drawingId, entries: [{ audience: 'agreement', agreementId: s.contractorA.agreementId! }] }, { elevated: elevatedFor(tx) });
    });
    expect(await visible(s.contractorA)).toBe(1);
    expect(await visible(s.contractorB)).toBe(0);

    await asInternal(s, s.pm.id, async (ctx, tx) => {
      await setDrawingDistribution(ctx, { drawingId, entries: [{ audience: 'principal', principalId: s.contractorB.principalId }] }, { elevated: elevatedFor(tx) });
      const detail = await getDrawingDetail(ctx, drawingId, { elevated: elevatedFor(tx) });
      expect(detail.distribution.map((entry) => entry.audience)).toEqual(['principal']);
    });
    expect(await visible(s.contractorA)).toBe(0);
    expect(await visible(s.contractorB)).toBe(1);

    // A contractor without ext.plan.view sees nothing even when distributed.
    const limited = await createContractor(database, { organizationId: s.orgId, projectId: s.projectId, label: 'limited', capabilities: [X.PROJECT_VIEW] });
    await asInternal(s, s.pm.id, (ctx, tx) =>
      setDrawingDistribution(ctx, { drawingId, entries: [{ audience: 'agreement', agreementId: limited.agreementId! }] }, { elevated: elevatedFor(tx) }),
    );
    await asContractor(s, limited, async (ctx) => {
      await expect(listContractorPlans(ctx, { organizationId: s.orgId, projectId: s.projectId })).rejects.toBeDefined();
      expect(await ctx.db.select().from(drawings)).toEqual([]);
    });
  });

  it('project-wide shares reach every project contractor; other projects and drafts stay hidden', async () => {
    const s = await scenario();
    const { drawingId } = await publishedDrawing(s);
    const documentId = await database.asService(async (db) =>
      (await db.select({ documentId: drawingRevisions.documentId }).from(drawingRevisions).where(eq(drawingRevisions.drawingId, drawingId)))[0]!.documentId,
    );
    await asInternal(s, s.pm.id, async (ctx, tx) => {
      await shareDocumentWithContractors(ctx, { projectId: s.projectId, documentId, audience: 'project_contractors', title: 'Site logistics plan' }, { elevated: elevatedFor(tx) });
      await expect(
        shareDocumentWithContractors(ctx, { projectId: s.projectId, documentId, audience: 'project_contractors' }, { elevated: elevatedFor(tx) }),
      ).rejects.toMatchObject({ messageKey: 'projectPlans.sharing.errors.alreadyShared' });
      await expect(
        shareDocumentWithContractors(ctx, { projectId: s.otherProjectId, documentId, audience: 'project_contractors' }, { elevated: elevatedFor(tx) }),
      ).rejects.toBeDefined();
      // A draft revision never reaches contractors.
      await beginDrawingRevisionUpload(ctx, { drawingId, revisionLabel: '4', fileName: 'draft.pdf', mimeType: 'application/pdf', sizeBytes: PDF_BYTES.length }, depsFor(tx, s.store));
    });
    for (const contractor of [s.contractorA, s.contractorB]) {
      await asContractor(s, contractor, async (ctx) => {
        const items = (await listContractorSharedDocuments(ctx, { organizationId: s.orgId, projectId: s.projectId })).items;
        expect(items.map((item) => item.title)).toEqual(['Site logistics plan']);
        const revisions = await ctx.db.select().from(drawingRevisions).where(and(eq(drawingRevisions.drawingId, drawingId)));
        expect(revisions.map((revision) => revision.status)).toEqual(['current']);
      });
    }
    await asInternal(s, s.viewer.id, async (ctx) => {
      const register = await listProjectDrawings(ctx, { projectId: s.projectId });
      expect(register.canManage).toBe(false);
      expect(register.drawings[0]).toMatchObject({ drawingNumber: 'A-101', draftCount: 1, currentRevision: { revisionLabel: '3' } });
    });
  });
});
