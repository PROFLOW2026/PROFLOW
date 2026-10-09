import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { eq, type AnyColumn } from 'drizzle-orm';
import {
  billingRecords,
  changeRequests,
  clients,
  employees,
  expenses,
  quotes,
  tasks,
} from '@drizzle/schema';
import type { Database } from '@/shared/db/types';
import type { SeededWorld } from './seed';

export type AuditRouteFixtures = Record<string, string>;

/**
 * Collects stable UUIDs for dynamic route segments in the audit route matrix.
 * Harness-only — not used by production code.
 */
export async function collectAuditRouteFixtures(
  db: Database,
  organizationId: string,
  world: SeededWorld,
): Promise<AuditRouteFixtures> {
  const orgEq = (orgColumn: AnyColumn) => eq(orgColumn, organizationId);

  const [clientId, expenseId, billingRecordId, quoteId, employeeId, taskId, changeRequestId] =
    await Promise.all([
      db
        .select({ id: clients.id })
        .from(clients)
        .where(orgEq(clients.organizationId))
        .limit(1)
        .then((r) => r[0]?.id),
      db
        .select({ id: expenses.id })
        .from(expenses)
        .where(orgEq(expenses.organizationId))
        .limit(1)
        .then((r) => r[0]?.id),
      db
        .select({ id: billingRecords.id })
        .from(billingRecords)
        .where(orgEq(billingRecords.organizationId))
        .limit(1)
        .then((r) => r[0]?.id),
      db
        .select({ id: quotes.id })
        .from(quotes)
        .where(orgEq(quotes.organizationId))
        .limit(1)
        .then((r) => r[0]?.id),
      db
        .select({ id: employees.id })
        .from(employees)
        .where(orgEq(employees.organizationId))
        .limit(1)
        .then((r) => r[0]?.id),
      db
        .select({ id: tasks.id })
        .from(tasks)
        .where(orgEq(tasks.organizationId))
        .limit(1)
        .then((r) => r[0]?.id),
      db
        .select({ id: changeRequests.id })
        .from(changeRequests)
        .where(orgEq(changeRequests.organizationId))
        .limit(1)
        .then((r) => r[0]?.id),
    ]);

  const fixtures: AuditRouteFixtures = {
    projectId: world.projectId,
    jobId: world.projectId,
    vendorId: world.vendorId,
    agreementId: world.gcAgreementId,
    id: world.projectId,
    clientId: clientId ?? world.projectId,
    expenseId: expenseId ?? world.projectId,
    billingRecordId: billingRecordId ?? world.projectId,
    quoteId: quoteId ?? world.projectId,
    employeeId: employeeId ?? world.projectId,
    taskId: taskId ?? world.projectId,
    changeRequestId: changeRequestId ?? world.projectId,
    purchaseOrderId: world.projectId,
    materialId: world.projectId,
    assetId: world.projectId,
    itemId: world.projectId,
    leadId: world.projectId,
    prospectId: world.projectId,
    opportunityId: world.projectId,
    inspectionId: world.projectId,
    logId: world.projectId,
    punchId: world.projectId,
    submissionId: world.projectId,
    draftId: world.projectId,
    recordId: world.projectId,
    definitionId: world.projectId,
    workspaceId: world.projectId,
    boardId: world.projectId,
    cycleId: world.projectId,
    claimId: world.projectId,
    defectId: world.projectId,
    eventId: world.projectId,
    instructionId: world.projectId,
    drawingId: world.projectId,
    rfiId: world.projectId,
    meetingId: world.projectId,
    actionItemId: world.projectId,
    decisionId: world.projectId,
    submittalId: world.projectId,
    packageId: world.projectId,
    billId: world.projectId,
    creditId: world.projectId,
    rfqId: world.projectId,
    paymentId: world.projectId,
    artifactId: world.projectId,
    communicationId: world.projectId,
    captureId: world.projectId,
    templateId: world.projectId,
    logDate: '2026-08-01',
    trade: 'electrical',
    gcProjectId: world.gcProjectId,
  };

  return fixtures;
}

export async function writeAuditRouteFixtures(fixtures: AuditRouteFixtures): Promise<void> {
  await writeFile(
    path.resolve(process.cwd(), 'tests/e2e/.audit-route-fixtures.json'),
    `${JSON.stringify(fixtures, null, 2)}\n`,
    'utf8',
  );
}
