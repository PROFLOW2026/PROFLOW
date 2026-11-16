import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  apBills,
  attendanceDays,
  billingRecords,
  boqNodes,
  clients,
  contracts,
  documents,
  employees,
  evidenceItems,
  expenses,
  infraCaptures,
  payments,
  projectBoqs,
  projectLocations,
  projectWorkspaceLinks,
  projects,
  tasks,
  timeEntries,
  vendors,
  workspaces,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { DemoFixture } from '../fixtures/fixture-builder';

export async function seedDemoFixture(
  db: DbExecutor,
  organizationId: string,
  fixture: DemoFixture,
): Promise<void> {
  const clientIds = new Map<string, string>();
  for (const client of fixture.clients) {
    const id = randomUUID();
    clientIds.set(client.key, id);
    await db.insert(clients).values({ id, organizationId, name: client.name });
  }

  const vendorIds = new Map<string, string>();
  const vendorNames = new Map<string, string>();
  for (const vendor of fixture.vendors) {
    const id = randomUUID();
    vendorIds.set(vendor.key, id);
    vendorNames.set(vendor.key, vendor.name);
    await db.insert(vendors).values({ id, organizationId, name: vendor.name, type: vendor.type });
  }

  const employeeIds = new Map<string, string>();
  for (const employee of fixture.employees) {
    const id = randomUUID();
    employeeIds.set(employee.key, id);
    await db.insert(employees).values({ id, organizationId, name: employee.name });
  }

  const workspaceId = randomUUID();
  await db.insert(workspaces).values({
    id: workspaceId,
    organizationId,
    name: fixture.organizationName,
    workspaceType: 'project_linked',
  });

  const projectIds = new Map<string, string>();
  for (const project of fixture.projects) {
    const id = randomUUID();
    projectIds.set(project.key, id);
    await db.insert(projects).values({
      id,
      organizationId,
      name: project.name,
      status: project.status,
      clientId: clientIds.get(project.clientKey) ?? null,
    });
    await db.insert(projectWorkspaceLinks).values({
      id: randomUUID(),
      workspaceId,
      projectId: id,
    });
  }

  for (const contract of fixture.contracts) {
    const projectId = projectIds.get(contract.projectKey);
    if (!projectId) continue;
    const id = randomUUID();
    await db.insert(contracts).values({
      id,
      organizationId,
      projectId,
      clientId: clientIds.get(contract.clientKey) ?? null,
      name: contract.name,
      startDate: contract.startDate,
      originalValueAmount: contract.originalValueNet,
      currency: 'ILS',
      status: 'active',
    });
  }

  for (const task of fixture.tasks) {
    const projectId = projectIds.get(task.projectKey);
    if (!projectId) continue;
    await db.insert(tasks).values({
      id: randomUUID(),
      organizationId,
      workspaceId,
      projectId,
      title: task.title,
      status: task.status,
      startDate: task.startDate ?? null,
      dueDate: task.dueDate ?? null,
      completionDate: task.completionDate ?? null,
      createdBySystem: true,
    });
  }

  for (const expense of fixture.expenses) {
    const vendorKey = expense.vendorKey;
    await db.insert(expenses).values({
      id: randomUUID(),
      organizationId,
      projectId: projectIds.get(expense.projectKey) ?? null,
      vendorId: vendorIds.get(vendorKey) ?? null,
      supplierName: vendorNames.get(vendorKey) ?? vendorKey,
      description: expense.description,
      expenseDate: expense.expenseDate,
      netAmount: expense.netAmount,
      grossAmount: expense.grossAmount,
      currency: 'ILS',
    });
  }

  const billingIds = new Map<string, string>();
  for (const bill of fixture.billing) {
    const id = randomUUID();
    billingIds.set(bill.key, id);
    const taxAmount = (Number(bill.totalAmount) - Number(bill.subtotalAmount)).toFixed(2);
    await db.insert(billingRecords).values({
      id,
      organizationId,
      projectId: projectIds.get(bill.projectKey) ?? null,
      clientId: clientIds.get(bill.clientKey) ?? null,
      reference: bill.reference,
      issueDate: bill.issueDate,
      subtotalAmount: bill.subtotalAmount,
      taxAmount,
      totalAmount: bill.totalAmount,
      vatMode: 'exclusive',
      status: 'finalized',
      finalizedAt: new Date(`${bill.issueDate}T09:00:00+02:00`),
      currency: 'ILS',
      sourceKind: 'manual',
    });
  }

  for (const payment of fixture.payments) {
    await db.insert(payments).values({
      id: randomUUID(),
      organizationId,
      billingRecordId: billingIds.get(payment.billingKey) ?? null,
      clientId: clientIds.get(payment.clientKey) ?? null,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      reference: payment.reference,
      currency: 'ILS',
      status: 'recorded',
    });
  }

  for (const vendorBill of fixture.vendorBills) {
    const vendorId = vendorIds.get(vendorBill.vendorKey);
    if (!vendorId) continue;
    await db.insert(apBills).values({
      id: randomUUID(),
      organizationId,
      projectId: projectIds.get(vendorBill.projectKey) ?? null,
      vendorId,
      reference: vendorBill.reference,
      status: 'open',
      billDate: vendorBill.billDate,
      netAmount: vendorBill.netAmount,
      grossAmount: vendorBill.grossAmount,
      taxAmount: vendorBill.taxAmount,
      totalAmount: vendorBill.grossAmount,
      taxBasis: 'canonical',
      currency: 'ILS',
    });
  }

  const activeProjectId = projectIds.get('p-active');
  if (activeProjectId && fixture.boqItems.length > 0) {
    const boqId = randomUUID();
    await db.insert(projectBoqs).values({
      id: boqId,
      organizationId,
      projectId: activeProjectId,
      title: 'כתב כמויות לדוגמה',
      currency: 'ILS',
    });
    const chapterId = randomUUID();
    await db.insert(boqNodes).values({
      id: chapterId,
      organizationId,
      boqId,
      nodeKind: 'chapter',
      description: 'פרק לדוגמה',
    });
    for (const item of fixture.boqItems) {
      await db.insert(boqNodes).values({
        id: randomUUID(),
        organizationId,
        boqId,
        parentId: chapterId,
        nodeKind: 'item',
        description: item.description,
        unit: 'יח',
        originalUnitPrice: item.unitPrice,
      });
    }
  }

  for (const employeeId of employeeIds.values()) {
    for (const workDate of fixture.attendanceDates) {
      await db.insert(attendanceDays).values({
        id: randomUUID(),
        organizationId,
        employeeId,
        workDate,
      });
    }
  }

  for (const timeEntry of fixture.timeEntries) {
    const employeeId = employeeIds.get(timeEntry.employeeKey);
    const projectId = projectIds.get(timeEntry.projectKey);
    if (!employeeId || !projectId) continue;
    await db.insert(timeEntries).values({
      id: randomUUID(),
      organizationId,
      employeeId,
      projectId,
      workDate: timeEntry.workDate,
      hours: timeEntry.hours,
      description: timeEntry.description,
      kind: 'project',
      status: 'recorded',
    });
  }

  for (const document of fixture.documents) {
    const projectId = projectIds.get(document.projectKey) ?? activeProjectId;
    if (!projectId) continue;
    const documentId = randomUUID();
    await db.insert(documents).values({
      id: documentId,
      organizationId,
      storageBucket: 'documents',
      storagePath: `${organizationId}/documents/${documentId}/demo.pdf`,
      originalFilename: document.fileName,
      mimeType: 'application/pdf',
      status: 'pending',
    });
    const locationId = randomUUID();
    await db.insert(projectLocations).values({
      id: locationId,
      organizationId,
      projectId,
      name: 'אזור עבודה',
    });
    const evidenceId = randomUUID();
    await db.insert(evidenceItems).values({
      id: evidenceId,
      organizationId,
      projectId,
      documentId,
      entityType: 'project',
      entityId: projectId,
      kind: 'document',
      fileName: document.fileName,
      mimeType: 'application/pdf',
      sizeBytes: 1,
      uploadedByActorType: 'system',
    });
    await db.insert(infraCaptures).values({
      id: randomUUID(),
      organizationId,
      projectId,
      locationId,
      evidenceId,
      description: `תיעוד שטח — ${document.fileName}`,
      createdByActorType: 'internal',
    });
  }
}