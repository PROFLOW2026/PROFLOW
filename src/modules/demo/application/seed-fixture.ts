import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  apBillLines,
  apBills,
  apPaymentApplications,
  apPayments,
  attendanceDays,
  attendanceEvents,
  billingRecords,
  boqNodes,
  clients,
  committedCosts,
  contracts,
  contractValueEvents,
  costCategories,
  documents,
  employeeProjectAssignments,
  employees,
  evidenceItems,
  expenses,
  infraCaptures,
  payments,
  projectBoqs,
  projectBudgetLines,
  projectBudgets,
  projectLocations,
  projectWorkspaceLinks,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  rateVersions,
  subcontractAgreements,
  subcontractValueEvents,
  tasks,
  timeEntries,
  vendors,
  workspaces,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { CONTRACT_VALUE_REASON_ORIGINAL } from '@/modules/projects/domain/contract-value-reason';
import type { DemoFixture } from '../fixtures/fixture-builder';

function jerusalemInstant(date: string, hour: number, minute = 0): Date {
  return new Date(`${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+02:00`);
}

function taxFromNet(net: string): string {
  const netNum = Number(net);
  const gross = Math.round(netNum * 1.18 * 100) / 100;
  return (gross - netNum).toFixed(2);
}

function grossFromNet(net: string): string {
  return (Math.round(Number(net) * 1.18 * 100) / 100).toFixed(2);
}

async function resolveDemoCostCategoryId(db: DbExecutor, organizationId: string): Promise<string> {
  const rows = await db
    .select({ id: costCategories.id, family: costCategories.family, key: costCategories.key })
    .from(costCategories)
    .where(and(eq(costCategories.organizationId, organizationId)));
  const preferred =
    rows.find((row) => row.family === 'direct_project') ??
    rows.find((row) => row.key.includes('material')) ??
    rows[0];
  if (!preferred) {
    throw new Error('Demo seed requires organization cost categories');
  }
  return preferred.id;
}

