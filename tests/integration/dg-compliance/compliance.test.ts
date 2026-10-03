import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  auditEvents,
  contractorComplianceDocuments,
  contractorComplianceRequirements,
  domainEvents,
} from '@drizzle/schema';
import {
  applyStandardRequirementSet,
  createComplianceRequirement,
  getContractorCompliance,
  getPaymentEligibilityInputs,
  getProjectComplianceOverview,
  listExpiringComplianceForOrg,
  reviewComplianceDocument,
  runComplianceExpiryScan,
  submitContractorComplianceDocument,
  submitInternalComplianceDocument,
} from '@/modules/contractor-compliance';
import { resolveEntityScope } from '@/shared/entity-access';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { asExternal, asInternal, complianceScenario } from '@tests/setup/dg-fixtures-compliance';

const evidence = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/modules/evidence', () => ({
  countEvidence: vi.fn(async () => evidence.count),
  listEvidence: vi.fn(async () => []),
}));

const TITLES = {
  insurance: 'Insurance',
  tax_certificate: 'Tax certificate',
  bookkeeping_certificate: 'Bookkeeping certificate',
  safety_certification: 'Safety certification',
  license: 'License',
  guarantee: 'Guarantee',
};

describe('Track P - contractor compliance', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    evidence.count = 0;
  });

  async function seeded() {
    const s = await complianceScenario(database);
    const insuranceA = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      createComplianceRequirement(context, {
        projectId: s.projectId,
        agreementId: s.contractorA.agreementId!,
        kind: 'insurance',
        title: 'Contractor all-risk insurance',
        warningDays: 30,
      }),
    );
    const insuranceB = await asInternal(database, s.owner.id, s.orgId, (context) =>
      createComplianceRequirement(context, {
        projectId: s.projectId,
        agreementId: s.contractorB.agreementId!,
        kind: 'insurance',
        title: 'Insurance B',
      }),
    );
    return { ...s, insuranceA, insuranceB };
  }

  it('isolates contractor A from contractor B (requirements, submissions, RLS)', async () => {
    const s = await seeded();
    const viewA = await asExternal(database, s.contractorA, s.orgId, (context) =>
      getContractorCompliance(context, { organizationId: s.orgId, projectId: s.projectId, today: '2026-10-01' }),
    );
    expect(viewA.agreements.flatMap((a) => a.requirements.map((r) => r.id))).toEqual([s.insuranceA.id]);
    expect(viewA.counts.missing).toBe(1);

    // B cannot submit to A's requirement (invisible -> not found)
    await expect(
      asExternal(database, s.contractorB, s.orgId, (context) =>
        submitContractorComplianceDocument(context, {
          organizationId: s.orgId,
          projectId: s.projectId,
          requirementId: s.insuranceA.id,
          expiresOn: '2027-01-01',
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });

    // B forging a raw insert into A's scope is refused by RLS
    await expect(
      database.asUser(s.contractorB.authUser.id, (tx) =>
        tx.insert(contractorComplianceDocuments).values({
          organizationId: s.orgId,
          projectId: s.projectId,
          vendorId: s.contractorA.vendorId,
          subcontractAgreementId: s.contractorA.agreementId!,
          requirementId: s.insuranceA.id,
          submittedActorType: 'external',
          submittedByPrincipalId: s.contractorB.principalId,
        }),
      ),
    ).rejects.toBeDefined();

    const { documentId } = await asExternal(database, s.contractorA, s.orgId, (context) =>
      submitContractorComplianceDocument(context, {
        organizationId: s.orgId,
        projectId: s.projectId,
        requirementId: s.insuranceA.id,
        referenceNumber: 'POL-1',
        issuedOn: '2026-01-01',
        expiresOn: '2027-01-01',
      }),
    );
    await database.asUser(s.contractorB.authUser.id, async (tx) => {
      expect(await tx.select().from(contractorComplianceDocuments)).toHaveLength(0);
      expect(await tx.select().from(contractorComplianceRequirements).where(eq(contractorComplianceRequirements.id, s.insuranceA.id))).toHaveLength(0);
      expect(await resolveEntityScope(tx, 'compliance_document', s.orgId, documentId)).toBeNull();
    });
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const scope = await resolveEntityScope(tx, 'compliance_document', s.orgId, documentId);
      expect(scope).toMatchObject({ vendorId: s.contractorA.vendorId, projectId: s.projectId, internalOnly: false });
    });

    const events = await database.asService((db) =>
      db.select().from(domainEvents).where(eq(domainEvents.entityId, documentId)),
    );
    expect(events.map((e) => [e.eventType, e.actorType, e.actorPrincipalId])).toEqual([
      ['compliance.document.submitted', 'external', s.contractorA.principalId],
    ]);
    const audit = await database.asService((db) =>
      db.select().from(auditEvents).where(eq(auditEvents.entityId, documentId)),
    );
    expect(audit[0]?.metadata).toMatchObject({ actor: { type: 'external', principalId: s.contractorA.principalId } });
  });

  it('requires a project capability for internal reads/writes (no cross-project leakage)', async () => {
    const s = await seeded();
    await expect(
      asInternal(database, s.outsider.id, s.orgId, (context) => getProjectComplianceOverview(context, s.projectId)),
    ).rejects.toMatchObject({ code: 'authorization_denied' });
    await database.asUser(s.outsider.id, async (tx) => {
      expect(await tx.select().from(contractorComplianceRequirements)).toHaveLength(0);
    });
    // a capability on project A never reaches an entity through project B's id
    await expect(
      asInternal(database, s.owner.id, s.orgId, (context) =>
        reviewComplianceDocument(context, {
          projectId: s.otherProjectId,
          documentId: s.insuranceA.id,
          decision: 'rejected',
          note: 'x',
        }),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
    // safety manager has contractor.view but not contractor.coordinate -> read yes, write no
    const overview = await asInternal(database, s.safetyLead.id, s.orgId, (context) =>
      getProjectComplianceOverview(context, s.projectId),
    );
    expect(overview.canManage).toBe(false);
    expect(overview.agreements.length).toBe(2);
    await expect(
      asInternal(database, s.safetyLead.id, s.orgId, (context) =>
        createComplianceRequirement(context, {
          projectId: s.projectId,
          agreementId: s.contractorA.agreementId!,
          kind: 'license',
          title: 'License',
        }),
      ),
    ).rejects.toMatchObject({ code: 'authorization_denied' });
  });

  it('reviews submissions once, needs evidence to approve and keeps submissions immutable', async () => {
    const s = await seeded();
    const { documentId } = await asExternal(database, s.contractorA, s.orgId, (context) =>
      submitContractorComplianceDocument(context, {
        organizationId: s.orgId,
        projectId: s.projectId,
        requirementId: s.insuranceA.id,
        expiresOn: '2027-06-30',
      }),
    );
    await expect(
      asInternal(database, s.pmOps.id, s.orgId, (context) =>
        reviewComplianceDocument(context, { projectId: s.projectId, documentId, decision: 'approved' }),
      ),
    ).rejects.toMatchObject({ messageKey: 'contractorCompliance.errors.evidenceRequired' });

    evidence.count = 1;
    const approved = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      reviewComplianceDocument(context, { projectId: s.projectId, documentId, decision: 'approved' }),
    );
    expect(approved.reviewStatus).toBe('approved');
    await expect(
      asInternal(database, s.pmOps.id, s.orgId, (context) =>
        reviewComplianceDocument(context, { projectId: s.projectId, documentId, decision: 'rejected', note: 'no' }),
      ),
    ).rejects.toMatchObject({ messageKey: 'contractorCompliance.errors.alreadyReviewed' });

    await expect(
      database.asService((db) =>
        db.update(contractorComplianceDocuments).set({ expiresOn: '2030-01-01' }).where(eq(contractorComplianceDocuments.id, documentId)),
      ),
    ).rejects.toBeDefined();
    await expect(
      database.asService((db) =>
        db.update(contractorComplianceDocuments).set({ reviewStatus: 'rejected', reviewNote: 'late' }).where(eq(contractorComplianceDocuments.id, documentId)),
      ),
    ).rejects.toBeDefined();
    await expect(
      database.asService((db) => db.delete(contractorComplianceDocuments).where(eq(contractorComplianceDocuments.id, documentId))),
    ).rejects.toBeDefined();

    // contractor cannot self-approve through RLS
    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const updated = await tx
        .update(contractorComplianceDocuments)
        .set({ reviewStatus: 'approved', reviewedAt: new Date() })
        .returning({ id: contractorComplianceDocuments.id });
      expect(updated).toHaveLength(0);
    });
  });

  it('computes payment-eligibility inputs for Track F (blocking -> compliant)', async () => {
    const s = await seeded();
    await asInternal(database, s.owner.id, s.orgId, (context) =>
      applyStandardRequirementSet(context, {
        projectId: s.projectId,
        agreementIds: [s.contractorA.agreementId!],
        titles: TITLES,
      }),
    );
    // re-applying never duplicates
    const again = await asInternal(database, s.owner.id, s.orgId, (context) =>
      applyStandardRequirementSet(context, { projectId: s.projectId, agreementIds: [s.contractorA.agreementId!], titles: TITLES }),
    );
    expect(again.created).toBe(0);

    const before = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      getPaymentEligibilityInputs(context.db, s.orgId, s.contractorA.agreementId!, { asOf: '2026-10-01' }),
    );
    expect(before.compliant).toBe(false);
    expect(before.vendorId).toBe(s.contractorA.vendorId);
    // insurance (manual) + tax + bookkeeping block; safety certification / license / guarantee do not
    expect(before.blockingRequirementIds).toHaveLength(3);
    expect(JSON.stringify(before)).not.toMatch(/amount|100000/i);

    const blocking = before.requirements.filter((row) => row.blocking);
    for (const requirement of blocking) {
      await asInternal(database, s.pmOps.id, s.orgId, (context) =>
        submitInternalComplianceDocument(context, {
          projectId: s.projectId,
          requirementId: requirement.requirementId,
          expiresOn: '2026-10-20',
          documentId: null,
          approve: false,
        }),
      );
    }
    evidence.count = 2;
    const overview = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      getProjectComplianceOverview(context, s.projectId),
    );
    expect(overview.pendingReviews).toHaveLength(3);
    for (const pending of overview.pendingReviews) {
      await asInternal(database, s.pmOps.id, s.orgId, (context) =>
        reviewComplianceDocument(context, { projectId: s.projectId, documentId: pending.id, decision: 'approved' }),
      );
    }
    const after = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      getPaymentEligibilityInputs(context.db, s.orgId, s.contractorA.agreementId!, { asOf: '2026-10-01' }),
    );
    expect(after.compliant).toBe(true);
    expect(after.counts.expiring).toBe(3);

    const lapsed = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      getPaymentEligibilityInputs(context.db, s.orgId, s.contractorA.agreementId!, { asOf: '2026-10-21' }),
    );
    expect(lapsed.compliant).toBe(false);
    expect(lapsed.counts.expired).toBe(3);

    // contractor B cannot be evaluated through A's executor scope (not visible -> NotFound)
    await expect(
      asInternal(database, s.outsider.id, s.orgId, (context) =>
        getPaymentEligibilityInputs(context.db, s.otherOrgId, s.contractorA.agreementId!),
      ),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('emits expiring / expired reminders once (dedupe) and feeds the Command Center', async () => {
    const s = await seeded();
    evidence.count = 1;
    await asInternal(database, s.pmOps.id, s.orgId, async (context) => {
      const doc = await submitInternalComplianceDocument(context, {
        projectId: s.projectId,
        requirementId: s.insuranceA.id,
        expiresOn: '2026-10-15',
      });
      await reviewComplianceDocument(context, { projectId: s.projectId, documentId: doc.id, decision: 'approved' });
    });

    const first = await database.asService((db) => runComplianceExpiryScan(db, { today: '2026-10-01' }));
    expect(first).toMatchObject({ expiring: 1, expired: 0 });
    const second = await database.asService((db) => runComplianceExpiryScan(db, { today: '2026-10-02' }));
    expect(second).toMatchObject({ expiring: 0, expired: 0 });
    const lapsed = await database.asService((db) => runComplianceExpiryScan(db, { today: '2026-10-16' }));
    expect(lapsed).toMatchObject({ expiring: 0, expired: 1 });
    const done = await database.asService((db) => runComplianceExpiryScan(db, { today: '2026-10-17' }));
    expect(done.scanned).toBe(0);

    const events = await database.asService((db) => db.select().from(domainEvents));
    const types = events.map((e) => e.eventType);
    expect(types.filter((t) => t === 'compliance.document.expiring')).toHaveLength(1);
    expect(types.filter((t) => t === 'compliance.document.expired')).toHaveLength(1);
    expect(events.find((e) => e.eventType === 'compliance.document.expired')?.actorType).toBe('system');

    const feed = await asInternal(database, s.pmOps.id, s.orgId, (context) =>
      listExpiringComplianceForOrg(context, { today: '2026-10-01' }),
    );
    expect(feed.map((item) => [item.requirementId, item.status, item.daysToExpiry])).toEqual([
      [s.insuranceA.id, 'expiring', 14],
    ]);
    const hidden = await asInternal(database, s.outsider.id, s.orgId, (context) =>
      listExpiringComplianceForOrg(context, { today: '2026-10-01' }),
    );
    expect(hidden).toEqual([]);
  });
});
