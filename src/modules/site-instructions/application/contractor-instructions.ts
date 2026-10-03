import { AUDIT_ACTIONS } from '@/shared/audit';
import { DOMAIN_EVENTS } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, requireExternalScope, type ExternalContext } from '@/shared/external';
import { resolveExternalProjectTargets } from '@/modules/site-log/shared/external-scope';
import { recordExternalFieldWrite } from '@/modules/site-log/shared/side-effects';
import { parseOrThrow } from '@/modules/site-log/shared/validation';
import {
  findInstructionInProject,
  insertInstructionEvent,
  listInstructionEvents,
  listInstructionsVisibleInProject,
  listPendingAckInstructions,
  type InstructionEventRow,
  type InstructionRow,
} from '../data/site-instructions.repository';
import { availableTransitions, transitionBlocker, type SiteInstructionStatus } from '../domain/lifecycle';
import { externalInstructionActionSchema } from '../validation/schemas';
import { instructionEventPayload } from './instructions';

const X = EXTERNAL_CAPABILITIES;

/** Contractor-safe projection: no internal links, no internal actor identities. */
export interface ContractorInstructionView {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly instructionNumber: number;
  readonly title: string;
  readonly description: string | null;
  readonly category: InstructionRow['category'];
  readonly status: SiteInstructionStatus;
  readonly dueDate: string | null;
  readonly issuedAt: Date;
  readonly acknowledgedAt: Date | null;
  readonly performedAt: Date | null;
  readonly closedAt: Date | null;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly locationId: string | null;
}

export interface ContractorInstructionEventView {
  readonly id: string;
  readonly eventType: InstructionEventRow['eventType'];
  readonly toStatus: InstructionEventRow['toStatus'];
  readonly note: string | null;
  readonly byContractor: boolean;
  readonly occurredAt: Date;
}

function toView(row: InstructionRow): ContractorInstructionView {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    instructionNumber: row.instructionNumber,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status,
    dueDate: row.dueDate,
    issuedAt: row.issuedAt,
    acknowledgedAt: row.acknowledgedAt,
    performedAt: row.performedAt,
    closedAt: row.closedAt,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    locationId: row.locationId,
  };
}

/** Commercial follow-up events are internal; contractors see the operational history only. */
const CONTRACTOR_VISIBLE_EVENTS: ReadonlySet<string> = new Set([
  'issued',
  'acknowledged',
  'performed',
  'closed',
  'cancelled',
  'reopened',
]);

function grantOrganizations(context: ExternalContext): string[] {
  return [...new Set(context.grants.map((grant) => grant.organizationId))];
}

function assertCovers(context: ExternalContext, row: InstructionRow): void {
  requireExternalScope(
    context,
    {
      organizationId: row.organizationId,
      projectId: row.projectId,
      vendorId: row.vendorId,
      subcontractAgreementId: row.subcontractAgreementId,
    },
    X.SITE_INSTRUCTION_ACK,
  );
}

export async function listContractorInstructions(
  context: ExternalContext,
  projectId: string,
  options: { readonly status?: 'open' | 'all' } = {},
): Promise<ContractorInstructionView[]> {
  const targets = await resolveExternalProjectTargets(context, projectId, X.SITE_INSTRUCTION_ACK);
  if (targets.length === 0) return [];
  const statuses: SiteInstructionStatus[] | null =
    options.status === 'all' ? null : ['issued', 'acknowledged', 'performed'];
  const rows = await listInstructionsVisibleInProject(
    context.db,
    projectId,
    [...new Set(targets.map((target) => target.organizationId))],
    statuses,
    200,
  );
  return rows
    .filter((row) =>
      targets.some(
        (target) =>
          target.organizationId === row.organizationId &&
          target.vendorId === row.vendorId &&
          (target.subcontractAgreementId === null || target.subcontractAgreementId === row.subcontractAgreementId),
      ),
    )
    .map(toView);
}

export interface ContractorInstructionDetail {
  readonly instruction: ContractorInstructionView;
  readonly events: readonly ContractorInstructionEventView[];
  readonly canAcknowledge: boolean;
  readonly canReportPerformed: boolean;
}

export async function getContractorInstruction(
  context: ExternalContext,
  projectId: string,
  instructionId: string,
): Promise<ContractorInstructionDetail> {
  const row = await findInstructionInProject(context.db, projectId, instructionId);
  if (!row) throw new NotFoundError('Site instruction');
  try {
    assertCovers(context, row);
  } catch {
    throw new NotFoundError('Site instruction');
  }
  const events = await listInstructionEvents(context.db, row.organizationId, row.id);
  const transitions = availableTransitions(row, 'external');
  return {
    instruction: toView(row),
    events: events
      .filter((event) => CONTRACTOR_VISIBLE_EVENTS.has(event.eventType) || event.actorType === 'external')
      .map((event) => ({
        id: event.id,
        eventType: event.eventType,
        toStatus: event.toStatus,
        note: event.actorType === 'external' || event.eventType !== 'note' ? event.note : null,
        byContractor: event.actorType === 'external',
        occurredAt: event.occurredAt,
      })),
    canAcknowledge: transitions.includes('acknowledged'),
    canReportPerformed: transitions.includes('performed'),
  };
}

