import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export const OCR_WORKER_USER_ID = '00000000-0000-4000-8000-000000000001';

/** Internal worker must read external storage and update OCR job rows. */
export const OCR_WORKER_PERMISSIONS = [
  PERMISSIONS.DOCUMENTS_READ,
  PERMISSIONS.DOCUMENTS_MANAGE,
] as const;

export function buildOcrWorkerOrgContext(
  db: DbExecutor,
  organization: OrgContext['organization'],
): OrgContext {
  return {
    userId: OCR_WORKER_USER_ID,
    organizationId: organization.id,
    membershipId: OCR_WORKER_USER_ID,
    organization,
    permissions: new Set(OCR_WORKER_PERMISSIONS),
    roleKeys: ['ocr_worker'],
    db,
    locale: organization.defaultLocale || 'en',
  };
}
