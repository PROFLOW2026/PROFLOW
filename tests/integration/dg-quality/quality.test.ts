import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  defectCycleRecords,
  defects,
  domainEvents,
  qualityInspectionOutcomes,
  qualityInspections,
} from '@drizzle/schema';
import { listEvidence, type EvidenceItem } from '@/modules/evidence';
import { createLinkedTask } from '@/modules/collaboration';
import {
  getContractorDefect,
  getContractorQualityMetrics,
  getContractorQualitySummary,
  getDefectDetail,
  listContractorDefects,
  listDefectsAwaitingVerification,
  listProjectDefects,
  startDefectVerification,
  submitDefectCompletion,
  verifyDefect,
  createDefect,
  reopenDefect,
} from '@/modules/defects';
import {
  createInspection,
  getInspectionDetail,
  listContractorInspections,
  recordInspectionOutcome,
  startReinspection,
} from '@/modules/inspections';
import { addProjectMember } from '@/modules/project-team';
import { resolveEntityScope } from '@/shared/entity-access';
import { EXTERNAL_CAPABILITIES as X } from '@/shared/external';
import type { Transaction } from '@/shared/db/types';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import {
  addOrgMember,
  createContractor,
  createProjectAs,
  externalContextFor,
  orgContextFor,
} from '@tests/setup/dg-fixtures';
import { provisionTwoTenants } from '../projects/setup';

vi.mock('@/modules/evidence', () => ({
  listEvidence: vi.fn(),
  countEvidence: vi.fn(),
}));
vi.mock('@/modules/collaboration', () => ({
  createLinkedTask: vi.fn(async () => ({ taskId: '00000000-0000-4000-8000-000000000001' })),
  postInternalComment: vi.fn(),
  postExternalComment: vi.fn(),
}));

function nestedAppendOnlyError(error: unknown): string {
  let text = '';
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth += 1) {
    text += `${current}`;
    current = (current as { cause?: unknown }).cause;
  }
  return text.toLowerCase();
}

function evidenceAt(uploadedAt: Date): EvidenceItem {
  return {
    documentId: crypto.randomUUID(),
    kind: 'photo',
    fileName: 'fix.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 10,
    caption: null,
    visibility: 'contractor',
    locationId: null,
    uploadedAt: uploadedAt.toISOString(),
    uploader: { type: 'external', displayName: null },
  };
}

