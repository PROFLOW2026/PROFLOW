import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, percentOfMoney, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  computeCurrentContractValue,
  findContractById,
  findProjectById,
  listContractValueEvents,
} from '@/modules/projects';
import { BILLING_PLAN_AUDIT_ACTIONS, type BillingPlanLineKind } from '../domain/types';
import { findProfessionStarterTemplate } from '../domain/templates';
import { assertCanTransitionPlanStatus, canActivatePlan } from '../domain/lifecycle';
import {
  findActivePlanForProjectContract,
  findPlanById,
  findProjectCurrency,
  insertPlan,
  updatePlan,
} from '../data/plans.repository';
import { insertLine, insertSection, listLinesForPlan } from '../data/lines.repository';
import { findTemplateById } from '../data/templates.repository';
import { createPlanSchema, type CreatePlanInput } from '../validation/schemas';

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

async function resolveContractValue(
  context: OrgContext,
  contractId: string,
  currency: string,
): Promise<string> {
  const events = await listContractValueEvents(
    context.db,
    context.organizationId,
    contractId,
  );
  return toNumericString(computeCurrentContractValue(events, currency));
}

export async function createBillingPlan(context: OrgContext, raw: CreatePlanInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = createPlanSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');

  const contract = await findContractById(context.db, context.organizationId, input.contractId);
  if (!contract || contract.projectId !== input.projectId) {
    throw new NotFoundError('Contract');
  }

  const existingActive = await findActivePlanForProjectContract(
    context.db,
    context.organizationId,
    input.projectId,
    input.contractId,
  );
  if (existingActive && input.activate) {
    throw new DomainRuleError(
      'An active billing plan already exists for this project and contract',
      'billingPlan.errors.activePlanExists',
    );
  }

  const projectCurrency = await findProjectCurrency(
    context.db,
    context.organizationId,
    input.projectId,
  );
  const currency = (
    input.currency ??
    projectCurrency?.currency ??
    context.organization.baseCurrency
  ).toUpperCase();

  const activate = Boolean(input.activate) && canActivatePlan('draft') && !existingActive;
  const plan = await insertPlan(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    contractId: input.contractId,
    templateId: input.templateId ?? null,
    name: input.name,
    status: activate ? 'active' : 'draft',
    currency,
    defaultRetentionPercent:
      input.defaultRetentionPercent ?? contract.retentionPercent ?? null,
    notes: input.notes ?? null,
    createdByUserId: context.userId,
    activatedAt: activate ? new Date() : null,
  });

  const contractValue = await resolveContractValue(context, input.contractId, currency);

  if (input.templateId) {
    const template = await findTemplateById(
      context.db,
      context.organizationId,
      input.templateId,
    );
    if (template) {
      await materializeTemplateRows(context, plan.id, currency, contractValue, template.rowsJson);
      if (template.defaultRetentionPercent && !input.defaultRetentionPercent) {
        await updatePlan(context.db, context.organizationId, plan.id, {
          defaultRetentionPercent: template.defaultRetentionPercent,
        });
      }
    }
  } else if (input.professionTemplateKey) {
    const starter = findProfessionStarterTemplate(input.professionTemplateKey);
    if (starter) {
      await materializeTemplateRows(context, plan.id, currency, contractValue, starter.rows);
      if (starter.defaultRetentionPercent && !input.defaultRetentionPercent) {
        await updatePlan(context.db, context.organizationId, plan.id, {
          defaultRetentionPercent: starter.defaultRetentionPercent,
        });
      }
    }
  }

  await noteModuleUsage(context.db, context.organizationId, 'billing');

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.PLAN_CREATED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    after: {
      projectId: plan.projectId,
      contractId: plan.contractId,
      status: plan.status,
      currency: plan.currency,
    },
  });

  const created = await findPlanById(context.db, context.organizationId, plan.id);
  return created!;
}

async function materializeTemplateRows(
  context: OrgContext,
  planId: string,
  currency: string,
  contractValue: string,
  rows: readonly {
    labelKey: string;
    labelFallback?: string;
    lineKind: BillingPlanLineKind;
    agreedPercent?: string | null;
    agreedAmount?: string | null;
    sortOrder: number;
    sectionKey?: string | null;
  }[],
): Promise<void> {
  const sectionIds = new Map<string, string>();
  let sectionOrder = 0;

  for (const row of rows) {
    let sectionId: string | null = null;
    if (row.sectionKey) {
      const existing = sectionIds.get(row.sectionKey);
      if (existing) {
        sectionId = existing;
      } else {
        const section = await insertSection(context.db, {
          organizationId: context.organizationId,
          planId,
          name: row.sectionKey,
          sortOrder: sectionOrder,
        });
        sectionOrder += 1;
        sectionIds.set(row.sectionKey, section.id);
        sectionId = section.id;
      }
    }

    const base = money(contractValue, currency);
    let agreedAmount = '0';
    if (row.agreedAmount) {
      agreedAmount = toNumericString(money(row.agreedAmount, currency));
    } else if (row.agreedPercent) {
      agreedAmount = toNumericString(percentOfMoney(base, row.agreedPercent));
    }

    await insertLine(context.db, {
      organizationId: context.organizationId,
      planId,
      sectionId,
      sortOrder: row.sortOrder,
      label: row.labelFallback ?? row.labelKey,
      lineKind: row.lineKind,
      agreedAmount,
      agreedPercent: row.agreedPercent ?? null,
    });
  }
}

export async function ensureNoConflictingActivePlan(
  context: OrgContext,
  projectId: string,
  contractId: string,
  excludingPlanId?: string,
): Promise<void> {
  const active = await findActivePlanForProjectContract(
    context.db,
    context.organizationId,
    projectId,
    contractId,
  );
  if (active && active.id !== excludingPlanId) {
    throw new DomainRuleError(
      'An active billing plan already exists for this project and contract',
      'billingPlan.errors.activePlanExists',
    );
  }
}

export { assertCanTransitionPlanStatus, listLinesForPlan };
