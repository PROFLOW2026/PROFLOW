import { and, eq } from 'drizzle-orm';
import { subcontractAgreements } from '@drizzle/schema';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent, writeAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { NotFoundError, ValidationError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES as X,
  requireExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { recordExternalAudit } from '@/modules/contractor-compliance';
import { findAgreementScope } from '@/modules/contractor-compliance';
import { PROJECT_CAPABILITIES as C, assertProjectCapability, hasProjectCapability } from '@/modules/project-team';
import { assertCloseoutCompleteness, DEFAULT_CLOSEOUT_CHECKLIST } from '../domain/checklist';
import {
  findCloseoutForAgreement,
  insertChecklistItem,
  insertCloseout,
  insertWarrantyReport,
  linkWarrantyReportToDefect,
  listChecklistItems,
  listProjectCloseouts,
  listWarrantyReports,
  updateChecklistItem,
  updateCloseout,
} from '../data/closeout.repository';
import {
  closeAgreementSchema,
  ensureCloseoutSchema,
  submitHandoverItemSchema,
  warrantyReportSchema,
  type CloseAgreementInput,
  type EnsureCloseoutInput,
  type SubmitHandoverItemInput,
  type WarrantyReportInput,
} from '../validation/schemas';

export const AGREEMENT_CLOSEOUT_ENTITY = 'agreement_closeout' as const;
export const WARRANTY_REPORT_ENTITY = 'contractor_warranty_report' as const;

function parse<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false } }, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ValidationError([]);
  return result.data;
}

export async function listProjectAgreementCloseouts(context: OrgContext, projectId: string) {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  return listProjectCloseouts(context.db, context.organizationId, projectId);
}

export async function ensureAgreementCloseout(context: OrgContext, raw: EnsureCloseoutInput) {
  const input = parse(ensureCloseoutSchema, raw);
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const scope = await findAgreementScope(context.db, context.organizationId, input.agreementId);
  if (!scope || scope.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  const existing = await findCloseoutForAgreement(context.db, context.organizationId, input.agreementId);
  if (existing) return { closeoutId: existing.id };
  const closeoutId = await withTransaction(context.db, async (tx) => {
    const id = await insertCloseout(tx, {
      organizationId: context.organizationId,
      projectId: scope.projectId,
      vendorId: scope.vendorId,
      subcontractAgreementId: input.agreementId,
      status: 'open',
    });
    for (const item of DEFAULT_CLOSEOUT_CHECKLIST) {
      await insertChecklistItem(tx, {
        organizationId: context.organizationId,
        projectId: scope.projectId,
        closeoutId: id,
        itemKind: item.itemKind,
        title: item.title,
        isRequired: item.isRequired,
        sortOrder: item.sortOrder,
        status: 'pending',
      });
    }
    return id;
  });
  return { closeoutId };
}

export async function closeAgreementWithChecklist(context: OrgContext, raw: CloseAgreementInput) {
  const input = parse(closeAgreementSchema, raw);
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const closeout = await findCloseoutForAgreement(context.db, context.organizationId, input.agreementId);
  if (!closeout || closeout.projectId !== input.projectId) throw new NotFoundError('Agreement closeout');
  const items = await listChecklistItems(context.db, context.organizationId, closeout.id);
  assertCloseoutCompleteness(items, input.overrideReason);
  const override = input.overrideReason?.trim();
  await withTransaction(context.db, async (tx) => {
    await updateCloseout(tx, context.organizationId, closeout.id, {
      status: 'closed',
      closedAt: new Date(),
      closedByUserId: context.userId,
      closeOverrideReason: override || null,
      closeOverrideByUserId: override ? context.userId : null,
      closeOverrideAt: override ? new Date() : null,
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: DOMAIN_EVENTS.CLOSEOUT_AGREEMENT_CLOSED,
      entityType: AGREEMENT_CLOSEOUT_ENTITY,
      entityId: closeout.id,
      actor: internalActor(context.userId),
      payload: { agreementId: input.agreementId, overridden: Boolean(override) },
    });
    await writeAuditEvent(tx, {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action: AUDIT_ACTIONS.AGREEMENT_CLOSEOUT_CLOSED,
      entityType: AGREEMENT_CLOSEOUT_ENTITY,
      entityId: closeout.id,
      metadata: { agreementId: input.agreementId, override: override ?? null },
    });
  });
}

export async function getPortalHandover(context: ExternalContext, input: { readonly organizationId: string; readonly projectId: string }) {
  const grant = context.grants.find(
    (g) =>
      g.organizationId === input.organizationId &&
      g.capabilities.has(X.HANDOVER_SUBMIT) &&
      (!g.projectId || g.projectId === input.projectId),
  );
  if (!grant) return { closeouts: [] as const };
  requireExternalScope(
    context,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: grant.vendorId,
      subcontractAgreementId: grant.subcontractAgreementId,
    },
    X.HANDOVER_SUBMIT,
  );
  const rows = await listProjectCloseouts(context.db, input.organizationId, input.projectId);
  const visible = rows.filter((row) => row.vendorId === grant.vendorId);
  const enriched = [];
  for (const row of visible) {
    const items = await listChecklistItems(context.db, input.organizationId, row.id);
    enriched.push({ closeout: row, items });
  }
  return { closeouts: enriched };
}

