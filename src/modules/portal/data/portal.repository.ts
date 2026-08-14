import { and, asc, desc, eq, inArray, isNull, isNotNull, sql } from 'drizzle-orm';
import {
  billingRecords,
  clients,
  documentLinks,
  documents,
  externalAccessGrants,
  externalPrincipals,
  payments,
  procurementRfqLines,
  procurementRfqs,
  projectMilestones,
  projects,
  purchaseOrderLines,
  purchaseOrders,
  supplierQuoteLines,
  supplierQuotes,
  vendors,
} from '@drizzle/schema';
import { estimates as estimateQuotes } from '@drizzle/schema/next-gen';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ExternalAccessGrantListItem,
  ExternalAccessGrantRecord,
  ExternalPrincipalRecord,
  GrantStatus,
  PortalKind,
} from '../domain/types';
import { assertGrantBelongsToOrganization } from '../domain/tenant-isolation';

/**
 * Principals are global identities; RLS only allows service_role mutations and
 * narrow member SELECT (active grants). Portal manage uses the admin connection
 * for principal upsert + grant joins, always filtered by organizationId.
 */

function mapPrincipal(row: typeof externalPrincipals.$inferSelect): ExternalPrincipalRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    authUserId: row.authUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapGrant(row: typeof externalAccessGrants.$inferSelect): ExternalAccessGrantRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    principalId: row.principalId,
    portalKind: row.portalKind as PortalKind,
    clientId: row.clientId,
    projectId: row.projectId,
    vendorId: row.vendorId,
    scopes: Array.isArray(row.scopes) ? row.scopes : [],
    status: row.status as GrantStatus,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findOrCreateExternalPrincipal(input: {
  email: string;
  displayName?: string | null;
}): Promise<ExternalPrincipalRecord> {
  const db = getAdminDb();
  const normalized = input.email.trim().toLowerCase();

  const [existing] = await db
    .select()
    .from(externalPrincipals)
    .where(sql`lower(${externalPrincipals.email}) = ${normalized}`)
    .limit(1);

  if (existing) {
    if (input.displayName && input.displayName !== existing.displayName) {
      const [updated] = await db
        .update(externalPrincipals)
        .set({ displayName: input.displayName, updatedAt: new Date() })
        .where(eq(externalPrincipals.id, existing.id))
        .returning();
      return mapPrincipal(updated!);
    }
    return mapPrincipal(existing);
  }

  const [row] = await db
    .insert(externalPrincipals)
    .values({
      email: normalized,
      displayName: input.displayName ?? null,
    })
    .returning();

  return mapPrincipal(row!);
}

