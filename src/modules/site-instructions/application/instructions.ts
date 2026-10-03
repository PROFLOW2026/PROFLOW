import { AUDIT_ACTIONS, recordAuditEvent, type AuditAction } from '@/shared/audit';
import { internalActor } from '@/shared/actor';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { DOMAIN_EVENTS, emitDomainEvent, type DomainEventType } from '@/shared/domain-events';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { PROJECT_CAPABILITIES, assertProjectCapability, loadProjectCapabilities } from '@/modules/project-team';
import { findDailyLog } from '@/modules/site-log';
import {
  listProjectContractors,
  listProjectLocationOptions,
  vendorNameMap,
  type ProjectContractorOption,
  type ProjectLocationOption,
} from '@/modules/site-log/shared/project-parties';
import { parseOrThrow } from '@/modules/site-log/shared/validation';
import {
  findInstruction,
  insertInstruction,
  insertInstructionEvent,
  insertInstructionLink,
  listInstructionEvents,
  listInstructionLinks,
  listInstructionsForProject,
  updateInstructionContent,
  type InstructionEventRow,
  type InstructionLinkRow,
  type InstructionRow,
} from '../data/site-instructions.repository';
import {
  availableTransitions,
  isInstructionOverdue,
  transitionBlocker,
  type SiteInstructionStatus,
  type TransitionEvent,
} from '../domain/lifecycle';
import {
  instructionNoteSchema,
  issueInstructionSchema,
  linkConversionSchema,
  listInstructionsFilterSchema,
  requestConversionSchema,
  transitionInstructionSchema,
  updateInstructionSchema,
  type IssueInstructionInput,
  type ListInstructionsFilter,
  type TransitionInstructionInput,
  type UpdateInstructionInput,
} from '../validation/schemas';
import { convertWithSubcontracts } from './conversion-port';

const C = PROJECT_CAPABILITIES;
const ENTITY = 'site_instruction';

const EVENT_EFFECTS: Readonly<
  Record<TransitionEvent, { readonly audit: AuditAction; readonly domain: DomainEventType | null }>
> = {
  acknowledged: { audit: AUDIT_ACTIONS.SITE_INSTRUCTION_ACKNOWLEDGED, domain: DOMAIN_EVENTS.FIELD_INSTRUCTION_ACKNOWLEDGED },
  performed: { audit: AUDIT_ACTIONS.SITE_INSTRUCTION_PERFORMED, domain: DOMAIN_EVENTS.FIELD_INSTRUCTION_PERFORMED },
  closed: { audit: AUDIT_ACTIONS.SITE_INSTRUCTION_CLOSED, domain: DOMAIN_EVENTS.FIELD_INSTRUCTION_CLOSED },
  cancelled: { audit: AUDIT_ACTIONS.SITE_INSTRUCTION_CANCELLED, domain: DOMAIN_EVENTS.FIELD_INSTRUCTION_CANCELLED },
  reopened: { audit: AUDIT_ACTIONS.SITE_INSTRUCTION_REOPENED, domain: DOMAIN_EVENTS.FIELD_INSTRUCTION_REOPENED },
  conversion_requested: {
    audit: AUDIT_ACTIONS.SITE_INSTRUCTION_CONVERSION_REQUESTED,
    domain: DOMAIN_EVENTS.FIELD_INSTRUCTION_CONVERSION_REQUESTED,
  },
  converted: { audit: AUDIT_ACTIONS.SITE_INSTRUCTION_CONVERTED, domain: DOMAIN_EVENTS.FIELD_INSTRUCTION_CONVERTED },
  conversion_dismissed: { audit: AUDIT_ACTIONS.SITE_INSTRUCTION_CONVERSION_DISMISSED, domain: null },
};

/** Ids + statuses only: consumers re-read with their own authorization. */
export function instructionEventPayload(instruction: InstructionRow, extra: Record<string, unknown> = {}) {
  return {
    instructionNumber: instruction.instructionNumber,
    category: instruction.category,
    status: instruction.status,
    vendorId: instruction.vendorId,
    subcontractAgreementId: instruction.subcontractAgreementId,
    dueDate: instruction.dueDate,
    ...extra,
  };
}

// ─── Reads ───────────────────────────────────────────────────────────────────

