import { and, eq } from 'drizzle-orm';
import { contracts, entityLinks } from '@drizzle/schema';
import { internalActor } from '@/shared/actor';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent, type DomainEventType } from '@/shared/domain-events';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import {
  findAgreementFinancial,
  findVendorForAgreement,
  findWorkPackageInProject,
  insertAgreement,
  insertValueEvent,
  listAgreementValueEvents,
  listProjectWorkPackageOptions,
  listSubcontractorVendorOptions,
  lockAgreement,
  updateAgreementRow,
  upsertAgreementProfile,
  upsertFinancialTerms,
} from '../data/agreements.repository';
import { countOpenChanges } from '../data/changes.repository';
import { countOpenUnpricedWork } from '../data/unpriced-work.repository';
import { listWorkLinePrices, listWorkLinesOperational } from '../data/work-lines.repository';
import {
  assertAgreementAction,
  assertAgreementClosable,
  assertBaselineEditable,
  isBaselineEditable,
} from '../domain/lifecycle';
import type { AgreementLifecycleAction } from '../domain/types';
import { approvedContractValue, assertWeightedLinesComplete, sumLineAmounts } from '../domain/value';
import {
  agreementActionSchema,
  createDraftAgreementSchema,
  updateAgreementSchema,
  updateFinancialTermsSchema,
  type AgreementActionInput,
  type CreateDraftAgreementInput,
  type UpdateAgreementInput,
  type UpdateFinancialTermsInput,
} from '../validation/schemas';
import {
  isUniqueViolation,
  loadAgreementWithAccess,
  loadSubcontractAccess,
  parseOrThrow,
  requireAccess,
} from './access';

const E = DOMAIN_EVENTS;

const ACTION_EVENT: Readonly<Record<AgreementLifecycleAction, DomainEventType>> = {
  activate: E.SUBCONTRACT_AGREEMENT_ACTIVATED,
  suspend: E.SUBCONTRACT_AGREEMENT_SUSPENDED,
  resume: E.SUBCONTRACT_AGREEMENT_RESUMED,
  complete: E.SUBCONTRACT_AGREEMENT_COMPLETED,
  close: E.SUBCONTRACT_AGREEMENT_CLOSED,
  cancel: E.SUBCONTRACT_AGREEMENT_CANCELLED,
};

async function assertParentContractInProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  parentContractId: string | null | undefined,
): Promise<void> {
  if (!parentContractId) return;
  const [row] = await db
    .select({ projectId: contracts.projectId })
    .from(contracts)
    .where(and(eq(contracts.organizationId, organizationId), eq(contracts.id, parentContractId)))
    .limit(1);
  // Not readable (no contracts.read) -> the composite same-org FK still guards tenancy.
  if (row && row.projectId !== projectId) {
    throw new ValidationError([{ path: 'parentContractId', message: 'subcontracts.validation.parentContractProject' }]);
  }
}

async function assertWorkPackage(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  workPackageId: string | null | undefined,
): Promise<void> {
  if (!workPackageId) return;
  if (!(await findWorkPackageInProject(db, organizationId, projectId, workPackageId))) {
    throw new ValidationError([{ path: 'workPackageId', message: 'subcontracts.validation.workPackageProject' }]);
  }
}

export interface CreatedDraftAgreement {
  readonly agreementId: string;
}

/**
 * Creates a DRAFT subcontract agreement on a project (requires `contract.manage` on that project).
 * Exported for Track Q (tender award). The original value is recorded as a value event only on
 * activation, when the baseline is locked.
 */
