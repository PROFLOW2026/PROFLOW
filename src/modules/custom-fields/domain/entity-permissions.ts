import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import type { CustomFieldEntityType } from './types';

/** Read gates — mirrors `app.custom_field_value_row_allowed(..., false)` in 0185. */
export const CUSTOM_FIELD_ENTITY_READ_PERMISSION: Record<CustomFieldEntityType, PermissionKey> = {
  client: PERMISSIONS.CLIENTS_READ,
  project: PERMISSIONS.PROJECTS_READ,
  vendor: PERMISSIONS.VENDORS_READ,
  employee: PERMISSIONS.WORKFORCE_READ,
  opportunity: PERMISSIONS.CRM_READ,
  expense: PERMISSIONS.EXPENSES_READ,
};

/** Write gates — mirrors `app.custom_field_value_row_allowed(..., true)` in 0185. */
export const CUSTOM_FIELD_ENTITY_WRITE_PERMISSION: Record<CustomFieldEntityType, PermissionKey> = {
  client: PERMISSIONS.CLIENTS_MANAGE,
  project: PERMISSIONS.PROJECTS_UPDATE,
  vendor: PERMISSIONS.VENDORS_MANAGE,
  employee: PERMISSIONS.WORKFORCE_MANAGE,
  opportunity: PERMISSIONS.CRM_MANAGE,
  expense: PERMISSIONS.EXPENSES_UPDATE,
};
