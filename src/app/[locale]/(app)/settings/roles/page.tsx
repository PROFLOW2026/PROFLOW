import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listOrganizationRoles, listRolePermissions } from '@/modules/rbac';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, SETTINGS_SECTIONS } from '../_lib/access';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { RolesSettingsPanel } from './roles-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('roles');
}

export default async function RolesSettingsPage() {
  const t = await getTranslations('settings.roles');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'roles')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) return { allowed: false as const };

    const roles = await listOrganizationRoles(context.db, context.organizationId);
    const rolePermissions: Record<string, PermissionKey[]> = {};

    for (const role of roles) {
      rolePermissions[role.key] = await listRolePermissions(context.db, role.id);
    }

    return { allowed: true as const, rolePermissions };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('title')}>
      <Card className="p-5">
        <RolesSettingsPanel rolePermissions={data.rolePermissions} />
      </Card>
    </SettingsPageShell>
  );
}
