import { describe, expect, it } from 'vitest';
import { CUSTOM_FIELD_ENTITY_TYPES } from '@/modules/custom-fields/domain/types';
import {
  CUSTOM_FIELD_ENTITY_READ_PERMISSION,
  CUSTOM_FIELD_ENTITY_WRITE_PERMISSION,
} from '@/modules/custom-fields/domain/entity-permissions';
import { PERMISSIONS } from '@/shared/permissions/catalog';

/** Mirrors `app.custom_field_value_row_allowed` entity branches in prepared 0185. */
const RLS_0185_READ: Record<(typeof CUSTOM_FIELD_ENTITY_TYPES)[number], string> = {
  client: PERMISSIONS.CLIENTS_READ,
  project: PERMISSIONS.PROJECTS_READ,
  vendor: PERMISSIONS.VENDORS_READ,
  employee: PERMISSIONS.WORKFORCE_READ,
  opportunity: PERMISSIONS.CRM_READ,
  expense: PERMISSIONS.EXPENSES_READ,
};

const RLS_0185_WRITE: Record<(typeof CUSTOM_FIELD_ENTITY_TYPES)[number], string> = {
  client: PERMISSIONS.CLIENTS_MANAGE,
  project: PERMISSIONS.PROJECTS_UPDATE,
  vendor: PERMISSIONS.VENDORS_MANAGE,
  employee: PERMISSIONS.WORKFORCE_MANAGE,
  opportunity: PERMISSIONS.CRM_MANAGE,
  expense: PERMISSIONS.EXPENSES_UPDATE,
};

describe('custom field entity permissions vs 0185 RLS', () => {
  it('read map matches prepared custom_field_value_row_allowed read branches', () => {
    for (const entityType of CUSTOM_FIELD_ENTITY_TYPES) {
      expect(CUSTOM_FIELD_ENTITY_READ_PERMISSION[entityType]).toBe(RLS_0185_READ[entityType]);
    }
  });

  it('write map matches prepared custom_field_value_row_allowed write branches', () => {
    for (const entityType of CUSTOM_FIELD_ENTITY_TYPES) {
      expect(CUSTOM_FIELD_ENTITY_WRITE_PERMISSION[entityType]).toBe(RLS_0185_WRITE[entityType]);
    }
  });
});
