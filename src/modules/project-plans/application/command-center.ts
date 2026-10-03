import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
  documentShareAcknowledgements,
  documentShares,
  drawingDistributionEntries,
  drawingRevisionAcknowledgements,
  drawingRevisions,
  drawings,
  projects,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import type { DgCommandCenterQueryInput } from '@/modules/command-center';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';

const SCAN = 100;

function calendarDay(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}

type VendorOnProject = { readonly id: string; readonly name: string };

async function vendorsByProject(
  context: OrgContext,
  projectIds: readonly string[],
): Promise<Map<string, VendorOnProject[]>> {
  if (projectIds.length === 0) return new Map();
  const rows = await context.db
    .select({
      projectId: subcontractAgreements.projectId,
      vendorId: subcontractAgreements.vendorId,
      vendorName: vendors.name,
    })
    .from(subcontractAgreements)
    .leftJoin(
      vendors,
      and(eq(vendors.id, subcontractAgreements.vendorId), eq(vendors.organizationId, subcontractAgreements.organizationId)),
    )
    .where(
      and(
        eq(subcontractAgreements.organizationId, context.organizationId),
        inArray(subcontractAgreements.projectId, [...projectIds]),
        ne(subcontractAgreements.status, 'cancelled'),
        isNull(subcontractAgreements.archivedAt),
      ),
    );
  const map = new Map<string, VendorOnProject[]>();
  for (const row of rows) {
    const name = row.vendorName?.trim();
    if (!name) continue;
    const list = map.get(row.projectId) ?? [];
    if (!list.some((vendor) => vendor.id === row.vendorId)) list.push({ id: row.vendorId, name });
    map.set(row.projectId, list);
  }
  return map;
}

async function planRevisionRows(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
  vendorsOnProject: Map<string, VendorOnProject[]>,
): Promise<DgCommandCenterRow[]> {
  const zone = context.organization.timezone;
  const revisions = await context.db
    .select({
      id: drawingRevisions.id,
      projectId: drawings.projectId,
      projectName: projects.name,
      drawingId: drawings.id,
      drawingNumber: drawings.drawingNumber,
      title: drawings.title,
      revisionLabel: drawingRevisions.revisionLabel,
      visibility: drawings.contractorVisibility,
      issueDate: drawingRevisions.issueDate,
      publishedAt: drawingRevisions.publishedAt,
    })
    .from(drawings)
    .innerJoin(
      drawingRevisions,
      and(
        eq(drawingRevisions.id, drawings.currentRevisionId),
        eq(drawingRevisions.organizationId, drawings.organizationId),
        eq(drawingRevisions.status, 'current'),
      ),
    )
    .innerJoin(projects, and(eq(projects.id, drawings.projectId), eq(projects.organizationId, drawings.organizationId)))
    .where(
      and(
        eq(drawings.organizationId, context.organizationId),
        inArray(drawings.projectId, [...input.projectIds]),
        eq(drawings.status, 'active'),
        isNull(drawings.archivedAt),
        eq(drawingRevisions.acknowledgementRequired, true),
        ne(drawings.contractorVisibility, 'internal'),
      ),
    )
    .orderBy(asc(drawingRevisions.issueDate), asc(drawings.drawingNumber))
    .limit(SCAN);
  if (revisions.length === 0) return [];

  const drawingIds = revisions.map((row) => row.drawingId);
  const revisionIds = revisions.map((row) => row.id);
  const [distribution, acknowledgements] = await Promise.all([
    context.db
      .select({
        drawingId: drawingDistributionEntries.drawingId,
        vendorId: drawingDistributionEntries.vendorId,
        principalId: drawingDistributionEntries.principalId,
        vendorName: vendors.name,
      })
      .from(drawingDistributionEntries)
      .leftJoin(
        vendors,
        and(
          eq(vendors.id, drawingDistributionEntries.vendorId),
          eq(vendors.organizationId, drawingDistributionEntries.organizationId),
        ),
      )
      .where(
        and(
          eq(drawingDistributionEntries.organizationId, context.organizationId),
          inArray(drawingDistributionEntries.drawingId, drawingIds),
        ),
      ),
    context.db
      .select({
        revisionId: drawingRevisionAcknowledgements.revisionId,
        vendorId: drawingRevisionAcknowledgements.vendorId,
        principalId: drawingRevisionAcknowledgements.principalId,
      })
      .from(drawingRevisionAcknowledgements)
      .where(
        and(
          eq(drawingRevisionAcknowledgements.organizationId, context.organizationId),
          inArray(drawingRevisionAcknowledgements.revisionId, revisionIds),
        ),
      ),
  ]);

  const rows: DgCommandCenterRow[] = [];
  for (const revision of revisions) {
    const dueDate = revision.issueDate ?? (revision.publishedAt ? calendarDay(revision.publishedAt, zone) : null);
    if (!dueDate || dueDate >= input.today) continue;
    const acks = acknowledgements.filter((ack) => ack.revisionId === revision.id);
    const ackVendors = new Set(acks.map((ack) => ack.vendorId));
    const ackPrincipals = new Set(acks.map((ack) => ack.principalId));
    let vendorName: string | null = null;
    if (revision.visibility === 'distribution') {
      const entries = distribution.filter((entry) => entry.drawingId === revision.drawingId);
      const missing = entries.filter((entry) =>
        entry.principalId ? !ackPrincipals.has(entry.principalId) : entry.vendorId ? !ackVendors.has(entry.vendorId) : false,
      );
      if (entries.length === 0 || missing.length === 0) continue;
      vendorName = missing.map((entry) => entry.vendorName?.trim()).find(Boolean) ?? null;
    } else {
      const expected = vendorsOnProject.get(revision.projectId) ?? [];
      const missing = expected.filter((vendor) => !ackVendors.has(vendor.id));
      if (expected.length === 0 || missing.length === 0) continue;
      vendorName = missing[0]?.name ?? null;
    }
    rows.push({
      id: revision.id,
      projectId: revision.projectId,
      projectName: revision.projectName,
      vendorName,
      reference: `${revision.drawingNumber} · ${revision.revisionLabel} ${revision.title}`.trim(),
      dueDate,
      since: revision.publishedAt,
      kind: 'plan_revision',
    });
  }
  return rows;
}

