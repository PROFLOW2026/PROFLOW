import { loadQualityFormData, type QualityFormData } from '@/modules/defects/application/query-defects';
import {
  assertProjectCapability,
  loadProjectCapabilities,
  PROJECT_CAPABILITIES,
} from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  countInspectionsByState,
  findInspectionRow,
  listCustomTemplates,
  listInspectionRows,
  loadInspectionDetail,
} from '../data/inspections.repository';
import { INSPECTION_CATALOG } from '../domain/catalog';
import { canEditChecklist, canPerformInspectionAction } from '../domain/rules';
import type {
  CustomTemplateView,
  InspectionDetail,
  InspectionListFilters,
  InspectionListPage,
  InspectionTemplateOption,
} from '../domain/types';

const C = PROJECT_CAPABILITIES;

export interface InspectionPermissions {
  readonly manage: boolean;
  readonly manageOrgTemplates: boolean;
}

export async function getInspectionPermissions(
  context: OrgContext,
  projectId: string,
): Promise<InspectionPermissions> {
  const held = await loadProjectCapabilities(context, projectId);
  return {
    manage: held.has(C.QUALITY_MANAGE),
    manageOrgTemplates: hasPermission(context, PERMISSIONS.PROJECT_TEAM_ADMIN),
  };
}

export async function listProjectInspections(
  context: OrgContext,
  projectId: string,
  filters: InspectionListFilters = {},
): Promise<InspectionListPage> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  return listInspectionRows(context.db, context.organizationId, projectId, filters);
}

export async function countProjectInspections(context: OrgContext, projectId: string) {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  return countInspectionsByState(context.db, context.organizationId, projectId);
}

export interface InspectionDetailView {
  readonly inspection: InspectionDetail;
  readonly permissions: InspectionPermissions;
  readonly can: {
    readonly edit: boolean;
    readonly editChecklist: boolean;
    readonly start: boolean;
    readonly recordOutcome: boolean;
    readonly reinspect: boolean;
    readonly cancel: boolean;
  };
}

export async function getInspectionDetail(
  context: OrgContext,
  projectId: string,
  inspectionId: string,
): Promise<InspectionDetailView> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const row = await findInspectionRow(context.db, context.organizationId, inspectionId);
  if (!row || row.projectId !== projectId) throw new NotFoundError('inspection');
  const permissions = await getInspectionPermissions(context, projectId);
  const manage = permissions.manage;
  return {
    inspection: await loadInspectionDetail(context.db, row),
    permissions,
    can: {
      edit: manage && canPerformInspectionAction('edit', row.status, row.outcome),
      editChecklist: manage && canEditChecklist(row.status),
      start: manage && canPerformInspectionAction('start', row.status, row.outcome),
      recordOutcome: manage && canPerformInspectionAction('record_outcome', row.status, row.outcome),
      reinspect: manage && canPerformInspectionAction('reinspect', row.status, row.outcome),
      cancel: manage && canPerformInspectionAction('cancel', row.status, row.outcome),
    },
  };
}

export async function listInspectionTemplateOptions(
  context: OrgContext,
  projectId: string,
): Promise<{ options: readonly InspectionTemplateOption[]; custom: readonly CustomTemplateView[] }> {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const custom = await listCustomTemplates(context.db, context.organizationId, projectId);
  const options: InspectionTemplateOption[] = [
    ...INSPECTION_CATALOG.map((template) => ({
      ref: `catalog:${template.key}`,
      kind: 'catalog' as const,
      key: template.key,
      name: template.name,
      category: template.category,
      itemCount: template.items.length,
      projectScoped: false,
    })),
    ...custom.map((template) => ({
      ref: `custom:${template.id}`,
      kind: 'custom' as const,
      key: template.id,
      name: template.name,
      category: template.category,
      itemCount: template.items.length,
      projectScoped: template.projectId !== null,
    })),
  ];
  return { options, custom };
}

export type InspectionFormData = QualityFormData;

/** Option lists for create/edit forms (operational only, no money). */
export async function loadInspectionFormData(context: OrgContext, projectId: string): Promise<InspectionFormData> {
  return loadQualityFormData(context, projectId);
}
