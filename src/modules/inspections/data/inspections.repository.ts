import { and, asc, count, desc, eq, inArray, isNull, max, notInArray, or, type SQL } from 'drizzle-orm';
import {
  defects,
  profiles,
  projectLocations,
  projectMilestones,
  qualityInspectionItems,
  qualityInspectionOutcomes,
  qualityInspections,
  qualityInspectionTemplateItems,
  qualityInspectionTemplates,
  subcontractWorkLines,
  workPackages,
} from '@drizzle/schema';
import { projectVendorNames } from '@/modules/defects';
import type { DbExecutor } from '@/shared/db/types';
import type { CheckResult, InspectionOutcome, InspectionStatus } from '../domain/rules';
import type {
  ContractorInspectionItem,
  CustomTemplateView,
  InspectionDetail,
  InspectionItemView,
  InspectionLinkedDefect,
  InspectionListFilters,
  InspectionListItem,
  InspectionListPage,
  InspectionOutcomeView,
} from '../domain/types';

export type InspectionRow = typeof qualityInspections.$inferSelect;
export type InspectionAudience = 'internal' | 'external';

export const INSPECTION_PAGE_SIZE = 50;

export async function maxInspectionReference(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: max(qualityInspections.referenceNo) })
    .from(qualityInspections)
    .where(and(eq(qualityInspections.organizationId, organizationId), eq(qualityInspections.projectId, projectId)));
  return row?.value ?? 0;
}

export async function insertInspectionRow(
  db: DbExecutor,
  values: typeof qualityInspections.$inferInsert,
): Promise<void> {
  await db.insert(qualityInspections).values(values);
}

