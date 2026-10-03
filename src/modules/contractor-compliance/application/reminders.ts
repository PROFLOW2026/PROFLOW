import { SYSTEM_ACTOR } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { addDays, daysBetween } from '../domain/status';
import { COMPLIANCE_DOCUMENT_ENTITY } from '../domain/types';
import {
  insertReminderIfAbsent,
  listApprovedDocumentsForRequirements,
  listExpiryCandidates,
  type ExpiryCandidateRow,
} from '../data/compliance.repository';

export interface ComplianceExpiryScanOptions {
  /** yyyy-mm-dd; default today (UTC). Track T passes the organization-local date when it has it. */
  readonly today?: string;
  readonly organizationId?: string;
  readonly limit?: number;
}

export interface ComplianceExpiryScanResult {
  readonly scanned: number;
  readonly expiring: number;
  readonly expired: number;
}

/** Max look-ahead equals the max requirement warning window (365 days, DB CHECK). */
const MAX_WARNING_DAYS = 365;

/** The document still defines the requirement status (no newer approved replacement expiring later). */
function isEffective(
  candidate: ExpiryCandidateRow,
  approved: readonly { id: string; requirementId: string; expiresOn: string | null }[],
): boolean {
  return !approved.some(
    (other) =>
      other.requirementId === candidate.requirementId &&
      other.id !== candidate.documentId &&
      (other.expiresOn === null || other.expiresOn > candidate.expiresOn),
  );
}

/**
 * Reminder scan (SYSTEM actor). Run with a service-role executor by the domain-event worker (Track T).
 * Emits `compliance.document.expiring` once per document/expiry when it enters its warning window and
 * `compliance.document.expired` once after it lapses. Deduped by `contractor_compliance_reminders`.
 * Events are written in the same transaction as the dedupe row.
 */
export async function runComplianceExpiryScan(
  db: DbExecutor,
  options: ComplianceExpiryScanOptions = {},
): Promise<ComplianceExpiryScanResult> {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const candidates = await listExpiryCandidates(db, {
    horizon: addDays(today, MAX_WARNING_DAYS),
    organizationId: options.organizationId,
    limit: Math.min(Math.max(options.limit ?? 500, 1), 2_000),
    excludeExpiredReminded: true,
  });
  const approved = await listApprovedDocumentsForRequirements(
    db,
    [...new Set(candidates.map((row) => row.requirementId))],
  );

  let expiring = 0;
  let expired = 0;
  for (const candidate of candidates) {
    const daysToExpiry = daysBetween(today, candidate.expiresOn);
    if (daysToExpiry > candidate.warningDays) continue;
    if (!isEffective(candidate, approved)) continue;
    const kind = daysToExpiry < 0 ? 'expired' : 'expiring';
    const fresh = await insertReminderIfAbsent(db, {
      organizationId: candidate.organizationId,
      projectId: candidate.projectId,
      requirementId: candidate.requirementId,
      documentId: candidate.documentId,
      reminderKind: kind,
      forExpiry: candidate.expiresOn,
    });
    if (!fresh) continue;
    await emitDomainEvent(db, {
      organizationId: candidate.organizationId,
      projectId: candidate.projectId,
      type: kind === 'expired' ? DOMAIN_EVENTS.COMPLIANCE_DOCUMENT_EXPIRED : DOMAIN_EVENTS.COMPLIANCE_DOCUMENT_EXPIRING,
      entityType: COMPLIANCE_DOCUMENT_ENTITY,
      entityId: candidate.documentId,
      actor: SYSTEM_ACTOR,
      payload: {
        requirementId: candidate.requirementId,
        kind: candidate.kind,
        agreementId: candidate.subcontractAgreementId,
        vendorId: candidate.vendorId,
        expiresOn: candidate.expiresOn,
        daysToExpiry,
      },
    });
    if (kind === 'expired') expired += 1;
    else expiring += 1;
  }
  return { scanned: candidates.length, expiring, expired };
}
