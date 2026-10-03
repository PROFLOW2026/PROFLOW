import { NOTIFICATION_RECIPIENT_FANOUT_CAP } from '@/modules/notifications/domain/recipients';

/** Project members explicitly holding the capability may all act; keep the fan-out bounded. */
export const DG_MEMBER_FANOUT_CAP = 25;
/** Org-wide project admins are a fallback only (no project member holds the capability). */
export const DG_ADMIN_FALLBACK_CAP = NOTIFICATION_RECIPIENT_FANOUT_CAP;
export const DG_EXTERNAL_FANOUT_CAP = 50;

export interface InternalRecipientInput {
  /** Active project members holding one of the audience capabilities. */
  readonly holders: readonly string[];
  /** Active `project_team.admin` holders. */
  readonly admins: readonly string[];
  /** Named users from the payload. */
  readonly named: readonly string[];
  /**
   * Named users allowed to receive this event: for financial events the capability holders and
   * admins only; for operational events any active project member or admin.
   */
  readonly namedEligible: ReadonlySet<string>;
  readonly namedOnly: boolean;
  readonly excludeUserIds: readonly string[];
}

/**
 * Named recipient wins (existing notifications pattern); otherwise capability holders, otherwise
 * admins as a fallback so an actionable event is never dropped. The actor never notifies itself.
 */
export function selectInternalRecipients(input: InternalRecipientInput): string[] {
  const exclude = new Set(input.excludeUserIds.filter(Boolean));
  const pick = (ids: readonly string[], cap: number) => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const id of ids) {
      if (!id || exclude.has(id) || seen.has(id)) continue;
      seen.add(id);
      result.push(id);
      if (result.length >= cap) break;
    }
    return result;
  };

  const named = pick(
    input.named.filter((id) => input.namedEligible.has(id)),
    DG_MEMBER_FANOUT_CAP,
  );
  if (named.length > 0 || input.namedOnly) return named;

  const holders = pick(input.holders, DG_MEMBER_FANOUT_CAP);
  if (holders.length > 0) return holders;
  return pick(input.admins, DG_ADMIN_FALLBACK_CAP);
}

export interface ExternalCandidate {
  readonly principalId: string;
  readonly vendorId: string;
  readonly agreementId: string | null;
}

/** Covered principals, narrowed to the named ones when the payload names any. */
export function selectExternalRecipients(input: {
  readonly covered: readonly ExternalCandidate[];
  readonly named: readonly string[];
  readonly namedOnly: boolean;
  readonly excludePrincipalIds: readonly string[];
}): ExternalCandidate[] {
  const exclude = new Set(input.excludePrincipalIds.filter(Boolean));
  const named = new Set(input.named);
  const seen = new Set<string>();
  const coveredNamed: ExternalCandidate[] = [];
  const all: ExternalCandidate[] = [];
  for (const candidate of input.covered) {
    if (exclude.has(candidate.principalId) || seen.has(candidate.principalId)) continue;
    seen.add(candidate.principalId);
    all.push(candidate);
    if (named.has(candidate.principalId)) coveredNamed.push(candidate);
  }
  if (named.size > 0) return coveredNamed.slice(0, DG_EXTERNAL_FANOUT_CAP);
  if (input.namedOnly) return [];
  return all.slice(0, DG_EXTERNAL_FANOUT_CAP);
}
