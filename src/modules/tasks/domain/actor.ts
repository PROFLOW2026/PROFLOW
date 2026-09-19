/**
 * Actor model enforcement (UWM mandatory).
 *
 * Every task operation MUST use exactly one of:
 *  - orgMemberId  (human org member)
 *  - employeeId   (human employee)
 *  - system       (automated process: recurrence, automation)
 *
 * NEVER use generic userId or creatorId.
 */

import { DomainRuleError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';

export interface HumanActor {
  readonly orgMemberId: string | null;
  readonly employeeId: string | null;
}

export interface SystemActor {
  readonly system: true;
}

export type TaskActor = HumanActor | SystemActor;

export function isSystemActor(actor: TaskActor): actor is SystemActor {
  return 'system' in actor && actor.system === true;
}

/**
 * Asserts that the actor is a human (org member or employee).
 * Throws DomainRuleError if it's a system actor.
 */
export function assertHumanActor(actor: TaskActor, operation: string): HumanActor {
  if (isSystemActor(actor)) {
    throw new DomainRuleError(
      `Operation '${operation}' requires a human actor (org member or employee), not system`,
      'tasks.errors.humanActorRequired',
    );
  }
  if (!actor.orgMemberId && !actor.employeeId) {
    throw new DomainRuleError(
      `Operation '${operation}' requires exactly one of orgMemberId or employeeId`,
      'tasks.errors.humanActorRequired',
    );
  }
  return actor;
}

/**
 * Asserts that the actor is system. Used in recurrence / automation paths.
 */
export function assertSystemActor(actor: TaskActor, operation: string): SystemActor {
  if (!isSystemActor(actor)) {
    throw new DomainRuleError(
      `Operation '${operation}' must be performed by system, not a human actor`,
      'tasks.errors.systemActorRequired',
    );
  }
  return actor;
}

/**
 * Builds the creator fields for task insertion from OrgContext.
 * OrgContext users are always org members (human).
 */
export function buildCreatorFieldsFromContext(context: OrgContext): {
  createdByOrgMemberId: string;
  createdByEmployeeId: null;
  createdBySystem: false;
} {
  return {
    createdByOrgMemberId: context.membershipId,
    createdByEmployeeId: null,
    createdBySystem: false,
  };
}

/**
 * Builds system creator fields for recurrence / automation.
 */
export function buildSystemCreatorFields(): {
  createdByOrgMemberId: null;
  createdByEmployeeId: null;
  createdBySystem: true;
} {
  return {
    createdByOrgMemberId: null,
    createdByEmployeeId: null,
    createdBySystem: true,
  };
}

/**
 * Builds activity actor fields from OrgContext (human org member).
 */
export function buildActivityActorFieldsFromContext(context: OrgContext): {
  actorOrgMemberId: string;
  actorEmployeeId: null;
  actorSystem: false;
} {
  return {
    actorOrgMemberId: context.membershipId,
    actorEmployeeId: null,
    actorSystem: false,
  };
}

/**
 * Builds system activity actor fields.
 */
export function buildSystemActivityActorFields(): {
  actorOrgMemberId: null;
  actorEmployeeId: null;
  actorSystem: true;
} {
  return {
    actorOrgMemberId: null,
    actorEmployeeId: null,
    actorSystem: true,
  };
}

/**
 * Validates comment author — must be a human (org member or employee).
 */
export function validateCommentAuthor(
  authorOrgMemberId: string | null | undefined,
  authorEmployeeId: string | null | undefined,
): void {
  const hasOrgMember = Boolean(authorOrgMemberId);
  const hasEmployee = Boolean(authorEmployeeId);
  if (!hasOrgMember && !hasEmployee) {
    throw new ValidationError([
      {
        path: 'author',
        message: 'Comment author must be an org member or employee (human actor required)',
        messageKey: 'tasks.errors.humanActorRequired',
      },
    ]);
  }
  if (hasOrgMember && hasEmployee) {
    throw new ValidationError([
      {
        path: 'author',
        message: 'Exactly one of authorOrgMemberId or authorEmployeeId must be set',
        messageKey: 'tasks.errors.exactlyOneActor',
      },
    ]);
  }
}
