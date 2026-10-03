import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { addProjectMember } from '@/modules/project-team';
import {
  addWorkLine,
  changeAgreementStatus,
  createDraftAgreement,
} from '@/modules/subcontracts';
import {
  certifyClaim,
  createClaim,
  effectiveCertifiedByLine,
  getAgreementPayments,
  getClaimDetail,
  getContractorClaimDetail,
  listProjectClaims,
  reassessClaim,
  saveClaimDraft,
  submitClaim,
} from '@/modules/subcontract-claims';
import { listAssessments as listAssessmentRows } from '@/modules/subcontract-claims/data/claims.repository';
import { NotFoundError } from '@/shared/errors';
import { createTestDatabase, resultRows, type TestDatabase } from '@tests/setup/database';
import { addOrgMember, createContractor, createProjectAs, orgContextFor } from '@tests/setup/dg-fixtures';
import { externalContextBinder } from '@tests/setup/dg-fixtures-subcontract';
import { setCompliancePortForTesting } from '@/modules/subcontract-claims/application/ports';
import { provisionTwoTenants } from '../projects/setup';

describe('Track F claims (migrations 0158 + 0159)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase();
  });
  afterAll(async () => {
    await database.close();
  });
  beforeEach(async () => {
    await database.reset();
    setCompliancePortForTesting({
      load: async () => ({ compliant: true, blocking: [] }),
    });
  });

  async function scenario() {
    const { orgA, userA } = await provisionTwoTenants(database);
    const orgId = orgA.organization.id;
    const projectId = await createProjectAs(database, userA.id, orgId, 'Claims tower');
    const contractorA = await createContractor(database, { organizationId: orgId, projectId, label: 'A' });
    const contractorB = await createContractor(database, { organizationId: orgId, projectId, label: 'B' });
    const qs = await addOrgMember(database, orgId, 'qs');
    await database.asUser(userA.id, async (tx) => {
      const context = await orgContextFor(tx, userA.id, orgId);
      await addProjectMember(context, { projectId, userId: qs.id, templateKey: 'quantity_surveyor' });
    });

    const asOwner = <T>(fn: (context: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
      database.asUser(userA.id, async (tx) => fn(await orgContextFor(tx, userA.id, orgId)));
    const asQs = <T>(fn: (context: Awaited<ReturnType<typeof orgContextFor>>) => Promise<T>) =>
      database.asUser(qs.id, async (tx) => fn(await orgContextFor(tx, qs.id, orgId)));

    const { agreementId } = await asOwner((context) =>
      createDraftAgreement(context, {
        projectId,
        vendorId: contractorA.vendorId,
        title: 'Envelope',
        trade: 'Facade',
        retentionPercent: '5',
        vatTreatment: 'reverse_charge',
        paymentTermsDays: 45,
        startDate: '2026-10-01',
        endDate: '2026-12-31',
      }),
    );

    const workLineId = await asOwner(async (context) => {
      const line = await addWorkLine(context, {
        agreementId,
        code: 'F-1',
        description: 'Cladding',
        unit: 'm2',
        quantity: '100',
        lineType: 'quantity_rate',
        unitPrice: '50',
      });
      return line.workLineId;
    });

    await asOwner((context) => changeAgreementStatus(context, { agreementId, action: 'activate' }));

    const externalA = await externalContextBinder(database, contractorA, orgId);
    const externalB = await externalContextBinder(database, contractorB, orgId);

    return {
      orgId,
      projectId,
      contractorA,
      contractorB,
      agreementId,
      workLineId,
      asOwner,
      asQs,
      externalA,
      externalB,
    };
  }

  it('keeps certify 60 then reassess 70 as append-only facts with effective 70', async () => {
    const s = await scenario();
    const { claimId } = await s.asOwner(async (context) => {
      const created = await createClaim(context, {
        projectId: s.projectId,
        agreementId: s.agreementId,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
      await saveClaimDraft(context, s.projectId, created.claimId, {
        lines: [{ workLineId: s.workLineId, currentAmount: '80' }],
      });
      await submitClaim(context, s.projectId, created.claimId);
      return created;
    });

    await s.asOwner(async (context) => {
      const detail = await getClaimDetail(context, s.projectId, claimId);
      const lineId = detail.detail.lines[0]!.claimLineId;
      await certifyClaim(context, s.projectId, claimId, {
        lines: [{ claimLineId: lineId, certifiedAmount: '60', reason: 'Measured progress' }],
      });
      await reassessClaim(context, s.projectId, claimId, {
        reason: 'QS remeasurement',
        lines: [{ claimLineId: lineId, certifiedAmount: '70' }],
      });
    });

    const assessments = await s.asOwner(async (context) => {
      const rows = await listAssessmentRows(context.db, context.organizationId, [claimId]);
      return rows.filter((row) => row.claimLineId !== null && row.certifiedAmount !== null);
    });
    expect(assessments.map((row) => row.decision)).toEqual(['certify', 'reassess']);
    expect(assessments.map((row) => row.certifiedAmount)).toEqual(['60.000000', '70.000000']);

    const effective = effectiveCertifiedByLine(
      assessments.map((row) => ({
        seq: row.seq,
        claimLineId: row.claimLineId,
        decision: row.decision,
        certifiedAmount: row.certifiedAmount,
      })),
      'ILS',
    );
    expect([...effective.values()][0]?.amount).toBe('70.000000');

    const nested = (error: unknown): string => {
      let text = '';
      let current: unknown = error;
      for (let depth = 0; depth < 6 && current; depth += 1) {
        text += `${current}`;
        current = (current as { cause?: unknown }).cause;
      }
      return text.toLowerCase();
    };
    await expect(
      database.asService(async (db) =>
        db.execute(sql`update subcontract_claim_assessments set certified_amount = '999' where claim_id = ${claimId}`),
      ),
    ).rejects.toSatisfy((error: unknown) => nested(error).includes('append-only'));
  });

  it('hides contractor A claims from contractor B', async () => {
    const s = await scenario();
    const { claimId } = await s.asOwner(async (context) => {
      const created = await createClaim(context, {
        projectId: s.projectId,
        agreementId: s.agreementId,
        periodStart: '2026-11-01',
        periodEnd: '2026-11-30',
      });
      await saveClaimDraft(context, s.projectId, created.claimId, {
        lines: [{ workLineId: s.workLineId, currentAmount: '10' }],
      });
      await submitClaim(context, s.projectId, created.claimId);
      return created;
    });

    await database.asUser(s.contractorA.authUser.id, async (tx) => {
      const ctx = s.externalA(tx);
      const view = await getContractorClaimDetail(ctx, s.orgId, s.projectId, claimId);
      expect(view.detail.header.status).toBe('submitted');
    });

    await database.asUser(s.contractorB.authUser.id, async (tx) => {
      const ctx = s.externalB(tx);
      await expect(getContractorClaimDetail(ctx, s.orgId, s.projectId, claimId)).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  it('operational PM and site manager receive no claim amounts or retention', async () => {
    const s = await scenario();
    const siteManager = await addOrgMember(database, s.orgId, 'site');
    const pmOps = await addOrgMember(database, s.orgId, 'pm-ops');
    await s.asOwner(async (context) => {
      await addProjectMember(context, {
        projectId: s.projectId,
        userId: siteManager.id,
        templateKey: 'site_manager',
      });
      await addProjectMember(context, {
        projectId: s.projectId,
        userId: pmOps.id,
        templateKey: 'project_manager_operational',
      });
    });

    const { claimId } = await s.asOwner(async (context) => {
      const created = await createClaim(context, {
        projectId: s.projectId,
        agreementId: s.agreementId,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
      await saveClaimDraft(context, s.projectId, created.claimId, {
        lines: [{ workLineId: s.workLineId, currentAmount: '80' }],
      });
      await submitClaim(context, s.projectId, created.claimId);
      const detail = await getClaimDetail(context, s.projectId, created.claimId);
      await certifyClaim(context, s.projectId, created.claimId, {
        lines: [{ claimLineId: detail.detail.lines[0]!.claimLineId, certifiedAmount: '60', reason: 'Measured' }],
      });
      return created;
    });

    await s.asOwner(async (context) => {
      const submitted = resultRows<{ current_amount: string }>(
        await context.db.execute(
          sql`SELECT current_amount::text AS current_amount FROM subcontract_claim_line_submissions WHERE claim_id = ${claimId}::uuid`,
        ),
      );
      expect(submitted.map((row) => row.current_amount)).toContain('80.000000');
      const retained = resultRows<{ retention_amount: string; certified_total: string }>(
        await context.db.execute(
          sql`SELECT retention_amount::text AS retention_amount, certified_total::text AS certified_total
              FROM subcontract_claim_payable_bases WHERE claim_id = ${claimId}::uuid`,
        ),
      );
      expect(retained).toHaveLength(1);
      expect(Number(retained[0]!.certified_total)).toBe(60);
      expect(Number(retained[0]!.retention_amount)).toBeGreaterThan(0);
    });

    for (const user of [siteManager, pmOps]) {
      await database.asUser(user.id, async (tx) => {
        const context = await orgContextFor(tx, user.id, s.orgId);
        await expect(listProjectClaims(context, s.projectId)).rejects.toMatchObject({
          code: 'authorization_denied',
        });
        await expect(getAgreementPayments(context, s.projectId, s.agreementId)).rejects.toMatchObject({
          code: 'authorization_denied',
        });
        expect(
          resultRows(
            await tx.execute(
              sql`SELECT current_amount FROM subcontract_claim_line_submissions WHERE claim_id = ${claimId}::uuid`,
            ),
          ),
        ).toEqual([]);
        expect(
          resultRows(
            await tx.execute(
              sql`SELECT certified_amount FROM subcontract_claim_assessments WHERE claim_id = ${claimId}::uuid`,
            ),
          ),
        ).toEqual([]);
        expect(
          resultRows(
            await tx.execute(
              sql`SELECT retention_amount, certified_total FROM subcontract_claim_payable_bases WHERE claim_id = ${claimId}::uuid`,
            ),
          ),
        ).toEqual([]);
      });
    }
  });

  it('holds retention, recovers advance, applies a deduction, and does not create an AP bill', async () => {
    const s = await scenario();
    await s.asOwner(async (context) => {
      await context.db.execute(sql`
        UPDATE subcontract_agreement_financial_terms
        SET advance_recovery_method = 'fixed_percent_per_claim',
            advance_recovery_percent = 10
        WHERE agreement_id = ${s.agreementId}::uuid
          AND organization_id = ${context.organizationId}::uuid
      `);
      await context.db.execute(sql`
        INSERT INTO subcontract_advances (
          organization_id, subcontract_agreement_id, project_id, amount, currency, paid_date, status
        ) VALUES (
          ${context.organizationId}::uuid, ${s.agreementId}::uuid, ${s.projectId}::uuid,
          20, 'ILS', CURRENT_DATE, 'paid'
        )
      `);
      const vendor = resultRows<{ vendor_id: string }>(
        await context.db.execute(sql`
          SELECT vendor_id FROM subcontract_agreements
          WHERE id = ${s.agreementId}::uuid AND organization_id = ${context.organizationId}::uuid
        `),
      );
      await context.db.execute(sql`
        INSERT INTO subcontract_deductions (
          organization_id, project_id, vendor_id, agreement_id, entry_kind, deduction_type,
          amount, currency, reason, issued_by_user_id
        ) VALUES (
          ${context.organizationId}::uuid, ${s.projectId}::uuid, ${vendor[0]!.vendor_id}::uuid,
          ${s.agreementId}::uuid, 'issue', 'back_charge', 4, 'ILS', 'Damage', ${context.userId}::uuid
        )
      `);
      const created = await createClaim(context, {
        projectId: s.projectId,
        agreementId: s.agreementId,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
      await saveClaimDraft(context, s.projectId, created.claimId, {
        lines: [{ workLineId: s.workLineId, currentAmount: '80' }],
      });
      await submitClaim(context, s.projectId, created.claimId);
      const detail = await getClaimDetail(context, s.projectId, created.claimId);
      await certifyClaim(context, s.projectId, created.claimId, {
        lines: [{ claimLineId: detail.detail.lines[0]!.claimLineId, certifiedAmount: '60', reason: 'Measured' }],
      });
      const basis = resultRows<{
        retention_amount: string;
        advance_recovery_amount: string;
        deductions_amount: string;
        payable_net: string;
        ap_bill_id: string | null;
        ap_bill_status: string;
      }>(
        await context.db.execute(sql`
          SELECT retention_amount::text, advance_recovery_amount::text, deductions_amount::text,
                 payable_net::text, ap_bill_id::text, ap_bill_status
          FROM subcontract_claim_payable_bases
          WHERE claim_id = ${created.claimId}::uuid
        `),
      );
      expect(basis).toHaveLength(1);
      expect(Number(basis[0]!.retention_amount)).toBe(3);
      expect(Number(basis[0]!.advance_recovery_amount)).toBe(6);
      expect(Number(basis[0]!.deductions_amount)).toBe(4);
      expect(Number(basis[0]!.payable_net)).toBe(47);
      expect(basis[0]!.ap_bill_status).toBe('pending');
      expect(basis[0]!.ap_bill_id).toBeNull();
    });
  });
});
