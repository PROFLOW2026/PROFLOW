import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  attendanceDays,
  boqNodes,
  clients,
  documents,
  employees,
  evidenceItems,
  expenses,
  infraCaptures,
  billingRecords,
  projectBoqs,
  projectLocations,
  projectWorkspaceLinks,
  projects,
  tasks,
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
  for (const vendor of fixture.vendors) {
    const id = randomUUID();
    vendorIds.set(vendor.key, id);
    await db.insert(vendors).values({ id, organizationId, name: vendor.name, type: vendor.type });
  }

  const employeeIds: string[] = [];
  for (const employee of fixture.employees) {
    const id = randomUUID();
    employeeIds.push(id);
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

  for (const task of fixture.tasks) {
    const projectId = projectIds.get(task.projectKey);
    if (!projectId) continue;
    await db.insert(tasks).values({
      id: randomUUID(),
      organizationId,
      workspaceId,
      projectId,
      title: task.title,
      createdBySystem: true,
    });
  }

  for (const expense of fixture.expenses) {
    await db.insert(expenses).values({
      id: randomUUID(),
      organizationId,
      projectId: projectIds.get(expense.projectKey) ?? null,
      vendorId: vendorIds.get(expense.vendorKey) ?? null,
      supplierName: 'ספק לדוגמה',
      description: expense.description,
      expenseDate: expense.expenseDate,
      netAmount: expense.netAmount,
      grossAmount: expense.grossAmount,
      currency: 'ILS',
    });
  }

  for (const bill of fixture.billing) {
    await db.insert(billingRecords).values({
      id: randomUUID(),
      organizationId,
      projectId: projectIds.get(bill.projectKey) ?? null,
      clientId: clientIds.get(bill.clientKey) ?? null,
      reference: bill.reference,
      issueDate: bill.issueDate,
      subtotalAmount: bill.subtotalAmount,
      totalAmount: bill.totalAmount,
      currency: 'ILS',
      sourceKind: 'manual',
    });
  }

  const activeProjectId = projectIds.get('p-active');
  if (activeProjectId) {
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

    for (const employeeId of employeeIds) {
      for (const workDate of fixture.attendanceDates) {
        await db.insert(attendanceDays).values({
          id: randomUUID(),
          organizationId,
          employeeId,
          workDate,
        });
      }
    }

    for (const document of fixture.documents) {
      const projectId = projectIds.get(document.projectKey) ?? activeProjectId;
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
        name: 'אזור לדוגמה',
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
        description: 'לכידת תשתיות לדוגמה',
        createdByActorType: 'internal',
      });
    }
  }
}
