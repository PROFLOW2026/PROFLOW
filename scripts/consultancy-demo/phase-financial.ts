import { SEED_MARKER } from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import type { ProjectSpec } from './generate-specs.ts';
import { generateClients } from './generate-specs.ts';
import { intBetween, mulberry32 } from './rng.ts';

function sumDecimal(values: readonly string[]): string {
  return values.reduce((acc, value) => acc + Number(value), 0).toFixed(2).replace(/\.00$/, '');
}

function billingAmount(contractNet: string, pct: number): string {
  const amount = (Number(contractNet) * pct) / 100;
  const rounded = Math.round(amount / 100) * 100 || amount;
  return String(rounded).replace(/\.00$/, '');
}

export async function seedFinancial(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
  projectSpecs: readonly ProjectSpec[],
): Promise<void> {
  const clients = generateClients();
  const clientPaymentTerms = new Map(clients.map((client) => [client.key, client.paymentTermKey]));

  await runPhase('invoicing settings', target.organizationId, target.userId, async (context) => {
    const { upsertOrgInvoicingSettings } = await import(
      '../../src/modules/invoicing-integration/data/org-invoicing-settings.repository.ts'
    );
    await upsertOrgInvoicingSettings(context, {
      mode: 'manual',
      paymentDocumentPolicy: 'tax_invoice_then_receipt',
      receiptIssuance: 'manual',
    });
  });

  const billingByRef = new Map<string, string>();

  await runPhase('billings', target.organizationId, target.userId, async (context) => {
    const { createBillingRecord, finalizeBillingRecord } = await import('../../src/modules/billing/index.ts');
    const { replaceBillingLines } = await import('../../src/modules/billing/data/billing.repository.ts');
    const {
      getCatalogEntryByKey,
      parsePaymentTermMetadata,
      suggestDueDateFromPaymentTerm,
    } = await import('../../src/modules/business-catalog/index.ts');
    const { billingRecords } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    const { toNumericString, money } = await import('../../src/shared/money/money.ts');
    const { businessDate } = await import('../../src/shared/dates/index.ts');

    async function ensureBilling(
      ref: string,
      projectId: string,
      clientKey: string,
      amount: string,
      issueDate: string,
      lineDesc: string,
    ) {
      const [existing] = await context.db
        .select({ id: billingRecords.id })
        .from(billingRecords)
        .where(and(eq(billingRecords.organizationId, target.organizationId), eq(billingRecords.reference, ref)))
        .limit(1);
      if (existing) {
        billingByRef.set(ref, existing.id);
        return existing.id;
      }

      const termKey = clientPaymentTerms.get(clientKey) ?? 'net_30';
      const termEntry = await getCatalogEntryByKey(context.db, target.organizationId, 'payment_term', termKey);
      if (!termEntry) throw new Error(`Missing payment term ${termKey}`);
      const termMeta = parsePaymentTermMetadata(termEntry.metadata);
      if (!termMeta) throw new Error(`Invalid term ${termKey}`);
      const dueDate = suggestDueDateFromPaymentTerm({ baseDateIso: issueDate, dueDate: null, term: termMeta });

      const draft = await createBillingRecord(context, {
        projectId,
        amount,
        currency: 'ILS',
        issueDate,
        paymentTermId: termEntry.id,
        dueDate: dueDate ?? undefined,
        reference: ref,
        notes: `${SEED_MARKER}:${lineDesc}`,
        vatMode: 'exclusive',
        finalize: false,
      });
      await replaceBillingLines(context.db, target.organizationId, draft.id, [
        {
          description: lineDesc,
          lineTotal: toNumericString(money(amount, 'ILS')),
          currency: 'ILS',
          changeOrderId: null,
          sortOrder: 0,
        },
      ]);
      const finalized = await finalizeBillingRecord(context, draft.id);
      billingByRef.set(ref, finalized.id);
      stats.billings += 1;
      return finalized.id;
    }

    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId || spec.billedPct <= 0) continue;

      const totalBilled = billingAmount(spec.contractNet, spec.billedPct);
      const monthCount = spec.activity === 'done' || spec.bucket === 'handover' ? 3 : spec.activity === 'high' ? 2 : 1;
      const parts = monthCount === 1 ? [totalBilled] : Array.from({ length: monthCount }, (_, idx) => {
        const share = Number(totalBilled) / monthCount;
        return idx === monthCount - 1
          ? String(Math.round((Number(totalBilled) - share * (monthCount - 1)) / 100) * 100)
          : String(Math.round(share / 100) * 100);
      });

      for (const [idx, partAmount] of parts.entries()) {
        if (Number(partAmount) <= 0) continue;
        const month = String(Math.min(1 + idx * 3, 9)).padStart(2, '0');
        const ref = `${SEED_MARKER}/BILL/${spec.docNum}/M${month}`;
        await ensureBilling(
          ref,
          projectId,
          spec.clientKey,
          partAmount,
          businessDate(`2026-${month}-12`),
          `חיוב התקדמות — ${spec.name}`,
        );
      }
    }
  });

  await runPhase('payments', target.organizationId, target.userId, async (context) => {
    const { recordPayment, getBillingRecord } = await import('../../src/modules/billing/index.ts');
    const { payments } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId || spec.collectedPct <= 0) continue;

      const targetCollected = billingAmount(spec.contractNet, spec.collectedPct);
      const monthCount = spec.activity === 'done' ? 3 : spec.activity === 'high' ? 2 : 1;
      const payParts = monthCount === 1
        ? [targetCollected]
        : Array.from({ length: monthCount }, (_, idx) => {
            const share = Number(targetCollected) / monthCount;
            return idx === monthCount - 1
              ? String(Math.round((Number(targetCollected) - share * (monthCount - 1)) / 100) * 100)
              : String(Math.round(share / 100) * 100);
          });

      for (const [idx, payAmount] of payParts.entries()) {
        const month = String(Math.min(1 + idx * 3, 9)).padStart(2, '0');
        const billRef = `${SEED_MARKER}/BILL/${spec.docNum}/M${month}`;
        const payRef = `${SEED_MARKER}/PAY/${spec.docNum}/M${month}`;
        const billingId = billingByRef.get(billRef);
        if (!billingId) continue;

        const [existingPay] = await context.db
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.organizationId, target.organizationId), eq(payments.reference, payRef)))
          .limit(1);
        if (existingPay) continue;

        const billing = await getBillingRecord(context, billingId);
        const outstanding = Number(billing.outstandingAmount.amount);
        const applied = Math.min(Number(payAmount), outstanding);
        if (applied <= 0) continue;

        await recordPayment(context, {
          billingRecordId: billingId,
          amount: applied.toFixed(2).replace(/\.00$/, ''),
          paymentDate: `2026-${String(Math.min(Number(month) + 1, 9)).padStart(2, '0')}-18`,
          method: 'העברה בנקאית',
          reference: payRef,
          notes: `${SEED_MARKER}:collection`,
        });
        stats.payments += 1;
      }
    }
  });

  await runPhase('vendors ap expenses changes', target.organizationId, target.userId, async (context) => {
    const { createVendor, createSubcontract, changeSubcontractStatus } = await import(
      '../../src/modules/vendors/index.ts'
    );
    const { createApBill } = await import('../../src/modules/ap/index.ts');
    const { createExpense, finalizeExpense } = await import('../../src/modules/expenses/index.ts');
    const { createChangeRequest, submitChangeRequestForApproval } = await import(
      '../../src/modules/commercial/index.ts'
    );
    const { approveChangeRequest } = await import(
      '../../src/modules/commercial/application/quotes-and-approval.ts'
    );
    const { vendors, apBills, subcontractAgreements, expenses, costCategories, changeRequests } = await import(
      '@drizzle/schema'
    );
    const { and, eq, like } = await import('drizzle-orm');

    const vendorSpecs = [
      { key: 'v1', name: 'יועץ BIM — אלון שגיא', type: 'subcontractor' as const },
      { key: 'v2', name: 'יועצת תאורה — נועה לוי', type: 'subcontractor' as const },
      { key: 'v3', name: 'יועץ מיזוג — קlima הנדסה', type: 'subcontractor' as const },
      { key: 'v4', name: 'משרד אדריכלות — קו ראשון', type: 'subcontractor' as const },
      { key: 'v5', name: 'מדפסת תוכניות — פלוט פרו', type: 'supplier' as const },
      { key: 'v6', name: 'ציוד CAD — תוכנה פלוס', type: 'supplier' as const },
      { key: 'v7', name: 'יועץ אקוסטיקה — ש.ד. הנדסה', type: 'subcontractor' as const },
      { key: 'v8', name: 'יועץ אינסטלציה — מ.א. תכנון', type: 'subcontractor' as const },
      { key: 'v9', name: 'מעבדה חשמלית — בדיקות א.ש.', type: 'supplier' as const },
      { key: 'v10', name: 'יועץ מיגון — בטיחות בע"מ', type: 'subcontractor' as const },
      { key: 'v11', name: 'שירותי IT — משרד חכם', type: 'supplier' as const },
      { key: 'v12', name: 'יועץ תקשורת — נט-סolut', type: 'subcontractor' as const },
    ];
    const vendorIds = new Map<string, string>();
    for (const spec of vendorSpecs) {
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
        notes: `${SEED_MARKER}:vendor:${spec.key}`,
      });
      vendorIds.set(spec.key, created.id);
      stats.vendors += 1;
    }

    const [materialsCategory] = await context.db
      .select({ id: costCategories.id })
      .from(costCategories)
      .where(and(eq(costCategories.organizationId, target.organizationId), eq(costCategories.key, 'materials')))
      .limit(1);

    const apSpecs = [
      { ref: `${SEED_MARKER}/AP/001`, vendorKey: 'v5', projectDocNum: '27001', amount: '4200' },
      { ref: `${SEED_MARKER}/AP/002`, vendorKey: 'v6', projectDocNum: '27012', amount: '8900' },
      { ref: `${SEED_MARKER}/AP/003`, vendorKey: 'v9', projectDocNum: '27025', amount: '6500' },
      { ref: `${SEED_MARKER}/AP/004`, vendorKey: 'v11', projectDocNum: '27040', amount: '3200' },
    ] as const;

    if (materialsCategory) {
      for (const spec of apSpecs) {
        const [existing] = await context.db
          .select({ id: apBills.id })
          .from(apBills)
          .where(and(eq(apBills.organizationId, target.organizationId), eq(apBills.reference, spec.ref)))
          .limit(1);
        if (existing) continue;
        const vendorId = vendorIds.get(spec.vendorKey);
        const projectId = maps.projectIds.get(spec.projectDocNum);
        if (!vendorId || !projectId) continue;
        await createApBill(context, {
          vendorId,
          projectId,
          reference: spec.ref,
          billDate: '2026-06-10',
          currency: 'ILS',
          totalAmount: spec.amount,
          amountIncludesTax: false,
          notes: `${SEED_MARKER}:ap`,
          lines: [
            {
              description: 'שירותי יועץ / ציוד',
              quantity: '1',
              unitAmount: spec.amount,
              lineTotal: spec.amount,
              currency: 'ILS',
              costCategoryId: materialsCategory.id,
              costFamily: 'direct_project',
            },
          ],
        });
        stats.notes.push(`AP bill ${spec.ref}`);
      }
    }

    const subSpecs = [
      { ref: `${SEED_MARKER}/SUB/001`, vendorKey: 'v1', projectDocNum: '27002', title: 'BIM — מגדלי פארק', amount: '48000' },
      { ref: `${SEED_MARKER}/SUB/002`, vendorKey: 'v2', projectDocNum: '27005', title: 'תאורה — קמפוס טכנולוגי', amount: '32000' },
      { ref: `${SEED_MARKER}/SUB/003`, vendorKey: 'v3', projectDocNum: '27008', title: 'תיאום מיזוג — מרכז לוגיסטי', amount: '28000' },
      { ref: `${SEED_MARKER}/SUB/004`, vendorKey: 'v7', projectDocNum: '27015', title: 'יועץ אקוסטיקה — מגדל משרדים', amount: '18000' },
    ] as const;

    for (const spec of subSpecs) {
      const [existing] = await context.db
        .select({ id: subcontractAgreements.id })
        .from(subcontractAgreements)
        .where(
          and(
            eq(subcontractAgreements.organizationId, target.organizationId),
            eq(subcontractAgreements.subcontractNumber, spec.ref),
          ),
        )
        .limit(1);
      if (existing) continue;
      const vendorId = vendorIds.get(spec.vendorKey);
      const projectId = maps.projectIds.get(spec.projectDocNum);
      if (!vendorId || !projectId) continue;
      const created = await createSubcontract(context, {
        title: spec.title,
        subcontractNumber: spec.ref,
        vendorId,
        projectId,
        originalAmount: spec.amount,
        startDate: '2026-02-01',
        endDate: '2026-10-31',
        notes: `${SEED_MARKER}:sub`,
      });
      await changeSubcontractStatus(context, { subcontractId: created.id, status: 'active' });
    }

    const categoryIds = new Map<string, string>();
    const categoryRows = await context.db
      .select({ id: costCategories.id, key: costCategories.key })
      .from(costCategories)
      .where(eq(costCategories.organizationId, target.organizationId));
    for (const row of categoryRows) {
      if (row.key) categoryIds.set(row.key, row.id);
    }

    const overheadSpecs = [
      { ref: `${SEED_MARKER}/OVERHEAD/RENT`, amount: '14500', description: 'שכירות משרד', month: '2026-01-05', categoryKey: 'rent' },
      { ref: `${SEED_MARKER}/OVERHEAD/RENT-02`, amount: '14500', description: 'שכירות משרד', month: '2026-04-05', categoryKey: 'rent' },
      { ref: `${SEED_MARKER}/OVERHEAD/RENT-03`, amount: '14500', description: 'שכירות משרד', month: '2026-07-05', categoryKey: 'rent' },
      { ref: `${SEED_MARKER}/OVERHEAD/IT`, amount: '4200', description: 'תוכנה ורישוי CAD', month: '2026-03-10', categoryKey: 'software' },
      { ref: `${SEED_MARKER}/OVERHEAD/INS`, amount: '6800', description: 'ביטוח מקצועי', month: '2026-02-15', categoryKey: 'insurance' },
    ] as const;

    for (const spec of overheadSpecs) {
      const [existing] = await context.db
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.organizationId, target.organizationId), eq(expenses.notes, spec.ref)))
        .limit(1);
      if (existing) continue;
      const costCategoryId = categoryIds.get(spec.categoryKey);
      if (!costCategoryId) continue;
      const draft = await createExpense(context, {
        amount: spec.amount,
        currency: 'ILS',
        description: spec.description,
        expenseDate: spec.month,
        costFamily: 'business_overhead',
        costCategoryId,
        allocationIntent: 'company_only',
        vatMode: 'exclusive',
        notes: spec.ref,
      });
      await finalizeExpense(context, draft.id);
      stats.expenses += 1;
    }

    const changeCandidates = projectSpecs.filter(
      (spec) => spec.activity === 'high' || spec.activity === 'medium',
    );
    const rng = mulberry32(424242);
    for (const spec of changeCandidates.slice(0, 24)) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;
      const ref = `${SEED_MARKER}/CR/${spec.docNum}`;
      const [existing] = await context.db
        .select({ id: changeRequests.id, status: changeRequests.status })
        .from(changeRequests)
        .where(
          and(
            eq(changeRequests.organizationId, target.organizationId),
            like(changeRequests.notes, `%${ref}%`),
          ),
        )
        .limit(1);
      if (existing) continue;

      const amount = String(intBetween(rng, 8000, 45000));
      const created = await createChangeRequest(context, {
        projectId,
        title: `שינוי תכנון — ${spec.name.slice(0, 40)}`,
        direction: 'addition',
        requestedAmount: amount,
        requestedDate: `2026-${String(intBetween(rng, 2, 8)).padStart(2, '0')}-10`,
        notes: `${ref}:pending-review`,
      });
      stats.changes += 1;

      if (Number(spec.docNum) % 2 === 0) {
        await submitChangeRequestForApproval(context, created.changeRequestId, { recordSent: true });
        await approveChangeRequest(context, {
          changeRequestId: created.changeRequestId,
          effectiveDate: `2026-${String(intBetween(rng, 3, 9)).padStart(2, '0')}-20`,
          approverName: 'אורי לביא',
          notes: `${ref}:approved`,
        });
        stats.approvals += 1;
      }
    }
  });

  await runPhase('financial summary note', target.organizationId, target.userId, async () => {
    const billedTotal = sumDecimal(
      projectSpecs.map((spec) => billingAmount(spec.contractNet, spec.billedPct)),
    );
    stats.notes.push(`Target billed net across projects: ${billedTotal} ILS`);
  });
}
