import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { listModulePreferences } from '../data/organizations.repository';
import { resolveModuleVisibility, type ModuleVisibility } from '../domain/types';

/** Shell read: which modules are visible. Does not apply or seed a business profile. */
export async function getModuleVisibility(context: OrgContext): Promise<ModuleVisibility> {
  const preferences = await listModulePreferences(context.db, context.organizationId);
  return resolveModuleVisibility(preferences);
}
