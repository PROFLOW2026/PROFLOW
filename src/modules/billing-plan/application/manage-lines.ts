import Decimal from 'decimal.js';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertPlanEditable } from '../domain/lifecycle';
import {
  assertAgreedAmountAllowsBilled,
  deriveAmountFromPercent,
} from '../domain/line-math';
import { BILLING_PLAN_AUDIT_ACTIONS } from '../domain/types';
import { findPlanById } from '../data/plans.repository';
import {
  archiveLine,
  findLineById,
  insertLine,
  listLinesForPlan,
  reorderLines,
  updateLine,
} from '../data/lines.repository';
import { sumIssuedAmountsByPlanLine } from '../data/cycles.repository';
import {
  addPlanLineSchema,
  duplicatePlanLineSchema,
  removePlanLineSchema,
  reorderPlanLinesSchema,
  splitPlanLineSchema,
  updatePlanLineSchema,
  type AddPlanLineInput,
  type ReorderPlanLinesInput,
  type SplitPlanLineInput,
  type UpdatePlanLineInput,
} from '../validation/schemas';

function throwZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): never {
  throw new ValidationError(
    error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

async function requireEditablePlan(context: OrgContext, planId: string) {
  const plan = await findPlanById(context.db, context.organizationId, planId);
  if (!plan) throw new NotFoundError('Billing plan');
  assertPlanEditable(plan.status);
  return plan;
}

export async function addPlanLine(context: OrgContext, raw: AddPlanLineInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = addPlanLineSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;
  const plan = await requireEditablePlan(context, input.planId);

  const existing = await listLinesForPlan(context.db, context.organizationId, plan.id);
  const sortOrder = input.sortOrder ?? existing.length;

  let agreedAmount = input.agreedAmount ?? '0';
  if (!input.agreedAmount && input.agreedPercent) {
    // Percent-of-contract lines need CCV at apply time; store 0 until apply-template / caller sets amount.
    agreedAmount = '0';
  }

  const line = await insertLine(context.db, {
    organizationId: context.organizationId,
    planId: plan.id,
    sectionId: input.sectionId ?? null,
    sortOrder,
    label: input.label,
    lineKind: input.lineKind,
    agreedAmount: toNumericString(money(agreedAmount, plan.currency)),
    agreedPercent: input.agreedPercent ?? null,
    targetDate: input.targetDate ?? null,
    milestoneLabel: input.milestoneLabel ?? null,
    retentionPercentOverride: input.retentionPercentOverride ?? null,
    boqNodeId: input.boqNodeId ?? null,
    notes: input.notes ?? null,
  });

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.LINES_CHANGED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: { op: 'add', lineId: line.id, label: line.label },
  });

  return line;
}

export async function updatePlanLine(context: OrgContext, raw: UpdatePlanLineInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = updatePlanLineSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;
  const plan = await requireEditablePlan(context, input.planId);

  const line = await findLineById(context.db, context.organizationId, input.lineId);
  if (!line || line.planId !== plan.id) throw new NotFoundError('Billing plan line');

  const billed = await sumIssuedAmountsByPlanLine(
    context.db,
    context.organizationId,
    plan.id,
  );
  const billedAmount = money(billed.get(line.id)?.amount ?? '0', plan.currency);

  const patch: Parameters<typeof updateLine>[3] = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.sectionId !== undefined) patch.sectionId = input.sectionId;
  if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
  if (input.targetDate !== undefined) patch.targetDate = input.targetDate;
  if (input.milestoneLabel !== undefined) patch.milestoneLabel = input.milestoneLabel;
  if (input.retentionPercentOverride !== undefined) {
    patch.retentionPercentOverride = input.retentionPercentOverride;
  }
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.agreedPercent !== undefined) patch.agreedPercent = input.agreedPercent;

  if (input.agreedAmount !== undefined) {
    const next = money(input.agreedAmount, plan.currency);
    assertAgreedAmountAllowsBilled({
      newAgreedAmount: next,
      billedCumulative: billedAmount,
    });
    patch.agreedAmount = toNumericString(next);
  }

  const updated = await updateLine(context.db, context.organizationId, line.id, patch);
  if (!updated) throw new NotFoundError('Billing plan line');

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.LINES_CHANGED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: { op: 'update', lineId: line.id },
  });

  return updated;
}

