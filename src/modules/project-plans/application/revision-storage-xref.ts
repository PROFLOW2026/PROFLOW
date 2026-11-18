import 'server-only';

import { uuid } from './shared';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ExternalContext } from '@/shared/external';
import { findDrawing, findRevision, findVisibleRevision } from '../data/plans.repository';
import { assertProjectCapability, PROJECT_CAPABILITIES } from '@/modules/project-team';
import { resolveStorageXrefPathAsync } from '@/modules/external-storage/application/resolve-storage-xref';
import {
  resolveStorageXrefsBatch,
  type XrefBatchItem,
} from '@/modules/external-storage/application/resolve-storage-xrefs-batch';
import { xrefHostFromRevision } from '@/modules/external-storage/application/xref-storage-host';
import { xrefOutcomeToApi, type XrefResolveApiBody } from '@/modules/external-storage/domain/xref-resolve-response';
import { storedDrawingVisibleToContractor } from './drawing-visibility';
import { requireExternalProjectCapability } from './shared';
import { createContractorXrefFileGate } from './contractor-xref-gate';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';

const X = EXTERNAL_CAPABILITIES;

async function assertInternalRevisionAccess(
  context: OrgContext,
  revisionId: string,
): Promise<{ projectId: string }> {
  const revision = await findRevision(context.db, context.organizationId, uuid.parse(revisionId));
  if (!revision?.fileReady) throw new NotFoundError('Revision');
  if (revision.status === 'draft') {
    assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);
  } else {
    await assertProjectCapability(context, revision.projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  }
  return { projectId: revision.projectId };
}

export async function resolveInternalDrawingRevisionStorageXref(
  context: OrgContext,
  input: { revisionId: string; xrefPath: string; anchorPath?: string | null; xrefName?: string },
): Promise<XrefResolveApiBody> {
  await assertInternalRevisionAccess(context, input.revisionId);
  const host = await xrefHostFromRevision(context.db, context.organizationId, input.revisionId);
  if (!host) return { status: 'missing', reason: 'not_found' };
  const outcome = await resolveStorageXrefPathAsync({
    adapter: host.adapter,
    accessToken: host.accessToken,
    startFolderId: host.startFolderId,
    rootFolderId: host.rootFolderId,
    xrefName: input.xrefName ?? input.xrefPath,
    savedPath: input.xrefPath,
    anchorPath: input.anchorPath,
  });
  return xrefOutcomeToApi(outcome, outcome.status === 'found' ? outcome.folderId : undefined);
}

export async function resolveInternalDrawingRevisionStorageXrefs(
  context: OrgContext,
  input: { revisionId: string; items: readonly XrefBatchItem[] },
): Promise<Record<string, XrefResolveApiBody>> {
  await assertInternalRevisionAccess(context, input.revisionId);
  const host = await xrefHostFromRevision(context.db, context.organizationId, input.revisionId);
  if (!host) return {};
  return resolveStorageXrefsBatch({
    adapter: host.adapter,
    accessToken: host.accessToken,
    startFolderId: host.startFolderId,
    rootFolderId: host.rootFolderId,
    items: input.items,
  });
}

export async function resolveExternalDrawingRevisionStorageXref(
  context: ExternalContext,
  input: { revisionId: string; xrefPath: string; anchorPath?: string | null; xrefName?: string },
): Promise<XrefResolveApiBody> {
  const revision = await asServiceRoleWrite(context.db, () =>
    findVisibleRevision(context.db, uuid.parse(input.revisionId)),
  );
  if (!revision?.fileReady || (revision.status !== 'current' && revision.status !== 'superseded')) {
    return { status: 'missing', reason: 'not_found' };
  }
  const drawing = await asServiceRoleWrite(context.db, () =>
    findDrawing(context.db, revision.organizationId, revision.drawingId),
  );
  if (!drawing || !(await storedDrawingVisibleToContractor(context, context.db, drawing))) {
    return { status: 'missing', reason: 'not_found' };
  }
  requireExternalProjectCapability(
    context,
    { organizationId: revision.organizationId, projectId: revision.projectId },
    X.PLAN_VIEW,
  );
  const host = await xrefHostFromRevision(context.db, revision.organizationId, input.revisionId);
  if (!host) return { status: 'missing', reason: 'not_found' };
  const gate = await createContractorXrefFileGate({
    context,
    db: context.db,
    organizationId: revision.organizationId,
    projectId: revision.projectId,
    connectionId: host.connectionId,
  });
  const outcome = await resolveStorageXrefPathAsync({
    adapter: host.adapter,
    accessToken: host.accessToken,
    startFolderId: host.startFolderId,
    rootFolderId: host.rootFolderId,
    xrefName: input.xrefName ?? input.xrefPath,
    savedPath: input.xrefPath,
    anchorPath: input.anchorPath,
    gate,
  });
  return xrefOutcomeToApi(outcome, outcome.status === 'found' ? outcome.folderId : undefined);
}