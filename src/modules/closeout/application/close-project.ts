import { sql } from 'drizzle-orm';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb, withTransaction } from '@/shared/db';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { hasPermission, assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject, findProjectById } from '@/modules/projects';
import { collectCloseoutReadiness } from './collect-readiness';
import { parseOrThrow } from './parse';
import {
  assertCanClose,
  assertCanMarkReady,
  assertCanReopen,
  assertCloseoutEligibleWorkKind,
  assertReasonRequired,
  CLOSEOUT_ERROR_NOT_CLOSED,
} from '../domain/close-rules';
import { buildCloseoutFinancialSnapshot } from '../domain/snapshot';
import { findCloseoutByProject } from '../data/closeout.repository';
import {
  closeProjectSchema,
  markCloseoutReadySchema,
  reopenProjectSchema,
  startCloseoutSchema,
  type CloseProjectInput,
  type MarkCloseoutReadyInput,
  type ReopenProjectInput,
  type StartCloseoutInput,
} from '../validation/schemas';

async function loadProject(context: OrgContext, projectId: string) {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');
  await assertCanAccessProject(context, projectId);
  return project;
}

export async function startCloseout(context: OrgContext, raw: StartCloseoutInput) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(startCloseoutSchema.safeParse(raw));
  const project = await loadProject(context, input.projectId);
  assertCloseoutEligibleWorkKind(project.workKind);

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    await tx.execute(sql`
      SELECT app.start_project_closeout(
        ${context.organizationId}::uuid,
        ${project.id}::uuid
      )
    `);
    const closeout = await findCloseoutByProject(tx, context.organizationId, project.id);
    if (!closeout) throw new NotFoundError('Closeout');
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.CLOSEOUT_STARTED,
      entityType: 'project_closeout',
      entityId: closeout.id,
      after: { projectId: project.id, status: closeout.status },
    });
    return closeout;
  });
}

export async function markCloseoutReady(context: OrgContext, raw: MarkCloseoutReadyInput) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(markCloseoutReadySchema.safeParse(raw));
  const project = await loadProject(context, input.projectId);
  const collected = await collectCloseoutReadiness(context, project.id);
  const existing = await findCloseoutByProject(context.db, context.organizationId, project.id);
  assertCanMarkReady({
    workKind: project.workKind,
    projectStatus: project.status,
    closeoutStatus: existing?.status ?? null,
    items: collected.items,
  });

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    await tx.execute(sql`
      SELECT app.mark_project_closeout_ready(
        ${context.organizationId}::uuid,
        ${project.id}::uuid
      )
    `);
    const closeout = await findCloseoutByProject(tx, context.organizationId, project.id);
    if (!closeout) throw new NotFoundError('Closeout');
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.CLOSEOUT_MARKED_READY,
      entityType: 'project_closeout',
      entityId: closeout.id,
      after: { projectId: project.id, status: 'ready' },
    });
    return closeout;
  });
}

export async function closeProject(context: OrgContext, raw: CloseProjectInput) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(closeProjectSchema.safeParse(raw));
  const reason = assertReasonRequired(input.reason);
  const project = await loadProject(context, input.projectId);
  const collected = await collectCloseoutReadiness(context, project.id);
  const existing = await findCloseoutByProject(context.db, context.organizationId, project.id);
  assertCanClose({
    workKind: project.workKind,
    projectStatus: project.status,
    closeoutStatus: existing?.status ?? null,
    items: collected.items,
  });

  const snapshot = collected.financials
    ? buildCloseoutFinancialSnapshot(collected.financials, {
        canReadProfit: hasPermission(context, PERMISSIONS.PROJECT_PROFIT_READ),
        retentionHeld: collected.retentionHeld,
      })
    : { capturedAt: new Date().toISOString(), unavailable: true };

  await getAdminDb().execute(sql`
    SELECT app.close_project_via_closeout(
      ${context.organizationId}::uuid,
      ${project.id}::uuid,
      ${reason},
      ${JSON.stringify(snapshot)}::jsonb,
      ${context.userId}::uuid
    )
  `);
  const closeout = await findCloseoutByProject(context.db, context.organizationId, project.id);
  if (!closeout) throw new NotFoundError('Closeout');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CLOSEOUT_CLOSED,
    entityType: 'project_closeout',
    entityId: closeout.id,
    after: {
      projectId: project.id,
      status: 'closed',
      projectStatus: 'completed',
      reason,
    },
  });

  const { captureBrandSnapshot } = await import('@/modules/branding');
  await captureBrandSnapshot(context, {
    entityType: 'closeout',
    entityId: closeout.id,
    projectId: project.id,
  });

  return closeout;
}

export async function reopenProject(context: OrgContext, raw: ReopenProjectInput) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  const input = parseOrThrow(reopenProjectSchema.safeParse(raw));
  const reason = assertReasonRequired(input.reason);
  const project = await loadProject(context, input.projectId);
  const existing = await findCloseoutByProject(context.db, context.organizationId, project.id);
  assertCanReopen({
    projectStatus: project.status,
    closeoutStatus: existing?.status ?? null,
  });

  if (!existing) {
    throw new DomainRuleError('This project is not closed', CLOSEOUT_ERROR_NOT_CLOSED);
  }

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    await tx.execute(sql`
      SELECT app.reopen_project_via_closeout(
        ${context.organizationId}::uuid,
        ${project.id}::uuid,
        ${reason}
      )
    `);
    const closeout = await findCloseoutByProject(tx, context.organizationId, project.id);
    if (!closeout) throw new NotFoundError('Closeout');
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.CLOSEOUT_REOPENED,
      entityType: 'project_closeout',
      entityId: closeout.id,
      after: {
        projectId: project.id,
        status: 'reopened',
        projectStatus: 'active',
        reason,
      },
    });
    return closeout;
  });
}
