import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { listPendingInvitations } from '@/modules/tenancy';
import { listOrganizationRoles, listPermissionsByRoleIds } from '@/modules/rbac';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessSection, canManageSection, SETTINGS_SECTIONS } from '../_lib/access';
import { listOrganizationMembers } from '@/modules/tenancy';
import {
  canManageProjectAccess,
  getProjectAccessModeForOrg,
  listProjectAccessGrantsForOrg,
  listProjectsForOrg,
} from '@/modules/projects';
import { SettingsNotAllowed } from '../settings-not-allowed';
import { SettingsPageShell, settingsMetadata } from '../settings-shell';
import { PeopleSettingsPanel } from './people-panel';
import { ProjectAccessPanel } from './project-access-panel';

export async function generateMetadata(): Promise<Metadata> {
  return settingsMetadata('people');
}

export default async function PeopleSettingsPage() {
  const t = await getTranslations('organization.members');
  const section = SETTINGS_SECTIONS.find((item) => item.key === 'people')!;

  const data = await withOrgContext(async (context) => {
    if (!canAccessSection(context, section)) {
      return { allowed: false as const };
    }

    const [members, pending, roles, accessMode, grants, projectRows] = await Promise.all([
      listOrganizationMembers(context),
      hasPermission(context, PERMISSIONS.INVITATIONS_MANAGE)
        ? listPendingInvitations(context)
        : Promise.resolve([]),
      listOrganizationRoles(context.db, context.organizationId),
      getProjectAccessModeForOrg(context),
      listProjectAccessGrantsForOrg(context).catch(() => []),
      hasPermission(context, PERMISSIONS.PROJECTS_READ)
        ? listProjectsForOrg(context, { includeArchived: false }).catch(() => [])
        : Promise.resolve([]),
    ]);

    const roleIdToKey = Object.fromEntries(roles.map((role) => [role.id, role.key]));
    const permissionsByRoleId = await listPermissionsByRoleIds(
      context.db,
      roles.map((role) => role.id),
    );
    const accessAllRoleKeys = new Set(
      roles
        .filter((role) =>
          (permissionsByRoleId.get(role.id) ?? []).includes(PERMISSIONS.PROJECTS_ACCESS_ALL),
        )
        .map((role) => role.key),
    );
    const accessAllMembers = members.filter((member) =>
      member.roleKeys.some((key) => accessAllRoleKeys.has(key)),
    );

    return {
      allowed: true as const,
      members,
      pending,
      roleIdToKey,
      currentUserId: context.userId,
      canManage: canManageSection(context, 'people'),
      canManageAccess: canManageProjectAccess(context),
      canInvite: hasPermission(context, PERMISSIONS.INVITATIONS_MANAGE),
      canInviteOwner: hasPermission(context, PERMISSIONS.ROLES_MANAGE),
      timezone: context.organization.timezone,
      accessMode,
      grants,
      projects: projectRows.map((row) => ({ id: row.id, name: row.name })),
      accessAllMembers: accessAllMembers.map((member) => ({
        userId: member.userId,
        email: member.email,
        displayName: member.displayName,
      })),
    };
  });

  if (!data.allowed) {
    return (
      <SettingsPageShell title={t('title')}>
        <SettingsNotAllowed />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t('title')} description={t('subtitle')}>
      <Card className="p-5">
        <PeopleSettingsPanel
          members={data.members}
          pendingInvitations={data.pending}
          roleIdToKey={data.roleIdToKey}
          currentUserId={data.currentUserId}
          canManage={data.canManage}
          canInvite={data.canInvite}
          canInviteOwner={data.canInviteOwner}
          timezone={data.timezone}
        />
        <ProjectAccessPanel
          mode={data.accessMode}
          canManage={data.canManageAccess}
          members={data.members}
          projects={data.projects}
          grants={data.grants}
          accessAllMembers={data.accessAllMembers}
        />
      </Card>
    </SettingsPageShell>
  );
}
