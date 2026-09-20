import type { DbExecutor } from '@/shared/db/types';

import {
  CONSULTANCY_DEMO_ORG_ID,
  CONTRACTOR_DEMO_ORG_ID,
  CORRECTION_SETTING_KEY,
  CORRECTION_VERSION,
  HISTORY_END,
  SEED_MARKER,
  TASK_TARGET_IDEAL,
  TASK_TARGET_MAX,
  TASK_TARGET_MIN,
} from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import type { ProjectSpec } from './generate-specs.ts';
import { applyFinancialRealism, type FinancialRealismReport } from './phase-financial-realism.ts';
import { applyConsultancyFinalPass, type FinalPassReport } from './phase-final-pass.ts';
import { applyTaskDistributionCorrections } from './phase-task-corrections.ts';
import { STAGE_NAMES } from './constants.ts';
import { ADMIN_DESC_RE, TASK_DESC_RE } from './task-distribution.ts';

export interface CorrectionReport {
  tasksBefore: number;
  tasksAfter: number;
  tasksDeleted: number;
  tasksDone: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksDueThisWeek: number;
  tasksWithEffort: number;
  technicalEmployeeProjectLinks: number;
  expensesAfter: number;
  apBillsPosted: number;
  apPayments: number;
  timeEntriesAfter: number;
  dueToday: number;
  blocked: number;
  waitingProjects: number;
  storageTenantIsolation: 'PASS' | 'FAIL';
  financialRealism: FinancialRealismReport | null;
  finalPass: FinalPassReport;
}

async function deleteTasksByIds(
  db: DbExecutor,
  organizationId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { tasks } = await import('@drizzle/schema');
  const { and, eq, inArray } = await import('drizzle-orm');
  const chunkSize = 200;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const removed = await db
      .delete(tasks)
      .where(and(eq(tasks.organizationId, organizationId), inArray(tasks.id, chunk)))
      .returning({ id: tasks.id });
    deleted += removed.length;
  }
  return deleted;
}