export async function insertAccessGrant(
  db: DbExecutor,
  input: {
    organizationId: string;
    principalId: string;
    portalKind: PortalKind;
    clientId?: string | null;
    projectId?: string | null;
    vendorId?: string | null;
    scopes: readonly string[];
    expiresAt?: Date | null;
  },
): Promise<ExternalAccessGrantRecord> {
  const [row] = await db
    .insert(externalAccessGrants)
    .values({
      organizationId: input.organizationId,
      principalId: input.principalId,
      portalKind: input.portalKind,
      clientId: input.clientId ?? null,
      projectId: input.projectId ?? null,
      vendorId: input.vendorId ?? null,
      scopes: [...input.scopes],
      status: 'active',
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  return mapGrant(row!);
}

export async function findGrantById(
  organizationId: string,
  grantId: string,
): Promise<ExternalAccessGrantRecord | null> {
  const db = getAdminDb();
  const [row] = await db
    .select()
    .from(externalAccessGrants)
    .where(
      and(eq(externalAccessGrants.id, grantId), eq(externalAccessGrants.organizationId, organizationId)),
    )
    .limit(1);

  if (!row) return null;
  const grant = mapGrant(row);
  // Defense in depth — repository already filters by org; assert traps misuse.
  assertGrantBelongsToOrganization(grant, organizationId);
  return grant;
}

export async function revokeAccessGrant(
  organizationId: string,
  grantId: string,
): Promise<ExternalAccessGrantRecord | null> {
  const db = getAdminDb();
  const now = new Date();
  const [row] = await db
    .update(externalAccessGrants)
    .set({
      status: 'revoked',
      revokedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(externalAccessGrants.id, grantId),
        eq(externalAccessGrants.organizationId, organizationId),
        eq(externalAccessGrants.status, 'active'),
      ),
    )
    .returning();

  return row ? mapGrant(row) : null;
}

async function listGrantsForOrgByKind(
  organizationId: string,
  portalKind: PortalKind,
): Promise<ExternalAccessGrantListItem[]> {
  const db = getAdminDb();
  const rows = await db
    .select({
      grant: externalAccessGrants,
      principalEmail: externalPrincipals.email,
      principalDisplayName: externalPrincipals.displayName,
      clientName: clients.name,
      projectName: projects.name,
      vendorName: vendors.name,
    })
    .from(externalAccessGrants)
    .innerJoin(externalPrincipals, eq(externalAccessGrants.principalId, externalPrincipals.id))
    .leftJoin(
      clients,
      and(
        eq(externalAccessGrants.clientId, clients.id),
        eq(clients.organizationId, organizationId),
      ),
    )
    .leftJoin(
      projects,
      and(
        eq(externalAccessGrants.projectId, projects.id),
        eq(projects.organizationId, organizationId),
      ),
    )
    .leftJoin(
      vendors,
      and(
        eq(externalAccessGrants.vendorId, vendors.id),
        eq(vendors.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(externalAccessGrants.organizationId, organizationId),
        eq(externalAccessGrants.portalKind, portalKind),
      ),
    )
    .orderBy(desc(externalAccessGrants.createdAt));

  return rows.map((row) => ({
    ...mapGrant(row.grant),
    principalEmail: row.principalEmail,
    principalDisplayName: row.principalDisplayName,
    clientName: row.clientName,
    projectName: row.projectName,
    vendorName: row.vendorName,
  }));
}

export async function listCustomerGrantsForOrg(
  organizationId: string,
): Promise<ExternalAccessGrantListItem[]> {
  return listGrantsForOrgByKind(organizationId, 'customer');
}

export async function listVendorGrantsForOrg(
  organizationId: string,
): Promise<ExternalAccessGrantListItem[]> {
  return listGrantsForOrgByKind(organizationId, 'vendor');
}

export async function findProjectForPortal(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{
  id: string;
  name: string;
  status: string;
  clientId: string | null;
  progressPercent: string | null;
  progressStatus: string | null;
  startDate: string | null;
  targetEndDate: string | null;
  location: string | null;
  description: string | null;
  currency: string | null;
  clientName: string | null;
} | null> {
  const [row] = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      clientId: projects.clientId,
      progressPercent: projects.progressPercent,
      progressStatus: projects.progressStatus,
      startDate: projects.startDate,
      targetEndDate: projects.targetEndDate,
      location: projects.location,
      description: projects.description,
      currency: projects.currency,
      clientName: clients.name,
      archivedAt: projects.archivedAt,
    })
    .from(projects)
    .leftJoin(
      clients,
      and(eq(projects.clientId, clients.id), eq(clients.organizationId, organizationId)),
    )
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);

  if (!row || row.archivedAt) return null;

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    clientId: row.clientId,
    progressPercent: row.progressPercent,
    progressStatus: row.progressStatus,
    startDate: row.startDate,
    targetEndDate: row.targetEndDate,
    location: row.location,
    description: row.description,
    currency: row.currency,
    clientName: row.clientName,
  };
}

export async function assertClientInOrganization(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(eq(clients.id, clientId), eq(clients.organizationId, organizationId), isNull(clients.archivedAt)),
    )
    .limit(1);
  return Boolean(row);
}

