import type { DbExecutor } from '../../src/shared/db/types.ts';
import { SEED_REGISTRY_SETTING_KEY } from './constants.ts';
import type { SeedRegistry } from './seed-registry-keys.ts';

export type { SeedRegistry } from './seed-registry-keys.ts';
export {
  containsVisibleSeedMarker,
  parseSeedAdminTaskRegistryKey,
  parseSeedTaskRegistryKey,
  seedAdminTaskRegistryKey,
  seedMeetingRegistryKey,
  seedTaskRegistryKey,
} from './seed-registry-keys.ts';

export async function loadSeedRegistry(
  db: DbExecutor,
  organizationId: string,
): Promise<SeedRegistry> {
  const { getOrganizationSettingValue } = await import(
    '../../src/modules/tenancy/data/organization-settings.repository.ts'
  );
  const stored = await getOrganizationSettingValue<SeedRegistry>(
    db,
    organizationId,
    SEED_REGISTRY_SETTING_KEY,
  );
  return stored ?? {};
}

export async function saveSeedRegistry(
  db: DbExecutor,
  organizationId: string,
  registry: SeedRegistry,
): Promise<void> {
  const { upsertOrganizationSettingValue } = await import(
    '../../src/modules/tenancy/data/organization-settings.repository.ts'
  );
  await upsertOrganizationSettingValue(db, organizationId, SEED_REGISTRY_SETTING_KEY, registry);
}
