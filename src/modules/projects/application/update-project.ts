import { and, eq } from 'drizzle-orm';
import { recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money } from '@/shared/money';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { projectDomains } from '@drizzle/schema';
import type { ProjectRecord } from '../domain/types';
import {
  findPrimaryContractByProject,
  listContractValueEvents,
} from '../data/contracts.repository';
import { findProjectById, updateProjectById } from '../data/projects.repository';
import { resolveDisplayOriginalEntered } from '../domain/entry-baseline';
import { isOriginalContractAmountLocked } from '../domain/contract-value';
import { updateProjectSchema, type UpdateProjectInput } from '../validation/schemas';
import { ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY, openingReductionInputsDiffer, upsertPrimaryContractAmount } from './contract-amount';
import { resolvePrimaryContactIdForProject } from './assert-project-contact';
import { assertClassicProjectUsesCloseout } from '@/modules/closeout/domain/close-rules';

function amountsDiffer(
  left: string | null | undefined,
  right: string,
  currency: string,
): boolean {
  if (!left) return true;
  try {
    return money(left, currency).amount !== money(right, currency).amount;
  } catch {
    return true;
  }
}

export async function updateProject(
  context: OrgContext,
  rawInput: UpdateProjectInput,
): Promise<ProjectRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = updateProjectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!existing) throw new NotFoundError('Project');
  assertSameOrganization(context, existing, 'Project');
  assertClassicProjectUsesCloseout({
    workKind: existing.workKind,
    existingStatus: existing.status,
    nextStatus: input.status,
  });

  const nextClientId = input.clientId !== undefined ? input.clientId : existing.clientId;

  let nextPrimaryContactId: string | null | undefined = undefined;
  if (input.primaryContactId !== undefined) {
    nextPrimaryContactId = await resolvePrimaryContactIdForProject(
      context,
      nextClientId,
      input.primaryContactId,
    );
  } else if (input.clientId !== undefined && input.clientId !== existing.clientId) {
    // Client changed without a new contact - clear project contact to satisfy FK/trigger.
    nextPrimaryContactId = null;
  }

  const updated = await updateProjectById(context.db, context.organizationId, input.projectId, {
    name: input.name,
    clientId: input.clientId,
    ...(nextPrimaryContactId !== undefined ? { primaryContactId: nextPrimaryContactId } : {}),
    location: input.location,
    description: input.description,
    status: input.status,
    projectRole: input.projectRole,
    deliveryMode: input.deliveryMode,
    startDate: input.startDate,
    targetEndDate: input.targetEndDate,
    actualEndDate: input.actualEndDate,
    progressPercent: input.progressPercent,
    progressStatus: input.progressStatus,
    notes: input.notes,
    ...(input.experienceProfile !== undefined
      ? { experienceProfile: input.experienceProfile }
      : {}),
  });

  if (!updated) throw new NotFoundError('Project');

  if (input.domainName !== undefined) {
    await context.db
      .delete(projectDomains)
      .where(
        and(
          eq(projectDomains.organizationId, context.organizationId),
          eq(projectDomains.projectId, input.projectId),
        ),
      );

    if (input.domainName) {
      await context.db.insert(projectDomains).values({
        organizationId: context.organizationId,
        projectId: input.projectId,
        adHocName: input.domainName,
      });
    }
  }

  if (input.contractValueAmount) {
    const currency = (
      input.contractValueCurrency ??
      existing.currency ??
      context.organization.baseCurrency
    ).toUpperCase();
    const includesTax = input.amountIncludesTax ?? false;
    const existingContract = await findPrimaryContractByProject(
      context.db,
      context.organizationId,
      input.projectId,
    );

    if (existingContract) {
      const events = await listContractValueEvents(
        context.db,
        context.organizationId,
        existingContract.id,
      );
      const locked = isOriginalContractAmountLocked(events);
      const displayEntered =
        resolveDisplayOriginalEntered(existingContract) ??
        existingContract.enteredValueAmount ??
        existingContract.originalValueAmount;
      const amountChanged = amountsDiffer(displayEntered, input.contractValueAmount, currency);
      const modeChanged = existingContract.amountIncludesTax !== includesTax;
      const reductionChanged = openingReductionInputsDiffer(
        existingContract.openingReductionEnteredAmount,
        input.openingReductionAmount,
        currency,
      );

      if (locked && (amountChanged || modeChanged || reductionChanged)) {
        throw new DomainRuleError(
          'Original contract amount cannot be changed after an approved contract-value change',
          ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY,
          { projectId: input.projectId, contractId: existingContract.id },
        );
      }

      if (!locked && (amountChanged || modeChanged || reductionChanged)) {
        await upsertPrimaryContractAmount(context, {
          projectId: input.projectId,
          enteredAmount: input.contractValueAmount,
          currency,
          amountIncludesTax: includesTax,
          openingReductionAmount: input.openingReductionAmount,
        });
      }
    } else {
      await upsertPrimaryContractAmount(context, {
        projectId: input.projectId,
        enteredAmount: input.contractValueAmount,
        currency,
        amountIncludesTax: includesTax,
        openingReductionAmount: input.openingReductionAmount,
      });
    }
  }

  await recordAuditEvent(context, {
    action: 'project.updated',
    entityType: 'project',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
