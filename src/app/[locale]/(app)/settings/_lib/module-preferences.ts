import { eq } from 'drizzle-orm';
import { organizationModulePreferences } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';

export async function listModulePreferencesForOrg(context: OrgContext) {
  return context.db
    .select({
      moduleKey: organizationModulePreferences.moduleKey,
      enabled: organizationModulePreferences.enabled,
      firstUsedAt: organizationModulePreferences.firstUsedAt,
    })
    .from(organizationModulePreferences)
    .where(eq(organizationModulePreferences.organizationId, context.organizationId));
}
