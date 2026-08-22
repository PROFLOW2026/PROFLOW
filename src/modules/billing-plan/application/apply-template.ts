import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, percentOfMoney, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  computeCurrentContractValue,
  listContractValueEvents,
} from '@/modules/projects';
import { assertPlanEditable } from '../domain/lifecycle';
import { findProfessionStarterTemplate } from '../domain/templates';
import { BILLING_PLAN_AUDIT_ACTIONS, type BillingPlanLineKind } from '../domain/types';
import { findPlanById, updatePlan } from '../data/plans.repository';
import {
  archiveLine,
  insertLine,
  insertSection,
  listLinesForPlan,
} from '../data/lines.repository';
import { findTemplateById } from '../data/templates.repository';
import { sumIssuedAmountsByPlanLine } from '../data/cycles.repository';
import { applyTemplateSchema, type ApplyTemplateInput } from '../validation/schemas';

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

export async function applyBillingPlanTemplate(
  context: OrgContext,
  raw: ApplyTemplateInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = applyTemplateSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  if (!input.templateId && !input.professionTemplateKey) {
    throw new ValidationError([
      { path: 'templateId', message: 'templateId or professionTemplateKey is required' },
    ]);
  }

  const plan = await findPlanById(context.db, context.organizationId, input.planId);
  if (!plan) throw new NotFoundError('Billing plan');
  assertPlanEditable(plan.status);

  const events = await listContractValueEvents(
    context.db,
    context.organizationId,
    plan.contractId,
  );
  const contractValue = toNumericString(
    computeCurrentContractValue(events, plan.currency),
  );

  let rows: readonly {
    labelKey: string;
    labelFallback?: string;
    lineKind: BillingPlanLineKind;
    agreedPercent?: string | null;
    agreedAmount?: string | null;
    sortOrder: number;
    sectionKey?: string | null;
  }[] = [];
  let defaultRetention: string | null = null;
  let templateId: string | null = null;

  if (input.templateId) {
    const template = await findTemplateById(
      context.db,
      context.organizationId,
      input.templateId,
    );
    if (!template) throw new NotFoundError('Billing plan template');
    rows = template.rowsJson;
    defaultRetention = template.defaultRetentionPercent;
    templateId = template.id;
  } else if (input.professionTemplateKey) {
    const starter = findProfessionStarterTemplate(input.professionTemplateKey);
    if (!starter) {
      throw new NotFoundError('Profession template');
    }
    rows = starter.rows;
    defaultRetention = starter.defaultRetentionPercent;
  }

  const billed = await sumIssuedAmountsByPlanLine(
    context.db,
    context.organizationId,
    plan.id,
  );
  const existing = await listLinesForPlan(context.db, context.organizationId, plan.id);

  if (input.replaceExisting) {
    for (const line of existing) {
      if (billed.has(line.id)) {
        throw new DomainRuleError(
          'Cannot replace template lines that have already been billed',
          'billingPlan.errors.lineAlreadyBilled',
        );
      }
      await archiveLine(context.db, context.organizationId, line.id);
    }
  }

  const sectionIds = new Map<string, string>();
  let sectionOrder = 0;
  const created = [];

  for (const row of rows) {
    let sectionId: string | null = null;
    if (row.sectionKey) {
      const cached = sectionIds.get(row.sectionKey);
      if (cached) {
        sectionId = cached;
      } else {
        const section = await insertSection(context.db, {
          organizationId: context.organizationId,
          planId: plan.id,
          name: row.sectionKey,
          sortOrder: sectionOrder++,
        });
        sectionIds.set(row.sectionKey, section.id);
        sectionId = section.id;
      }
    }

    const base = money(contractValue, plan.currency);
    let agreedAmount = '0';
    if (row.agreedAmount) {
      agreedAmount = toNumericString(money(row.agreedAmount, plan.currency));
    } else if (row.agreedPercent) {
      agreedAmount = toNumericString(percentOfMoney(base, row.agreedPercent));
    }

    const line = await insertLine(context.db, {
      organizationId: context.organizationId,
      planId: plan.id,
      sectionId,
      sortOrder: row.sortOrder,
      label: row.labelFallback ?? row.labelKey,
      lineKind: row.lineKind,
      agreedAmount,
      agreedPercent: row.agreedPercent ?? null,
    });
    created.push(line);
  }

  await updatePlan(context.db, context.organizationId, plan.id, {
    templateId,
    ...(defaultRetention && !plan.defaultRetentionPercent
      ? { defaultRetentionPercent: defaultRetention }
      : {}),
  });

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.TEMPLATE_APPLIED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: {
      templateId,
      professionTemplateKey: input.professionTemplateKey ?? null,
      linesCreated: created.length,
    },
  });

  return {
    planId: plan.id,
    lines: created,
  };
}