export async function assertVendorInOrganization(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(
      and(
        eq(vendors.id, vendorId),
        eq(vendors.organizationId, organizationId),
        isNull(vendors.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function findVendorName(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ name: vendors.name })
    .from(vendors)
    .where(
      and(
        eq(vendors.id, vendorId),
        eq(vendors.organizationId, organizationId),
        isNull(vendors.archivedAt),
      ),
    )
    .limit(1);
  return row?.name ?? null;
}

/**
 * RFQs visible to a vendor with rfq.read.
 * No RFQ↔vendor invite table yet — only RFQs already associated via
 * supplier_quote for this vendor (never an org-wide sent-RFQ dump).
 */
export async function listVendorScopedRfqsForPortal(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<
  {
    id: string;
    title: string;
    status: string;
    dueDate: string | null;
    projectName: string | null;
    lines: { description: string; quantity: string; unit: string | null }[];
  }[]
> {
  const associated = await db
    .selectDistinct({ rfqId: supplierQuotes.rfqId })
    .from(supplierQuotes)
    .where(
      and(
        eq(supplierQuotes.organizationId, organizationId),
        eq(supplierQuotes.vendorId, vendorId),
        isNotNull(supplierQuotes.rfqId),
      ),
    );

  const rfqIds = associated
    .map((row) => row.rfqId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (rfqIds.length === 0) return [];

  const rfqs = await db
    .select({
      id: procurementRfqs.id,
      title: procurementRfqs.title,
      status: procurementRfqs.status,
      dueDate: procurementRfqs.dueDate,
      projectName: projects.name,
    })
    .from(procurementRfqs)
    .leftJoin(
      projects,
      and(
        eq(procurementRfqs.projectId, projects.id),
        eq(projects.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(procurementRfqs.organizationId, organizationId),
        inArray(procurementRfqs.id, rfqIds),
        inArray(procurementRfqs.status, ['sent', 'closed']),
        isNull(procurementRfqs.archivedAt),
      ),
    )
    .orderBy(desc(procurementRfqs.createdAt));

  const result = [];
  for (const rfq of rfqs) {
    const lines = await db
      .select({
        description: procurementRfqLines.description,
        quantity: procurementRfqLines.quantity,
        unit: procurementRfqLines.unit,
      })
      .from(procurementRfqLines)
      .where(
        and(
          eq(procurementRfqLines.organizationId, organizationId),
          eq(procurementRfqLines.rfqId, rfq.id),
        ),
      )
      .orderBy(procurementRfqLines.sortOrder);

    result.push({
      id: rfq.id,
      title: rfq.title,
      status: rfq.status,
      dueDate: rfq.dueDate,
      projectName: rfq.projectName,
      lines,
    });
  }
  return result;
}

/**
 * Customer-safe project documents (metadata only). Never returns storage paths.
 * Prefer `document_links.portal_visible`; callers still apply shared-label
 * interim filter via buildCustomerSafeDocuments.
 */
export async function listCustomerSafeProjectDocuments(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<
  {
    id: string;
    originalFilename: string;
    label: string | null;
    portalVisible: boolean;
    mimeType: string;
    sizeBytes: number | null;
  }[]
> {
  const rows = await db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      label: documentLinks.label,
      portalVisible: documentLinks.portalVisible,
      mimeType: documents.mimeType,
      sizeBytes: documents.sizeBytes,
    })
    .from(documentLinks)
    .innerJoin(documents, eq(documentLinks.documentId, documents.id))
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        eq(documents.organizationId, organizationId),
        eq(documentLinks.ownerType, 'project'),
        eq(documentLinks.ownerId, projectId),
        isNull(documents.deletedAt),
        sql`${documents.status} <> 'deleted'`,
      ),
    )
    .orderBy(documents.createdAt)
    .limit(100);

  return rows;
}

/**
 * Customer-visible milestones for a project (org-scoped).
 * Only rows with portal_visible = true (default false → share nothing).
 * Notes are selected only so callers can drop them — never expose in DTO.
 */
export async function listCustomerSafeProjectMilestones(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<
  {
    id: string;
    name: string;
    status: string;
    targetDate: string | null;
    completedAt: string | null;
    notes: string | null;
  }[]
> {
  return db
    .select({
      id: projectMilestones.id,
      name: projectMilestones.name,
      status: projectMilestones.status,
      targetDate: projectMilestones.targetDate,
      completedAt: projectMilestones.completedAt,
      notes: projectMilestones.notes,
    })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.organizationId, organizationId),
        eq(projectMilestones.projectId, projectId),
        eq(projectMilestones.portalVisible, true),
        isNull(projectMilestones.archivedAt),
        sql`${projectMilestones.status} <> 'cancelled'`,
      ),
    )
    .orderBy(asc(projectMilestones.sortOrder), asc(projectMilestones.targetDate))
    .limit(100);
}

/**
 * Customer-facing commercial quotes for a project client.
 * Never selects estimated cost / margin / internal notes.
 * Only statuses the customer would already know after send.
 */
