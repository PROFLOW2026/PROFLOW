import 'server-only';

import type { DbExecutor } from '@/shared/db/types';
import { getOrganizationSettingValue } from '../data/organization-settings.repository';
import {
  BUSINESS_PROFILE_SETTING_KEY,
  getBusinessProfile,
  type BusinessProfileKey,
} from '../domain/business-profiles';

/** Settings read only. Does not seed catalogs, documents, or storage. */
export async function getBusinessProfileKeyForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<BusinessProfileKey | null> {
  const raw = await getOrganizationSettingValue<unknown>(
    db,
    organizationId,
    BUSINESS_PROFILE_SETTING_KEY,
  );
  if (typeof raw === 'string') {
    return getBusinessProfile(raw)?.key ?? null;
  }
  return null;
}
