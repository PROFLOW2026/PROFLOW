import { DomainRuleError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { findEscalatingPermissions } from '../domain/permission-subset';
import { listRolePermissions } from '../data/roles.repository';

/**
 * Rejects granting a role whose effective permissions exceed what the actor
 * already holds (doc 73 §10).
 */
export async function assertCanGrantRole(
  context: OrgContext,
  db: DbExecutor,
  roleId: string,
): Promise<void> {
  const targetPermissions = await listRolePermissions(db, roleId);
  const escalating = findEscalatingPermissions(context.permissions, targetPermissions);

  if (escalating.length > 0) {
    throw new DomainRuleError(
      'Cannot grant a role with permissions you do not hold',
      'errors.invitations.cannotEscalate',
      { missingPermissions: escalating },
    );
  }
}
