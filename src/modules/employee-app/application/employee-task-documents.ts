import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findDocumentById,
  findDocumentLinkById,
  listDocumentsForEntity,
} from '@/modules/documents';
import { linkDocumentToEntity, unlinkDocumentFromEntity } from '@/modules/documents/application/link-document';
import { isStorageConfigured } from '@/modules/documents/application/upload-document';
import { canReadCompensationDocuments } from '@/modules/documents/application/document-visibility';
import type { DocumentLinkCandidate, DocumentListItem } from '@/modules/documents/domain/types';
import type { EntityDocumentPanelData } from '@/modules/documents/application/entity-document-panel';
import { hasPermission } from '@/shared/permissions/assert';
import {
  linkProviderFileToTask,
  type ProviderFileLinkInput,
} from '@/modules/tasks/application/task-provider-file-link';
import { recordTaskAttachmentEvent } from '@/modules/tasks';
import {
  employeeHasPermission,
  employeePermissionScope,
} from './load-employee-app-context';
import {
  assertCanReadDocumentForEmployee,
  canEmployeeReadDocumentCategory,
} from './document-access';
import { assertEmployeeProjectScope } from './project-scope';
import { assertEmployeePmTaskReadAccess } from './employee-pm-tasks';
import { listEmployeeProjectDocuments } from './employee-project-documents';

export type EmployeeTaskDocumentPanelData = EntityDocumentPanelData;

async function filterEmployeeReadableTaskDocuments(
  context: OrgContext,
  taskProjectId: string | null,
  rows: readonly DocumentListItem[],
): Promise<DocumentListItem[]> {
  const visible: DocumentListItem[] = [];
  for (const doc of rows) {
    try {
      await assertCanReadDocumentForEmployee(context, {
        documentId: doc.id,
        category: doc.category,
        privacyClass: doc.privacyClass,
        projectIds: taskProjectId ? [taskProjectId] : undefined,
      });
      if (!canEmployeeReadDocumentCategory(context, doc.category)) continue;
      visible.push(doc);
    } catch {
      // skip unreadable attachments
    }
  }
  return visible;
}

/** Task attachment panel for Employee App (tasks.read + documents.read + project scope). */
export async function getEmployeeTaskDocumentPanelData(
  context: OrgContext,
  taskId: string,
): Promise<EmployeeTaskDocumentPanelData> {
  const task = await assertEmployeePmTaskReadAccess(context, taskId);
  const canRead = employeeHasPermission(context, PERMISSIONS.DOCUMENTS_READ);
  const canManage = employeeHasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  if (!canRead) {
    const storageConfigured = await isStorageConfigured(context);
    return {
      documents: [],
      linkCandidates: [],
      canRead: false,
      canManage: false,
      storageConfigured,
      canClassifyCompensation: canReadCompensationDocuments(context),
      projectId: task.projectId,
      canBrowseCloudFiles: false,
    };
  }

  const rawDocuments = await listDocumentsForEntity(context.db, context.organizationId, {
    ownerType: 'task',
    ownerId: taskId,
  });
  const documents = await filterEmployeeReadableTaskDocuments(context, task.projectId, rawDocuments);
  const attachedIds = new Set(documents.map((document) => document.id));

  let linkCandidates: DocumentLinkCandidate[] = [];
  let canManageProjectDocs = false;
  if (canManage && task.projectId) {
    const manageScope = employeePermissionScope(context, PERMISSIONS.DOCUMENTS_MANAGE);
    canManageProjectDocs =
      manageScope === 'all_organization' ||
      (await assertEmployeeProjectScope(context, PERMISSIONS.DOCUMENTS_MANAGE, task.projectId)
        .then(() => true)
        .catch(() => false));

    if (canManageProjectDocs) {
      const projectDocs = await listEmployeeProjectDocuments(context, task.projectId);
      linkCandidates = projectDocs
        .filter((document) => document.status === 'available' && !attachedIds.has(document.id))
        .map((document) => ({
          id: document.id,
          originalFilename: document.originalFilename,
        }));
    }
  }

  const storageConfigured = await isStorageConfigured(context);

  return {
    documents,
    linkCandidates,
    canRead,
    canManage,
    storageConfigured,
    canClassifyCompensation: canReadCompensationDocuments(context),
    projectId: task.projectId,
    canBrowseCloudFiles:
      canManage && Boolean(task.projectId) && storageConfigured && canManageProjectDocs,
  };
}

export async function linkDocumentToEmployeeTask(
  context: OrgContext,
  taskId: string,
  documentId: string,
  options: { label?: string | null; privacyClass?: 'standard' | 'compensation' | null } = {},
) {
  const task = await assertEmployeePmTaskReadAccess(context, taskId);
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) {
    throw new NotFoundError('Document');
  }
  if (task.projectId) {
    await assertEmployeeProjectScope(context, PERMISSIONS.DOCUMENTS_MANAGE, task.projectId);
  }
  return linkDocumentToEntity(context, {
    documentId,
    ownerType: 'task',
    ownerId: taskId,
    label: options.label ?? null,
    ...(options.privacyClass ? { privacyClass: options.privacyClass } : {}),
  });
}

export async function unlinkDocumentFromEmployeeTask(
  context: OrgContext,
  taskId: string,
  linkId: string,
): Promise<void> {
  await assertEmployeePmTaskReadAccess(context, taskId);
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) {
    throw new NotFoundError('Document link');
  }

  const link = await findDocumentLinkById(context.db, context.organizationId, linkId);
  if (!link || link.ownerType !== 'task' || link.ownerId !== taskId) {
    throw new NotFoundError('Document link');
  }

  const document = await findDocumentById(context.db, context.organizationId, link.documentId);
  await unlinkDocumentFromEntity(context, { linkId });

  await recordTaskAttachmentEvent(context, taskId, 'attachment_removed', {
    documentId: link.documentId,
    linkId,
    filename: document?.originalFilename ?? null,
  });
}

export async function linkProviderFileToEmployeeTask(
  context: OrgContext,
  taskId: string,
  input: ProviderFileLinkInput,
) {
  const task = await assertEmployeePmTaskReadAccess(context, taskId);
  if (!employeeHasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) {
    throw new NotFoundError('Document');
  }
  if (task.projectId) {
    await assertEmployeeProjectScope(context, PERMISSIONS.DOCUMENTS_MANAGE, task.projectId);
  }
  if (!task.projectId || task.projectId !== input.projectId) {
    throw new NotFoundError('Project');
  }
  return linkProviderFileToTask(context, taskId, input);
}

export async function recordEmployeeTaskAttachmentAdded(
  context: OrgContext,
  taskId: string,
  documentId: string,
): Promise<void> {
  await assertEmployeePmTaskReadAccess(context, taskId);
  if (!hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) {
    throw new ValidationError([{ path: 'permission', message: 'documents.manage required' }]);
  }

  const link = (
    await listDocumentsForEntity(context.db, context.organizationId, {
      ownerType: 'task',
      ownerId: taskId,
    })
  ).find((row) => row.id === documentId);

  if (!link?.linkId) {
    throw new NotFoundError('Document link');
  }

  const document = await findDocumentById(context.db, context.organizationId, documentId);

  await recordTaskAttachmentEvent(context, taskId, 'attachment_added', {
    documentId,
    linkId: link.linkId,
    filename: document?.originalFilename ?? null,
  });
}