export async function createDraftAgreement(
  context: OrgContext,
  rawInput: CreateDraftAgreementInput,
): Promise<CreatedDraftAgreement> {
  const input = parseOrThrow(createDraftAgreementSchema.safeParse(rawInput));
  const access = await loadSubcontractAccess(context, input.projectId);
  requireAccess(access, 'canManageContract');

  const vendor = await findVendorForAgreement(context.db, context.organizationId, input.vendorId);
  if (vendor) {
    if (vendor.archivedAt) throw new NotFoundError('Vendor');
    if (vendor.type !== 'subcontractor' && vendor.type !== 'both') {
      throw new DomainRuleError(
        'Only subcontractor vendors can receive a subcontract agreement',
        'subcontracts.errors.vendorNotSubcontractor',
        { vendorType: vendor.type },
      );
    }
  }
  await assertWorkPackage(context.db, context.organizationId, input.projectId, input.workPackageId);
  await assertParentContractInProject(context.db, context.organizationId, input.projectId, input.parentContractId);

  const currency = context.organization.baseCurrency.toUpperCase();
  const original = money(input.originalAmount ?? '0', currency);

  const agreementId = await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    let id: string;
    try {
      id = await insertAgreement(tx, {
        organizationId: context.organizationId,
        subcontractNumber: input.subcontractNumber ?? null,
        vendorId: input.vendorId,
        projectId: input.projectId,
        parentContractId: input.parentContractId ?? null,
        title: input.title,
        status: 'draft',
        originalAmount: toNumericString(original),
        currency,
        retentionPercent: input.retentionPercent ?? null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        notes: input.notes ?? null,
        createdByUserId: context.userId,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Subcontract number already exists', 'subcontracts.errors.numberTaken');
      }
      if ((error as { code?: string }).code === '23503') throw new NotFoundError('Vendor');
      throw error;
    }

    await upsertAgreementProfile(tx, {
      agreementId: id,
      organizationId: context.organizationId,
      projectId: input.projectId,
      vendorId: input.vendorId,
      trade: input.trade ?? null,
      workPackageId: input.workPackageId ?? null,
      scopeSummary: input.scopeSummary ?? null,
      sourceEntityType: input.source?.type ?? null,
      sourceEntityId: input.source?.id ?? null,
      createdByUserId: context.userId,
    });
    await upsertFinancialTerms(tx, {
      agreementId: id,
      organizationId: context.organizationId,
      projectId: input.projectId,
      vendorId: input.vendorId,
      currency,
      retentionCapPercent: input.retentionCapPercent ?? null,
      retentionCapAmount: input.retentionCapAmount ?? null,
      advancePercent: input.advancePercent ?? null,
      advanceAmount: input.advanceAmount ?? null,
      advanceRecoveryMethod: input.advanceRecoveryMethod ?? 'none',
      advanceRecoveryPercent: input.advanceRecoveryPercent ?? null,
      vatTreatment: input.vatTreatment ?? 'standard',
      paymentTermsDays: input.paymentTermsDays ?? null,
      paymentTermsText: input.paymentTermsText ?? null,
    });

    if (input.source) {
      await tx
        .insert(entityLinks)
        .values({
          organizationId: context.organizationId,
          projectId: input.projectId,
          sourceType: input.source.type,
          sourceId: input.source.id,
          targetType: 'subcontract_agreement',
          targetId: id,
          relation: 'created',
          actorType: 'internal',
          actorUserId: context.userId,
        })
        .onConflictDoNothing();
    }

    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      type: E.SUBCONTRACT_AGREEMENT_CREATED,
      entityType: 'subcontract_agreement',
      entityId: id,
      actor: internalActor(context.userId),
      payload: { agreementId: id, vendorId: input.vendorId, status: 'draft', source: input.source?.type ?? null },
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_AGREEMENT_CREATED,
      entityType: 'subcontract_agreement',
      entityId: id,
      after: { id, projectId: input.projectId, vendorId: input.vendorId, title: input.title, status: 'draft' },
    });
    return id;
  });

  return { agreementId };
}

/** Header edit. Commercial identity (number, parent, dates) is frozen after activation. */
export async function updateAgreement(context: OrgContext, rawInput: UpdateAgreementInput): Promise<void> {
  const input = parseOrThrow(updateAgreementSchema.safeParse(rawInput));
  const { agreement, access } = await loadAgreementWithAccess(context, input.agreementId);
  requireAccess(access, 'canManageContract');
  if (agreement.status === 'closed' || agreement.status === 'cancelled') {
    throw new DomainRuleError('Closed or cancelled agreements cannot be edited', 'subcontracts.errors.notEditable');
  }
  const draft = isBaselineEditable(agreement.status);
  const touchesBaseline =
    input.subcontractNumber !== undefined ||
    input.parentContractId !== undefined ||
    input.startDate !== undefined ||
    input.endDate !== undefined;
  if (touchesBaseline && !draft) assertBaselineEditable(agreement.status);

  await assertWorkPackage(context.db, context.organizationId, agreement.projectId, input.workPackageId);
  await assertParentContractInProject(context.db, context.organizationId, agreement.projectId, input.parentContractId);

  await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    try {
      await updateAgreementRow(tx, context.organizationId, agreement.id, {
        title: input.title,
        subcontractNumber: input.subcontractNumber === undefined ? undefined : input.subcontractNumber,
        parentContractId: input.parentContractId === undefined ? undefined : input.parentContractId,
        startDate: input.startDate === undefined ? undefined : input.startDate,
        endDate: input.endDate === undefined ? undefined : input.endDate,
        notes: input.notes === undefined ? undefined : input.notes,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('Subcontract number already exists', 'subcontracts.errors.numberTaken');
      }
      throw error;
    }
    await upsertAgreementProfile(tx, {
      agreementId: agreement.id,
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      vendorId: agreement.vendorId,
      trade: input.trade === undefined ? agreement.trade : input.trade,
      workPackageId: input.workPackageId === undefined ? agreement.workPackageId : input.workPackageId,
      scopeSummary: input.scopeSummary === undefined ? agreement.scopeSummary : input.scopeSummary,
    });
    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: E.SUBCONTRACT_AGREEMENT_UPDATED,
      entityType: 'subcontract_agreement',
      entityId: agreement.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId },
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_AGREEMENT_UPDATED,
      entityType: 'subcontract_agreement',
      entityId: agreement.id,
      before: { title: agreement.title, trade: agreement.trade, endDate: agreement.endDate },
      after: { title: input.title, trade: input.trade, endDate: input.endDate },
    });
  });
}

