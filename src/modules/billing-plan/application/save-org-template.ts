import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { BILLING_PLAN_AUDIT_ACTIONS, type BillingPlanTemplateRowDefinition } from '../domain/types';
import { findPlanById } from '../data/plans.repository';
import { listLinesForPlan } from '../data/lines.repository';
import { insertTemplate } from '../data/templates.repository';
import { saveOrgTemplateSchema, type SaveOrgTemplateInput } from '../validation/schemas';

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

export async function saveOrgBillingPlanTemplate(
  context: OrgContext,
  raw: SaveOrgTemplateInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = saveOrgTemplateSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  let rows: BillingPlanTemplateRowDefinition[] = [];

  if (input.sourcePlanId) {
    const plan = await findPlanById(
      context.db,
      context.organizationId,
      input.sourcePlanId,
    );
    if (!plan) throw new NotFoundError('Billing plan');
    const lines = await listLinesForPlan(context.db, context.organizationId, plan.id);
    rows = lines.map((line, index) => ({
      labelKey: `custom.${line.id}`,
      labelFallback: line.label,
      lineKind: line.lineKind,
      agreedPercent: line.agreedPercent,
      agreedAmount: line.agreedAmount,
      sortOrder: line.sortOrder ?? index,
      sectionKey: line.sectionId,
      sectionLabelKey: null,
    }));
  } else if (input.rows && input.rows.length > 0) {
    rows = input.rows.map((row, index) => ({
      labelKey: row.labelKey ?? `row_${index}`,
      labelFallback: row.labelFallback,
      lineKind: row.lineKind,
      agreedPercent: row.agreedPercent ?? null,
      agreedAmount: row.agreedAmount ?? null,
      sortOrder: row.sortOrder,
      sectionKey: row.sectionKey ?? null,
      sectionLabelKey: null,
    }));
  } else {
    throw new ValidationError([
      { path: 'rows', message: 'Provide rows or sourcePlanId' },
    ]);
  }

  const template = await insertTemplate(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    description: input.description ?? null,
    workKind: input.workKind ?? null,
    defaultRetentionPercent: input.defaultRetentionPercent ?? null,
    currency: input.currency ?? null,
    rowsJson: rows,
    isSystem: false,
    isActive: true,
  });

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.TEMPLATE_SAVED,
    entityType: 'billing_plan_template',
    entityId: template.id,
    after: { name: template.name, rowCount: rows.length },
  });

  return template;
}
