import Decimal from 'decimal.js';
import { createDraftApBill } from '@/modules/ap';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { addMoney, compareMoney, money, multiplyMoney, toNumericString, zeroMoney } from '@/shared/money';
import { assertAllPermissions, assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findActiveEngagementForVendorProject,
  findSubcontractAgreementById,
  findVendorEngagementById,
} from '@/modules/vendors';
import { parseQuantity, quantityString } from '../domain/amounts';
import { BOQ_AUDIT_ACTIONS } from '../domain/types';
import {
  cumulativeSubValuationApprovedForLine,
  findBoqById,
  findBoqNodeById,
  findProjectInOrganization,
  findSubcontractorScheduleById,
  findSubcontractorScheduleLineById,
  findSubcontractorValuationById,
  insertSubcontractorSchedule,
  insertSubcontractorScheduleLine,
  insertSubcontractorValuation,
  insertSubcontractorValuationLines,
  listSubcontractorScheduleLines,
  listSubcontractorSchedulesForBoq,
  listSubcontractorValuationLines,
  listSubcontractorValuationsForSchedule,
  approveSubcontractorValuationRpc,
  activateSubcontractorScheduleRpc,
  proposeSubcontractorValuationApRpc,
  voidSubcontractorValuationRpc,
} from '../data/boq.repository';
import {
  addSubcontractorScheduleLineSchema,
  approveSubcontractorValuationSchema,
  activateSubcontractorScheduleSchema,
  createDraftApFromSubcontractorValuationSchema,
  createSubcontractorScheduleSchema,
  createSubcontractorValuationSchema,
  proposeSubcontractorValuationApSchema,
  voidSubcontractorValuationSchema,
  type AddSubcontractorScheduleLineInput,
  type ApproveSubcontractorValuationInput,
  type ActivateSubcontractorScheduleInput,
  type CreateDraftApFromSubcontractorValuationInput,
  type CreateSubcontractorScheduleInput,
  type CreateSubcontractorValuationInput,
  type ProposeSubcontractorValuationApInput,
  type VoidSubcontractorValuationInput,
} from '../validation/schemas';

/**
 * Subcontractor schedule of rates — COST side only.
 *
 * Invariant 9: unit rates / amounts here MUST NEVER be mixed into client BOQ
 * original_* / current_* revenue columns.
 *
 * AP proposal boundary:
 * `createDraftApBill` is the safe explicit draft API (no Actual, no PO consume).
 * `createApBill` without asDraft can insert `open` and recognize Actual.
 * After an approved valuation, `createDraftApFromSubcontractorValuation` creates a
 * draft vendor bill and links it via propose_boq_subcontractor_valuation_ap.
 * Posting remains a separate AP action — never auto-post from this module.
 */

function validationFromZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) {
  return new ValidationError(
    error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

export async function createSubcontractorSchedule(
  context: OrgContext,
  raw: CreateSubcontractorScheduleInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = createSubcontractorScheduleSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const project = await findProjectInOrganization(
    context.db,
    context.organizationId,
    input.projectId,
  );
  if (!project) throw new NotFoundError('Project');

  const boq = await findBoqById(context.db, context.organizationId, input.boqId);
  if (!boq || boq.projectId !== input.projectId) throw new NotFoundError('BOQ');

  const engagement = await findVendorEngagementById(
    context.db,
    context.organizationId,
    input.vendorEngagementId,
  );
  if (!engagement || engagement.projectId !== input.projectId) {
    throw new NotFoundError('Vendor engagement');
  }

  let vendorEngagementId = engagement.id;
  const subcontractAgreementId = input.subcontractAgreementId ?? null;
  if (subcontractAgreementId) {
    const agreement = await findSubcontractAgreementById(
      context.db,
      context.organizationId,
      subcontractAgreementId,
    );
    if (!agreement) throw new NotFoundError('Subcontract agreement');
    if (agreement.projectId !== input.projectId) {
      throw new ValidationError([
        { path: 'subcontractAgreementId', message: 'Agreement must belong to this project' },
      ]);
    }
    if (engagement.vendorId !== agreement.vendorId) {
      const preferred = await findActiveEngagementForVendorProject(
        context.db,
        context.organizationId,
        agreement.vendorId,
        input.projectId,
      );
      if (!preferred) {
        throw new ValidationError([
          {
            path: 'subcontractAgreementId',
            message: 'Agreement vendor must match a project engagement',
          },
        ]);
      }
      vendorEngagementId = preferred.id;
    }
  }

  const scheduleId = await insertSubcontractorSchedule(context.db, context.organizationId, {
    projectId: input.projectId,
    boqId: input.boqId,
    vendorEngagementId,
    subcontractAgreementId,
    title: input.title?.trim() || null,
    currency: boq.currency,
    notes: input.notes?.trim() || null,
    createdByUserId: context.userId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'boq');
  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_SUB_SCHEDULE_CREATED,
    entityType: 'boq_subcontractor_schedule',
    entityId: scheduleId,
    after: {
      boqId: boq.id,
      vendorEngagementId,
      subcontractAgreementId,
      currency: boq.currency,
      costSideOnly: true,
    },
  });

  return findSubcontractorScheduleById(context.db, context.organizationId, scheduleId);
}

/**
 * Adds a COST rate line mapped to a client BOQ item.
 * Does not mutate client BOQ amounts or unit prices.
 */
export async function addSubcontractorScheduleLine(
  context: OrgContext,
  raw: AddSubcontractorScheduleLineInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = addSubcontractorScheduleLineSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const schedule = await findSubcontractorScheduleById(
    context.db,
    context.organizationId,
    input.scheduleId,
  );
  if (!schedule) throw new NotFoundError('Subcontractor schedule');
  if (schedule.status !== 'draft') {
    throw new ConflictError('Cannot add lines to a non-draft schedule');
  }

  const node = await findBoqNodeById(context.db, context.organizationId, input.boqNodeId);
  if (!node || node.boqId !== schedule.boqId || node.nodeKind !== 'item') {
    throw new NotFoundError('BOQ item');
  }

  const qty = quantityString(input.agreedQuantity);
  const unitRate = money(input.unitRate, schedule.currency);
  const amount = multiplyMoney(unitRate, parseQuantity(qty));

  const lineId = await insertSubcontractorScheduleLine(context.db, context.organizationId, {
    scheduleId: schedule.id,
    boqNodeId: node.id,
    unit: input.unit?.trim() || node.unit,
    agreedQuantity: qty,
    unitRate: toNumericString(unitRate),
    amount: toNumericString(amount),
    currency: schedule.currency,
    notes: input.notes?.trim() || null,
    sortOrder: input.sortOrder ?? 0,
  });

  return findSubcontractorScheduleLineById(context.db, context.organizationId, lineId);
}

/**
 * Creates a durable subcontractor valuation draft.
 * Does NOT create AP — after approval, use createDraftApFromSubcontractorValuation.
 */
export async function createSubcontractorValuationDraft(
  context: OrgContext,
  raw: CreateSubcontractorValuationInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = createSubcontractorValuationSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const schedule = await findSubcontractorScheduleById(
    context.db,
    context.organizationId,
    input.scheduleId,
  );
  if (!schedule) throw new NotFoundError('Subcontractor schedule');
  if (schedule.status !== 'active') {
    throw new ConflictError('Valuation draft requires an active subcontractor schedule');
  }

  const prepared: {
    scheduleLineId: string;
    previousApprovedQuantity: string;
    approvedQuantity: string;
    unitRateSnapshot: string;
    periodAmount: string;
    currency: string;
    notes: string | null;
  }[] = [];

  for (const line of input.lines) {
    const scheduleLine = await findSubcontractorScheduleLineById(
      context.db,
      context.organizationId,
      line.scheduleLineId,
    );
    if (!scheduleLine || scheduleLine.scheduleId !== schedule.id) {
      throw new NotFoundError('Schedule line');
    }

    const previousApprovedQuantity = await cumulativeSubValuationApprovedForLine(
      context.db,
      context.organizationId,
      scheduleLine.id,
    );
    const approvedQuantity = quantityString(line.approvedQuantity);
    const cumulativeAfter = new Decimal(previousApprovedQuantity).plus(approvedQuantity);
    const agreed = parseQuantity(scheduleLine.agreedQuantity);
    if (cumulativeAfter.greaterThan(agreed)) {
      throw new ConflictError(
        `Sub valuation cumulative ${cumulativeAfter.toFixed()} exceeds agreed ${agreed.toFixed()}`,
      );
    }

    const unitRate = money(scheduleLine.unitRate, schedule.currency);
    const periodAmount = multiplyMoney(unitRate, parseQuantity(approvedQuantity));

    prepared.push({
      scheduleLineId: scheduleLine.id,
      previousApprovedQuantity,
      approvedQuantity,
      unitRateSnapshot: toNumericString(unitRate),
      periodAmount: toNumericString(periodAmount),
      currency: schedule.currency,
      notes: line.notes?.trim() || null,
    });
  }

  const valuationId = await insertSubcontractorValuation(context.db, context.organizationId, {
    scheduleId: schedule.id,
    periodLabel: input.periodLabel.trim(),
    notes: input.notes?.trim() || null,
    createdByUserId: context.userId,
  });
  await insertSubcontractorValuationLines(
    context.db,
    context.organizationId,
    valuationId,
    prepared,
  );

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_SUB_VALUATION_CREATED,
    entityType: 'boq_subcontractor_valuation',
    entityId: valuationId,
    after: {
      scheduleId: schedule.id,
      status: 'draft',
      apProposal: 'manual_only',
      note: 'After approval, create a draft vendor bill via createDraftApFromSubcontractorValuation',
    },
  });

  return {
    valuationId,
    scheduleId: schedule.id,
    status: 'draft' as const,
    /**
     * Explicit product note for UI: do not auto-post AP.
     * After approval, operator may create a draft vendor bill (not Actual).
     */
    apProposalNote: 'create_draft_vendor_bill_after_approval' as const,
  };
}

