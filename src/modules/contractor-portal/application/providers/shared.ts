import { todayInTimeZone } from '@/shared/dates';
import type { PortalProjectTarget, PortalSectionScope } from '../../domain/sections';

/** Organizations default to Asia/Jerusalem; the external session carries no org timezone. */
export const PORTAL_TIME_ZONE = 'Asia/Jerusalem';

export function portalToday(scope: PortalSectionScope): string {
  return todayInTimeZone(PORTAL_TIME_ZONE, scope.now);
}

export function dateInPortalZone(value: Date): string {
  return todayInTimeZone(PORTAL_TIME_ZONE, value);
}

export function targetsByOrganization(
  targets: readonly PortalProjectTarget[],
): ReadonlyMap<string, readonly PortalProjectTarget[]> {
  const grouped = new Map<string, PortalProjectTarget[]>();
  for (const target of targets) {
    const list = grouped.get(target.organizationId) ?? [];
    list.push(target);
    grouped.set(target.organizationId, list);
  }
  return grouped;
}

/** Single-project scopes let domain queries filter in SQL; multi-project scopes filter in memory. */
export function singleProjectId(targets: readonly PortalProjectTarget[]): string | null {
  return targets.length === 1 ? targets[0]!.projectId : null;
}

export function projectSet(targets: readonly PortalProjectTarget[]): ReadonlySet<string> {
  return new Set(targets.map((target) => target.projectId));
}

export const BADGE = {
  overdue: 'contractorPortal.badges.overdue',
  today: 'contractorPortal.badges.today',
  actionRequired: 'contractorPortal.badges.actionRequired',
  awaitingVerification: 'contractorPortal.badges.awaitingVerification',
  awaitingResponse: 'contractorPortal.badges.awaitingResponse',
  awaitingAcknowledgement: 'contractorPortal.badges.awaitingAcknowledgement',
  open: 'contractorPortal.badges.open',
  unread: 'contractorPortal.badges.unread',
} as const;