export async function listCustomerSafeQuotesForClient(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<
  {
    id: string;
    title: string;
    status: string;
    currency: string;
    totalAmount: string | null;
    validityDate: string | null;
    sentAt: Date | null;
  }[]
> {
  return db
    .select({
      id: estimateQuotes.id,
      title: estimateQuotes.title,
      status: estimateQuotes.status,
      currency: estimateQuotes.currency,
      totalAmount: estimateQuotes.totalAmount,
      validityDate: estimateQuotes.validityDate,
      sentAt: estimateQuotes.sentAt,
    })
    .from(estimateQuotes)
    .where(
      and(
        eq(estimateQuotes.organizationId, organizationId),
        eq(estimateQuotes.clientId, clientId),
        isNull(estimateQuotes.archivedAt),
        inArray(estimateQuotes.status, [
          'sent',
          'accepted',
          'rejected',
          'expired',
          'converted',
        ]),
      ),
    )
    .orderBy(desc(estimateQuotes.sentAt), desc(estimateQuotes.updatedAt))
    .limit(50);
}

/**
 * Customer-facing billing + payment rows for portal (org + project scoped).
 * Excludes draft/void at the query layer; notes are never selected.
 */
export async function listCustomerSafeBillingRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<
  {
    id: string;
    reference: string | null;
    kind: string;
    status: string;
    issueDate: string | null;
    dueDate: string | null;
    totalAmount: string;
    currency: string;
    payments: {
      amount: string;
      currency: string;
      status: string;
      paymentDate: string | null;
      reference: string | null;
    }[];
  }[]
> {
  const rows = await db
    .select({
      id: billingRecords.id,
      reference: billingRecords.reference,
      kind: billingRecords.kind,
      status: billingRecords.status,
      issueDate: billingRecords.issueDate,
      dueDate: billingRecords.dueDate,
      totalAmount: billingRecords.totalAmount,
      currency: billingRecords.currency,
    })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.organizationId, organizationId),
        eq(billingRecords.projectId, projectId),
        isNull(billingRecords.archivedAt),
        inArray(billingRecords.status, ['finalized']),
      ),
    )
    .orderBy(desc(billingRecords.issueDate))
    .limit(100);

  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const paymentRows = await db
    .select({
      billingRecordId: payments.billingRecordId,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      paymentDate: payments.paymentDate,
      reference: payments.reference,
    })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, organizationId),
        inArray(payments.billingRecordId, ids),
        eq(payments.status, 'recorded'),
      ),
    );

  const paymentsByRecord = new Map<string, typeof paymentRows>();
  for (const payment of paymentRows) {
    if (!payment.billingRecordId) continue;
    const list = paymentsByRecord.get(payment.billingRecordId) ?? [];
    list.push(payment);
    paymentsByRecord.set(payment.billingRecordId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    status: row.status,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    totalAmount: row.totalAmount,
    currency: row.currency,
    payments: (paymentsByRecord.get(row.id) ?? []).map((payment) => ({
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      paymentDate: payment.paymentDate,
      reference: payment.reference,
    })),
  }));
}

export async function listVendorPurchaseOrdersForPortal(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<
  {
    id: string;
    reference: string | null;
    status: string;
    currency: string;
    committedAmount: string;
    orderedOn: string | null;
    projectName: string | null;
    lines: {
      description: string;
      quantity: string;
      unitAmount: string;
      lineTotal: string;
      currency: string;
    }[];
  }[]
> {
  const orders = await db
    .select({
      id: purchaseOrders.id,
      reference: purchaseOrders.reference,
      status: purchaseOrders.status,
      currency: purchaseOrders.currency,
      committedAmount: purchaseOrders.committedAmount,
      orderedOn: purchaseOrders.orderedOn,
      projectName: projects.name,
    })
    .from(purchaseOrders)
    .leftJoin(
      projects,
      and(
        eq(purchaseOrders.projectId, projects.id),
        eq(projects.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(purchaseOrders.organizationId, organizationId),
        eq(purchaseOrders.vendorId, vendorId),
        isNull(purchaseOrders.archivedAt),
        inArray(purchaseOrders.status, ['issued', 'partially_received', 'closed']),
      ),
    )
    .orderBy(desc(purchaseOrders.createdAt));

  const result = [];
  for (const order of orders) {
    const lines = await db
      .select({
        description: purchaseOrderLines.description,
        quantity: purchaseOrderLines.quantity,
        unitAmount: purchaseOrderLines.unitAmount,
        lineTotal: purchaseOrderLines.lineTotal,
        currency: purchaseOrderLines.currency,
      })
      .from(purchaseOrderLines)
      .where(
        and(
          eq(purchaseOrderLines.organizationId, organizationId),
          eq(purchaseOrderLines.purchaseOrderId, order.id),
        ),
      )
      .orderBy(purchaseOrderLines.sortOrder);

    result.push({
      id: order.id,
      reference: order.reference,
      status: order.status,
      currency: order.currency,
      committedAmount: order.committedAmount,
      orderedOn: order.orderedOn,
      projectName: order.projectName,
      lines,
    });
  }
  return result;
}

export async function findRfqInOrg(
  db: DbExecutor,
  organizationId: string,
  rfqId: string,
): Promise<{ id: string; status: string } | null> {
  const [row] = await db
    .select({ id: procurementRfqs.id, status: procurementRfqs.status })
    .from(procurementRfqs)
    .where(
      and(
        eq(procurementRfqs.id, rfqId),
        eq(procurementRfqs.organizationId, organizationId),
        isNull(procurementRfqs.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertSupplierQuoteCandidate(
  db: DbExecutor,
  values: typeof supplierQuotes.$inferInsert,
): Promise<typeof supplierQuotes.$inferSelect> {
  const [row] = await db.insert(supplierQuotes).values(values).returning();
  if (!row) throw new Error('Failed to insert supplier quote');
  return row;
}

export async function insertSupplierQuoteLines(
  db: DbExecutor,
  lines: (typeof supplierQuoteLines.$inferInsert)[],
): Promise<void> {
  if (lines.length === 0) return;
  await db.insert(supplierQuoteLines).values(lines);
}
