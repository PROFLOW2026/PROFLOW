import type { SiteMeetingAttendance, SiteMeetingStatus, SiteMeetingType } from '@drizzle/schema';

/**
 * Contractor meeting rules (framework-free). A site meeting is a `meeting_records` row extended by
 * `site_meeting_details`. Minutes are published as immutable versions visible to attending
 * contractors; editing after publication and republishing creates a new version.
 */

export type { SiteMeetingAttendance, SiteMeetingStatus, SiteMeetingType };

export function canEditMeeting(status: SiteMeetingStatus): boolean {
  return status !== 'cancelled';
}

export function canMarkHeld(status: SiteMeetingStatus): boolean {
  return status === 'scheduled';
}

export function canCancelMeeting(status: SiteMeetingStatus): boolean {
  return status === 'scheduled';
}

/** Minutes can be published once the meeting took place (republish allowed). */
export function canPublishMinutes(status: SiteMeetingStatus): boolean {
  return status === 'held' || status === 'published';
}

export function nextPublicationVersion(currentVersion: number): number {
  return Math.max(0, currentVersion) + 1;
}

export type ActionItemAssignee =
  | { readonly kind: 'none' }
  | { readonly kind: 'member'; readonly membershipId: string }
  | { readonly kind: 'contractor'; readonly vendorId: string; readonly subcontractAgreementId: string | null };

/** Parses the single `assignee` form value: '' | 'member:<id>' | 'vendor:<vendorId>[:<agreementId>]'. */
export function parseActionItemAssignee(value: string | null | undefined): ActionItemAssignee | null {
  if (!value) return { kind: 'none' };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const [kind, first, second] = value.split(':');
  if (kind === 'member' && first && uuid.test(first) && second === undefined) {
    return { kind: 'member', membershipId: first };
  }
  if (kind === 'vendor' && first && uuid.test(first)) {
    if (second !== undefined && !uuid.test(second)) return null;
    return { kind: 'contractor', vendorId: first, subcontractAgreementId: second ?? null };
  }
  return null;
}
