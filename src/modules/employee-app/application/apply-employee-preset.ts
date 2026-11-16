import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import {
  replaceEmployeeDocumentCategoryGrants,
  upsertEmployeePermissionGrant,
} from '../data/grants.repository';
import { employeePreset, type EmployeePresetKey } from './presets';

/** System provisioning path. Does not check the caller's own grants. */
export async function applyEmployeePresetGrants(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    presetKey: EmployeePresetKey;
    grantedByUserId: string;
  },
): Promise<void> {
  const preset = employeePreset(input.presetKey);
  for (const grant of preset.grants) {
    await upsertEmployeePermissionGrant(db, {
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      permissionKey: grant.permissionKey,
      scope: grant.scope,
      granted: true,
      grantedByUserId: input.grantedByUserId,
    });
  }
  await replaceEmployeeDocumentCategoryGrants(
    db,
    input.organizationId,
    input.employeeId,
    new Map(preset.documentCategories.map((category) => [category, true])),
    input.grantedByUserId,
  );
}