export interface InstructionListItem extends InstructionRow {
  readonly vendorName: string | null;
  readonly overdue: boolean;
}

export interface InstructionListResult {
  readonly items: readonly InstructionListItem[];
  readonly hasMore: boolean;
  readonly canIssue: boolean;
  readonly contractors: readonly ProjectContractorOption[];
  readonly locations: readonly ProjectLocationOption[];
}

function statusesForFilter(status: string): SiteInstructionStatus[] | null {
  if (status === 'all') return null;
  if (status === 'open') return ['issued', 'acknowledged', 'performed'];
  return [status as SiteInstructionStatus];
}

export async function listProjectInstructions(
  context: OrgContext,
  projectId: string,
  rawFilter: ListInstructionsFilter = {},
): Promise<InstructionListResult> {
  await assertProjectCapability(context, projectId, C.CONTRACTOR_VIEW);
  const filter = parseOrThrow(listInstructionsFilterSchema.safeParse(rawFilter));
  const capabilities = await loadProjectCapabilities(context, projectId);
  const canIssue = capabilities.has(C.CONTRACTOR_COORDINATE);
  const [{ rows, hasMore }, contractors, locations] = await Promise.all([
    listInstructionsForProject(context.db, context.organizationId, projectId, {
      statuses: statusesForFilter(filter.status),
      vendorId: filter.vendorId ?? null,
      limit: filter.limit,
      offset: filter.offset,
    }),
    listProjectContractors(context.db, context.organizationId, projectId),
    canIssue ? listProjectLocationOptions(context.db, context.organizationId, projectId) : Promise.resolve([]),
  ]);
  const names = await vendorNameMap(context.db, context.organizationId, rows.map((row) => row.vendorId));
  const today = todayInTimeZone(context.organization.timezone);
  return {
    items: rows.map((row) => ({
      ...row,
      vendorName: names.get(row.vendorId) ?? null,
      overdue: isInstructionOverdue(row.status, row.dueDate, today),
    })),
    hasMore,
    canIssue,
    contractors,
    locations,
  };
}

export interface InstructionDetail {
  readonly instruction: InstructionRow;
  readonly vendorName: string | null;
  readonly events: readonly InstructionEventRow[];
  readonly links: readonly InstructionLinkRow[];
  readonly overdue: boolean;
  readonly canCoordinate: boolean;
  readonly transitions: readonly TransitionEvent[];
  readonly locations: readonly ProjectLocationOption[];
}

export async function getInstructionDetail(
  context: OrgContext,
  projectId: string,
  instructionId: string,
): Promise<InstructionDetail> {
  await assertProjectCapability(context, projectId, C.CONTRACTOR_VIEW);
  const instruction = await findInstruction(context.db, context.organizationId, instructionId);
  if (!instruction || instruction.projectId !== projectId) throw new NotFoundError('Site instruction');
  const capabilities = await loadProjectCapabilities(context, projectId);
  const canCoordinate = capabilities.has(C.CONTRACTOR_COORDINATE);
  const [events, links, names, locations] = await Promise.all([
    listInstructionEvents(context.db, context.organizationId, instruction.id),
    listInstructionLinks(context.db, context.organizationId, instruction.id),
    vendorNameMap(context.db, context.organizationId, [instruction.vendorId]),
    canCoordinate ? listProjectLocationOptions(context.db, context.organizationId, projectId) : Promise.resolve([]),
  ]);
  return {
    instruction,
    vendorName: names.get(instruction.vendorId) ?? null,
    events,
    links,
    overdue: isInstructionOverdue(instruction.status, instruction.dueDate, todayInTimeZone(context.organization.timezone)),
    canCoordinate,
    transitions: canCoordinate ? availableTransitions(instruction, 'internal') : [],
    locations,
  };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

async function loadForWrite(context: OrgContext, projectId: string, instructionId: string): Promise<InstructionRow> {
  await assertProjectCapability(context, projectId, C.CONTRACTOR_COORDINATE);
  const instruction = await findInstruction(context.db, context.organizationId, instructionId);
  if (!instruction || instruction.projectId !== projectId) throw new NotFoundError('Site instruction');
  return instruction;
}

export async function issueInstruction(context: OrgContext, raw: IssueInstructionInput): Promise<InstructionRow> {
  const input = parseOrThrow(issueInstructionSchema.safeParse(raw));
  await assertProjectCapability(context, input.projectId, C.CONTRACTOR_COORDINATE);
  const dailyLog = input.logDate
    ? await findDailyLog(context.db, context.organizationId, input.projectId, input.logDate)
    : null;

  const inserted = await insertInstruction(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    title: input.title,
    description: input.description ?? null,
    category: input.category,
    vendorId: input.vendorId,
    subcontractAgreementId: input.subcontractAgreementId ?? null,
    locationId: input.locationId ?? null,
    dailyLogId: dailyLog?.id ?? null,
    meetingId: input.meetingId ?? null,
    dueDate: input.dueDate ?? null,
    issuedByUserId: context.userId,
  });
  await insertInstructionEvent(context.db, {
    organizationId: context.organizationId,
    projectId: inserted.projectId,
    instructionId: inserted.id,
    vendorId: inserted.vendorId,
    eventType: 'issued',
    actorType: 'internal',
    actorUserId: context.userId,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_INSTRUCTION_ISSUED,
    entityType: ENTITY,
    entityId: inserted.id,
    after: {
      instructionNumber: inserted.instructionNumber,
      category: inserted.category,
      vendorId: inserted.vendorId,
      title: inserted.title,
    },
  });
  await emitDomainEvent(context.db, {
    organizationId: context.organizationId,
    projectId: inserted.projectId,
    type: DOMAIN_EVENTS.FIELD_INSTRUCTION_ISSUED,
    entityType: ENTITY,
    entityId: inserted.id,
    actor: internalActor(context.userId),
    payload: instructionEventPayload(inserted),
  });
  return inserted;
}