async function documentShareRows(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
  vendorsOnProject: Map<string, VendorOnProject[]>,
): Promise<DgCommandCenterRow[]> {
  const zone = context.organization.timezone;
  const shares = await context.db
    .select({
      id: documentShares.id,
      projectId: documentShares.projectId,
      projectName: projects.name,
      title: documentShares.title,
      audience: documentShares.audience,
      vendorId: documentShares.vendorId,
      principalId: documentShares.principalId,
      vendorName: vendors.name,
      sharedAt: documentShares.sharedAt,
    })
    .from(documentShares)
    .innerJoin(
      projects,
      and(eq(projects.id, documentShares.projectId), eq(projects.organizationId, documentShares.organizationId)),
    )
    .leftJoin(
      vendors,
      and(eq(vendors.id, documentShares.vendorId), eq(vendors.organizationId, documentShares.organizationId)),
    )
    .where(
      and(
        eq(documentShares.organizationId, context.organizationId),
        inArray(documentShares.projectId, [...input.projectIds]),
        eq(documentShares.acknowledgementRequired, true),
        isNull(documentShares.revokedAt),
      ),
    )
    .orderBy(asc(documentShares.sharedAt))
    .limit(SCAN);
  const overdue = shares.filter((share) => calendarDay(share.sharedAt, zone) < input.today);
  if (overdue.length === 0) return [];
  const acknowledgements = await context.db
    .select({
      shareId: documentShareAcknowledgements.shareId,
      vendorId: documentShareAcknowledgements.vendorId,
      principalId: documentShareAcknowledgements.principalId,
    })
    .from(documentShareAcknowledgements)
    .where(
      and(
        eq(documentShareAcknowledgements.organizationId, context.organizationId),
        inArray(
          documentShareAcknowledgements.shareId,
          overdue.map((share) => share.id),
        ),
      ),
    );

  const rows: DgCommandCenterRow[] = [];
  for (const share of overdue) {
    const acks = acknowledgements.filter((ack) => ack.shareId === share.id);
    const ackVendors = new Set(acks.map((ack) => ack.vendorId));
    const ackPrincipals = new Set(acks.map((ack) => ack.principalId));
    let vendorName = share.vendorName?.trim() || null;
    if (share.audience === 'principal') {
      if (!share.principalId || ackPrincipals.has(share.principalId)) continue;
    } else if (share.audience === 'agreement') {
      if (!share.vendorId || ackVendors.has(share.vendorId)) continue;
    } else {
      const expected = vendorsOnProject.get(share.projectId) ?? [];
      const missing = expected.filter((vendor) => !ackVendors.has(vendor.id));
      if (expected.length === 0 || missing.length === 0) continue;
      vendorName = missing[0]?.name ?? vendorName;
    }
    rows.push({
      id: share.id,
      projectId: share.projectId,
      projectName: share.projectName,
      vendorName,
      reference: share.title,
      dueDate: calendarDay(share.sharedAt, zone),
      since: share.sharedAt,
      kind: 'document',
    });
  }
  return rows;
}

/** Current plan revisions and shared documents whose required acknowledgement is past due. */
export async function queryPlanAcknowledgementOverdue(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const vendorsOnProject = await vendorsByProject(context, input.projectIds);
  const [plans, documents] = await Promise.all([
    planRevisionRows(context, input, vendorsOnProject),
    documentShareRows(context, input, vendorsOnProject),
  ]);
  return [...plans, ...documents].sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? '')).slice(0, input.limit);
}
