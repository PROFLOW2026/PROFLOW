import 'server-only';

import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { organizations, procurementRfqLines, procurementRfqs, vendors } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withUserContext } from '@/shared/db/client';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findActiveOrgOwnerUserId } from '@/modules/recurring-drafts/application/ops-worker';
import { resolveOrgContext } from '@/modules/tenancy';
import {
  assertVendorInOrganization,
  findProcurementRfqById,
} from '../data/procurement.repository';
import {
  findSupplierRfqAccessTokenByHash,
  insertSupplierRfqAccessToken,
  markSupplierRfqAccessTokenUsed,
} from '../data/supplier-rfq-access.repository';
import {
  areSupplierRfqAccessTokensTablesAvailable,
  refreshSupplierRfqAccessTokensTableAvailability,
} from '../data/supplier-rfq-access-persistence';
import {
  assessSupplierRfqAccessTokenValidity,
  hashSupplierRfqAccessToken,
  SUPPLIER_RFQ_ACCESS_TOKEN_TTL_MS,
} from '../domain/supplier-rfq-access-token';
import { createSupplierQuote } from './quotes';
import type { CreateSupplierQuoteInput } from '../validation/schemas';
import { createSupplierQuoteSchema } from '../validation/schemas';

export class SupplierRfqAccessLinkError extends DomainRuleError {
  constructor(
    message: string,
    readonly publicReason: 'invalid' | 'expired' | 'used' | 'unavailable' | 'rfqNotOpen',
  ) {
    super(message, `procurement.supplierRfqLink.errors.${publicReason}`);
    this.publicReason = publicReason;
  }
}

async function assertSupplierRfqAccessTokensReady(): Promise<void> {
  await refreshSupplierRfqAccessTokensTableAvailability();
  if (!areSupplierRfqAccessTokensTablesAvailable()) {
    throw new SupplierRfqAccessLinkError(
      'Supplier RFQ links are not available',
      'unavailable',
    );
  }
}

function generateRawToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface CreateSupplierRfqAccessLinkResult {
  readonly tokenId: string;
  readonly rawToken: string;
  readonly expiresAt: Date;
  readonly vendorId: string;
  readonly rfqId: string;
}

export async function createSupplierRfqAccessLink(
  context: OrgContext,
  input: { readonly rfqId: string; readonly vendorId: string },
): Promise<CreateSupplierRfqAccessLinkResult> {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);
  await assertSupplierRfqAccessTokensReady();

  const rfq = await findProcurementRfqById(context.db, context.organizationId, input.rfqId);
  if (!rfq || rfq.archivedAt) throw new NotFoundError('RFQ');
  if (rfq.status !== 'sent') {
    throw new DomainRuleError(
      'RFQ must be sent before inviting a supplier quote link',
      'procurement.supplierRfqLink.errors.rfqNotSent',
    );
  }

  const vendorOk = await assertVendorInOrganization(
    context.db,
    context.organizationId,
    input.vendorId,
  );
  if (!vendorOk) throw new NotFoundError('Vendor');

  const rawToken = generateRawToken();
  const tokenHash = hashSupplierRfqAccessToken(rawToken);
  const expiresAt = new Date(Date.now() + SUPPLIER_RFQ_ACCESS_TOKEN_TTL_MS);
  const tokenId = randomUUID();

  await insertSupplierRfqAccessToken(context, {
    id: tokenId,
    rfqId: input.rfqId,
    vendorId: input.vendorId,
    tokenHash,
    expiresAt,
  });

  return {
    tokenId,
    rawToken,
    expiresAt,
    vendorId: input.vendorId,
    rfqId: input.rfqId,
  };
}

export type SupplierRfqPublicView = {
  readonly organizationName: string;
  readonly rfqTitle: string;
  readonly rfqNotes: string | null;
  readonly rfqDueDate: string | null;
  readonly vendorName: string;
  readonly vendorId: string;
  readonly rfqId: string;
  readonly organizationId: string;
  readonly defaultCurrency: string;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unit: string | null;
  }[];
};