/**
 * Canonical cumulative approval — DB enforces agreed qty ceiling and stamps evidence.
 */
export async function approveSubcontractorValuation(
  context: OrgContext,
  raw: ApproveSubcontractorValuationInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = approveSubcontractorValuationSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  await approveSubcontractorValuationRpc(
    context.db,
    context.organizationId,
    parsed.data.valuationId,
  );

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_SUB_VALUATION_APPROVED,
    entityType: 'boq_subcontractor_valuation',
    entityId: parsed.data.valuationId,
    after: { status: 'approved' },
  });

  return { valuationId: parsed.data.valuationId, status: 'approved' as const };
}

export async function activateSubcontractorSchedule(
  context: OrgContext,
  raw: ActivateSubcontractorScheduleInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = activateSubcontractorScheduleSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  await activateSubcontractorScheduleRpc(
    context.db,
    context.organizationId,
    parsed.data.scheduleId,
  );

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_SUB_SCHEDULE_ACTIVATED,
    entityType: 'boq_subcontractor_schedule',
    entityId: parsed.data.scheduleId,
    after: { status: 'active' },
  });

  return findSubcontractorScheduleById(context.db, context.organizationId, parsed.data.scheduleId);
}

/**
 * Canonical approved → proposed_ap. Attaches proposed_vendor_bill_id only here.
 * Does not create Actual; AP bill must already exist as a draft-safe proposal.
 */
export async function proposeSubcontractorValuationAp(
  context: OrgContext,
  raw: ProposeSubcontractorValuationApInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = proposeSubcontractorValuationApSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  await proposeSubcontractorValuationApRpc(
    context.db,
    context.organizationId,
    parsed.data.valuationId,
    parsed.data.vendorBillId,
  );

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_SUB_VALUATION_PROPOSED_AP,
    entityType: 'boq_subcontractor_valuation',
    entityId: parsed.data.valuationId,
    after: {
      status: 'proposed_ap',
      proposedVendorBillId: parsed.data.vendorBillId,
    },
  });

  return { valuationId: parsed.data.valuationId, status: 'proposed_ap' as const };
}

/**
 * After approved valuation: create a draft vendor bill (no Actual, no PO consume)
 * then link it via the canonical proposed_ap RPC. Never auto-posts.
 */
