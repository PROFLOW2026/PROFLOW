import { listClientsForOrg, listContactsForClients } from '@/modules/clients';
import { listOrganizationMembers } from '@/modules/tenancy';
import { listEmployeesForOrg } from '@/modules/workforce';
import { listProjectsForOrg } from '@/modules/projects';
import { listWorkspaces } from '@/modules/workspaces';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function loadMeetingPickerData(context: OrgContext) {
  const [projects, workspaces] = await Promise.all([
    listProjectsForOrg(context, {}).catch(() => []),
    listWorkspaces(context, {}).catch(() => []),
  ]);

  return {
    projects: projects.map((project) => ({ id: project.id, name: project.name })),
    workspaces: workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
  };
}

export async function loadAttendeePickerData(context: OrgContext) {
  const [members, employees, contacts] = await Promise.all([
    hasPermission(context, PERMISSIONS.MEMBERS_READ)
      ? listOrganizationMembers(context)
          .then((rows) =>
            rows
              .filter((row) => row.status === 'active')
              .map((row) => ({
                id: row.membershipId,
                name: row.displayName ?? row.email,
              })),
          )
          .catch(() => [])
      : Promise.resolve([]),
    listEmployeesForOrg(context, { status: 'active' })
      .then((rows) => rows.map((row) => ({ id: row.id, name: row.name })))
      .catch(() => []),
    hasPermission(context, PERMISSIONS.CLIENTS_READ)
      ? listClientsForOrg(context, {})
          .then(async (clients) => {
            const contactRows = await listContactsForClients(
              context,
              clients.map((client) => client.id),
            );
            const clientNameById = new Map(clients.map((client) => [client.id, client.name]));
            return contactRows.map((contact) => ({
              id: contact.id,
              name: contact.name,
              clientName: clientNameById.get(contact.clientId) ?? null,
            }));
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  return { members, employees, contacts };
}

export async function loadAssigneePickerData(context: OrgContext) {
  const { members, employees } = await loadAttendeePickerData(context);
  return { members, employees };
}
