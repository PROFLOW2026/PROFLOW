import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { isUsableStorageConnection } from '../domain/connection-rules';
import { ensureUsablePrimaryStorageConnection } from './reconcile-primary-storage';

/** Whether the organization has an active external storage connection for new uploads. */
export async function isOrganizationStorageConfigured(context: OrgContext): Promise<boolean> {
  const primary = await ensureUsablePrimaryStorageConnection(
    context.db,
    context.organizationId,
  );
  return isUsableStorageConnection(primary);
}
