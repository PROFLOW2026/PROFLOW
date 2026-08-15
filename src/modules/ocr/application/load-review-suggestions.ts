import { and, eq, isNull, or } from 'drizzle-orm';
import { apBills, projects, purchaseOrders, subcontractAgreements, vendorEngagements } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import {
  listOcrCorrectionMemory,
  vendorIdentifierSourceKey,
  vendorNameSourceKey,
} from '../data/correction-memory.repository';
import { suggestProjects } from '../domain/project-matching';
import { suggestPurchaseOrders, type PurchaseOrderSuggestionRow } from '../domain/po-matching';
import { suggestSubcontracts, type SubcontractSuggestionRow } from '../domain/agreement-matching';

export interface OcrReviewSuggestions {
  readonly projects: ReturnType<typeof suggestProjects>;
  readonly purchaseOrders: readonly PurchaseOrderSuggestionRow[];
  readonly subcontractAgreements: readonly SubcontractSuggestionRow[];
}

export async function loadOcrReviewSuggestions(
  context: OrgContext,
  probe: {
    vendorId?: string | null;
    vendorName?: string | null;
    companyNumber?: string | null;
    vatId?: string | null;
    projectId?: string | null;
    orderNumber?: string | null;
    currency?: string | null;
  },
): Promise<OcrReviewSuggestions> {
  const empty: OcrReviewSuggestions = { projects: [], purchaseOrders: [], subcontractAgreements: [] };
  if (!context.db || typeof (context.db as { select?: unknown }).select !== 'function') return empty;

  const allowed = await resolveAccessibleProjectIds(context);
  const memory = await listOcrCorrectionMemory(context.db, context.organizationId);
  const nameKey = vendorNameSourceKey(probe.vendorName);
  const idKey =
    vendorIdentifierSourceKey(probe.companyNumber) ?? vendorIdentifierSourceKey(probe.vatId);

  const memoryVendor = memory.find(
    (row) =>
      row.mappingKind === 'vendor' &&
      ((nameKey && row.sourceKey === nameKey) || (idKey && row.sourceKey === idKey)),
  );
  const vendorId = probe.vendorId ?? memoryVendor?.vendorId ?? null;

  const memoryProjectIds = memory
    .filter((row) => row.mappingKind === 'project' && row.vendorId === vendorId && row.projectId)
    .map((row) => row.projectId!)
    .filter((id) => allowed === null || allowed.includes(id));

  const names: Record<string, string> = {};
  if (hasPermission(context, PERMISSIONS.PROJECTS_READ)) {
    const projectRows = await context.db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(and(eq(projects.organizationId, context.organizationId), isNull(projects.archivedAt)));
    for (const row of projectRows) names[row.id] = row.name;
  }

  let purchaseOrdersOut: readonly PurchaseOrderSuggestionRow[] = [];
  let openPoProjectIds: string[] = [];
  if (vendorId && hasPermission(context, PERMISSIONS.PROCUREMENT_READ)) {
    const poRows = await context.db
      .select({
        id: purchaseOrders.id,
        vendorId: purchaseOrders.vendorId,
        projectId: purchaseOrders.projectId,
        reference: purchaseOrders.reference,
        status: purchaseOrders.status,
      })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.organizationId, context.organizationId),
          eq(purchaseOrders.vendorId, vendorId),
          isNull(purchaseOrders.archivedAt),
          or(eq(purchaseOrders.status, 'issued'), eq(purchaseOrders.status, 'partially_received')),
        ),
      );
    const scoped = poRows.filter(
      (row) => !row.projectId || allowed === null || allowed.includes(row.projectId),
    );
    openPoProjectIds = scoped.map((row) => row.projectId).filter((id): id is string => Boolean(id));
    purchaseOrdersOut = suggestPurchaseOrders(
      { vendorId, projectId: probe.projectId ?? null, orderNumber: probe.orderNumber ?? null },
      scoped,
    );
  }

  let engagementProjectIds: string[] = [];
  let subcontractOut: readonly SubcontractSuggestionRow[] = [];
  if (vendorId && hasPermission(context, PERMISSIONS.VENDORS_READ)) {
    const engagementRows = await context.db
      .select({ projectId: vendorEngagements.projectId })
      .from(vendorEngagements)
      .where(
        and(
          eq(vendorEngagements.organizationId, context.organizationId),
          eq(vendorEngagements.vendorId, vendorId),
        ),
      );
    engagementProjectIds = engagementRows
      .map((row) => row.projectId)
      .filter((id) => allowed === null || allowed.includes(id));

    const agreementRows = await context.db
      .select({
        id: subcontractAgreements.id,
        vendorId: subcontractAgreements.vendorId,
        projectId: subcontractAgreements.projectId,
        title: subcontractAgreements.title,
        subcontractNumber: subcontractAgreements.subcontractNumber,
        currency: subcontractAgreements.currency,
        status: subcontractAgreements.status,
      })
      .from(subcontractAgreements)
      .where(
        and(
          eq(subcontractAgreements.organizationId, context.organizationId),
          eq(subcontractAgreements.vendorId, vendorId),
          isNull(subcontractAgreements.archivedAt),
        ),
      );
    const scopedAgreements = agreementRows.filter(
      (row) => allowed === null || allowed.includes(row.projectId),
    );
    subcontractOut = suggestSubcontracts(
      {
        vendorId,
        projectId: probe.projectId ?? memoryProjectIds[0] ?? null,
        currency: probe.currency ?? null,
      },
      scopedAgreements,
    );
  }

  let recentBillProjectIds: string[] = [];
  if (vendorId && hasPermission(context, PERMISSIONS.AP_READ)) {
    const billRows = await context.db
      .select({ projectId: apBills.projectId })
      .from(apBills)
      .where(
        and(
          eq(apBills.organizationId, context.organizationId),
          eq(apBills.vendorId, vendorId),
          isNull(apBills.archivedAt),
        ),
      )
      .limit(20);
    recentBillProjectIds = billRows
      .map((row) => row.projectId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => allowed === null || allowed.includes(id));
  }

  return {
    projects: suggestProjects({
      memoryProjectIds,
      openPoProjectIds,
      engagementProjectIds,
      recentBillProjectIds,
      names,
    }),
    purchaseOrders: purchaseOrdersOut,
    subcontractAgreements: subcontractOut,
  };
}