/** Financial terms are part of the baseline: editable only while draft (contract.manage). */
export async function updateAgreementFinancialTerms(
  context: OrgContext,
  rawInput: UpdateFinancialTermsInput,
): Promise<void> {
  const input = parseOrThrow(updateFinancialTermsSchema.safeParse(rawInput));
  const { agreement, access } = await loadAgreementWithAccess(context, input.agreementId);
  requireAccess(access, 'canManageContract');
  assertBaselineEditable(agreement.status);

  await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const financial = await findAgreementFinancial(tx, context.organizationId, agreement.id);
    if (!financial) throw new NotFoundError('Subcontract agreement');
    const lines = await listWorkLinesOperational(tx, context.organizationId, agreement.id);
    if (input.originalAmount !== undefined && input.originalAmount !== null && lines.length > 0) {
      throw new DomainRuleError(
        'The agreement value is the total of its work lines',
        'subcontracts.errors.valueDerivedFromLines',
      );
    }
    await updateAgreementRow(
      tx,
      context.organizationId,
      agreement.id,
      {
        originalAmount:
          input.originalAmount === undefined || input.originalAmount === null
            ? undefined
            : toNumericString(money(input.originalAmount, financial.currency)),
        retentionPercent: input.retentionPercent === undefined ? undefined : input.retentionPercent,
      },
      ['draft'],
    );
    await upsertFinancialTerms(tx, {
      agreementId: agreement.id,
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      vendorId: agreement.vendorId,
      currency: financial.currency,
      retentionCapPercent: input.retentionCapPercent === undefined ? financial.retentionCapPercent : input.retentionCapPercent,
      retentionCapAmount: input.retentionCapAmount === undefined ? financial.retentionCapAmount : input.retentionCapAmount,
      advancePercent: input.advancePercent === undefined ? financial.advancePercent : input.advancePercent,
      advanceAmount: input.advanceAmount === undefined ? financial.advanceAmount : input.advanceAmount,
      advanceRecoveryMethod: input.advanceRecoveryMethod ?? financial.advanceRecoveryMethod ?? 'none',
      advanceRecoveryPercent:
        input.advanceRecoveryPercent === undefined ? financial.advanceRecoveryPercent : input.advanceRecoveryPercent,
      vatTreatment: input.vatTreatment ?? financial.vatTreatment ?? 'standard',
      paymentTermsDays: input.paymentTermsDays === undefined ? financial.paymentTermsDays : input.paymentTermsDays,
      paymentTermsText: input.paymentTermsText === undefined ? financial.paymentTermsText : input.paymentTermsText,
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_AGREEMENT_TERMS_UPDATED,
      entityType: 'subcontract_agreement',
      entityId: agreement.id,
      before: financial,
      after: input,
    });
  });
}

/** Lines total -> agreement draft value (keeps the draft header in step with its lines). */
export async function syncDraftOriginalFromLines(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
  currency: string,
): Promise<void> {
  const prices = await listWorkLinePrices(db, organizationId, agreementId);
  if (prices.length === 0) return;
  const total = sumLineAmounts(
    prices.map((price) => price.contractAmount),
    currency,
  );
  await updateAgreementRow(db, organizationId, agreementId, { originalAmount: toNumericString(total) }, ['draft']);
}

