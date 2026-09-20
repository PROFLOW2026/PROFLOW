import {
  CONSULTANCY_ORG_NAME,
  EXCLUDED_ORG_NAME,
  SEED_MARKER,
  SEED_SETTING_KEY,
} from './constants.ts';
import { buildRunPhase } from './context.ts';

export interface ConsultancyDemoValidationReport {
  organizationId: string;
  organizationName: string;
  seedVersion: string | null;
  realBusinessOrgTouched: 'NO';
  counts: {
    clients: number;
    projects: number;
    employees: number;
    workspaces: number;
    tasks: number;
    meetings: number;
    decisions: number;
    milestones: number;
    billings: number;
    payments: number;
    vendors: number;
    expenses: number;
    changeRequests: number;
    approvedChanges: number;
    openReceivablesNet: string | null;
  };
  marker: string;
}

export async function validateConsultancyDemo(
  organizationId: string,
  userId: string,
): Promise<ConsultancyDemoValidationReport> {
  const runPhase = buildRunPhase(userId, organizationId);

  return runPhase('validate consultancy demo', organizationId, userId, async (context) => {
    if (context.organization.name === EXCLUDED_ORG_NAME) {
      throw new Error(`Refusing real business org: ${EXCLUDED_ORG_NAME}`);
    }
    if (context.organization.name !== CONSULTANCY_ORG_NAME) {
      throw new Error(`Expected consultancy org, got ${context.organization.name}`);
    }

    const {
      clients,
      projects,
      employees,
      workspaces,
      tasks,
      meetingRecords,
      meetingDecisions,
      projectMilestones,
      billingRecords,
      payments,
      vendors,
      expenses,
      changeRequests,
    } = await import('@drizzle/schema');
    const { and, eq, like, sql } = await import('drizzle-orm');
    const { getOrganizationSettingValue } = await import(
      '../../src/modules/tenancy/data/organization-settings.repository.ts'
    );
    const { getOrganizationReceivablesSummary } = await import('../../src/modules/billing/index.ts');

    const markerLike = `%${SEED_MARKER}%`;
    const countFor = async (table: typeof clients, extra = sql`true`) =>
      context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(table)
        .where(and(eq(table.organizationId, organizationId), extra))
        .then((rows) => rows[0]?.count ?? 0);

    const [
      clientCount,
      projectCount,
      employeeCount,
      workspaceCount,
      taskCount,
      meetingCount,
      decisionCount,
      milestoneCount,
      billingCount,
      paymentCount,
      vendorCount,
      expenseCount,
      changeCount,
      approvedChangeCount,
    ] = await Promise.all([
      countFor(clients, like(clients.notes, markerLike)),
      countFor(projects, like(projects.description, markerLike)),
      countFor(employees, like(employees.notes, markerLike)),
      countFor(workspaces),
      countFor(tasks, like(tasks.description, markerLike)),
      countFor(meetingRecords, like(meetingRecords.notes, markerLike)),
      countFor(meetingDecisions, like(meetingDecisions.body, markerLike)),
      countFor(projectMilestones, like(projectMilestones.notes, markerLike)),
      countFor(billingRecords, like(billingRecords.notes, markerLike)),
      countFor(payments, like(payments.notes, markerLike)),
      countFor(vendors, like(vendors.notes, markerLike)),
      countFor(expenses, like(expenses.notes, markerLike)),
      countFor(changeRequests, like(changeRequests.notes, markerLike)),
      context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.organizationId, organizationId),
            eq(changeRequests.status, 'approved'),
            like(changeRequests.notes, markerLike),
          ),
        )
        .then((rows) => rows[0]?.count ?? 0),
    ]);

    const seedVersion = await getOrganizationSettingValue<string>(
      context.db,
      organizationId,
      SEED_SETTING_KEY,
    );
    const receivables = await getOrganizationReceivablesSummary(context);

    return {
      organizationId,
      organizationName: context.organization.name,
      seedVersion,
      realBusinessOrgTouched: 'NO',
      counts: {
        clients: clientCount,
        projects: projectCount,
        employees: employeeCount,
        workspaces: workspaceCount,
        tasks: taskCount,
        meetings: meetingCount,
        decisions: decisionCount,
        milestones: milestoneCount,
        billings: billingCount,
        payments: paymentCount,
        vendors: vendorCount,
        expenses: expenseCount,
        changeRequests: changeCount,
        approvedChanges: approvedChangeCount,
        openReceivablesNet: receivables.totalOutstanding.amount,
      },
      marker: SEED_MARKER,
    };
  });
}
