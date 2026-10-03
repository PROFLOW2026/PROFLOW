import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/shared/errors';
import type { ProjectCapability } from '../domain/capabilities';
import { parseCapabilityList } from '../domain/editor';

export type ProjectTeamErrorCode =
  | 'grantBeyondAuthority'
  | 'revokeBeyondAuthority'
  | 'deactivateHigherAuthority'
  | 'notAllowed'
  | 'alreadyMember'
  | 'notOrgMember'
  | 'noCapabilities'
  | 'unknownTemplate'
  | 'invalidInput'
  | 'notFound';

export interface ClassifiedProjectTeamError {
  readonly code: ProjectTeamErrorCode;
  /** Capabilities that blocked the change (anti-escalation only). */
  readonly capabilities: readonly ProjectCapability[];
}

/** Postgres SQLSTATE from a driver error (postgres-js / PGlite may wrap it in `cause`). */
export function sqlState(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Maps project-team use-case failures to stable UI codes. Returns `null` for
 * errors that are not expected outcomes, so the action can rethrow them.
 */
export function classifyProjectTeamError(error: unknown): ClassifiedProjectTeamError | null {
  if (error instanceof AuthorizationError) {
    const permission = typeof error.details?.permission === 'string' ? error.details.permission : '';
    if (permission.startsWith('project:grant:')) {
      return {
        code: 'grantBeyondAuthority',
        capabilities: parseCapabilityList(permission.slice('project:grant:'.length)),
      };
    }
    if (permission.startsWith('project:revoke:')) {
      return {
        code: 'revokeBeyondAuthority',
        capabilities: parseCapabilityList(permission.slice('project:revoke:'.length)),
      };
    }
    if (permission === 'project:deactivate-higher-authority') {
      return { code: 'deactivateHigherAuthority', capabilities: [] };
    }
    return { code: 'notAllowed', capabilities: [] };
  }
  if (error instanceof ConflictError) {
    return { code: 'alreadyMember', capabilities: [] };
  }
  if (error instanceof NotFoundError) {
    return { code: 'notFound', capabilities: [] };
  }
  if (error instanceof ValidationError) {
    const paths = new Set(error.issues.map((issue) => issue.path));
    if (paths.has('userId')) return { code: 'notOrgMember', capabilities: [] };
    if (paths.has('templateKey')) return { code: 'unknownTemplate', capabilities: [] };
    const unknownCapability = error.issues.some((issue) => /unknown project capability/i.test(issue.message));
    if (paths.has('capabilities') && !unknownCapability) return { code: 'noCapabilities', capabilities: [] };
    return { code: 'invalidInput', capabilities: [] };
  }
  // Database guards (0154 triggers) backing the same rules.
  const state = sqlState(error);
  if (state === '42501') return { code: 'grantBeyondAuthority', capabilities: [] };
  if (state === '23514') return { code: 'notOrgMember', capabilities: [] };
  if (state === '23505') return { code: 'alreadyMember', capabilities: [] };
  return null;
}
