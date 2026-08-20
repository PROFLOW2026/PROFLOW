import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { ValidationError } from '@/shared/errors';
import {
  listModulePreferences,
  markModuleUsed,
  setModulePreference,
} from '../data/organizations.repository';
import { upsertOrganizationSettingValue } from '../data/organization-settings.repository';
import {
  CAPABILITY_MODE_SETTING_KEY,
  modulePreferenceWritesForProfile,
} from '../domain/capability-overrides';
import { requiredFoundationsFor } from '../domain/capability-registry';
import {
  CUSTOMER_FEATURE_MODULE_KEYS,
  resolveModuleVisibility,
  type ModuleVisibility,
  type OptionalModuleKey,
} from '../domain/types';
import { getBusinessProfileKeyForOrg } from './apply-business-profile';

/**
 * Adaptive navigation (doc 41 §2, option C).
 *
 * A module appears when the owner turns it on, or by itself once the
 * organization genuinely uses it. Turning one off hides navigation only —
 * nothing is deleted and no existing record becomes unreachable.
 */

export type { ModuleVisibility } from '../domain/types';
export { resolveModuleVisibility } from '../domain/types';

export async function getModuleVisibility(context: OrgContext): Promise<ModuleVisibility> {
  const preferences = await listModulePreferences(context.db, context.organizationId);
  return resolveModuleVisibility(preferences);
}

export async function setModuleVisibility(
  context: OrgContext,
  input: { moduleKey: OptionalModuleKey; enabled: boolean | null },
): Promise<{ enabledFoundations: readonly OptionalModuleKey[] }> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const enabledFoundations: OptionalModuleKey[] = [];

  if (input.enabled === true) {
    for (const foundation of requiredFoundationsFor(input.moduleKey)) {
      await setModulePreference(context.db, context.organizationId, foundation, true);
      enabledFoundations.push(foundation);
    }
  }

  await setModulePreference(context.db, context.organizationId, input.moduleKey, input.enabled);

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    CAPABILITY_MODE_SETTING_KEY,
    'custom',
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_module_preference',
    entityId: null,
    after: {
      moduleKey: input.moduleKey,
      enabled: input.enabled,
      enabledFoundations,
    },
  });

  return { enabledFoundations };
}

/**
 * Enable every customer-toggleable capability (Settings → “Show all”).
 * Does not change the stored business profile key.
 */
export async function enableAllCustomerCapabilities(context: OrgContext): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  for (const moduleKey of CUSTOMER_FEATURE_MODULE_KEYS) {
    await setModulePreference(context.db, context.organizationId, moduleKey, true);
  }

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    CAPABILITY_MODE_SETTING_KEY,
    'all',
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_module_preference',
    entityId: null,
    after: { action: 'enable_all_customer_capabilities' },
  });
}

/**
 * Reset module toggles to the current business profile recommendation (replace).
 */
export async function resetCapabilitiesToBusinessProfile(context: OrgContext): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const profileKey = await getBusinessProfileKeyForOrg(context.db, context.organizationId);
  if (!profileKey) {
    throw new ValidationError([
      { path: 'businessProfile', message: 'No business profile is set for this organization' },
    ]);
  }

  for (const write of modulePreferenceWritesForProfile(profileKey, 'replace')) {
    await setModulePreference(context.db, context.organizationId, write.moduleKey, write.enabled);
  }

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    CAPABILITY_MODE_SETTING_KEY,
    profileKey === 'ALL_CAPABILITIES' ? 'all' : 'profile',
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_module_preference',
    entityId: null,
    after: { action: 'reset_to_profile', profileKey },
  });
}

/**
 * Called by feature modules the first time they create something real, which is
 * what makes Workforce appear after the first employee without any setup step.
 * Intentionally unauthorized: it is a side effect of an action that was already
 * authorized by its own use case.
 */
export async function noteModuleUsage(
  db: DbExecutor,
  organizationId: string,
  moduleKey: OptionalModuleKey,
): Promise<void> {
  await markModuleUsed(db, organizationId, moduleKey);
}