export async function createDraftApFromSubcontractorValuation(
  context: OrgContext,
  raw: CreateDraftApFromSubcontractorValuationInput,
) {
  assertAllPermissions(context, [PERMISSIONS.BOQ_MANAGE, PERMISSIONS.AP_MANAGE]);
  const parsed = createDraftApFromSubcontractorValuationSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  const valuation = await findSubcontractorValuationById(
    context.db,
    context.organizationId,
    parsed.data.valuationId,
  );
  if (!valuation) throw new NotFoundError('Subcontractor valuation');
  if (valuation.status !== 'approved') {
    throw new ConflictError('Draft vendor bill requires an approved subcontractor valuation');
  }
  if (valuation.proposedVendorBillId) {
    throw new ConflictError('Valuation already has a proposed vendor bill');
  }

  const schedule = await findSubcontractorScheduleById(
    context.db,
    context.organizationId,
    valuation.scheduleId,
  );
  if (!schedule) throw new NotFoundError('Subcontractor schedule');

  const engagement = await findVendorEngagementById(
    context.db,
    context.organizationId,
    schedule.vendorEngagementId,
  );
  if (!engagement) throw new NotFoundError('Vendor engagement');

  let vendorId = engagement.vendorId;
  const agreement = schedule.subcontractAgreementId
    ? await findSubcontractAgreementById(
        context.db,
        context.organizationId,
        schedule.subcontractAgreementId,
      )
    : null;
  if (schedule.subcontractAgreementId && !agreement) {
    throw new NotFoundError('Subcontract agreement');
  }
  if (agreement) {
    if (agreement.vendorId !== engagement.vendorId || agreement.projectId !== schedule.projectId) {
      throw new ConflictError('Subcontract agreement vendor or project does not match the schedule');
    }
    vendorId = agreement.vendorId;
  }

  const retentionPercent =
    parsed.data.retentionPercent ?? agreement?.retentionPercent ?? undefined;

  const valuationLines = await listSubcontractorValuationLines(
    context.db,
    context.organizationId,
    valuation.id,
  );

  const billLines: {
    description: string;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
    currency: string;
  }[] = [];
  let total = zeroMoney(schedule.currency);

  for (const line of valuationLines) {
    const period = money(line.periodAmount, line.currency);
    if (compareMoney(period, zeroMoney(line.currency)) <= 0) continue;
    billLines.push({
      description: line.notes?.trim() || `Subcontractor valuation ${valuation.periodLabel}`,
      quantity: line.approvedQuantity,
      unitAmount: toNumericString(money(line.unitRateSnapshot, line.currency)),
      lineTotal: toNumericString(period),
      currency: line.currency,
    });
    total = addMoney(total, period);
  }

  if (billLines.length === 0) {
    throw new ConflictError('Approved valuation has no billable period amounts');
  }

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const bill = await createDraftApBill(txContext, {
      vendorId,
      projectId: schedule.projectId,
      reference: valuation.periodLabel.slice(0, 80),
      currency: schedule.currency,
      totalAmount: toNumericString(total),
      notes: `Draft from approved subcontractor valuation ${valuation.id} — not Actual until posted`,
      lines: billLines,
      subcontractAgreementId: schedule.subcontractAgreementId ?? undefined,
      retentionPercent,
    });

    if (bill.status !== 'draft') {
      throw new ConflictError('Subcontractor AP handoff must remain draft');
    }

    await proposeSubcontractorValuationApRpc(
      tx,
      context.organizationId,
      valuation.id,
      bill.id,
    );

    await recordAuditEvent(txContext, {
      action: BOQ_AUDIT_ACTIONS.BOQ_SUB_VALUATION_PROPOSED_AP,
      entityType: 'boq_subcontractor_valuation',
      entityId: valuation.id,
      after: {
        status: 'proposed_ap',
        proposedVendorBillId: bill.id,
        billStatus: bill.status,
        recognizedActual: false,
        consumedPo: false,
      },
    });

    return {
      valuationId: valuation.id,
      vendorBillId: bill.id,
      status: 'proposed_ap' as const,
      billStatus: bill.status,
    };
  });
}

export async function voidSubcontractorValuation(
  context: OrgContext,
  raw: VoidSubcontractorValuationInput,
) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = voidSubcontractorValuationSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  await voidSubcontractorValuationRpc(
    context.db,
    context.organizationId,
    parsed.data.valuationId,
  );

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_SUB_VALUATION_VOIDED,
    entityType: 'boq_subcontractor_valuation',
    entityId: parsed.data.valuationId,
    after: { status: 'voided' },
  });

  return { valuationId: parsed.data.valuationId, status: 'voided' as const };
}

export async function listSubcontractorSchedulesForBoqWorkspace(
  context: OrgContext,
  boqId: string,
) {
  assertPermission(context, PERMISSIONS.BOQ_READ);
  const showCostRates =
    hasPermission(context, PERMISSIONS.BOQ_MANAGE) ||
    hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
  if (!showCostRates) {
    return [];
  }

  const boq = await findBoqById(context.db, context.organizationId, boqId);
  if (!boq) throw new NotFoundError('BOQ');

  const schedules = await listSubcontractorSchedulesForBoq(
    context.db,
    context.organizationId,
    boqId,
  );
  const detailed = [];
  for (const schedule of schedules) {
    const lines = await listSubcontractorScheduleLines(
      context.db,
      context.organizationId,
      schedule.id,
    );
    const valuations = await listSubcontractorValuationsForSchedule(
      context.db,
      context.organizationId,
      schedule.id,
    );
    detailed.push({
      schedule,
      lines,
      valuations,
      agreement: schedule.subcontractAgreementId
        ? await findSubcontractAgreementById(
            context.db,
            context.organizationId,
            schedule.subcontractAgreementId,
          )
        : null,
    });
  }
  return detailed;
}
