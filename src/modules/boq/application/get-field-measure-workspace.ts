import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates/dates';
import { toFieldMeasureItems, type FieldMeasureItemDto } from '../domain/field-measure';
import { canRecordProgress } from '../domain/lifecycle';
import { findActiveBoqForProject, findProjectInOrganization } from '../data/boq.repository';
import { getProjectBoqWorkspace } from './manage-boq';
import { listBoqProgress } from './manage-progress';

export type FieldMeasureWorkspace = {
  readonly projectId: string;
  readonly projectName: string;
  readonly workKind: string;
  readonly boq: {
    readonly id: string;
    readonly status: string;
    readonly title: string | null;
  } | null;
  readonly items: readonly FieldMeasureItemDto[];
  readonly canSubmit: boolean;
  readonly canApproveProgress: boolean;
  readonly defaultPeriodLabel: string;
};

export async function getFieldMeasureWorkspace(
  context: OrgContext,
  projectId: string,
): Promise<FieldMeasureWorkspace> {
  assertPermission(context, PERMISSIONS.BOQ_READ);
  const workspace = await getProjectBoqWorkspace(context, projectId);
  const boq = workspace.activeBoq;
  const progress = boq
    ? await listBoqProgress(context, boq.id)
    : { batches: [] as Awaited<ReturnType<typeof listBoqProgress>>['batches'] };

  const items = toFieldMeasureItems(
    workspace.nodes.map((node) => ({
      id: node.id,
      parentId: node.parentId,
      nodeKind: node.nodeKind,
      itemCode: node.itemCode,
      description: node.description,
      unit: node.unit,
      status: node.status,
      sortOrder: node.sortOrder,
      currentQuantity: node.currentQuantity,
      openingApprovedQuantity: node.openingApprovedQuantity,
      openingBilledQuantity: node.openingBilledQuantity,
    })),
    progress.batches.map(({ batch, lines }) => ({
      status: batch.status,
      lines: lines.map((line) => ({
        boqNodeId: line.boqNodeId,
        measuredQuantity: line.measuredQuantity,
        approvedQuantity: line.approvedQuantity,
      })),
    })),
  );

  const canSubmit =
    hasPermission(context, PERMISSIONS.BOQ_PROGRESS_SUBMIT) &&
    Boolean(boq && canRecordProgress(boq.status as 'draft' | 'active' | 'superseded' | 'archived'));

  return {
    projectId: workspace.project.id,
    projectName: workspace.project.name,
    workKind: workspace.project.workKind,
    boq: boq
      ? {
          id: boq.id,
          status: boq.status,
          title: boq.title,
        }
      : null,
    items,
    canSubmit,
    canApproveProgress: hasPermission(context, PERMISSIONS.BOQ_PROGRESS_APPROVE),
    defaultPeriodLabel: todayInTimeZone(context.organization.timezone),
  };
}

/** Cheap entry check - submitters only, and only when an active BOQ exists. */
export async function getFieldMeasureEntry(
  context: OrgContext,
  projectId: string,
): Promise<{ readonly href: string } | null> {
  if (!hasPermission(context, PERMISSIONS.BOQ_READ)) return null;
  if (!hasPermission(context, PERMISSIONS.BOQ_PROGRESS_SUBMIT)) return null;
  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) return null;
  const boq = await findActiveBoqForProject(context.db, context.organizationId, projectId);
  if (!boq) return null;
  return { href: `/projects/${projectId}/boq-measure` };
}
