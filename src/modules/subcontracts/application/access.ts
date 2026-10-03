import { loadProjectCapabilities, PROJECT_CAPABILITIES as C } from '@/modules/project-team';
import type { ProjectCapability } from '@/modules/project-team';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';
import { findAgreementOperational } from '../data/agreements.repository';
import type { AgreementOperationalView, SubcontractAccess } from '../domain/types';

/** Internal authorization for subcontract core: project capabilities only, never role names. */
export async function loadSubcontractAccess(context: OrgContext, projectId: string): Promise<SubcontractAccess> {
  const held = await loadProjectCapabilities(context, projectId);
  return accessFromCapabilities(held);
}

export function accessFromCapabilities(held: ReadonlySet<ProjectCapability>): SubcontractAccess {
  return {
    canView: held.has(C.CONTRACTOR_VIEW),
    canCoordinate: held.has(C.CONTRACTOR_COORDINATE),
    canViewFinancial: held.has(C.CONTRACT_FINANCIAL_VIEW),
    canManageContract: held.has(C.CONTRACT_MANAGE),
    canManageChangeFinancial: held.has(C.CHANGE_FINANCIAL_MANAGE),
  };
}

const KEY_TO_CAPABILITY: Readonly<Record<keyof SubcontractAccess, ProjectCapability>> = {
  canView: C.CONTRACTOR_VIEW,
  canCoordinate: C.CONTRACTOR_COORDINATE,
  canViewFinancial: C.CONTRACT_FINANCIAL_VIEW,
  canManageContract: C.CONTRACT_MANAGE,
  canManageChangeFinancial: C.CHANGE_FINANCIAL_MANAGE,
};

export function requireAccess(access: SubcontractAccess, key: keyof SubcontractAccess): void {
  if (!access[key]) throw new AuthorizationError(`project:${KEY_TO_CAPABILITY[key]}`);
}

export function requireAnyAccess(access: SubcontractAccess, keys: readonly (keyof SubcontractAccess)[]): void {
  if (!keys.some((key) => access[key])) {
    throw new AuthorizationError(`project:${keys.map((key) => KEY_TO_CAPABILITY[key]).join('|')}`);
  }
}

/** Agreement visible to the caller (RLS) + the caller's access on its project. No existence oracle. */
export async function loadAgreementWithAccess(
  context: OrgContext,
  agreementId: string,
): Promise<{ agreement: AgreementOperationalView; access: SubcontractAccess }> {
  const agreement = await findAgreementOperational(context.db, context.organizationId, agreementId);
  if (!agreement) throw new NotFoundError('Subcontract agreement');
  const access = await loadSubcontractAccess(context, agreement.projectId);
  if (!access.canView) throw new NotFoundError('Subcontract agreement');
  return { agreement, access };
}

export function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}
