'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import {
  activateEmployeeAppAccess,
  getEmployeeAppAdminView,
  resetEmployeeAppPin,
  revokeEmployeeAppSessions,
  saveEmployeeAppGrants,
  updateEmployeeAppStatus,
} from '@/modules/employee-app';
import type { EmployeePresetKey } from '@/modules/employee-app/application/presets';
import type { PermissionKey } from '@/shared/permissions/catalog';
import type { PermissionScope } from '@/shared/permissions/scopes';
import type { DocumentCategory } from '@/modules/documents/domain/categories';
import { isDocumentCategory } from '@/modules/documents/domain/categories';

export async function activateEmployeeAppAction(
  employeeId: string,
  presetKey: EmployeePresetKey = 'field_worker',
): Promise<{ username: string; temporaryPin: string; loginPath: string }> {
  return withOrgContext(async (context) => {
    const result = await activateEmployeeAppAccess(context, { employeeId, presetKey });
    revalidatePath(`/workforce/employees/${employeeId}`);
    return {
      username: result.username,
      temporaryPin: result.temporaryPin,
      loginPath: result.loginPath,
    };
  });
}

export async function suspendEmployeeAppAction(employeeId: string): Promise<void> {
  return withOrgContext(async (context) => {
    await updateEmployeeAppStatus(context, employeeId, 'suspended');
    revalidatePath(`/workforce/employees/${employeeId}`);
  });
}

export async function resumeEmployeeAppAction(employeeId: string): Promise<void> {
  return withOrgContext(async (context) => {
    await updateEmployeeAppStatus(context, employeeId, 'active');
    revalidatePath(`/workforce/employees/${employeeId}`);
  });
}

export async function blockEmployeeAppAction(employeeId: string): Promise<void> {
  return withOrgContext(async (context) => {
    await updateEmployeeAppStatus(context, employeeId, 'blocked');
    revalidatePath(`/workforce/employees/${employeeId}`);
  });
}

export async function disableEmployeeAppAction(employeeId: string): Promise<void> {
  return withOrgContext(async (context) => {
    await updateEmployeeAppStatus(context, employeeId, 'inactive');
    revalidatePath(`/workforce/employees/${employeeId}`);
  });
}

export async function resetEmployeeAppPinAction(
  employeeId: string,
): Promise<{ temporaryPin: string }> {
  return withOrgContext(async (context) => {
    const result = await resetEmployeeAppPin(context, employeeId);
    revalidatePath(`/workforce/employees/${employeeId}`);
    return { temporaryPin: result.temporaryPin };
  });
}

export async function revokeEmployeeAppSessionsAction(employeeId: string): Promise<void> {
  return withOrgContext(async (context) => {
    await revokeEmployeeAppSessions(context, employeeId);
    revalidatePath(`/workforce/employees/${employeeId}`);
  });
}

export async function loadEmployeeAppAdminAction(employeeId: string) {
  return withOrgContext((context) => getEmployeeAppAdminView(context, employeeId));
}

export async function saveEmployeeAppGrantsAction(
  employeeId: string,
  formData: FormData,
): Promise<void> {
  return withOrgContext(async (context) => {
    const grants: Array<{ permissionKey: PermissionKey; scope: PermissionScope; granted: boolean }> =
      [];
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith('perm:') || value !== 'on') continue;
      const permissionKey = key.slice(5) as PermissionKey;
      const scope = String(formData.get(`scope:${permissionKey}`) ?? 'self_only') as PermissionScope;
      grants.push({ permissionKey, scope, granted: true });
    }

    const categories = new Map<DocumentCategory, boolean>();
    for (const [key, value] of formData.entries()) {
      if (!key.startsWith('cat:') || value !== 'on') continue;
      const category = key.slice(4);
      if (isDocumentCategory(category)) categories.set(category, true);
    }

    await saveEmployeeAppGrants(context, { employeeId, grants, documentCategories: categories });
    revalidatePath(`/workforce/employees/${employeeId}`);
  });
}