export async function removePlanLine(
  context: OrgContext,
  raw: { planId: string; lineId: string },
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = removePlanLineSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;
  const plan = await requireEditablePlan(context, input.planId);

  const line = await findLineById(context.db, context.organizationId, input.lineId);
  if (!line || line.planId !== plan.id) throw new NotFoundError('Billing plan line');

  const billed = await sumIssuedAmountsByPlanLine(
    context.db,
    context.organizationId,
    plan.id,
  );
  if (billed.has(line.id)) {
    throw new DomainRuleError(
      'Cannot remove a plan line that has already been billed',
      'billingPlan.errors.lineAlreadyBilled',
    );
  }

  await archiveLine(context.db, context.organizationId, line.id);

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.LINES_CHANGED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: { op: 'remove', lineId: line.id },
  });

  return { ok: true as const };
}

export async function renamePlanLine(
  context: OrgContext,
  input: { planId: string; lineId: string; label: string },
) {
  return updatePlanLine(context, {
    planId: input.planId,
    lineId: input.lineId,
    label: input.label,
  });
}

export async function reorderPlanLines(context: OrgContext, raw: ReorderPlanLinesInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = reorderPlanLinesSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;
  const plan = await requireEditablePlan(context, input.planId);

  const existing = await listLinesForPlan(context.db, context.organizationId, plan.id);
  const existingIds = new Set(existing.map((l) => l.id));
  for (const id of input.orderedLineIds) {
    if (!existingIds.has(id)) throw new NotFoundError('Billing plan line');
  }

  await reorderLines(
    context.db,
    context.organizationId,
    plan.id,
    input.orderedLineIds,
  );

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.LINES_CHANGED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: { op: 'reorder', count: input.orderedLineIds.length },
  });

  return listLinesForPlan(context.db, context.organizationId, plan.id);
}

export async function duplicatePlanLine(
  context: OrgContext,
  raw: { planId: string; lineId: string },
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = duplicatePlanLineSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;
  const plan = await requireEditablePlan(context, input.planId);

  const line = await findLineById(context.db, context.organizationId, input.lineId);
  if (!line || line.planId !== plan.id) throw new NotFoundError('Billing plan line');

  const lines = await listLinesForPlan(context.db, context.organizationId, plan.id);
  const copy = await insertLine(context.db, {
    organizationId: context.organizationId,
    planId: plan.id,
    sectionId: line.sectionId,
    sortOrder: lines.length,
    label: `${line.label} (copy)`,
    lineKind: line.lineKind,
    agreedAmount: line.agreedAmount,
    agreedPercent: line.agreedPercent,
    targetDate: line.targetDate,
    milestoneLabel: line.milestoneLabel,
    retentionPercentOverride: line.retentionPercentOverride,
    boqNodeId: line.boqNodeId,
    notes: line.notes,
  });

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.LINES_CHANGED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: { op: 'duplicate', fromLineId: line.id, lineId: copy.id },
  });

  return copy;
}

export async function splitPlanLine(context: OrgContext, raw: SplitPlanLineInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = splitPlanLineSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;
  const plan = await requireEditablePlan(context, input.planId);

  const line = await findLineById(context.db, context.organizationId, input.lineId);
  if (!line || line.planId !== plan.id) throw new NotFoundError('Billing plan line');

  const billed = await sumIssuedAmountsByPlanLine(
    context.db,
    context.organizationId,
    plan.id,
  );
  if (billed.has(line.id)) {
    throw new DomainRuleError(
      'Cannot split a plan line that has already been billed',
      'billingPlan.errors.lineAlreadyBilled',
    );
  }

  const totalPct = input.partPercents.reduce(
    (acc, p) => acc.plus(new Decimal(p)),
    new Decimal(0),
  );
  if (!totalPct.equals(100)) {
    throw new DomainRuleError(
      'Split part percents must total 100',
      'billingPlan.errors.splitPercentsInvalid',
    );
  }

  const base = money(line.agreedAmount, plan.currency);
  const created = [];
  const lines = await listLinesForPlan(context.db, context.organizationId, plan.id);
  let sortOrder = lines.length;

  for (let i = 0; i < input.partPercents.length; i += 1) {
    const pct = input.partPercents[i]!;
    const amount = deriveAmountFromPercent(base, pct);
    const label = input.labels?.[i] ?? `${line.label} (${i + 1})`;
    const part = await insertLine(context.db, {
      organizationId: context.organizationId,
      planId: plan.id,
      sectionId: line.sectionId,
      sortOrder: sortOrder++,
      label,
      lineKind: line.lineKind,
      agreedAmount: toNumericString(amount),
      agreedPercent: pct,
      retentionPercentOverride: line.retentionPercentOverride,
      notes: line.notes,
    });
    created.push(part);
  }

  await archiveLine(context.db, context.organizationId, line.id);

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.LINES_CHANGED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: {
      op: 'split',
      fromLineId: line.id,
      newLineIds: created.map((c) => c.id),
    },
  });

  return created;
}
