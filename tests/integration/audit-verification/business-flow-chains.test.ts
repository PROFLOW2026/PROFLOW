/**
 * Linked business-flow chains (PGlite, no browser). AUDIT ONLY.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { projects } from '@drizzle/schema';
import {
  acceptSalesQuoteVersion,
  convertCrmQuoteToProductQuote,
  createOpportunity,
  createSalesQuote,
  issueSalesQuoteVersion,
} from '@/modules/crm';
import { transitionQuoteStatus } from '@/modules/quotes';
import { convertQuote } from '@/modules/quotes/application/convert-quote';
import { createBillingRecord } from '@/modules/billing';
import { getProjectLaborCost } from '@/modules/workforce';
import {
  applyManualAttendanceWorkdayRange,
  createEmployee,
} from '@/modules/workforce';
import { listTimeEntries } from '@/modules/workforce/data/time-entries.repository';
import { approveTimeEntry, submitTimesheet } from '@/modules/workforce/application/timesheets';
import { resolveOrgContext } from '@/modules/tenancy';
import { businessDate } from '@/shared/dates';
import { createTestDatabase, type TestDatabase } from '@tests/setup/database';
import { createTestOrganization, createTestUser, seedSystem } from '@tests/setup/fixtures';

describe('audit business flow chains (EXEC)', () => {
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

  async function ownerCtx() {
    await seedSystem(database);
    const owner = await createTestUser(database, `flow-${Date.now()}@example.test`);
    const tenant = await createTestOrganization(database, owner, 'Flow Org');
    return {
      owner,
      orgId: tenant.organization.id,
      run: <T>(fn: (ctx: Awaited<ReturnType<typeof resolveOrgContext>>) => Promise<T>) =>
        database.asUser(owner.id, async (tx) => {
          const ctx = await resolveOrgContext(tx, {
            userId: owner.id,
            organizationId: tenant.organization.id,
            locale: 'he-IL',
          });
          return fn(ctx);
        }),
    };
  }

  it('Flow 1 chain: CRM bridge → product accept → convert → project row', async () => {
    const { run, orgId } = await ownerCtx();
    const projectId = await run(async (ctx) => {
      const opp = await createOpportunity(ctx, { name: 'Flow1' });
      const { quote: crmQuote, version } = await createSalesQuote(ctx, {
        opportunityId: opp.id,
        title: 'CRM',
        lines: [{ description: 'L', quantity: '1', unitAmount: '5000', lineTotal: '5000' }],
      });
      const issued = await issueSalesQuoteVersion(ctx, { versionId: version.id });
      await acceptSalesQuoteVersion(ctx, { versionId: issued.id });
      const bridged = await convertCrmQuoteToProductQuote(ctx, { salesQuoteId: crmQuote.id });
      await transitionQuoteStatus(ctx, { quoteId: bridged.productQuoteId, toStatus: 'sent' });
      await transitionQuoteStatus(ctx, { quoteId: bridged.productQuoteId, toStatus: 'accepted' });
      const converted = await convertQuote(ctx, {
        quoteId: bridged.productQuoteId,
        workKind: 'project',
        projectName: 'Flow1 Project',
      });
      return converted.projectId;
    });
    await run(async (ctx) => {
      const rows = await ctx.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, orgId), eq(projects.id, projectId)));
      expect(rows).toHaveLength(1);
    });
  });

  it('Flow 5 chain: attendance → project time → labor cost > 0', async () => {
    const workDate = businessDate('2029-06-05');
    await ownerCtx().then(({ run }) =>
      run(async (ctx) => {
        const { createProject } = await import('@/modules/projects');
        const project = await createProject(ctx, { name: 'Flow5 site' });
        const employee = await createEmployee(ctx, {
          name: 'Flow5 worker',
          rateUnit: 'hourly',
          baseRate: '100',
          currency: 'ILS',
          hireDate: businessDate('2026-01-01'),
        });
        await applyManualAttendanceWorkdayRange(ctx, {
          employeeId: employee.id,
          fromDate: workDate,
          toDate: workDate,
          weekdays: [2],
          clockInTime: '09:00',
          clockOutTime: '17:00',
          workScope: 'project',
          projectId: project.projectId,
        });
        const pendingEntries = await listTimeEntries(ctx.db, ctx.organizationId, {
          employeeId: employee.id,
          projectId: project.projectId,
          fromDate: workDate,
          toDate: workDate,
          kind: 'project',
          approvalStatus: 'all',
        });
        for (const entry of pendingEntries) {
          if (entry.approvalStatus === 'draft' || entry.approvalStatus === 'returned') {
            await submitTimesheet(ctx, { employeeId: employee.id, entryIds: [entry.id] });
          }
          if (entry.approvalStatus !== 'approved') {
            await approveTimeEntry(ctx, { timeEntryId: entry.id });
          }
        }
        const labor = await getProjectLaborCost(ctx, project.projectId);
        expect(Number(labor.laborCost.amount)).toBeGreaterThan(0);
      }),
    );
  });

  it('Flow 4 partial: finalize billing → AR row (SUMIT boundary not invoked)', async () => {
    await ownerCtx().then(({ run }) =>
      run(async (ctx) => {
        const { createProject } = await import('@/modules/projects');
        const project = await createProject(ctx, { name: 'Bill site' });
        const record = await createBillingRecord(ctx, {
          projectId: project.projectId,
          amount: '1800',
          issueDate: '2026-09-01',
          vatMode: 'exclusive',
          finalize: true,
        });
        expect(record.status).toBe('finalized');
        expect(Number(record.subtotalAmount.amount)).toBeGreaterThan(0);
      }),
    );
  });
});