async function applyExternalEvent(
  context: ExternalContext,
  raw: { readonly projectId: string; readonly instructionId: string; readonly note?: string | null },
  event: 'acknowledged' | 'performed',
): Promise<ContractorInstructionView> {
  const input = parseOrThrow(externalInstructionActionSchema.safeParse(raw));
  const row = await findInstructionInProject(context.db, input.projectId, input.instructionId);
  if (!row) throw new NotFoundError('Site instruction');
  assertCovers(context, row);
  const blocker = transitionBlocker(row, event, 'external');
  if (blocker) throw new DomainRuleError(`Transition ${event} not allowed`, `siteOps.errors.${blocker}`);

  await insertInstructionEvent(context.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    instructionId: row.id,
    vendorId: row.vendorId,
    eventType: event,
    note: input.note ?? null,
    actorType: 'external',
    actorPrincipalId: context.principalId,
  });
  const updated = await findInstructionInProject(context.db, row.projectId, row.id);
  if (!updated) throw new NotFoundError('Site instruction');

  await recordExternalFieldWrite(context.db, {
    organizationId: row.organizationId,
    projectId: row.projectId,
    principalId: context.principalId,
    audit: {
      action:
        event === 'acknowledged'
          ? AUDIT_ACTIONS.SITE_INSTRUCTION_ACKNOWLEDGED
          : AUDIT_ACTIONS.SITE_INSTRUCTION_PERFORMED,
      entityType: 'site_instruction',
      entityId: row.id,
      after: { status: updated.status, note: input.note ?? null },
    },
    event: {
      type:
        event === 'acknowledged'
          ? DOMAIN_EVENTS.FIELD_INSTRUCTION_ACKNOWLEDGED
          : DOMAIN_EVENTS.FIELD_INSTRUCTION_PERFORMED,
      entityType: 'site_instruction',
      entityId: row.id,
      payload: instructionEventPayload(updated),
    },
  });
  return toView(updated);
}

/** Contractor acknowledges an issued instruction (ext.site_instruction.ack). */
export function acknowledgeInstructionAsContractor(
  context: ExternalContext,
  raw: { readonly projectId: string; readonly instructionId: string; readonly note?: string | null },
): Promise<ContractorInstructionView> {
  return applyExternalEvent(context, raw, 'acknowledged');
}

/** Contractor reports the instruction performed (internal verification closes it). */
export function reportInstructionPerformedAsContractor(
  context: ExternalContext,
  raw: { readonly projectId: string; readonly instructionId: string; readonly note?: string | null },
): Promise<ContractorInstructionView> {
  return applyExternalEvent(context, raw, 'performed');
}

// ─── Portal summary (Track R dashboard) ─────────────────────────────────────

export interface PendingInstructionAckItem {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly instructionNumber: number;
  readonly title: string;
  readonly category: InstructionRow['category'];
  readonly dueDate: string | null;
  readonly issuedAt: Date;
}

export interface ContractorInstructionSummary {
  readonly pendingAcknowledgements: number;
  readonly items: readonly PendingInstructionAckItem[];
}

/**
 * Instructions awaiting the contractor's acknowledgement, across every grant (or one project).
 * Rows are RLS-scoped and re-checked against the in-memory grants.
 */
export async function getContractorInstructionSummary(
  context: ExternalContext,
  options: { readonly projectId?: string | null; readonly limit?: number } = {},
): Promise<ContractorInstructionSummary> {
  const ackGrants = context.grants.filter((grant) => grant.capabilities.has(X.SITE_INSTRUCTION_ACK));
  if (ackGrants.length === 0) return { pendingAcknowledgements: 0, items: [] };
  const { rows, total } = await listPendingAckInstructions(
    context.db,
    grantOrganizations({ ...context, grants: ackGrants }),
    options.projectId ?? null,
    Math.min(options.limit ?? 5, 50),
  );
  return {
    pendingAcknowledgements: total,
    items: rows.map((row) => ({
      id: row.id,
      organizationId: row.organizationId,
      projectId: row.projectId,
      instructionNumber: row.instructionNumber,
      title: row.title,
      category: row.category,
      dueDate: row.dueDate,
      issuedAt: row.issuedAt,
    })),
  };
}