describe('Quality inspections + defects (Track MN, migration 0164)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    vi.mocked(listEvidence).mockReset();
    vi.mocked(createLinkedTask).mockClear();
  }, 600_000);

  async function scenario() {
    const { orgA, userA, userB } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Tower');
    const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
    const qualityMgr = await addOrgMember(database, orgId, 'qm');
    const viewer = await addOrgMember(database, orgId, 'viewer');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: qualityMgr.id, templateKey: 'quality_manager' });
      await addProjectMember(context, { projectId, userId: viewer.id, templateKey: 'viewer' });
    });
    return { orgId, owner: userA, otherOwner: userB, projectId, contractorA, contractorB, qualityMgr, viewer };
  }

  /**
   * Load grants before opening the contractor transaction. `externalContextFor` reads as the
   * service role on the same PGlite connection; calling it inside `asUser` deadlocks that connection
   * and the following reset never finishes.
   */
  async function bindContractor(contractor: Awaited<ReturnType<typeof createContractor>>, organizationId: string) {
    const base = await externalContextFor(database, database.db as unknown as Transaction, contractor, organizationId);
    return (tx: Transaction) => ({ ...base, db: tx });
  }

  async function failedInspectionWithDefects(s: Awaited<ReturnType<typeof scenario>>) {
    return database.asUser(s.qualityMgr.id, async (tx) => {
      const context = await orgContextFor(tx, s.qualityMgr.id, s.orgId);
      const { inspectionId } = await createInspection(context, {
        projectId: s.projectId,
        templateRef: 'catalog:waterproofing',
        title: 'Roof waterproofing',
        subcontractAgreementId: s.contractorA.agreementId,
        scheduledFor: '2026-10-05',
      });
      const detail = await getInspectionDetail(context, s.projectId, inspectionId);
      const results = detail.inspection.items.map((item, index) => ({
        itemId: item.id,
        result: index === 1 ? ('fail' as const) : ('pass' as const),
        note: index === 1 ? 'Tear near drain' : null,
      }));
      const outcome = await recordInspectionOutcome(context, inspectionId, {
        results,
        outcome: 'fail',
        summary: 'Membrane torn',
        followUp: { createDefects: true, defectSeverity: 'high', createTask: true, taskTitle: 'Fix membrane' },
      });
      return { inspectionId, ...outcome, itemCount: detail.inspection.items.length };
    });
  }

  it('creates a catalog inspection with a checklist snapshot; viewers cannot create', async () => {
    const s = await scenario();
    const created = await database.asUser(s.qualityMgr.id, async (tx) => {
      const context = await orgContextFor(tx, s.qualityMgr.id, s.orgId);
      const result = await createInspection(context, {
        projectId: s.projectId,
        templateRef: 'catalog:concrete_pre_pour',
        title: 'Slab L3 pre-pour',
        extraItems: ['Edge protection installed'],
      });
      const detail = await getInspectionDetail(context, s.projectId, result.inspectionId);
      return { result, detail };
    });
    expect(created.result.referenceNo).toBe(1);
    expect(created.detail.inspection.category).toBe('concrete');
    expect(created.detail.inspection.items).toHaveLength(8);
    expect(created.detail.inspection.items[0]!.itemKey).toBe('formwork_dimensions');
    expect(created.detail.can.recordOutcome).toBe(true);

    await expect(
      database.asUser(s.viewer.id, async (tx) => {
        const context = await orgContextFor(tx, s.viewer.id, s.orgId);
        return createInspection(context, { projectId: s.projectId, title: 'Nope' });
      }),
    ).rejects.toMatchObject({ code: 'authorization_denied' });

    // RLS mirrors the rule: a direct insert by the viewer is refused.
    await expect(
      database.asUser(s.viewer.id, (tx) =>
        tx.insert(qualityInspections).values({
          organizationId: s.orgId,
          projectId: s.projectId,
          referenceNo: 99,
          title: 'Direct',
        }),
      ),
    ).rejects.toThrow();
  });

  it('a failed inspection opens defects and a corrective task; outcomes are append-only', async () => {
    const s = await scenario();
    const result = await failedInspectionWithDefects(s);
    expect(result.attemptNo).toBe(1);
    expect(result.defectIds).toHaveLength(1);
    expect(result.taskId).not.toBeNull();
    expect(vi.mocked(createLinkedTask)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: s.projectId,
        title: 'Fix membrane',
        assignee: expect.objectContaining({ kind: 'contractor', vendorId: s.contractorA.vendorId }),
        sources: [expect.objectContaining({ entityType: 'inspection', entityId: result.inspectionId })],
      }),
    );

    const [defect] = await database.asService((db) =>
      db.select().from(defects).where(eq(defects.id, result.defectIds[0]!)),
    );
    expect(defect).toMatchObject({
      status: 'assigned',
      vendorId: s.contractorA.vendorId,
      subcontractAgreementId: s.contractorA.agreementId,
      sourceInspectionId: result.inspectionId,
      severity: 'high',
      title: 'Membrane continuous, no tears or blisters',
    });
    expect(defect!.dueDate).not.toBeNull();

    const events = await database.asService((db) =>
      db.select({ type: domainEvents.eventType }).from(domainEvents).where(eq(domainEvents.organizationId, s.orgId)),
    );
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'quality.inspection.scheduled',
        'quality.inspection.failed',
        'defect.item.opened',
        'defect.item.assigned',
      ]),
    );

    await expect(
      database.asService((db) =>
        db.update(qualityInspectionOutcomes).set({ summary: 'changed' }).where(eq(qualityInspectionOutcomes.organizationId, s.orgId)),
      ),
    ).rejects.toSatisfy((error: unknown) => nestedAppendOnlyError(error).includes('append-only'));
  });

  it('isolates contractor A from contractor B (inspections, defects, records)', async () => {
    const s = await scenario();
    const { inspectionId, defectIds } = await failedInspectionWithDefects(s);
    const defectId = defectIds[0]!;

    const asContractorA = await bindContractor(s.contractorA, s.orgId);
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const ext = asContractorA(tx);
      const inspections = await listContractorInspections(ext, { organizationId: s.orgId, projectId: s.projectId });
      expect(inspections.items.map((item) => item.id)).toEqual([inspectionId]);
      expect(inspections.items[0]!.failedItems).toHaveLength(1);
      const list = await listContractorDefects(ext, { organizationId: s.orgId, projectId: s.projectId });
      expect(list.items.map((item) => item.id)).toEqual([defectId]);
      expect(list.items[0]!.vendor).toBeNull();
      const detail = await getContractorDefect(ext, { organizationId: s.orgId, defectId });
      expect(detail.canSubmitCompletion).toBe(true);
      expect(detail.records.map((record) => record.kind)).toEqual(['opened', 'assigned']);
    });

    const asContractorB = await bindContractor(s.contractorB, s.orgId);
    await database.asUser(s.contractorB.authUser.id, async (tx) => {
      const ext = asContractorB(tx);
      expect((await listContractorInspections(ext, { organizationId: s.orgId, projectId: s.projectId })).items).toEqual([]);
      expect((await listContractorDefects(ext, { organizationId: s.orgId, projectId: s.projectId })).items).toEqual([]);
      await expect(getContractorDefect(ext, { organizationId: s.orgId, defectId })).rejects.toMatchObject({
        code: 'not_found',
      });
      // Raw reads are filtered by RLS too.
      expect(await tx.select().from(defects)).toEqual([]);
      expect(await tx.select().from(defectCycleRecords)).toEqual([]);
      expect(await tx.select().from(qualityInspections)).toEqual([]);
      const updated = await tx
        .update(defects)
        .set({ status: 'completion_submitted' })
        .where(eq(defects.id, defectId))
        .returning({ id: defects.id });
      expect(updated).toEqual([]);
    });
  });

  it('open -> completion -> rejected -> corrected -> closed keeps every repair cycle', async () => {
    const s = await scenario();
    const { defectIds } = await failedInspectionWithDefects(s);
    const defectId = defectIds[0]!;
    const beforeRejection = new Date();
    const asContractorA = await bindContractor(s.contractorA, s.orgId);

    // No evidence -> refused.
    vi.mocked(listEvidence).mockResolvedValue([]);
    await expect(
      database.asUser(s.contractorA.authUser.id, async (tx) => {
        await submitDefectCompletion(asContractorA(tx), { organizationId: s.orgId, defectId, note: 'done' });
      }),
    ).rejects.toMatchObject({ messageKey: 'defects.errors.evidenceRequired' });

    // Cycle 1 submission with evidence.
    vi.mocked(listEvidence).mockResolvedValue([evidenceAt(beforeRejection)]);
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const ext = asContractorA(tx);
      await submitDefectCompletion(ext, { organizationId: s.orgId, defectId, note: 'Patched' });
    });

    // Command Center: the owner sees it awaiting verification, the viewer does not.
    const awaiting = await database.asUser(s.owner.id, async (tx) =>
      listDefectsAwaitingVerification(await orgContextFor(tx, s.owner.id, s.orgId)),
    );
    expect(awaiting.map((item) => item.defectId)).toEqual([defectId]);
    expect(awaiting[0]!.href).toContain(`/projects/${s.projectId}/defects/${defectId}`);
    const viewerAwaiting = await database.asUser(s.viewer.id, async (tx) =>
      listDefectsAwaitingVerification(await orgContextFor(tx, s.viewer.id, s.orgId)),
    );
    expect(viewerAwaiting).toEqual([]);

    // Verifier rejects -> reopened, cycle 2.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await database.asUser(s.qualityMgr.id, async (tx) => {
      const context = await orgContextFor(tx, s.qualityMgr.id, s.orgId);
      await startDefectVerification(context, defectId);
      await expect(verifyDefect(context, defectId, { decision: 'reject' })).rejects.toMatchObject({
        code: 'validation_failed',
      });
      await verifyDefect(context, defectId, { decision: 'reject', note: 'Still leaking at the drain' });
    });

    // Old evidence does not count for cycle 2.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await expect(
      database.asUser(s.contractorA.authUser.id, async (tx) => {
        const ext = asContractorA(tx);
        const detail = await getContractorDefect(ext, { organizationId: s.orgId, defectId });
        expect(detail.status).toBe('reopened');
        expect(detail.cycleNo).toBe(2);
        await submitDefectCompletion(ext, { organizationId: s.orgId, defectId, note: 'again' });
      }),
    ).rejects.toMatchObject({ messageKey: 'defects.errors.evidenceRequired' });

    vi.mocked(listEvidence).mockResolvedValue([evidenceAt(beforeRejection), evidenceAt(new Date())]);
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const ext = asContractorA(tx);
      await submitDefectCompletion(ext, { organizationId: s.orgId, defectId, note: 'Drain resealed' });
    });

    const final = await database.asUser(s.qualityMgr.id, async (tx) => {
      const context = await orgContextFor(tx, s.qualityMgr.id, s.orgId);
      await verifyDefect(context, defectId, { decision: 'accept', note: 'Dry after flood test' });
      return getDefectDetail(context, s.projectId, defectId);
    });
    expect(final.defect.status).toBe('closed');
    expect(final.defect.cycleNo).toBe(2);
    expect(final.defect.closedAt).not.toBeNull();
    expect(final.defect.records.map((record) => [record.kind, record.cycleNo])).toEqual([
      ['opened', 1],
      ['assigned', 1],
      ['completion_submitted', 1],
      ['verification_started', 1],
      ['rejected', 1],
      ['completion_submitted', 2],
      ['accepted', 2],
    ]);
    const external = final.defect.records.filter((record) => record.actorType === 'external');
    expect(external).toHaveLength(2);
    expect(external[0]!.actorName).toBe('A');

    const events = await database.asService((db) =>
      db
        .select({ type: domainEvents.eventType, actorType: domainEvents.actorType })
        .from(domainEvents)
        .where(and(eq(domainEvents.organizationId, s.orgId), eq(domainEvents.entityId, defectId))),
    );
    expect(events.filter((event) => event.type === 'defect.item.completion_submitted')).toHaveLength(2);
    expect(events.some((event) => event.type === 'defect.item.completion_submitted' && event.actorType === 'external')).toBe(true);
    expect(events.some((event) => event.type === 'defect.item.reopened')).toBe(true);
    expect(events.some((event) => event.type === 'defect.item.closed')).toBe(true);

    // Cycle history is immutable.
    await expect(
      database.asService((db) =>
        db.update(defectCycleRecords).set({ note: 'rewrite' }).where(eq(defectCycleRecords.defectId, defectId)),
      ),
    ).rejects.toSatisfy((error: unknown) => nestedAppendOnlyError(error).includes('append-only'));

    // Closed defects can be reopened (e.g. recurrence) into cycle 3.
    await database.asUser(s.qualityMgr.id, async (tx) => {
      const context = await orgContextFor(tx, s.qualityMgr.id, s.orgId);
      await reopenDefect(context, defectId, { note: 'Leak returned' });
      const detail = await getDefectDetail(context, s.projectId, defectId);
      expect(detail.defect.status).toBe('reopened');
      expect(detail.defect.cycleNo).toBe(3);
    });
  });

  it('contractors can only submit completion - no other column, no other transition', async () => {
    const s = await scenario();
    const { defectIds } = await failedInspectionWithDefects(s);
    const defectId = defectIds[0]!;
    await expect(
      database.asUser(s.contractorA.authUser.id, (tx) =>
        tx.update(defects).set({ title: 'renamed' }).where(eq(defects.id, defectId)),
      ),
    ).rejects.toThrow();
    await expect(
      database.asUser(s.contractorA.authUser.id, (tx) =>
        tx.update(defects).set({ status: 'closed', closedAt: new Date() }).where(eq(defects.id, defectId)),
      ),
    ).rejects.toThrow();
    await expect(
      database.asUser(s.contractorA.authUser.id, (tx) =>
        tx
          .update(defects)
          .set({ status: 'completion_submitted', dueDate: '2030-01-01' })
          .where(eq(defects.id, defectId)),
      ),
    ).rejects.toThrow();
    // The DB state machine refuses illegal transitions even for the service role.
    // Drizzle wraps the trigger exception; the message lives on the cause chain.
    await expect(
      database.asService((db) => db.update(defects).set({ status: 'open' }).where(eq(defects.id, defectId))),
    ).rejects.toSatisfy((error: unknown) => nestedAppendOnlyError(error).includes('not allowed'));
  });

  it('requires ext.defect.work / ext.inspection.view for portal access', async () => {
    const s = await scenario();
    await failedInspectionWithDefects(s);
    const limited = await createContractor(database, {
      organizationId: s.orgId,
      projectId: s.projectId,
      label: 'limited',
      vendorId: s.contractorA.vendorId,
      capabilities: [X.PROJECT_VIEW],
    });
    const asLimited = await bindContractor(limited, s.orgId);
    await database.asUser(limited.authUser.id, async (tx) => {
      const ext = asLimited(tx);
      await expect(listContractorDefects(ext, { organizationId: s.orgId, projectId: s.projectId })).rejects.toMatchObject({
        code: 'authorization_denied',
      });
      await expect(
        listContractorInspections(ext, { organizationId: s.orgId, projectId: s.projectId }),
      ).rejects.toMatchObject({ code: 'authorization_denied' });
      const summary = await getContractorQualitySummary(ext, { organizationId: s.orgId, projectId: s.projectId });
      expect(summary).toEqual({
        defectsToFix: 0,
        defectsOverdue: 0,
        defectsReopened: 0,
        defectsAwaitingVerification: 0,
        inspectionsUpcoming: 0,
        inspectionsFailedOpen: 0,
      });
      expect(await tx.select().from(defects)).toEqual([]);
    });

    const asContractorA = await bindContractor(s.contractorA, s.orgId);
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const ext = asContractorA(tx);
      const summary = await getContractorQualitySummary(ext, { organizationId: s.orgId, projectId: s.projectId });
      expect(summary.defectsToFix).toBe(1);
      expect(summary.inspectionsFailedOpen).toBe(1);
    });
  });

  it('re-inspection keeps the attempt history and feeds contractor metrics', async () => {
    const s = await scenario();
    const { inspectionId } = await failedInspectionWithDefects(s);
    await database.asUser(s.qualityMgr.id, async (tx) => {
      const context = await orgContextFor(tx, s.qualityMgr.id, s.orgId);
      await startReinspection(context, inspectionId, { scheduledFor: '2026-10-09' });
      const reset = await getInspectionDetail(context, s.projectId, inspectionId);
      expect(reset.inspection.status).toBe('scheduled');
      expect(reset.inspection.items.every((item) => item.result === 'pending')).toBe(true);
      await recordInspectionOutcome(context, inspectionId, {
        results: reset.inspection.items.map((item) => ({ itemId: item.id, result: 'pass' as const, note: null })),
        outcome: 'pass',
      });
      const detail = await getInspectionDetail(context, s.projectId, inspectionId);
      expect(detail.inspection.outcome).toBe('pass');
      expect(detail.inspection.outcomes.map((outcome) => [outcome.attemptNo, outcome.outcome])).toEqual([
        [2, 'pass'],
        [1, 'fail'],
      ]);
      expect(detail.can.reinspect).toBe(false);
      expect(detail.inspection.defects).toHaveLength(1);
    });

    const metrics = await database.asUser(s.owner.id, async (tx) =>
      getContractorQualityMetrics(await orgContextFor(tx, s.owner.id, s.orgId), {
        vendorId: s.contractorA.vendorId,
        projectId: s.projectId,
      }),
    );
    expect(metrics).toMatchObject({
      inspectionAttempts: 2,
      inspectionsFailedAttempts: 1,
      firstAttemptCount: 1,
      firstTimePassRate: 0,
      defectsTotal: 1,
      defectsOpen: 1,
    });
  });

  it('resolves inspection / defect entity scopes for internal and external callers', async () => {
    const s = await scenario();
    const { inspectionId, defectIds } = await failedInspectionWithDefects(s);
    const internalOnly = await database.asUser(s.owner.id, async (tx) => {
      const context = await orgContextFor(tx, s.owner.id, s.orgId);
      const created = await createDefect(context, { projectId: s.projectId, title: 'Paint scratch', severity: 'low' });
      expect(await resolveEntityScope(tx, 'inspection', s.orgId, inspectionId)).toMatchObject({
        projectId: s.projectId,
        vendorId: s.contractorA.vendorId,
        internalOnly: false,
      });
      expect(await resolveEntityScope(tx, 'defect', s.orgId, created.defectId)).toMatchObject({
        projectId: s.projectId,
        vendorId: null,
        internalOnly: true,
      });
      const page = await listProjectDefects(context, s.projectId, { status: 'active' });
      expect(page.items.map((item) => item.title).sort()).toEqual(
        ['Membrane continuous, no tears or blisters', 'Paint scratch'].sort(),
      );
      return created.defectId;
    });
    await database.asUser(s.contractorB.authUser.id, async (tx) => {
      expect(await resolveEntityScope(tx, 'defect', s.orgId, defectIds[0]!)).toBeNull();
      expect(await resolveEntityScope(tx, 'defect', s.orgId, internalOnly)).toBeNull();
    });
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      expect(await resolveEntityScope(tx, 'defect', s.orgId, defectIds[0]!)).toMatchObject({
        vendorId: s.contractorA.vendorId,
      });
    });
  });

  it('another tenant owner sees nothing', async () => {
    const s = await scenario();
    await failedInspectionWithDefects(s);
    await database.asUser(s.otherOwner.id, async (tx) => {
      expect(await tx.select().from(defects)).toEqual([]);
      expect(await tx.select().from(qualityInspections)).toEqual([]);
      expect(await tx.select().from(defectCycleRecords)).toEqual([]);
      expect(await tx.select().from(qualityInspectionOutcomes)).toEqual([]);
    });
  });
});
