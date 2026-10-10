import { and, eq, inArray } from 'drizzle-orm';
import {
  organizationCatalogEntries,
  subcontractAgreementFinancialTerms,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import { parsePaymentTermMetadata } from '@/modules/business-catalog/domain/types';
import type { DbExecutor } from '@/shared/db/types';

function netDaysFromCatalogMetadata(metadata: Record<string, unknown> | null | undefined): number | null {
  const parsed = parsePaymentTermMetadata(metadata);
  if (!parsed) return null;
  if (parsed.strategy === 'immediate') return 0;
  if (parsed.strategy === 'net_days') {
    return typeof parsed.netDays === 'number' && parsed.netDays >= 0 ? parsed.netDays : null;
  }
  return null;
}

async function loadCatalogNetDaysById(
  db: DbExecutor,
  organizationId: string,
  termIds: readonly string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (termIds.length === 0) return map;
  const rows = await db
    .select({
      id: organizationCatalogEntries.id,
      metadata: organizationCatalogEntries.metadata,
    })
    .from(organizationCatalogEntries)
    .where(
      and(
        eq(organizationCatalogEntries.organizationId, organizationId),
        eq(organizationCatalogEntries.kind, 'payment_term'),
        inArray(organizationCatalogEntries.id, [...termIds]),
      ),
    );
  for (const row of rows) {
    map.set(row.id, netDaysFromCatalogMetadata(row.metadata));
  }
  return map;
}

/** Net payment days from agreement terms when resolvable; null when unknown (never invent). */
export async function loadAgreementPaymentTermsDays(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<number | null> {
  const map = await loadAgreementPaymentTermsDaysByAgreement(db, organizationId, [agreementId]);
  return map.get(agreementId) ?? null;
}

export async function loadAgreementPaymentTermsDaysByAgreement(
  db: DbExecutor,
  organizationId: string,
  agreementIds: readonly string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  for (const id of agreementIds) map.set(id, null);
  if (agreementIds.length === 0) return map;

  const agreements = await db
    .select({
      id: subcontractAgreements.id,
      paymentTermId: subcontractAgreements.paymentTermId,
      vendorId: subcontractAgreements.vendorId,
    })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, organizationId),
        inArray(subcontractAgreements.id, [...agreementIds]),
      ),
    );

  const financialRows = await db
    .select({
      agreementId: subcontractAgreementFinancialTerms.agreementId,
      paymentTermsDays: subcontractAgreementFinancialTerms.paymentTermsDays,
    })
    .from(subcontractAgreementFinancialTerms)
    .where(
      and(
        eq(subcontractAgreementFinancialTerms.organizationId, organizationId),
        inArray(subcontractAgreementFinancialTerms.agreementId, [...agreementIds]),
      ),
    );
  const financialByAgreement = new Map(financialRows.map((row) => [row.agreementId, row.paymentTermsDays]));

  const vendorIds = [...new Set(agreements.map((row) => row.vendorId))];
  const vendorRows =
    vendorIds.length === 0
      ? []
      : await db
          .select({ id: vendors.id, defaultPaymentTermId: vendors.defaultPaymentTermId })
          .from(vendors)
          .where(and(eq(vendors.organizationId, organizationId), inArray(vendors.id, vendorIds)));
  const vendorTermById = new Map(vendorRows.map((row) => [row.id, row.defaultPaymentTermId]));

  const catalogIds = [
    ...new Set(
      [
        ...agreements.map((row) => row.paymentTermId),
        ...vendorRows.map((row) => row.defaultPaymentTermId),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const catalogNetDays = await loadCatalogNetDaysById(db, organizationId, catalogIds);

  for (const agreement of agreements) {
    const explicitDays = financialByAgreement.get(agreement.id);
    if (typeof explicitDays === 'number' && explicitDays >= 0) {
      map.set(agreement.id, explicitDays);
      continue;
    }
    const agreementTermId = agreement.paymentTermId;
    if (agreementTermId) {
      const fromAgreement = catalogNetDays.get(agreementTermId);
      if (fromAgreement != null) {
        map.set(agreement.id, fromAgreement);
        continue;
      }
    }
    const vendorTermId = vendorTermById.get(agreement.vendorId);
    if (vendorTermId) {
      const fromVendor = catalogNetDays.get(vendorTermId);
      if (fromVendor != null) {
        map.set(agreement.id, fromVendor);
      }
    }
  }

  return map;
}
