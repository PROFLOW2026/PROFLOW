import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getOrganizationSettingValue, upsertOrganizationSettingValue } from '../data/organization-settings.repository';
import {
  DASHBOARD_QUICK_ACCESS_SETTING_KEY,
  listAccessibleDashboardQuickAccessCatalog,
  parseDashboardQuickAccessPreference,
  resolveDashboardQuickAccessShortcuts,
  type DashboardQuickAccessDefinition,
  type DashboardQuickAccessKey,
} from '../domain/dashboard-quick-access';
import { getModuleVisibility } from './module-visibility';

export async function getDashboardQuickAccessPreference(
  context: OrgContext,
): Promise<DashboardQuickAccessKey[]> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    DASHBOARD_QUICK_ACCESS_SETTING_KEY,
  );
  return parseDashboardQuickAccessPreference(raw);
}

export async function getDashboardQuickAccessShortcuts(
  context: OrgContext,
): Promise<DashboardQuickAccessDefinition[]> {
  const [savedKeys, modules] = await Promise.all([
    getDashboardQuickAccessPreference(context),
    getModuleVisibility(context),
  ]);
  return resolveDashboardQuickAccessShortcuts(savedKeys, context.permissions, modules);
}

export async function listDashboardQuickAccessCatalogForOrg(
  context: OrgContext,
): Promise<DashboardQuickAccessDefinition[]> {
  const modules = await getModuleVisibility(context);
  return listAccessibleDashboardQuickAccessCatalog(context.permissions, modules);
}

export async function saveDashboardQuickAccessPreference(
  context: OrgContext,
  keys: readonly DashboardQuickAccessKey[],
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const normalized = parseDashboardQuickAccessPreference([...keys]);
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    DASHBOARD_QUICK_ACCESS_SETTING_KEY,
    normalized,
  );
}