export async function resolveSupplierRfqPublicView(
  rawToken: string,
): Promise<SupplierRfqPublicView> {
  await assertSupplierRfqAccessTokensReady();
  const tokenHash = hashSupplierRfqAccessToken(rawToken);
  const row = await findSupplierRfqAccessTokenByHash(tokenHash);
  if (!row) {
    throw new SupplierRfqAccessLinkError('Invalid supplier RFQ link', 'invalid');
  }

  const validity = assessSupplierRfqAccessTokenValidity(row);
  if (validity.kind === 'used') {
    throw new SupplierRfqAccessLinkError('Supplier RFQ link already used', 'used');
  }
  if (validity.kind === 'expired') {
    throw new SupplierRfqAccessLinkError('Supplier RFQ link expired', 'expired');
  }

  const db = getAdminDb();
  const [rfq] = await db
    .select()
    .from(procurementRfqs)
    .where(
      and(
        eq(procurementRfqs.id, row.rfqId),
        eq(procurementRfqs.organizationId, row.organizationId),
        isNull(procurementRfqs.archivedAt),
      ),
    )
    .limit(1);
  if (!rfq || rfq.status !== 'sent') {
    throw new SupplierRfqAccessLinkError('RFQ is not open for supplier quotes', 'rfqNotOpen');
  }

  const [org] = await db
    .select({ name: organizations.name, baseCurrency: organizations.baseCurrency })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
    .limit(1);
  if (!org) {
    throw new SupplierRfqAccessLinkError('Invalid supplier RFQ link', 'invalid');
  }

  const [vendor] = await db
    .select({ name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.id, row.vendorId), eq(vendors.organizationId, row.organizationId)))
    .limit(1);
  if (!vendor) {
    throw new SupplierRfqAccessLinkError('Invalid supplier RFQ link', 'invalid');
  }

  const lines = await db
    .select({
      description: procurementRfqLines.description,
      quantity: procurementRfqLines.quantity,
      unit: procurementRfqLines.unit,
    })
    .from(procurementRfqLines)
    .where(
      and(
        eq(procurementRfqLines.rfqId, row.rfqId),
        eq(procurementRfqLines.organizationId, row.organizationId),
      ),
    )
    .orderBy(asc(procurementRfqLines.sortOrder));

  return {
    organizationName: org.name,
    rfqTitle: rfq.title,
    rfqNotes: rfq.notes,
    rfqDueDate: rfq.dueDate,
    vendorName: vendor.name,
    vendorId: row.vendorId,
    rfqId: row.rfqId,
    organizationId: row.organizationId,
    defaultCurrency: org.baseCurrency,
    lines,
  };
}

export async function submitSupplierQuoteViaAccessToken(
  rawToken: string,
  rawQuote: Omit<CreateSupplierQuoteInput, 'vendorId' | 'rfqId'>,
): Promise<{ readonly quoteId: string }> {
  await assertSupplierRfqAccessTokensReady();
  const tokenHash = hashSupplierRfqAccessToken(rawToken);
  const row = await findSupplierRfqAccessTokenByHash(tokenHash);
  if (!row) {
    throw new SupplierRfqAccessLinkError('Invalid supplier RFQ link', 'invalid');
  }

  const validity = assessSupplierRfqAccessTokenValidity(row);
  if (validity.kind === 'used') {
    throw new SupplierRfqAccessLinkError('Supplier RFQ link already used', 'used');
  }
  if (validity.kind === 'expired') {
    throw new SupplierRfqAccessLinkError('Supplier RFQ link expired', 'expired');
  }

  const parsed = createSupplierQuoteSchema.safeParse({
    ...rawQuote,
    vendorId: row.vendorId,
    rfqId: row.rfqId,
  });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const adminDb = getAdminDb();
  const owner = await findActiveOrgOwnerUserId(adminDb, row.organizationId);
  if (!owner) {
    throw new SupplierRfqAccessLinkError('Supplier RFQ links are not available', 'unavailable');
  }

  const [orgRow] = await adminDb
    .select({ defaultLocale: organizations.defaultLocale })
    .from(organizations)
    .where(eq(organizations.id, row.organizationId))
    .limit(1);
  const locale = orgRow?.defaultLocale || 'he-IL';

  return withUserContext(
    owner.userId,
    async (tx) => {
      const rfq = await findProcurementRfqById(tx, row.organizationId, row.rfqId);
      if (!rfq || rfq.archivedAt || rfq.status !== 'sent') {
        throw new SupplierRfqAccessLinkError('RFQ is not open for supplier quotes', 'rfqNotOpen');
      }

      const marked = await markSupplierRfqAccessTokenUsed(tx, tokenHash);
      if (!marked) {
        throw new SupplierRfqAccessLinkError('Supplier RFQ link already used', 'used');
      }

      const context = await resolveOrgContext(tx, {
        userId: owner.userId,
        organizationId: row.organizationId,
        locale,
      });

      const quote = await createSupplierQuote(context, parsed.data);
      return { quoteId: quote.id };
    },
    adminDb,
  );
}