export async function updateInstruction(context: OrgContext, raw: UpdateInstructionInput): Promise<InstructionRow> {
  const input = parseOrThrow(updateInstructionSchema.safeParse(raw));
  const existing = await loadForWrite(context, input.projectId, input.instructionId);
  if (existing.status !== 'issued' && existing.status !== 'acknowledged') {
    throw new DomainRuleError('Instruction can no longer be edited', 'siteOps.errors.instructionLocked');
  }
  const updated = await updateInstructionContent(context.db, context.organizationId, existing.id, {
    title: input.title,
    description: input.description ?? null,
    locationId: input.locationId ?? null,
    dueDate: input.dueDate ?? null,
  });
  if (!updated) throw new NotFoundError('Site instruction');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SITE_INSTRUCTION_UPDATED,
    entityType: ENTITY,
    entityId: existing.id,
    before: { title: existing.title, description: existing.description, dueDate: existing.dueDate },
    after: { title: updated.title, description: updated.description, dueDate: updated.dueDate },
  });
  return updated;
}

async function applyInternalEvent(
  context: OrgContext,
  instruction: InstructionRow,
  event: TransitionEvent,
  note: string | null,
  extraPayload: Record<string, unknown> = {},
): Promise<InstructionRow> {
  const blocker = transitionBlocker(instruction, event, 'internal');
  if (blocker) throw new DomainRuleError(`Transition ${event} not allowed`, `siteOps.errors.${blocker}`);
  await insertInstructionEvent(context.db, {
    organizationId: context.organizationId,
    projectId: instruction.projectId,
    instructionId: instruction.id,
    vendorId: instruction.vendorId,
    eventType: event,
    note,
    actorType: 'internal',
    actorUserId: context.userId,
  });
  const updated = await findInstruction(context.db, context.organizationId, instruction.id);
  if (!updated) throw new NotFoundError('Site instruction');
  const effects = EVENT_EFFECTS[event];
  await recordAuditEvent(context, {
    action: effects.audit,
    entityType: ENTITY,
    entityId: instruction.id,
    before: { status: instruction.status, conversionState: instruction.conversionState },
    after: { status: updated.status, conversionState: updated.conversionState, note, ...extraPayload },
  });
  if (effects.domain) {
    await emitDomainEvent(context.db, {
      organizationId: context.organizationId,
      projectId: instruction.projectId,
      type: effects.domain,
      entityType: ENTITY,
      entityId: instruction.id,
      actor: internalActor(context.userId),
      payload: instructionEventPayload(updated, extraPayload),
    });
  }
  return updated;
}

