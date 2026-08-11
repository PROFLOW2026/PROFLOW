import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import {
  businessDate,
  compareBusinessDates,
  todayInTimeZone,
  type BusinessDate,
} from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findApBillById, isRecognizedVendorBillStatus } from '@/modules/ap';
import { getBillingRecord } from '@/modules/billing';
import {
  insertRetentionRelease,
  listRetentionReleasesForSource,
  type RetentionReleaseRow,
} from '../data/retention.repository';
import { assertRetentionRelease, retentionErrorKey, type RetentionSide } from '../domain/retention';
import { releaseRetentionSchema, type ReleaseRetentionInput } from '../validation/schemas';

function assertReleaseNotFuture(
  context: OrgContext,
  releasedOn: BusinessDate,
  side: RetentionSide,
): void {
  const orgToday = todayInTimeZone(context.organization.timezone);
  if (compareBusinessDates(releasedOn, orgToday) > 0) {
    throw new DomainRuleError(
      'Release date cannot be in the future',
      retentionErrorKey(side, 'retentionReleaseDateFuture'),
    );
  }
}

export async function listVendorBillRetentionReleases(
  context: OrgContext,
  billId: string,
): Promise<readonly RetentionReleaseRow[]> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
  return listRetentionReleasesForSource(context.db, context.organizationId, 'vendor_bill', billId);
}

export async function listBillingRetentionReleases(
  context: OrgContext,
  billingRecordId: string,
): Promise<readonly RetentionReleaseRow[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  await getBillingRecord(context, billingRecordId);
  return listRetentionReleasesForSource(
    context.db,
    context.organizationId,
    'billing_record',
    billingRecordId,
  );
}

export async function releaseVendorBillRetention(
  context: OrgContext,
  raw: ReleaseRetentionInput,
): Promise<RetentionReleaseRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = releaseRetentionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const bill = await findApBillById(context.db, context.organizationId, input.sourceId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');

  const amount = money(input.amount, bill.currency);
  assertRetentionRelease({
    side: 'ap',
    sourcePosted: isRecognizedVendorBillStatus(bill.status),
    heldRemaining: money(bill.retentionHeldRemaining, bill.currency),
    amount,
  });

  const releasedOn = businessDate(input.releasedOn);
  assertReleaseNotFuture(context, releasedOn, 'ap');
  const row = await insertRetentionRelease(context.db, {
    organizationId: context.organizationId,
    side: 'ap',
    sourceType: 'vendor_bill',
    sourceId: bill.id,
    amount: toNumericString(amount),
    currency: bill.currency,
    releasedOn,
    notes: input.notes?.trim() || null,
    createdByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RETENTION_RELEASED,
    entityType: 'retention_release',
    entityId: row.id,
    after: {
      side: 'ap',
      sourceType: 'vendor_bill',
      sourceId: bill.id,
      amount: row.amount,
      currency: row.currency,
      affectsActual: false,
    },
  });

  return row;
}

export async function releaseBillingRecordRetention(
  context: OrgContext,
  raw: ReleaseRetentionInput,
): Promise<RetentionReleaseRow> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = releaseRetentionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const record = await getBillingRecord(context, input.sourceId);
  if (record.kind === 'credit_note') {
    throw new DomainRuleError(
      'Retention cannot be released on a credit note',
      'billing.errors.retentionNotReleasable',
    );
  }

  const currency = record.totalAmount.currency;
  const held = record.retentionHeldRemaining ?? money('0', currency);
  const amount = money(input.amount, currency);
  assertRetentionRelease({
    side: 'ar',
    sourcePosted: record.status === 'finalized',
    heldRemaining: held,
    amount,
  });

  const releasedOn = businessDate(input.releasedOn);
  assertReleaseNotFuture(context, releasedOn, 'ar');
  const row = await insertRetentionRelease(context.db, {
    organizationId: context.organizationId,
    side: 'ar',
    sourceType: 'billing_record',
    sourceId: record.id,
    amount: toNumericString(amount),
    currency,
    releasedOn,
    notes: input.notes?.trim() || null,
    createdByUserId: context.userId,
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RETENTION_RELEASED,
    entityType: 'retention_release',
    entityId: row.id,
    after: {
      side: 'ar',
      sourceType: 'billing_record',
      sourceId: record.id,
      amount: row.amount,
      currency: row.currency,
      kind: record.kind,
      affectsInvoiced: false,
    },
  });

  return row;
}
