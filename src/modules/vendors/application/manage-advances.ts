/**
 * Subcontract advance commands. Cash only — never posts AP and never
 * writes Recognized Actual.
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { assertCanAccessProject } from '@/modules/projects/application/project-access';
import { findSubcontractAgreementById } from '../data/subcontracts.repository';
import {
  createSubcontractAdvance as insertAdvance,
  getAdvanceOutstandingBalance as loadAdvanceOutstanding,
  listSubcontractAdvances as listAdvancesRows,
} from '../data/subcontract-advances.repository';
import type {
  SubcontractAdvancePosition,
  SubcontractAdvanceRecord,
} from '../domain/subcontract-advances';
import {
  createSubcontractAdvanceSchema,
  type CreateSubcontractAdvanceFormInput,
} from '../validation/schemas';

function parseOrThrow<T>(
  parsed:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

export async function listSubcontractAdvancesForAgreement(
  context: OrgContext,
  agreementId: string,
): Promise<SubcontractAdvanceRecord[]> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const agreement = await findSubcontractAgreementById(
    context.db,
    context.organizationId,
    agreementId,
  );
  if (!agreement) throw new NotFoundError('Subcontract');
  await assertCanAccessProject(context, agreement.projectId);
  return listAdvancesRows(context.db, context.organizationId, agreementId);
}

export async function getSubcontractAdvanceOutstanding(
  context: OrgContext,
  agreementId: string,
): Promise<SubcontractAdvancePosition | null> {
  assertPermission(context, PERMISSIONS.VENDORS_READ);
  const agreement = await findSubcontractAgreementById(
    context.db,
    context.organizationId,
    agreementId,
  );
  if (!agreement) throw new NotFoundError('Subcontract');
  await assertCanAccessProject(context, agreement.projectId);
  return loadAdvanceOutstanding(context.db, context.organizationId, agreementId);
}

export async function recordSubcontractAdvance(
  context: OrgContext,
  rawInput: CreateSubcontractAdvanceFormInput,
): Promise<SubcontractAdvanceRecord> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  const input = parseOrThrow(createSubcontractAdvanceSchema.safeParse(rawInput));

  const agreement = await findSubcontractAgreementById(
    context.db,
    context.organizationId,
    input.subcontractAgreementId,
  );
  if (!agreement) throw new NotFoundError('Subcontract');
  await assertCanAccessProject(context, agreement.projectId);

  if (agreement.status === 'cancelled') {
    throw new DomainRuleError(
      'Cannot record an advance on a cancelled subcontract',
      'vendors.subcontracts.advances.errors.cancelled',
    );
  }

  const amount = money(input.amount, agreement.currency);
  const paidDate = input.paidDate ?? todayInTimeZone(context.organization.timezone);
  const created = await insertAdvance(context.db, context.organizationId, {
    subcontractAgreementId: agreement.id,
    projectId: agreement.projectId,
    currency: agreement.currency,
    amount: toNumericString(amount),
    paidDate,
    status: input.status ?? 'paid',
    notes: input.notes ?? null,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SUBCONTRACT_ADVANCE_RECORDED,
    entityType: 'subcontract_agreement',
    entityId: agreement.id,
    after: {
      advanceId: created.id,
      amount: created.amount,
      paidDate: created.paidDate,
      status: created.status,
    },
  });

  return created;
}