/** Lifecycle transitions (contract.manage). Activation locks the baseline and records the original value event. */
export async function changeAgreementStatus(context: OrgContext, rawInput: AgreementActionInput): Promise<void> {
  const input = parseOrThrow(agreementActionSchema.safeParse(rawInput));
  const { agreement, access } = await loadAgreementWithAccess(context, input.agreementId);
  requireAccess(access, 'canManageContract');
  if (input.action === 'suspend' && !input.reason) {
    throw new ValidationError([{ path: 'reason', message: 'subcontracts.validation.reasonRequired' }]);
  }

  await withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const locked = await lockAgreement(tx, context.organizationId, agreement.id);
    if (!locked) throw new NotFoundError('Subcontract agreement');
    const next = assertAgreementAction(locked.status, input.action);
    const now = new Date();

    if (input.action === 'activate') {
      const lines = await listWorkLinesOperational(tx, context.organizationId, agreement.id);
      assertWeightedLinesComplete(lines);
      await syncDraftOriginalFromLines(tx, context.organizationId, agreement.id, locked.currency);
      const financial = await findAgreementFinancial(tx, context.organizationId, agreement.id);
      const events = await listAgreementValueEvents(tx, context.organizationId, agreement.id);
      const value = approvedContractValue({
        currency: locked.currency,
        draftOriginalAmount: financial?.originalAmount ?? '0',
        events: [],
      });
      const existingOriginal = events.find((event) => event.kind === 'original');
      if (existingOriginal) {
        if (money(existingOriginal.amount, locked.currency).amount !== value.original.amount) {
          throw new DomainRuleError(
            'The recorded original value differs from the lines total',
            'subcontracts.errors.originalMismatch',
          );
        }
      } else {
        await insertValueEvent(tx, {
          organizationId: context.organizationId,
          subcontractId: agreement.id,
          kind: 'original',
          amount: toNumericString(value.original),
          currency: locked.currency,
          effectiveDate: agreement.startDate ?? todayInTimeZone(context.organization.timezone),
          reason: 'Original subcontract amount (baseline locked on activation)',
          actorUserId: context.userId,
        });
      }
    }

    if (input.action === 'close') {
      assertAgreementClosable({
        openChanges: await countOpenChanges(tx, context.organizationId, agreement.id),
        openUnpricedWork: await countOpenUnpricedWork(tx, context.organizationId, agreement.id),
      });
    }

    const updated = await updateAgreementRow(tx, context.organizationId, agreement.id, { status: next }, [locked.status]);
    if (!updated) throw new ConflictError('Subcontract agreement was updated concurrently');

    await upsertAgreementProfile(tx, {
      agreementId: agreement.id,
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      vendorId: agreement.vendorId,
      statusChangedByUserId: context.userId,
      ...(input.action === 'activate' ? { activatedAt: now, baselineLockedAt: now } : {}),
      ...(input.action === 'suspend' ? { suspendedAt: now, suspensionReason: input.reason ?? null } : {}),
      ...(input.action === 'resume' ? { suspendedAt: null, suspensionReason: null } : {}),
      ...(input.action === 'complete' ? { completedAt: now } : {}),
      ...(input.action === 'close' ? { closedAt: now } : {}),
      ...(input.action === 'cancel' ? { cancelledAt: now } : {}),
    });

    await emitDomainEvent(tx, {
      organizationId: context.organizationId,
      projectId: agreement.projectId,
      type: ACTION_EVENT[input.action],
      entityType: 'subcontract_agreement',
      entityId: agreement.id,
      actor: internalActor(context.userId),
      payload: { agreementId: agreement.id, vendorId: agreement.vendorId, from: locked.status, to: next },
    });
    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.DG_SUBCONTRACT_AGREEMENT_STATUS_CHANGED,
      entityType: 'subcontract_agreement',
      entityId: agreement.id,
      before: { status: locked.status },
      after: { status: next, reason: input.reason ?? null },
    });
  });
}

/** Options for the create-agreement form (vendors need org `vendors.read`). */
export async function getCreateAgreementOptions(context: OrgContext, projectId: string) {
  const access = await loadSubcontractAccess(context, projectId);
  requireAccess(access, 'canManageContract');
  const [vendorOptions, workPackageOptions] = await Promise.all([
    listSubcontractorVendorOptions(context.db, context.organizationId),
    listProjectWorkPackageOptions(context.db, context.organizationId, projectId),
  ]);
  return { vendors: vendorOptions, workPackages: workPackageOptions, currency: context.organization.baseCurrency };
}