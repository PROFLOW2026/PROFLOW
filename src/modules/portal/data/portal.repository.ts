import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import {
  clients,
  externalAccessGrants,
  externalPrincipals,
  projects,
  vendors,
} from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ExternalAccessGrantListItem,
  ExternalAccessGrantRecord,
  ExternalPrincipalRecord,
  GrantStatus,
  PortalKind,
} from '../domain/types';

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

  return row ? mapGrant(row) : null;
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
    .leftJoin(clients, eq(externalAccessGrants.clientId, clients.id))
    .leftJoin(projects, eq(externalAccessGrants.projectId, projects.id))
    .leftJoin(vendors, eq(externalAccessGrants.vendorId, vendors.id))
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
    .leftJoin(clients, eq(projects.clientId, clients.id))
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
