import type { BillingRecordDetail, CustomerSnapshot } from '@/modules/billing/domain/types';
import { DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { compareMoney, sumMoney } from '@/shared/money';
import {
  buildStatutoryExternalReference,
  buildStatutoryIdempotencyKey,
} from '../domain/idempotency-key';
import type {
  BillingRecordBridgeRef,
  ExternalDocumentKind,
  StatutoryLineItem,
  StatutoryPartySnapshot,
} from '../domain/types';

function mapCustomerSnapshot(snapshot: CustomerSnapshot): StatutoryPartySnapshot {
  return {
    name: snapshot.name,
    companyNumber: snapshot.companyNumber,
    externalIdentifier: snapshot.externalIdentifier,
    email: snapshot.email,
    phone: snapshot.phone,
    address: snapshot.address,
    city: snapshot.city,
    postalCode: snapshot.postalCode,
    noVat: snapshot.noVat,
  };
}

function resolveVatMode(
  billing: BillingRecordDetail,
): BillingRecordBridgeRef['vatMode'] {
  const fromTax = billing.taxSnapshot?.vatMode;
  if (fromTax === 'inclusive' || fromTax === 'exclusive' || fromTax === 'zero') {
    return fromTax;
  }
  const fromRow = billing.vatMode;
  if (fromRow === 'inclusive' || fromRow === 'exclusive' || fromRow === 'zero') {
    return fromRow;
  }
  return 'exclusive';
}

function mapStoredLinesToStatutory(billing: BillingRecordDetail): StatutoryLineItem[] {
  if (billing.lines.length === 0) {
    return [
      {
        description: billing.reference?.trim() || billing.notes?.trim() || 'Billing amount',
        lineNet: billing.subtotalAmount,
        quantity: null,
        unitPrice: null,
      },
    ];
  }

  return billing.lines.map((line) => ({
    description: line.description,
    lineNet: line.lineTotal,
    quantity: null,
    unitPrice: null,
  }));
}

/**
 * Read-time guard: legacy drafts stored gross line totals (line_total == invoice total).
 * Normalizes a single gross line to net; multi-line gross CO rows require manual fix.
 */
export function mapBillingLinesForStatutoryBridge(
  billing: BillingRecordDetail,
): StatutoryLineItem[] {
  const lines = mapStoredLinesToStatutory(billing);
  if (lines.length === 0) return lines;

  const currency = billing.subtotalAmount.currency;
  const lineSum = sumMoney(
    lines.map((line) => line.lineNet),
    currency,
  );
  const headerTotal = billing.totalAmount;
  const headerSubtotal = billing.subtotalAmount;

  const headerIsGross = compareMoney(headerTotal, headerSubtotal) !== 0;
  if (!headerIsGross) {
    return lines;
  }

  const sumMatchesHeaderGross = compareMoney(lineSum, headerTotal) === 0;
  const multiLineEachFullGross =
    lines.length > 1 &&
    lines.every((line) => compareMoney(line.lineNet, headerTotal) === 0);

  if (multiLineEachFullGross) {
    throw new DomainRuleError(
      'Legacy billing lines use gross totals and cannot be sent to SUMIT without review',
      'invoicingIntegration.errors.legacyLinesNeedReview',
      { billingRecordId: billing.id },
    );
  }

  if (sumMatchesHeaderGross && lines.length === 1) {
    return [
      {
        ...lines[0]!,
        lineNet: headerSubtotal,
      },
    ];
  }

  return lines;
}

export function assertBillingHasCustomerSnapshot(billing: BillingRecordDetail): CustomerSnapshot {
  if (!billing.customerSnapshot?.name?.trim()) {
    throw new DomainRuleError(
      'Finalized billing record is missing a customer snapshot required for external statutory issuance',
      'invoicingIntegration.errors.missingCustomerSnapshot',
      { billingRecordId: billing.id },
    );
  }
  return billing.customerSnapshot;
}

export function buildStatutoryBridgeFromBillingRecord(
  context: Pick<OrgContext, 'organizationId'>,
  billing: BillingRecordDetail,
  kind: ExternalDocumentKind = 'tax_invoice',
  paymentId?: string | null,
): { bridge: BillingRecordBridgeRef; idempotencyKey: string } {
  const customerSnapshot = assertBillingHasCustomerSnapshot(billing);
  const vatMode = resolveVatMode(billing);
  const idempotencyKey = buildStatutoryIdempotencyKey(billing.id, kind, paymentId);

  return {
    idempotencyKey,
    bridge: {
      billingRecordId: billing.id,
      organizationId: context.organizationId,
      projectId: billing.projectId,
      clientId: billing.clientId,
      kind: billing.kind,
      status: billing.status,
      reference: billing.reference,
      subtotalAmount: billing.subtotalAmount,
      taxAmount: billing.taxAmount,
      totalAmount: billing.totalAmount,
      vatMode,
      vatRatePercent: billing.taxSnapshot?.vatRatePercent ?? null,
      lines: mapBillingLinesForStatutoryBridge(billing),
      issuer: null,
      customer: mapCustomerSnapshot(customerSnapshot),
      issueDate: billing.issueDate,
      dueDate: billing.dueDate,
      notes: billing.notes,
      externalReference: buildStatutoryExternalReference(billing.id, kind, paymentId),
    },
  };
}