export async function applyConsultancyCorrections(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
  projectSpecs: readonly ProjectSpec[],
): Promise<CorrectionReport> {
  const report: CorrectionReport = {
    tasksBefore: 0,
    tasksAfter: 0,
    tasksDeleted: 0,
    tasksDone: 0,
    tasksOpen: 0,
    tasksOverdue: 0,
    tasksDueThisWeek: 0,
    tasksWithEffort: 0,
    technicalEmployeeProjectLinks: 0,
    expensesAfter: 0,
    apBillsPosted: 0,
    apPayments: 0,
    timeEntriesAfter: 0,
    dueToday: 0,
    blocked: 0,
    waitingProjects: 0,
    storageTenantIsolation: 'PASS',
    financialRealism: null,
    finalPass: {
      apPaymentsAdded: 0,
      expensePaymentsAdded: 0,
      payrollPaymentsAdded: 0,
      apSkippedFuture: 0,
      expenseSkippedFuture: 0,
      payrollSkippedFuture: 0,
      timeSubmitted: 0,
      timeApproved: 0,
      timeSkipped: 0,
      pendingHoursAfter: 0,
      activityDatesAdjusted: 0,
    },
  };

  const taskCountByDoc = new Map(projectSpecs.map((spec) => [spec.docNum, spec.taskCount]));
  const waitingDocNums = new Set(
    projectSpecs.filter((spec) => spec.bucket === 'waiting').map((spec) => spec.docNum),
  );

  await runPhase('cleanup duplicate tasks', target.organizationId, target.userId, async (context) => {
    const { tasks } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');

    const rows = await context.db
      .select({
        id: tasks.id,
        description: tasks.description,
        status: tasks.status,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .where(and(eq(tasks.organizationId, target.organizationId), like(tasks.description, `%${SEED_MARKER}%`)));

    report.tasksBefore = rows.length;

    const keepIds = new Set<string>();
    const byTaskKey = new Map<string, typeof rows>();

    for (const row of rows) {
      const desc = row.description ?? '';
      const taskMatch = TASK_DESC_RE.exec(desc);
      if (taskMatch) {
        const docNum = taskMatch[1]!;
        const index = Number(taskMatch[2]);
        const maxIndex = taskCountByDoc.get(docNum) ?? 0;
        if (index >= maxIndex) continue;
        const key = `${docNum}:${index}`;
        const bucket = byTaskKey.get(key) ?? [];
        bucket.push(row);
        byTaskKey.set(key, bucket);
        continue;
      }
      const adminMatch = ADMIN_DESC_RE.exec(desc);
      if (adminMatch) {
        const index = Number(adminMatch[1]);
        if (index >= 8) continue;
        const key = `admin:${index}`;
        const bucket = byTaskKey.get(key) ?? [];
        bucket.push(row);
        byTaskKey.set(key, bucket);
      }
    }

    for (const group of byTaskKey.values()) {
      group.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (group[0]) keepIds.add(group[0].id);
    }

    const deleteIds = rows.filter((row) => !keepIds.has(row.id)).map((row) => row.id);

    if (keepIds.size > TASK_TARGET_MAX) {
      const keptRows = rows.filter((row) => keepIds.has(row.id));
      const doneDeletable = keptRows
        .filter((row) => row.status === 'done')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      let overflow = keepIds.size - TASK_TARGET_IDEAL;
      for (const row of doneDeletable) {
        if (overflow <= 0) break;
        keepIds.delete(row.id);
        deleteIds.push(row.id);
        overflow -= 1;
      }
      if (keepIds.size > TASK_TARGET_MAX) {
        const anyDeletable = keptRows
          .filter((row) => !deleteIds.includes(row.id) && row.status !== 'blocked')
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        overflow = keepIds.size - TASK_TARGET_IDEAL;
        for (const row of anyDeletable) {
          if (overflow <= 0) break;
          keepIds.delete(row.id);
          deleteIds.push(row.id);
          overflow -= 1;
        }
      }
    }

    report.tasksDeleted = await deleteTasksByIds(context.db, target.organizationId, deleteIds);
    report.tasksAfter = report.tasksBefore - report.tasksDeleted;
    stats.notes.push(`Task cleanup: ${report.tasksBefore} → ${report.tasksAfter} (deleted ${report.tasksDeleted})`);
  });

  const taskDistribution = await applyTaskDistributionCorrections(
    runPhase,
    target,
    stats,
    maps,
    projectSpecs,
  );
  Object.assign(report, taskDistribution);

  await runPhase('expand office expenses', target.organizationId, target.userId, async (context) => {
    const { createExpense, finalizeExpense } = await import('../../src/modules/expenses/index.ts');
    const { costCategories, expenses } = await import('@drizzle/schema');
    const { and, eq, like, sql } = await import('drizzle-orm');

    const categoryRows = await context.db
      .select({ id: costCategories.id, key: costCategories.key })
      .from(costCategories)
      .where(eq(costCategories.organizationId, target.organizationId));
    const cat = new Map(categoryRows.map((row) => [row.key ?? '', row.id]));

    type ExpSpec = {
      ref: string;
      amount: string;
      description: string;
      date: string;
      categoryKey: string;
      allocationIntent: 'company_only' | 'auto_pool' | 'project_allocate';
      projectDocNum?: string;
    };

    const monthly: ExpSpec[] = [];
    for (let month = 1; month <= 9; month += 1) {
      const mm = String(month).padStart(2, '0');
      const day = month % 2 === 0 ? '05' : '08';
      monthly.push(
        {
          ref: `${SEED_MARKER}/EXP/RENT/${mm}`,
          amount: month % 3 === 0 ? '15000' : '13500',
          description: 'שכירות משרד',
          date: `2026-${mm}-${day}`,
          categoryKey: 'rent',
          allocationIntent: 'company_only',
        },
        {
          ref: `${SEED_MARKER}/EXP/UTIL/${mm}`,
          amount: String(1800 + month * 120),
          description: 'חשמל ומים',
          date: `2026-${mm}-12`,
          categoryKey: 'utilities',
          allocationIntent: 'auto_pool',
        },
        {
          ref: `${SEED_MARKER}/EXP/SW/${mm}`,
          amount: month % 2 === 0 ? '6200' : '4800',
          description: 'רישוי AutoCAD / Revit / M365',
          date: `2026-${mm}-15`,
          categoryKey: 'software',
          allocationIntent: 'company_only',
        },
      );
      if (month % 2 === 0) {
        monthly.push({
          ref: `${SEED_MARKER}/EXP/FUEL/${mm}`,
          amount: String(900 + month * 50),
          description: 'דלק וחניה',
          date: `2026-${mm}-20`,
          categoryKey: 'vehicle_fuel',
          allocationIntent: 'auto_pool',
        });
      }
      if (month === 1 || month === 4 || month === 7) {
        monthly.push({
          ref: `${SEED_MARKER}/EXP/INS/${mm}`,
          amount: '6800',
          description: 'ביטוח אחריות מקצועית',
          date: `2026-${mm}-18`,
          categoryKey: 'insurance',
          allocationIntent: 'company_only',
        });
      }
      if (month === 3 || month === 6 || month === 9) {
        monthly.push({
          ref: `${SEED_MARKER}/EXP/ACC/${mm}`,
          amount: '3200',
          description: 'שירותי הנהלת חשבונות',
          date: `2026-${mm}-25`,
          categoryKey: 'accounting_legal',
          allocationIntent: 'company_only',
        });
      }
    }

    const irregular: ExpSpec[] = [
      {
        ref: `${SEED_MARKER}/EXP/IT/01`,
        amount: '2400',
        description: 'תמיכת IT חודשית',
        date: '2026-02-10',
        categoryKey: 'software',
        allocationIntent: 'company_only',
      },
      {
        ref: `${SEED_MARKER}/EXP/LEGAL/01`,
        amount: '4500',
        description: 'ייעוץ משפטי — הסכם שירות',
        date: '2026-05-14',
        categoryKey: 'accounting_legal',
        allocationIntent: 'company_only',
      },
      {
        ref: `${SEED_MARKER}/EXP/TRAIN/01`,
        amount: '2800',
        description: 'הדרכה מקצועית — תקן 941',
        date: '2026-04-22',
        categoryKey: 'other_overhead',
        allocationIntent: 'auto_pool',
      },
      {
        ref: `${SEED_MARKER}/EXP/SUP/01`,
        amount: '850',
        description: 'ציוד משרדי',
        date: '2026-03-07',
        categoryKey: 'office_supplies',
        allocationIntent: 'company_only',
      },
      {
        ref: `${SEED_MARKER}/EXP/PLOT/01`,
        amount: '1900',
        description: 'הדפסות ופלוטים — פרויקט',
        date: '2026-06-18',
        categoryKey: 'materials',
        allocationIntent: 'project_allocate',
        projectDocNum: '27002',
      },
    ];

    for (const spec of [...monthly, ...irregular]) {
      const [existing] = await context.db
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.organizationId, target.organizationId), eq(expenses.notes, spec.ref)))
        .limit(1);
      if (existing) continue;

      const costCategoryId = cat.get(spec.categoryKey);
      if (!costCategoryId) continue;

      const projectId = spec.projectDocNum ? maps.projectIds.get(spec.projectDocNum) : undefined;

      const draft = await createExpense(context, {
        amount: spec.amount,
        currency: 'ILS',
        description: spec.description,
        expenseDate: spec.date,
        costFamily: spec.allocationIntent === 'project_allocate' ? 'direct_project' : 'business_overhead',
        costCategoryId,
        allocationIntent: spec.allocationIntent,
        projectId: spec.allocationIntent === 'project_allocate' ? projectId : undefined,
        vatMode: 'exclusive',
        notes: spec.ref,
      });
      await finalizeExpense(context, draft.id);
      stats.expenses += 1;
    }

    const [{ count }] = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(and(eq(expenses.organizationId, target.organizationId), like(expenses.notes, `%${SEED_MARKER}%`)));
    report.expensesAfter = count;
  });

  await runPhase('expand vendor AP consultants', target.organizationId, target.userId, async (context) => {
    const { createVendor } = await import('../../src/modules/vendors/index.ts');
    const { createApBill, postApBill } = await import('../../src/modules/ap/index.ts');
    const { recordVendorPayment } = await import('../../src/modules/ap/index.ts');
    const { apBills, costCategories, vendors } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');

    const consultantVendors = [
      { key: 'c1', name: 'מודד — י.Sh. מדידות', type: 'subcontractor' as const },
      { key: 'c2', name: 'יועץ תאורה — אור מקצועי', type: 'subcontractor' as const },
      { key: 'c3', name: 'יועץ תקשורת — NetPlan', type: 'subcontractor' as const },
      { key: 'c4', name: 'BIM חיצוני — דigiBuild', type: 'subcontractor' as const },
      { key: 'c5', name: 'יועץ מתח גבוה — HV Pro', type: 'subcontractor' as const },
      { key: 'c6', name: 'בודק חשמל — בדק-א.ש', type: 'subcontractor' as const },
      { key: 'c7', name: 'שרטט חיצוני — CAD Express', type: 'subcontractor' as const },
    ];

    const vendorIds = new Map<string, string>();
    for (const spec of consultantVendors) {
      const [existing] = await context.db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.organizationId, target.organizationId), eq(vendors.name, spec.name)))
        .limit(1);
      if (existing) {
        vendorIds.set(spec.key, existing.id);
        continue;
      }
      const created = await createVendor(context, {
        name: spec.name,
        type: spec.type,
        city: 'ישראל',
        countryCode: 'IL',
        notes: `${SEED_MARKER}:consultant:${spec.key}`,
      });
      vendorIds.set(spec.key, created.id);
      stats.vendors += 1;
    }

    const categoryRows = await context.db
      .select({ id: costCategories.id, key: costCategories.key })
      .from(costCategories)
      .where(eq(costCategories.organizationId, target.organizationId));
    const apCategoryId =
      categoryRows.find((row) => row.key === 'materials')?.id ??
      categoryRows.find((row) => row.key === 'other_direct')?.id;
    if (!apCategoryId) return;

    const apSpecs = [
      { ref: `${SEED_MARKER}/AP/C/001`, vendorKey: 'c1', docNum: '27001', amount: '8500', date: '2026-02-14', paid: true },
      { ref: `${SEED_MARKER}/AP/C/002`, vendorKey: 'c2', docNum: '27005', amount: '12000', date: '2026-03-20', paid: false },
      { ref: `${SEED_MARKER}/AP/C/003`, vendorKey: 'c3', docNum: '27008', amount: '7600', date: '2026-04-11', paid: true },
      { ref: `${SEED_MARKER}/AP/C/004`, vendorKey: 'c4', docNum: '27002', amount: '22000', date: '2026-05-08', paid: false },
      { ref: `${SEED_MARKER}/AP/C/005`, vendorKey: 'c4', docNum: '27012', amount: '18500', date: '2026-06-15', paid: false },
      { ref: `${SEED_MARKER}/AP/C/006`, vendorKey: 'c5', docNum: '27025', amount: '14000', date: '2026-03-28', paid: true },
      { ref: `${SEED_MARKER}/AP/C/007`, vendorKey: 'c6', docNum: '27030', amount: '5200', date: '2026-07-02', paid: false },
      { ref: `${SEED_MARKER}/AP/C/008`, vendorKey: 'c7', docNum: '27040', amount: '9800', date: '2026-08-19', paid: true },
      { ref: `${SEED_MARKER}/AP/C/009`, vendorKey: 'c2', docNum: '27015', amount: '6500', date: '2026-09-05', paid: false },
      { ref: `${SEED_MARKER}/AP/C/010`, vendorKey: 'c1', docNum: '27018', amount: '7200', date: '2026-01-22', paid: true },
      { ref: `${SEED_MARKER}/AP/C/011`, vendorKey: 'c3', docNum: '27022', amount: '5400', date: '2026-08-08', paid: false },
      { ref: `${SEED_MARKER}/AP/C/012`, vendorKey: 'c6', docNum: '27035', amount: '4800', date: '2026-05-30', paid: true },
    ] as const;

    for (const spec of apSpecs) {
      const vendorId = vendorIds.get(spec.vendorKey);
      const projectId = maps.projectIds.get(spec.docNum);
      if (!vendorId || !projectId) continue;

      let billId: string;
      const [existing] = await context.db
        .select({ id: apBills.id, status: apBills.status })
        .from(apBills)
        .where(and(eq(apBills.organizationId, target.organizationId), eq(apBills.reference, spec.ref)))
        .limit(1);

      if (existing) {
        billId = existing.id;
        if (existing.status === 'draft') {
          await postApBill(context, existing.id);
          report.apBillsPosted += 1;
        }
      } else {
        const created = await createApBill(context, {
          vendorId,
          projectId,
          reference: spec.ref,
          billDate: spec.date,
          currency: 'ILS',
          totalAmount: spec.amount,
          amountIncludesTax: false,
          notes: `${SEED_MARKER}:consultant-ap`,
          lines: [
            {
              description: 'שירותי יועץ חיצוני',
              quantity: '1',
              unitAmount: spec.amount,
              lineTotal: spec.amount,
              currency: 'ILS',
              costCategoryId: apCategoryId,
              costFamily: 'direct_project',
              projectId,
            },
          ],
        });
        billId = created.id;
        if (created.status === 'draft') {
          await postApBill(context, billId);
        }
        report.apBillsPosted += 1;
      }

      if (spec.paid) {
        const payRef = `${spec.ref}/PAY`;
        const { apPayments } = await import('@drizzle/schema');
        const [paid] = await context.db
          .select({ id: apPayments.id })
          .from(apPayments)
          .where(and(eq(apPayments.organizationId, target.organizationId), eq(apPayments.reference, payRef)))
          .limit(1);
        if (!paid) {
          await recordVendorPayment(context, {
            vendorId,
            amount: spec.amount,
            currency: 'ILS',
            paymentDate: spec.date.replace(/-\d{2}$/, '-28'),
            method: 'העברה בנקאית',
            reference: payRef,
            notes: `${SEED_MARKER}:ap-payment`,
            applications: [{ apBillId: billId, appliedAmount: spec.amount }],
          });
          report.apPayments += 1;
        }
      }
    }

    const draftBills = await context.db
      .select({ id: apBills.id })
      .from(apBills)
      .where(
        and(
          eq(apBills.organizationId, target.organizationId),
          eq(apBills.status, 'draft'),
          like(apBills.notes, `%${SEED_MARKER}%`),
        ),
      );
    for (const bill of draftBills) {
      try {
        await postApBill(context, bill.id);
        report.apBillsPosted += 1;
      } catch {
        /* approval gate — skip */
      }
    }
  });

  await runPhase('labor history note', target.organizationId, target.userId, async (context) => {
    const { timeEntries } = await import('@drizzle/schema');
    const { and, eq, like, sql } = await import('drizzle-orm');
    const [{ count }] = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(
        and(eq(timeEntries.organizationId, target.organizationId), like(timeEntries.description, `%${SEED_MARKER}%`)),
      );
    report.timeEntriesAfter = count;
    stats.notes.push(
      `Labor Actual driven by monthly employer-cost allocation + ${count} approved time entries (canonical, no double count).`,
    );
  });

  await runPhase('operational live states', target.organizationId, target.userId, async (context) => {
    const { changeRequests, projectMilestones } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');
    const { submitChangeRequestForApproval } = await import('../../src/modules/commercial/index.ts');

    const today = HISTORY_END;
    const weekOut = '2026-09-26';

    const pendingChanges = await context.db
      .select({ id: changeRequests.id, status: changeRequests.status })
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.organizationId, target.organizationId),
          like(changeRequests.notes, `%${SEED_MARKER}%`),
          eq(changeRequests.status, 'draft'),
        ),
      )
      .limit(5);

    for (const cr of pendingChanges) {
      await submitChangeRequestForApproval(context, cr.id, { recordSent: true });
    }

    const milestones = await context.db
      .select({ id: projectMilestones.id })
      .from(projectMilestones)
      .where(
        and(
          eq(projectMilestones.organizationId, target.organizationId),
          like(projectMilestones.notes, `%${SEED_MARKER}%`),
        ),
      )
      .limit(8);

    for (const [idx, ms] of milestones.entries()) {
      await context.db
        .update(projectMilestones)
        .set({ targetDate: idx < 4 ? today : weekOut })
        .where(eq(projectMilestones.id, ms.id));
    }
  });

  await runPhase('waiting project stages', target.organizationId, target.userId, async (context) => {
    const { projectStageDefinitions, projectStageTransitions, projects } = await import('@drizzle/schema');
    const { and, desc, eq } = await import('drizzle-orm');

    const waitingStageName = STAGE_NAMES[5]!;
    const [waitingStage] = await context.db
      .select({ id: projectStageDefinitions.id })
      .from(projectStageDefinitions)
      .where(
        and(
          eq(projectStageDefinitions.organizationId, target.organizationId),
          eq(projectStageDefinitions.name, waitingStageName),
        ),
      )
      .limit(1);
    if (!waitingStage) return;

    for (const docNum of waitingDocNums) {
      const projectId = maps.projectIds.get(docNum);
      if (!projectId) continue;

      const [latest] = await context.db
        .select({ toStageId: projectStageTransitions.toStageId })
        .from(projectStageTransitions)
        .where(
          and(
            eq(projectStageTransitions.projectId, projectId),
            eq(projectStageTransitions.organizationId, target.organizationId),
          ),
        )
        .orderBy(desc(projectStageTransitions.transitionedAt))
        .limit(1);

      if (latest?.toStageId === waitingStage.id) {
        report.waitingProjects += 1;
        continue;
      }

      await context.db.insert(projectStageTransitions).values({
        organizationId: target.organizationId,
        projectId,
        fromStageId: latest?.toStageId ?? null,
        toStageId: waitingStage.id,
        transitionedAt: new Date('2026-08-15T10:00:00.000Z'),
        transitionedByOrgMemberId: context.membershipId,
        notes: `${SEED_MARKER}:waiting-hold`,
      });

      const [projectRow] = await context.db
        .select({ description: projects.description })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      if (projectRow?.description && !projectRow.description.includes('ממתין')) {
        await context.db
          .update(projects)
          .set({ description: `${projectRow.description} [ממתין ללקוח/יועץ]` })
          .where(eq(projects.id, projectId));
      }

      report.waitingProjects += 1;
    }
  });

  await runPhase('verify storage tenant isolation', target.organizationId, target.userId, async (context) => {
    const { organizationStorageConnections } = await import('@drizzle/schema');
    const { eq } = await import('drizzle-orm');

    const connections = await context.db
      .select({
        orgId: organizationStorageConnections.organizationId,
        provider: organizationStorageConnections.provider,
        rootFolderExternalId: organizationStorageConnections.rootFolderExternalId,
        externalAccountId: organizationStorageConnections.externalAccountId,
      })
      .from(organizationStorageConnections)
      .where(eq(organizationStorageConnections.status, 'connected'));

    const consultancy = connections.filter((row) => row.orgId === CONSULTANCY_DEMO_ORG_ID);
    const contractor = connections.filter((row) => row.orgId === CONTRACTOR_DEMO_ORG_ID);

    if (consultancy.length > 0 && contractor.length > 0) {
      for (const cRow of consultancy) {
        for (const tRow of contractor) {
          if (
            cRow.provider === tRow.provider &&
            cRow.rootFolderExternalId &&
            tRow.rootFolderExternalId &&
            cRow.rootFolderExternalId === tRow.rootFolderExternalId
          ) {
            report.storageTenantIsolation = 'FAIL';
          }
          if (
            cRow.externalAccountId &&
            tRow.externalAccountId &&
            cRow.externalAccountId === tRow.externalAccountId &&
            cRow.rootFolderExternalId === tRow.rootFolderExternalId
          ) {
            report.storageTenantIsolation = 'FAIL';
          }
        }
      }
    }

    stats.notes.push(`Storage isolation: ${report.storageTenantIsolation}`);
  });

  report.financialRealism = await applyFinancialRealism(
    runPhase,
    target,
    stats,
    maps,
    projectSpecs,
  );

  report.finalPass = await applyConsultancyFinalPass(runPhase, target, stats);

  await runPhase('store correction version', target.organizationId, target.userId, async (context) => {
    const { upsertOrganizationSettingValue } = await import(
      '../../src/modules/tenancy/data/organization-settings.repository.ts'
    );
    await upsertOrganizationSettingValue(
      context.db,
      target.organizationId,
      CORRECTION_SETTING_KEY,
      CORRECTION_VERSION,
    );
  });

  if (report.tasksAfter < TASK_TARGET_MIN || report.tasksAfter > TASK_TARGET_MAX) {
    stats.notes.push(
      `WARN: task count ${report.tasksAfter} outside band ${TASK_TARGET_MIN}-${TASK_TARGET_MAX}`,
    );
  }

  return report;
}