export async function seedDemoFixture(
  db: DbExecutor,
  organizationId: string,
  fixture: DemoFixture,
): Promise<void> {
  const costCategoryId = await resolveDemoCostCategoryId(db, organizationId);

  const clientIds = new Map<string, string>();
  await db.insert(clients).values(
    fixture.clients.map((client) => {
      const id = randomUUID();
      clientIds.set(client.key, id);
      return { id, organizationId, name: client.name };
    }),
  );

  const vendorIds = new Map<string, string>();
  const vendorNames = new Map<string, string>();
  await db.insert(vendors).values(
    fixture.vendors.map((vendor) => {
      const id = randomUUID();
      vendorIds.set(vendor.key, id);
      vendorNames.set(vendor.key, vendor.name);
      return { id, organizationId, name: vendor.name, type: vendor.type };
    }),
  );

  const employeeIds = new Map<string, string>();
  const rateVersionIds = new Map<string, string>();
  const hireDate = fixture.projects.find((row) => row.key === 'p-archive')?.startedDate ?? fixture.anchorDay;
  await db.insert(employees).values(
    fixture.employees.map((employee) => {
      const id = randomUUID();
      employeeIds.set(employee.key, id);
      return {
        id,
        organizationId,
        name: employee.name,
        jobTitle: employee.jobTitle,
        employmentBasis: 'hourly' as const,
        hireDate,
        employeeNumber: `E-${employee.key.toUpperCase()}`,
      };
    }),
  );
  await db.insert(rateVersions).values(
    fixture.employees.map((employee) => {
      const rateId = randomUUID();
      rateVersionIds.set(employee.key, rateId);
      return {
        id: rateId,
        organizationId,
        employeeId: employeeIds.get(employee.key)!,
        validFrom: hireDate,
        baseRate: employee.hourlyRate.toFixed(2),
        rateUnit: 'hourly' as const,
        currency: 'ILS',
        estimatedEmployerCost: (employee.hourlyRate * 1.25).toFixed(2),
        source: 'manual',
        costQuality: 'estimated',
      };
    }),
  );

  const workspaceId = randomUUID();
  await db.insert(workspaces).values({
    id: workspaceId,
    organizationId,
    name: fixture.organizationName,
    workspaceType: 'project_linked',
  });

  const projectIds = new Map<string, string>();
  await db.insert(projects).values(
    fixture.projects.map((project) => {
      const id = randomUUID();
      projectIds.set(project.key, id);
      return {
        id,
        organizationId,
        name: project.name,
        status: project.status,
        clientId: clientIds.get(project.clientKey) ?? null,
        startDate: project.startedDate,
        targetEndDate: project.targetEndDate,
        actualEndDate: project.actualEndDate ?? null,
        progressPercent: String(project.progressPercent),
        progressStatus:
          project.status === 'completed'
            ? 'completed'
            : project.progressPercent >= 70
              ? 'on_track'
              : project.progressPercent >= 35
                ? 'at_risk'
                : 'not_started',
        progressSource: 'manual',
        workKind: project.workKind,
        pricingMode: project.pricingMode,
        location: project.location,
        currency: 'ILS',
      };
    }),
  );
  await db.insert(projectWorkspaceLinks).values(
    [...projectIds.values()].map((projectId) => ({
      id: randomUUID(),
      workspaceId,
      projectId,
    })),
  );

  const assignmentRows = fixture.assignments
    .map((assignment) => {
      const projectId = projectIds.get(assignment.projectKey);
      const employeeId = employeeIds.get(assignment.employeeKey);
      if (!projectId || !employeeId) return null;
      return {
        id: randomUUID(),
        organizationId,
        projectId,
        employeeId,
        startDate: assignment.startDate,
        role: assignment.role,
        status: 'active',
        plannedAllocationPercent: '50',
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);
  if (assignmentRows.length > 0) {
    await db.insert(employeeProjectAssignments).values(assignmentRows);
  }

  // Contracts + original value events (same path as contract-amount.ts commercial truth).
  const contractIds = new Map<string, string>();
  const contractRows = fixture.contracts
    .map((contract) => {
      const projectId = projectIds.get(contract.projectKey);
      if (!projectId) return null;
      const id = randomUUID();
      contractIds.set(contract.key, id);
      const net = contract.originalValueNet;
      const tax = taxFromNet(net);
      const gross = grossFromNet(net);
      return {
        id,
        organizationId,
        projectId,
        clientId: clientIds.get(contract.clientKey) ?? null,
        name: contract.name,
        startDate: contract.startDate,
        endDate: contract.endDate ?? null,
        isPrimary: true,
        contractType: 'primary' as const,
        enteredValueAmount: net,
        amountIncludesTax: false,
        originalValueAmount: net,
        originalTaxAmount: tax,
        originalGrossAmount: gross,
        displayOriginalEnteredAmount: net,
        displayOriginalNetAmount: net,
        displayOriginalTaxAmount: tax,
        displayOriginalGrossAmount: gross,
        currency: 'ILS',
        status: contract.status,
        signedDate: contract.startDate,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (contractRows.length > 0) {
    await db.insert(contracts).values(contractRows);
    await db.insert(contractValueEvents).values(
      fixture.contracts
        .map((contract) => {
          const contractId = contractIds.get(contract.key);
          const projectId = projectIds.get(contract.projectKey);
          if (!contractId || !projectId) return null;
          return {
            id: randomUUID(),
            organizationId,
            contractId,
            projectId,
            kind: 'original',
            amount: contract.originalValueNet,
            currency: 'ILS',
            effectiveDate: contract.startDate,
            reason: CONTRACT_VALUE_REASON_ORIGINAL,
            actorUserId: null,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    );
  }

  await db.insert(tasks).values(
    fixture.tasks
      .map((task) => {
        const projectId = projectIds.get(task.projectKey);
        if (!projectId) return null;
        const ownerEmployeeId = task.employeeKey ? employeeIds.get(task.employeeKey) ?? null : null;
        return {
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
          ownerEmployeeId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  );

  await db.insert(expenses).values(
    fixture.expenses.map((expense) => {
      const vendorKey = expense.vendorKey;
      return {
        id: randomUUID(),
        organizationId,
        projectId: projectIds.get(expense.projectKey) ?? null,
        vendorId: vendorIds.get(vendorKey) ?? null,
        supplierName: vendorNames.get(vendorKey) ?? vendorKey,
        description: expense.description,
        expenseDate: expense.expenseDate,
        netAmount: expense.netAmount,
        taxAmount: expense.taxAmount,
        grossAmount: expense.grossAmount,
        currency: 'ILS',
        vatMode: 'exclusive',
        status: 'finalized' as const,
        finalizedAt: expense.expenseDate,
        dueDate: expense.dueDate,
        paymentStatus: expense.paymentStatus,
        paidAt: expense.paidAt ?? null,
        paymentConfirmationSource: expense.paymentStatus === 'paid' ? 'manual' : null,
        paidGrossAmount: expense.paymentStatus === 'paid' ? expense.grossAmount : null,
        classificationStatus: 'classified' as const,
        costCategoryId,
        costFamily: 'direct_project' as const,
      };
    }),
  );

  const billingIds = new Map<string, string>();
  await db.insert(billingRecords).values(
    fixture.billing.map((bill) => {
      const id = randomUUID();
      billingIds.set(bill.key, id);
      const taxAmount = (Number(bill.totalAmount) - Number(bill.subtotalAmount)).toFixed(2);
      return {
        id,
        organizationId,
        projectId: projectIds.get(bill.projectKey) ?? null,
        clientId: clientIds.get(bill.clientKey) ?? null,
        reference: bill.reference,
        issueDate: bill.issueDate,
        subtotalAmount: bill.subtotalAmount,
        taxAmount,
        totalAmount: bill.totalAmount,
        vatMode: 'exclusive' as const,
        status: 'finalized' as const,
        finalizedAt: jerusalemInstant(bill.issueDate, 9),
        currency: 'ILS',
        sourceKind: 'manual' as const,
      };
    }),
  );

  await db.insert(payments).values(
    fixture.payments.map((payment) => ({
      id: randomUUID(),
      organizationId,
      billingRecordId: billingIds.get(payment.billingKey) ?? null,
      clientId: clientIds.get(payment.clientKey) ?? null,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      reference: payment.reference,
      currency: 'ILS',
      status: 'recorded' as const,
    })),
  );

  // AP must follow draft → classified lines → open. Payments are cash-only.
  for (const vendorBill of fixture.vendorBills) {
    const vendorId = vendorIds.get(vendorBill.vendorKey);
    if (!vendorId) continue;
    const billId = randomUUID();
    const projectId = projectIds.get(vendorBill.projectKey) ?? null;
    await db.insert(apBills).values({
      id: billId,
      organizationId,
      projectId,
      vendorId,
      reference: vendorBill.reference,
      status: 'draft',
      billDate: vendorBill.billDate,
      dueDate: vendorBill.dueDate,
      netAmount: vendorBill.netAmount,
      grossAmount: vendorBill.grossAmount,
      taxAmount: vendorBill.taxAmount,
      totalAmount: vendorBill.grossAmount,
      taxBasis: 'canonical',
      currency: 'ILS',
      costFamily: 'direct_project',
      costCategoryId,
      remainderAllocationIntent: projectId ? 'project_allocate' : 'auto_pool',
    });
    await db.insert(apBillLines).values({
      id: randomUUID(),
      organizationId,
      apBillId: billId,
      description: `שורה — ${vendorBill.reference}`,
      quantity: '1',
      unitAmount: vendorBill.netAmount,
      netAmount: vendorBill.netAmount,
      taxAmount: vendorBill.taxAmount,
      grossAmount: vendorBill.grossAmount,
      lineTotal: vendorBill.grossAmount,
      currency: 'ILS',
      economicTargetType: 'inherit',
      projectId: null,
      costFamily: 'direct_project',
      costCategoryId,
      classificationStatus: 'classified',
      sortOrder: 0,
    });
    await db
      .update(apBills)
      .set({ status: 'open', updatedAt: new Date() })
      .where(and(eq(apBills.id, billId), eq(apBills.organizationId, organizationId)));

    if (vendorBill.paidGross && vendorBill.paidDate) {
      const paid = Number(vendorBill.paidGross);
      if (!(paid > 0)) continue;
      const paymentId = randomUUID();
      await db.insert(apPayments).values({
        id: paymentId,
        organizationId,
        vendorId,
        amount: vendorBill.paidGross,
        currency: 'ILS',
        paymentDate: vendorBill.paidDate,
        method: 'transfer',
        reference: `PAY-${vendorBill.reference}`,
        status: 'recorded',
      });
      await db.insert(apPaymentApplications).values({
        id: randomUUID(),
        organizationId,
        apPaymentId: paymentId,
        apBillId: billId,
        appliedAmount: vendorBill.paidGross,
        currency: 'ILS',
      });
    }
  }

  // Issued POs open committed-cost rows (commitment ≠ expense).
  for (const po of fixture.purchaseOrders) {
    const vendorId = vendorIds.get(po.vendorKey);
    const projectId = projectIds.get(po.projectKey);
    if (!vendorId || !projectId) continue;
    const poId = randomUUID();
    await db.insert(purchaseOrders).values({
      id: poId,
      organizationId,
      vendorId,
      projectId,
      reference: po.reference,
      status: 'issued',
      currency: 'ILS',
      committedAmount: po.committedNet,
      orderedOn: po.orderedOn,
      expectedCashDate: po.expectedCashDate,
      notes: 'הזמנת רכש לדוגמה — דמו',
    });
    await db.insert(purchaseOrderLines).values({
      id: randomUUID(),
      organizationId,
      purchaseOrderId: poId,
      description: po.lineDescription,
      quantity: '1',
      unitAmount: po.committedNet,
      lineTotal: po.committedNet,
      currency: 'ILS',
      sortOrder: 0,
    });
    await db.insert(committedCosts).values({
      id: randomUUID(),
      organizationId,
      purchaseOrderId: poId,
      projectId,
      amount: po.committedNet,
      currency: 'ILS',
      status: 'open',
    });
  }

  for (const subcontract of fixture.subcontracts) {
    const vendorId = vendorIds.get(subcontract.vendorKey);
    const projectId = projectIds.get(subcontract.projectKey);
    if (!vendorId || !projectId) continue;
    const agreementId = randomUUID();
    await db.insert(subcontractAgreements).values({
      id: agreementId,
      organizationId,
      subcontractNumber: `SC-${subcontract.key.toUpperCase()}`,
      vendorId,
      projectId,
      parentContractId: contractIds.get(subcontract.parentContractKey) ?? null,
      title: subcontract.title,
      status: 'active',
      originalAmount: subcontract.originalAmount,
      currency: 'ILS',
      startDate: subcontract.startDate,
      endDate: subcontract.endDate ?? null,
      notes: 'הסכם קבלן משנה לדוגמה — דמו',
    });
    await db.insert(subcontractValueEvents).values({
      id: randomUUID(),
      organizationId,
      subcontractId: agreementId,
      kind: 'original',
      amount: subcontract.originalAmount,
      currency: 'ILS',
      effectiveDate: subcontract.startDate,
      reason: 'Original subcontract value',
      actorUserId: null,
    });
  }

  for (const budget of fixture.budgets) {
    const projectId = projectIds.get(budget.projectKey);
    if (!projectId) continue;
    const budgetId = randomUUID();
    await db.insert(projectBudgets).values({
      id: budgetId,
      organizationId,
      projectId,
      name: budget.name,
      status: 'active',
      currency: 'ILS',
      totalBudgetAmount: budget.totalBudgetAmount,
      currentRevisionNumber: 1,
    });
    await db.insert(projectBudgetLines).values({
      id: randomUUID(),
      organizationId,
      budgetId,
      revisionNumber: 1,
      lineType: 'total',
      label: 'תקציב כולל',
      budgetAmount: budget.totalBudgetAmount,
      sortOrder: 0,
    });
  }

  // BOQ per projectKey group (fixture may tag items to more than one project).
  const boqByProject = new Map<string, Array<(typeof fixture.boqItems)[number]>>();
  for (const item of fixture.boqItems) {
    const list = boqByProject.get(item.projectKey) ?? [];
    list.push(item);
    boqByProject.set(item.projectKey, list);
  }
  for (const [projectKey, items] of boqByProject) {
    const projectId = projectIds.get(projectKey);
    if (!projectId || items.length === 0) continue;
    const boqId = randomUUID();
    await db.insert(projectBoqs).values({
      id: boqId,
      organizationId,
      projectId,
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
    await db.insert(boqNodes).values(
      items.map((item) => ({
        id: randomUUID(),
        organizationId,
        boqId,
        parentId: chapterId,
        nodeKind: 'item' as const,
        description: item.description,
        unit: 'יח',
        originalUnitPrice: item.unitPrice,
      })),
    );
  }

  const attendanceEmployeeIds = [...employeeIds.values()].slice(0, 4);
  const dayRows: { id: string; organizationId: string; employeeId: string; workDate: string; status: 'complete' }[] =
    [];
  const eventRows: {
    id: string;
    organizationId: string;
    attendanceDayId: string;
    eventType: 'clock_in' | 'clock_out';
    occurredAt: Date;
    source: 'system';
  }[] = [];
  for (const employeeId of attendanceEmployeeIds) {
    for (const workDate of fixture.attendanceDates) {
      const dayId = randomUUID();
      dayRows.push({ id: dayId, organizationId, employeeId, workDate, status: 'complete' });
      eventRows.push({
        id: randomUUID(),
        organizationId,
        attendanceDayId: dayId,
        eventType: 'clock_in',
        occurredAt: jerusalemInstant(workDate, 8, 5),
        source: 'system',
      });
      eventRows.push({
        id: randomUUID(),
        organizationId,
        attendanceDayId: dayId,
        eventType: 'clock_out',
        occurredAt: jerusalemInstant(workDate, 16, 35),
        source: 'system',
      });
    }
  }
  if (dayRows.length > 0) {
    await db.insert(attendanceDays).values(dayRows);
    await db.insert(attendanceEvents).values(eventRows);
  }

  await db.insert(timeEntries).values(
    fixture.timeEntries
      .map((timeEntry) => {
        const employeeId = employeeIds.get(timeEntry.employeeKey);
        const projectId = projectIds.get(timeEntry.projectKey);
        const rateVersionId = rateVersionIds.get(timeEntry.employeeKey);
        if (!employeeId || !projectId) return null;
        const hours = Number(timeEntry.hours);
        return {
          id: randomUUID(),
          organizationId,
          employeeId,
          projectId,
          workDate: timeEntry.workDate,
          hours: timeEntry.hours,
          description: timeEntry.description,
          kind: 'project' as const,
          status: 'recorded' as const,
          approvalStatus: 'approved' as const,
          rateVersionId: rateVersionId ?? null,
          costAmount: (hours * timeEntry.hourlyRate).toFixed(2),
          costCurrency: 'ILS',
          decidedAt: jerusalemInstant(timeEntry.workDate, 18),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  );

  for (const document of fixture.documents) {
    const projectId = projectIds.get(document.projectKey) ?? projectIds.get('p-active');
    if (!projectId) continue;
    const documentId = randomUUID();
    await db.insert(documents).values({
      id: documentId,
      organizationId,
      storageBucket: 'documents',
      storagePath: `${organizationId}/documents/${documentId}/demo.pdf`,
      originalFilename: document.fileName,
      mimeType: 'application/pdf',
      status: 'available',
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