export async function insertInspectionItems(
  db: DbExecutor,
  rows: (typeof qualityInspectionItems.$inferInsert)[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(qualityInspectionItems).values(rows);
}

export async function findInspectionRow(
  db: DbExecutor,
  organizationId: string,
  inspectionId: string,
): Promise<InspectionRow | null> {
  const [row] = await db
    .select()
    .from(qualityInspections)
    .where(
      and(
        eq(qualityInspections.organizationId, organizationId),
        eq(qualityInspections.id, inspectionId),
        isNull(qualityInspections.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Compare-and-set on status. Returns false on a concurrent change. */
export async function updateInspectionRow(
  db: DbExecutor,
  organizationId: string,
  inspectionId: string,
  expectedStatus: InspectionStatus,
  patch: Partial<typeof qualityInspections.$inferInsert>,
): Promise<boolean> {
  const rows = await db
    .update(qualityInspections)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(qualityInspections.organizationId, organizationId),
        eq(qualityInspections.id, inspectionId),
        eq(qualityInspections.status, expectedStatus),
      ),
    )
    .returning({ id: qualityInspections.id });
  return rows.length > 0;
}

export async function listItemRows(db: DbExecutor, organizationId: string, inspectionId: string) {
  return db
    .select()
    .from(qualityInspectionItems)
    .where(
      and(
        eq(qualityInspectionItems.organizationId, organizationId),
        eq(qualityInspectionItems.inspectionId, inspectionId),
      ),
    )
    .orderBy(asc(qualityInspectionItems.sortOrder));
}

export async function updateItemResults(
  db: DbExecutor,
  organizationId: string,
  inspectionId: string,
  userId: string,
  results: readonly { readonly itemId: string; readonly result: CheckResult; readonly note: string | null }[],
): Promise<number> {
  let updated = 0;
  const now = new Date();
  for (const entry of results) {
    const rows = await db
      .update(qualityInspectionItems)
      .set({
        result: entry.result,
        note: entry.note,
        checkedByUserId: entry.result === 'pending' ? null : userId,
        checkedAt: entry.result === 'pending' ? null : now,
        updatedAt: now,
      })
      .where(
        and(
          eq(qualityInspectionItems.organizationId, organizationId),
          eq(qualityInspectionItems.inspectionId, inspectionId),
          eq(qualityInspectionItems.id, entry.itemId),
        ),
      )
      .returning({ id: qualityInspectionItems.id });
    updated += rows.length;
  }
  return updated;
}

export async function resetItemResults(db: DbExecutor, organizationId: string, inspectionId: string): Promise<void> {
  await db
    .update(qualityInspectionItems)
    .set({ result: 'pending', note: null, checkedByUserId: null, checkedAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(qualityInspectionItems.organizationId, organizationId),
        eq(qualityInspectionItems.inspectionId, inspectionId),
      ),
    );
}

export async function insertOutcomeRow(
  db: DbExecutor,
  values: typeof qualityInspectionOutcomes.$inferInsert,
): Promise<void> {
  await db.insert(qualityInspectionOutcomes).values(values);
}

function listConditions(
  organizationId: string,
  projectId: string,
  filters: InspectionListFilters,
  vendorIds: readonly string[] | null,
): SQL[] {
  const conditions: SQL[] = [
    eq(qualityInspections.organizationId, organizationId),
    eq(qualityInspections.projectId, projectId),
    isNull(qualityInspections.archivedAt),
  ];
  if (vendorIds) conditions.push(inArray(qualityInspections.vendorId, [...vendorIds]));
  if (filters.status === 'open') {
    conditions.push(inArray(qualityInspections.status, ['scheduled', 'in_progress']));
  } else if (filters.status) {
    conditions.push(eq(qualityInspections.status, filters.status));
  }
  if (filters.outcome) conditions.push(eq(qualityInspections.outcome, filters.outcome));
  if (filters.vendorId) conditions.push(eq(qualityInspections.vendorId, filters.vendorId));
  if (filters.locationId) conditions.push(eq(qualityInspections.locationId, filters.locationId));
  return conditions;
}

async function openDefectCounts(
  db: DbExecutor,
  organizationId: string,
  inspectionIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (inspectionIds.length === 0) return result;
  const rows = await db
    .select({ inspectionId: defects.sourceInspectionId, total: count() })
    .from(defects)
    .where(
      and(
        eq(defects.organizationId, organizationId),
        inArray(defects.sourceInspectionId, [...inspectionIds]),
        notInArray(defects.status, ['closed', 'cancelled']),
        isNull(defects.archivedAt),
      ),
    )
    .groupBy(defects.sourceInspectionId);
  for (const row of rows) if (row.inspectionId) result.set(row.inspectionId, Number(row.total));
  return result;
}

export async function listInspectionRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  filters: InspectionListFilters,
): Promise<InspectionListPage> {
  const limit = Math.min(Math.max(filters.limit ?? INSPECTION_PAGE_SIZE, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const rows = await db
    .select({
      id: qualityInspections.id,
      projectId: qualityInspections.projectId,
      referenceNo: qualityInspections.referenceNo,
      title: qualityInspections.title,
      category: qualityInspections.category,
      templateKey: qualityInspections.templateKey,
      status: qualityInspections.status,
      outcome: qualityInspections.outcome,
      attemptNo: qualityInspections.attemptNo,
      scheduledFor: qualityInspections.scheduledFor,
      completedAt: qualityInspections.completedAt,
      locationId: qualityInspections.locationId,
      locationName: projectLocations.name,
      vendorId: qualityInspections.vendorId,
      subcontractAgreementId: qualityInspections.subcontractAgreementId,
      inspectorName: profiles.displayName,
      inspectorEmail: profiles.email,
    })
    .from(qualityInspections)
    .leftJoin(
      projectLocations,
      and(
        eq(projectLocations.id, qualityInspections.locationId),
        eq(projectLocations.organizationId, qualityInspections.organizationId),
      ),
    )
    .leftJoin(profiles, eq(profiles.id, qualityInspections.inspectorUserId))
    .where(and(...listConditions(organizationId, projectId, filters, null)))
    .orderBy(desc(qualityInspections.scheduledFor), desc(qualityInspections.referenceNo))
    .limit(limit + 1)
    .offset(offset);
  const page = rows.slice(0, limit);
  const counts = await openDefectCounts(
    db,
    organizationId,
    page.map((row) => row.id),
  );
  const vendorNames = page.some((row) => row.vendorId)
    ? await projectVendorNames(db, organizationId, projectId)
    : new Map<string, string>();
  const items: InspectionListItem[] = page.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    referenceNo: row.referenceNo,
    title: row.title,
    category: row.category,
    templateKey: row.templateKey,
    status: row.status,
    outcome: row.outcome,
    attemptNo: row.attemptNo,
    scheduledFor: row.scheduledFor,
    completedAt: row.completedAt,
    location: row.locationId && row.locationName ? { id: row.locationId, name: row.locationName } : null,
    vendor: row.vendorId ? { id: row.vendorId, name: vendorNames.get(row.vendorId) ?? '' } : null,
    subcontractAgreementId: row.subcontractAgreementId,
    inspectorName: row.inspectorName ?? row.inspectorEmail ?? null,
    openDefects: counts.get(row.id) ?? 0,
  }));
  return { items, hasMore: rows.length > limit };
}

export async function countInspectionsByState(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ open: number; passed: number; conditional: number; failed: number }> {
  const rows = await db
    .select({ status: qualityInspections.status, outcome: qualityInspections.outcome, total: count() })
    .from(qualityInspections)
    .where(
      and(
        eq(qualityInspections.organizationId, organizationId),
        eq(qualityInspections.projectId, projectId),
        isNull(qualityInspections.archivedAt),
      ),
    )
    .groupBy(qualityInspections.status, qualityInspections.outcome);
  let open = 0;
  let passed = 0;
  let conditional = 0;
  let failed = 0;
  for (const row of rows) {
    const total = Number(row.total);
    if (row.status === 'scheduled' || row.status === 'in_progress') open += total;
    else if (row.status === 'completed' && row.outcome === 'pass') passed += total;
    else if (row.status === 'completed' && row.outcome === 'conditional_pass') conditional += total;
    else if (row.status === 'completed' && row.outcome === 'fail') failed += total;
  }
  return { open, passed, conditional, failed };
}

function toItemView(row: typeof qualityInspectionItems.$inferSelect): InspectionItemView {
  return {
    id: row.id,
    sortOrder: row.sortOrder,
    itemKey: row.itemKey,
    label: row.label,
    guidance: row.guidance,
    isRequired: row.isRequired,
    result: row.result,
    note: row.note,
    checkedAt: row.checkedAt,
  };
}

export async function loadInspectionDetail(db: DbExecutor, row: InspectionRow): Promise<InspectionDetail> {
  const organizationId = row.organizationId;
  const [location] = row.locationId
    ? await db
        .select({ id: projectLocations.id, name: projectLocations.name })
        .from(projectLocations)
        .where(and(eq(projectLocations.organizationId, organizationId), eq(projectLocations.id, row.locationId)))
        .limit(1)
    : [];
  const vendor = row.vendorId
    ? {
        id: row.vendorId,
        name: (await projectVendorNames(db, organizationId, row.projectId)).get(row.vendorId) ?? '',
      }
    : null;
  const [inspector] = row.inspectorUserId
    ? await db
        .select({ displayName: profiles.displayName, email: profiles.email })
        .from(profiles)
        .where(eq(profiles.id, row.inspectorUserId))
        .limit(1)
    : [];
  const [workLine] = row.workLineId
    ? await db
        .select({
          id: subcontractWorkLines.id,
          code: subcontractWorkLines.code,
          description: subcontractWorkLines.description,
        })
        .from(subcontractWorkLines)
        .where(and(eq(subcontractWorkLines.organizationId, organizationId), eq(subcontractWorkLines.id, row.workLineId)))
        .limit(1)
    : [];
  const [workPackage] = row.workPackageId
    ? await db
        .select({ id: workPackages.id, name: workPackages.name })
        .from(workPackages)
        .where(and(eq(workPackages.organizationId, organizationId), eq(workPackages.id, row.workPackageId)))
        .limit(1)
    : [];
  const [milestone] = row.milestoneId
    ? await db
        .select({ id: projectMilestones.id, name: projectMilestones.name })
        .from(projectMilestones)
        .where(and(eq(projectMilestones.organizationId, organizationId), eq(projectMilestones.id, row.milestoneId)))
        .limit(1)
    : [];

  const items = (await listItemRows(db, organizationId, row.id)).map(toItemView);
  const outcomeRows = await db
    .select({
      outcome: qualityInspectionOutcomes,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(qualityInspectionOutcomes)
    .leftJoin(profiles, eq(profiles.id, qualityInspectionOutcomes.actorUserId))
    .where(
      and(
        eq(qualityInspectionOutcomes.organizationId, organizationId),
        eq(qualityInspectionOutcomes.inspectionId, row.id),
      ),
    )
    .orderBy(desc(qualityInspectionOutcomes.attemptNo));
  const outcomes: InspectionOutcomeView[] = outcomeRows.map(({ outcome, displayName, email }) => ({
    id: outcome.id,
    attemptNo: outcome.attemptNo,
    outcome: outcome.outcome,
    summary: outcome.summary,
    conditions: outcome.conditions,
    passCount: outcome.passCount,
    failCount: outcome.failCount,
    naCount: outcome.naCount,
    decidedAt: outcome.decidedAt,
    decidedByName: displayName ?? email ?? null,
  }));
  const linked: InspectionLinkedDefect[] = await db
    .select({
      id: defects.id,
      referenceNo: defects.referenceNo,
      title: defects.title,
      status: defects.status,
      severity: defects.severity,
    })
    .from(defects)
    .where(
      and(
        eq(defects.organizationId, organizationId),
        eq(defects.sourceInspectionId, row.id),
        isNull(defects.archivedAt),
      ),
    )
    .orderBy(asc(defects.referenceNo));

  return {
    id: row.id,
    organizationId,
    projectId: row.projectId,
    referenceNo: row.referenceNo,
    title: row.title,
    category: row.category,
    templateKey: row.templateKey,
    status: row.status,
    outcome: row.outcome,
    attemptNo: row.attemptNo,
    scheduledFor: row.scheduledFor,
    completedAt: row.completedAt,
    startedAt: row.startedAt,
    location: location ?? null,
    locationId: row.locationId,
    vendor,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    inspectorUserId: row.inspectorUserId,
    inspectorName: inspector ? (inspector.displayName ?? inspector.email) : null,
    openDefects: linked.filter((defect) => defect.status !== 'closed' && defect.status !== 'cancelled').length,
    summary: row.summary,
    conditions: row.conditions,
    contractorVisible: row.contractorVisible,
    workLine: workLine ?? null,
    workPackage: workPackage ?? null,
    milestone: milestone ?? null,
    items,
    outcomes,
    defects: linked,
  };
}

/** Contractor portal list: RLS + vendor filter; no vendor / profile joins. */
export async function listContractorInspectionRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  vendorIds: readonly string[],
  filters: InspectionListFilters,
): Promise<{ items: ContractorInspectionItem[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(filters.limit ?? INSPECTION_PAGE_SIZE, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const rows = await db
    .select({
      id: qualityInspections.id,
      referenceNo: qualityInspections.referenceNo,
      title: qualityInspections.title,
      category: qualityInspections.category,
      templateKey: qualityInspections.templateKey,
      status: qualityInspections.status,
      outcome: qualityInspections.outcome,
      attemptNo: qualityInspections.attemptNo,
      scheduledFor: qualityInspections.scheduledFor,
      completedAt: qualityInspections.completedAt,
      summary: qualityInspections.summary,
      conditions: qualityInspections.conditions,
      locationName: projectLocations.name,
    })
    .from(qualityInspections)
    .leftJoin(
      projectLocations,
      and(
        eq(projectLocations.id, qualityInspections.locationId),
        eq(projectLocations.organizationId, qualityInspections.organizationId),
      ),
    )
    .where(
      and(
        ...listConditions(organizationId, projectId, filters, vendorIds),
        eq(qualityInspections.contractorVisible, true),
        or(
          eq(qualityInspections.status, 'scheduled'),
          eq(qualityInspections.status, 'in_progress'),
          eq(qualityInspections.status, 'completed'),
        )!,
      ),
    )
    .orderBy(desc(qualityInspections.scheduledFor), desc(qualityInspections.referenceNo))
    .limit(limit + 1)
    .offset(offset);
  const page = rows.slice(0, limit);
  const failedIds = page.filter((row) => row.status === 'completed' && row.outcome !== 'pass').map((row) => row.id);
  const failedItems = failedIds.length
    ? await db
        .select({
          inspectionId: qualityInspectionItems.inspectionId,
          itemKey: qualityInspectionItems.itemKey,
          label: qualityInspectionItems.label,
          note: qualityInspectionItems.note,
        })
        .from(qualityInspectionItems)
        .where(
          and(
            eq(qualityInspectionItems.organizationId, organizationId),
            inArray(qualityInspectionItems.inspectionId, failedIds),
            eq(qualityInspectionItems.result, 'fail'),
          ),
        )
        .orderBy(asc(qualityInspectionItems.sortOrder))
    : [];
  return {
    items: page.map((row) => ({
      id: row.id,
      referenceNo: row.referenceNo,
      title: row.title,
      category: row.category,
      templateKey: row.templateKey,
      status: row.status,
      outcome: row.outcome as InspectionOutcome | null,
      attemptNo: row.attemptNo,
      scheduledFor: row.scheduledFor,
      completedAt: row.completedAt,
      locationName: row.locationName,
      summary: row.summary,
      conditions: row.conditions,
      failedItems: failedItems
        .filter((item) => item.inspectionId === row.id)
        .map((item) => ({ itemKey: item.itemKey, label: item.label, note: item.note })),
    })),
    hasMore: rows.length > limit,
  };
}

// --- custom templates ---------------------------------------------------------------------------

export async function listCustomTemplates(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<CustomTemplateView[]> {
  const templates = await db
    .select()
    .from(qualityInspectionTemplates)
    .where(
      and(
        eq(qualityInspectionTemplates.organizationId, organizationId),
        isNull(qualityInspectionTemplates.archivedAt),
        eq(qualityInspectionTemplates.isActive, true),
        or(isNull(qualityInspectionTemplates.projectId), eq(qualityInspectionTemplates.projectId, projectId))!,
      ),
    )
    .orderBy(asc(qualityInspectionTemplates.name));
  if (templates.length === 0) return [];
  const items = await db
    .select()
    .from(qualityInspectionTemplateItems)
    .where(
      and(
        eq(qualityInspectionTemplateItems.organizationId, organizationId),
        inArray(
          qualityInspectionTemplateItems.templateId,
          templates.map((template) => template.id),
        ),
      ),
    )
    .orderBy(asc(qualityInspectionTemplateItems.sortOrder));
  return templates.map((template) => ({
    id: template.id,
    projectId: template.projectId,
    name: template.name,
    category: template.category,
    description: template.description,
    items: items
      .filter((item) => item.templateId === template.id)
      .map((item) => ({ id: item.id, label: item.label, isRequired: item.isRequired })),
  }));
}

export async function findCustomTemplate(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<CustomTemplateView | null> {
  const [template] = await db
    .select()
    .from(qualityInspectionTemplates)
    .where(
      and(
        eq(qualityInspectionTemplates.organizationId, organizationId),
        eq(qualityInspectionTemplates.id, templateId),
        isNull(qualityInspectionTemplates.archivedAt),
      ),
    )
    .limit(1);
  if (!template) return null;
  const items = await db
    .select()
    .from(qualityInspectionTemplateItems)
    .where(
      and(
        eq(qualityInspectionTemplateItems.organizationId, organizationId),
        eq(qualityInspectionTemplateItems.templateId, templateId),
      ),
    )
    .orderBy(asc(qualityInspectionTemplateItems.sortOrder));
  return {
    id: template.id,
    projectId: template.projectId,
    name: template.name,
    category: template.category,
    description: template.description,
    items: items.map((item) => ({ id: item.id, label: item.label, isRequired: item.isRequired })),
  };
}

export async function insertCustomTemplate(
  db: DbExecutor,
  template: typeof qualityInspectionTemplates.$inferInsert,
  items: readonly { readonly label: string; readonly isRequired: boolean }[],
): Promise<void> {
  await db.insert(qualityInspectionTemplates).values(template);
  if (items.length > 0) {
    await db.insert(qualityInspectionTemplateItems).values(
      items.map((item, index) => ({
        organizationId: template.organizationId,
        templateId: template.id!,
        sortOrder: index,
        label: item.label,
        isRequired: item.isRequired,
      })),
    );
  }
}

export async function archiveCustomTemplate(
  db: DbExecutor,
  organizationId: string,
  templateId: string,
): Promise<boolean> {
  const rows = await db
    .update(qualityInspectionTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(qualityInspectionTemplates.organizationId, organizationId),
        eq(qualityInspectionTemplates.id, templateId),
        isNull(qualityInspectionTemplates.archivedAt),
      ),
    )
    .returning({ id: qualityInspectionTemplates.id });
  return rows.length > 0;
}