export async function submitHandoverChecklistItem(context: ExternalContext, raw: SubmitHandoverItemInput) {
  const input = parse(submitHandoverItemSchema, raw);
  const grant = requireExternalScope(
    context,
    {
      organizationId: input.organizationId,
      projectId: input.projectId,
      vendorId: input.vendorId,
      subcontractAgreementId: input.agreementId,
    },
    X.HANDOVER_SUBMIT,
  );
  if (grant.vendorId !== input.vendorId) throw new NotFoundError('Checklist item');
  const closeout = await findCloseoutForAgreement(context.db, input.organizationId, input.agreementId);
  if (!closeout) throw new NotFoundError('Agreement closeout');
  const items = await listChecklistItems(context.db, input.organizationId, closeout.id);
  const item = items.find((row) => row.id === input.itemId);
  if (!item) throw new NotFoundError('Checklist item');
  await updateChecklistItem(context.db, input.organizationId, item.id, {
    status: 'submitted',
    notes: input.notes ?? item.notes,
    completedAt: new Date(),
    completedActorType: 'external',
    completedByPrincipalId: context.principalId,
  });
  await recordExternalAudit(context.db, {
    organizationId: input.organizationId,
    principalId: context.principalId,
    action: AUDIT_ACTIONS.HANDOVER_ITEM_SUBMITTED,
    entityType: AGREEMENT_CLOSEOUT_ENTITY,
    entityId: closeout.id,
    after: { itemId: item.id },
  });
}

export async function listProjectWarrantyReports(context: OrgContext, projectId: string) {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  return listWarrantyReports(context.db, context.organizationId, projectId);
}

export async function reportWarrantyIssue(context: OrgContext, raw: WarrantyReportInput) {
  const input = parse(warrantyReportSchema, raw);
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const scope = await findAgreementScope(context.db, context.organizationId, input.agreementId);
  if (!scope || scope.projectId !== input.projectId) throw new NotFoundError('Subcontract agreement');
  const reportId = await insertWarrantyReport(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    vendorId: scope.vendorId,
    subcontractAgreementId: input.agreementId,
    warrantyCoverageId: input.warrantyCoverageId ?? null,
    title: input.title,
    notes: input.notes ?? null,
    reportedActorType: 'internal',
    reportedByUserId: context.userId,
    retentionFlag: input.retentionFlag ?? false,
    guaranteeFlag: input.guaranteeFlag ?? false,
  });
  if (input.defectId) {
    await linkWarrantyReportToDefect(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      reportId,
      defectId: input.defectId,
      createdByUserId: context.userId,
    });
  }
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    type: DOMAIN_EVENTS.WARRANTY_CLAIM_REPORTED,
    entityType: WARRANTY_REPORT_ENTITY,
    entityId: reportId,
    actor: internalActor(context.userId),
    payload: { agreementId: input.agreementId, defectLinked: Boolean(input.defectId) },
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.WARRANTY_ISSUE_REPORTED,
    entityType: WARRANTY_REPORT_ENTITY,
    entityId: reportId,
  });
  return { reportId };
}

export async function listAgreementOptions(context: OrgContext, projectId: string) {
  await assertProjectCapability(context, projectId, C.PROJECT_VIEW);
  const rows = await context.db
    .select({
      id: subcontractAgreements.id,
      title: subcontractAgreements.title,
      vendorId: subcontractAgreements.vendorId,
    })
    .from(subcontractAgreements)
    .where(
      and(
        eq(subcontractAgreements.organizationId, context.organizationId),
        eq(subcontractAgreements.projectId, projectId),
      ),
    );
  return rows;
}

export async function canManageCloseout(context: OrgContext, projectId: string): Promise<boolean> {
  return hasProjectCapability(context, projectId, C.CONTRACTOR_COORDINATE);
}
