import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import {
  listModulePreferences,
  markModuleUsed,
  setModulePreference,
} from '../data/organizations.repository';
import { OPTIONAL_MODULE_KEYS, type OptionalModuleKey } from '../domain/types';

/**
 * Adaptive navigation (doc 41 §2, option C).
 *
 * A module appears when the owner turns it on, or by itself once the
 * organization genuinely uses it. Turning one off hides navigation only —
 * nothing is deleted and no existing record becomes unreachable.
 */

export type ModuleVisibility = Record<OptionalModuleKey, boolean>;

export function resolveModuleVisibility(
  preferences: readonly { moduleKey: string; enabled: boolean | null; firstUsedAt: Date | null }[],
): ModuleVisibility {
  const byKey = new Map(preferences.map((preference) => [preference.moduleKey, preference]));

  return Object.fromEntries(
    OPTIONAL_MODULE_KEYS.map((key) => {
      const preference = byKey.get(key);
      // Explicit owner choice always wins; otherwise usage decides.
      if (preference?.enabled !== null && preference?.enabled !== undefined) {
        return [key, preference.enabled];
      }
      return [key, preference?.firstUsedAt != null];
    }),
  ) as ModuleVisibility;
}

export async function getModuleVisibility(context: OrgContext): Promise<ModuleVisibility> {
  const preferences = await listModulePreferences(context.db, context.organizationId);
  return resolveModuleVisibility(preferences);
}

export async function setModuleVisibility(
  context: OrgContext,
  input: { moduleKey: OptionalModuleKey; enabled: boolean | null },
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  await setModulePreference(context.db, context.organizationId, input.moduleKey, input.enabled);

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_module_preference',
    entityId: null,
    after: { moduleKey: input.moduleKey, enabled: input.enabled },
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
