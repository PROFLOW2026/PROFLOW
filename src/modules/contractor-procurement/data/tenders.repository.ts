import { and, eq } from 'drizzle-orm';
import {
  contractorTenderInvitations,
  contractorTenderOfferFinancials,
  contractorTenderOffers,
  contractorTenderPackages,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { TenderInvitationRow, TenderOfferRow, TenderPackageRow } from '../domain/types';

function mapPackage(row: typeof contractorTenderPackages.$inferSelect): TenderPackageRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    tradeKey: row.tradeKey,
    title: row.title,
    scopeDescription: row.scopeDescription,
    status: row.status as TenderPackageRow['status'],
    awardedVendorId: row.awardedVendorId,
    awardedAgreementId: row.awardedAgreementId,
  };
}

export async function insertTenderPackage(
  db: DbExecutor,
  values: typeof contractorTenderPackages.$inferInsert,
): Promise<string> {
  const [row] = await db.insert(contractorTenderPackages).values(values).returning({ id: contractorTenderPackages.id });
  return row!.id;
}

export async function findTenderPackage(
  db: DbExecutor,
  organizationId: string,
  packageId: string,
): Promise<TenderPackageRow | null> {
  const [row] = await db
    .select()
    .from(contractorTenderPackages)
    .where(and(eq(contractorTenderPackages.organizationId, organizationId), eq(contractorTenderPackages.id, packageId)))
    .limit(1);
  return row ? mapPackage(row) : null;
}

export async function listTenderPackages(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<readonly TenderPackageRow[]> {
  const rows = await db
    .select()
    .from(contractorTenderPackages)
    .where(
      and(
        eq(contractorTenderPackages.organizationId, organizationId),
        eq(contractorTenderPackages.projectId, projectId),
      ),
    )
    .orderBy(contractorTenderPackages.createdAt);
  return rows.map(mapPackage);
}

export async function updateTenderPackage(
  db: DbExecutor,
  organizationId: string,
  packageId: string,
  patch: Partial<typeof contractorTenderPackages.$inferInsert>,
): Promise<void> {
  await db
    .update(contractorTenderPackages)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contractorTenderPackages.organizationId, organizationId), eq(contractorTenderPackages.id, packageId)));
}

export async function insertInvitation(
  db: DbExecutor,
  values: typeof contractorTenderInvitations.$inferInsert,
): Promise<string> {
  const [row] = await db
    .insert(contractorTenderInvitations)
    .values(values)
    .returning({ id: contractorTenderInvitations.id });
  return row!.id;
}

export async function listInvitationsForPackage(
  db: DbExecutor,
  organizationId: string,
  packageId: string,
): Promise<readonly TenderInvitationRow[]> {
  return db
    .select({
      id: contractorTenderInvitations.id,
      organizationId: contractorTenderInvitations.organizationId,
      projectId: contractorTenderInvitations.projectId,
      packageId: contractorTenderInvitations.packageId,
      vendorId: contractorTenderInvitations.vendorId,
      status: contractorTenderInvitations.status,
    })
    .from(contractorTenderInvitations)
    .where(
      and(
        eq(contractorTenderInvitations.organizationId, organizationId),
        eq(contractorTenderInvitations.packageId, packageId),
      ),
    );
}

export async function findInvitationForVendor(
  db: DbExecutor,
  organizationId: string,
  packageId: string,
  vendorId: string,
): Promise<TenderInvitationRow | null> {
  const [row] = await db
    .select({
      id: contractorTenderInvitations.id,
      organizationId: contractorTenderInvitations.organizationId,
      projectId: contractorTenderInvitations.projectId,
      packageId: contractorTenderInvitations.packageId,
      vendorId: contractorTenderInvitations.vendorId,
      status: contractorTenderInvitations.status,
    })
    .from(contractorTenderInvitations)
    .where(
      and(
        eq(contractorTenderInvitations.organizationId, organizationId),
        eq(contractorTenderInvitations.packageId, packageId),
        eq(contractorTenderInvitations.vendorId, vendorId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertOffer(
  db: DbExecutor,
  values: typeof contractorTenderOffers.$inferInsert,
): Promise<string> {
  const [row] = await db.insert(contractorTenderOffers).values(values).returning({ id: contractorTenderOffers.id });
  return row!.id;
}

export async function findOffer(
  db: DbExecutor,
  organizationId: string,
  offerId: string,
): Promise<TenderOfferRow | null> {
  const [row] = await db
    .select()
    .from(contractorTenderOffers)
    .where(and(eq(contractorTenderOffers.organizationId, organizationId), eq(contractorTenderOffers.id, offerId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    packageId: row.packageId,
    vendorId: row.vendorId,
    invitationId: row.invitationId,
    status: row.status as TenderOfferRow['status'],
    notes: row.notes,
  };
}

export async function listOffersForPackage(
  db: DbExecutor,
  organizationId: string,
  packageId: string,
): Promise<readonly TenderOfferRow[]> {
  const rows = await db
    .select()
    .from(contractorTenderOffers)
    .where(
      and(eq(contractorTenderOffers.organizationId, organizationId), eq(contractorTenderOffers.packageId, packageId)),
    );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    packageId: row.packageId,
    vendorId: row.vendorId,
    invitationId: row.invitationId,
    status: row.status as TenderOfferRow['status'],
    notes: row.notes,
  }));
}

export async function updateOffer(
  db: DbExecutor,
  organizationId: string,
  offerId: string,
  patch: Partial<typeof contractorTenderOffers.$inferInsert>,
): Promise<void> {
  await db
    .update(contractorTenderOffers)
    .set(patch)
    .where(and(eq(contractorTenderOffers.organizationId, organizationId), eq(contractorTenderOffers.id, offerId)));
}

export async function upsertOfferFinancials(
  db: DbExecutor,
  values: typeof contractorTenderOfferFinancials.$inferInsert,
): Promise<void> {
  await db.insert(contractorTenderOfferFinancials).values(values);
}

export async function listOfferFinancialsForPackage(
  db: DbExecutor,
  organizationId: string,
  packageId: string,
): Promise<
  readonly { readonly offerId: string; readonly bidAmount: string; readonly currency: string; readonly vendorId: string }[]
> {
  const rows = await db
    .select({
      offerId: contractorTenderOfferFinancials.offerId,
      bidAmount: contractorTenderOfferFinancials.bidAmount,
      currency: contractorTenderOfferFinancials.currency,
      vendorId: contractorTenderOffers.vendorId,
    })
    .from(contractorTenderOfferFinancials)
    .innerJoin(contractorTenderOffers, eq(contractorTenderOffers.id, contractorTenderOfferFinancials.offerId))
    .where(
      and(
        eq(contractorTenderOfferFinancials.organizationId, organizationId),
        eq(contractorTenderOffers.packageId, packageId),
      ),
    );
  return rows.map((row) => ({
    offerId: row.offerId,
    bidAmount: String(row.bidAmount),
    currency: row.currency,
    vendorId: row.vendorId,
  }));
}
