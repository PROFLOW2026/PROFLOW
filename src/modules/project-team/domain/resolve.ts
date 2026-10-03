import {
  ALL_PROJECT_CAPABILITIES,
  expandCapabilities,
  type ProjectCapability,
} from './capabilities';

export const PROJECT_MEMBER_STATUSES = ['active', 'inactive'] as const;
export type ProjectMemberStatus = (typeof PROJECT_MEMBER_STATUSES)[number];

export function isProjectMemberStatus(value: unknown): value is ProjectMemberStatus {
  return typeof value === 'string' && (PROJECT_MEMBER_STATUSES as readonly string[]).includes(value);
}

export interface ProjectMemberCapabilityInput {
  /** Holder of the org-wide `project_team.admin` permission (Owner by default). */
  readonly isOrgProjectAdmin: boolean;
  /** `null` = the user has no membership row on this project. */
  readonly member: {
    readonly status: ProjectMemberStatus;
    readonly capabilities: readonly string[];
  } | null;
}

/**
 * Effective capabilities of one user on one project.
 *
 * - Org-wide admin: every capability (Owner retains full organization access).
 * - Active member: stored capabilities plus implication closure.
 * - Inactive or missing membership: nothing. Project A membership never leaks to project B
 *   because the caller resolves exactly one project at a time.
 */
export function resolveProjectCapabilities(input: ProjectMemberCapabilityInput): ReadonlySet<ProjectCapability> {
  if (input.isOrgProjectAdmin) return new Set(ALL_PROJECT_CAPABILITIES);
  if (!input.member || input.member.status !== 'active') return new Set();
  return expandCapabilities(input.member.capabilities);
}

/**
 * Anti-escalation: a grantor may only hand out capabilities they hold themselves.
 * Returns the capabilities that exceed the grantor's own authority (empty = allowed).
 */
export function capabilitiesBeyondGrantor(
  grantorCapabilities: ReadonlySet<ProjectCapability>,
  requested: Iterable<string>,
): ProjectCapability[] {
  const closure = expandCapabilities(requested);
  return [...closure].filter((capability) => !grantorCapabilities.has(capability)).sort();
}