/** Internal lifecycle step (incl. recording a contractor's verbal acknowledgement). */
export async function transitionInstruction(context: OrgContext, raw: TransitionInstructionInput): Promise<InstructionRow> {
  const input = parseOrThrow(transitionInstructionSchema.safeParse(raw));
  const instruction = await loadForWrite(context, input.projectId, input.instructionId);
  return applyInternalEvent(context, instruction, input.event, input.note ?? null);
}

export async function addInstructionNote(
  context: OrgContext,
  raw: { readonly projectId: string; readonly instructionId: string; readonly note: string },
): Promise<void> {
  const input = parseOrThrow(instructionNoteSchema.safeParse(raw));
  const instruction = await loadForWrite(context, input.projectId, input.instructionId);
  await insertInstructionEvent(context.db, {
    organizationId: context.organizationId,
    projectId: instruction.projectId,
    instructionId: instruction.id,
    vendorId: instruction.vendorId,
    eventType: 'note',
    note: input.note,
    actorType: 'internal',
    actorUserId: context.userId,
  });
}

export interface ConversionOutcome {
  readonly instruction: InstructionRow;
  /** null when Track E has not created the record yet (request recorded, link added later). */
  readonly linked: { readonly targetType: string; readonly targetId: string } | null;
}

/**
 * Potentially-financial instruction -> subcontract change or unpriced work. Calls Track E through
 * the conversion port; the edge is always stored in entity_links (instruction -> created record).
 */
export async function requestInstructionConversion(
  context: OrgContext,
  raw: { readonly projectId: string; readonly instructionId: string; readonly target: string; readonly note?: string | null },
): Promise<ConversionOutcome> {
  const input = parseOrThrow(requestConversionSchema.safeParse(raw));
  const instruction = await loadForWrite(context, input.projectId, input.instructionId);
  const blocker = transitionBlocker(instruction, 'conversion_requested', 'internal');
  if (blocker) throw new DomainRuleError('Conversion not allowed', `siteOps.errors.${blocker}`);

  const result = await convertWithSubcontracts(context, {
    organizationId: context.organizationId,
    projectId: instruction.projectId,
    instructionId: instruction.id,
    instructionNumber: instruction.instructionNumber,
    vendorId: instruction.vendorId,
    subcontractAgreementId: instruction.subcontractAgreementId,
    title: instruction.title,
    description: instruction.description,
    target: input.target,
  });

  if (!result) {
    const updated = await applyInternalEvent(context, instruction, 'conversion_requested', input.note ?? null, {
      target: input.target,
    });
    return { instruction: updated, linked: null };
  }

  await insertInstructionLink(context.db, {
    organizationId: context.organizationId,
    projectId: instruction.projectId,
    instructionId: instruction.id,
    targetType: result.targetType,
    targetId: result.targetId,
    relation: 'converted_to',
    actorUserId: context.userId,
  });
  const updated = await applyInternalEvent(context, instruction, 'converted', input.note ?? null, {
    target: input.target,
    targetType: result.targetType,
    targetId: result.targetId,
  });
  return { instruction: updated, linked: result };
}

/** Links an instruction to an existing change / unpriced-work record created in Track E. */
export async function linkInstructionConversion(
  context: OrgContext,
  raw: { readonly projectId: string; readonly instructionId: string; readonly targetType: string; readonly targetId: string },
): Promise<InstructionRow> {
  const input = parseOrThrow(linkConversionSchema.safeParse(raw));
  const instruction = await loadForWrite(context, input.projectId, input.instructionId);
  const blocker = transitionBlocker(instruction, 'converted', 'internal');
  if (blocker) throw new DomainRuleError('Conversion not allowed', `siteOps.errors.${blocker}`);
  await insertInstructionLink(context.db, {
    organizationId: context.organizationId,
    projectId: instruction.projectId,
    instructionId: instruction.id,
    targetType: input.targetType,
    targetId: input.targetId,
    relation: 'converted_to',
    actorUserId: context.userId,
  });
  return applyInternalEvent(context, instruction, 'converted', null, {
    targetType: input.targetType,
    targetId: input.targetId,
  });
}
