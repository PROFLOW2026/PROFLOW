import { eq } from 'drizzle-orm';
import { organizations } from '../schema';
import type { DbExecutor } from '@/shared/db/types';
import { createOrganization } from '@/modules/tenancy';
import { ensureProfile } from '@/modules/identity';

/**
 * Demo data for local development and E2E runs (doc 77).
 *
 * Deliberately small and deliberately *incomplete*: the demo organization has
 * expenses but no workforce and no overhead allocation, so the coverage
 * disclosure has something real to disclose. A demo dataset that fills every
 * module would hide the exact behaviour we most need to see.
 *
 * Never run against production. Idempotent, so `npm run seed:demo` is safe to
 * repeat.
 */

export const DEMO_ORGANIZATION_NAME = 'ProjectFlow Demo';

export interface DemoSeedResult {
  organizationId: string;
  created: boolean;
}

export async function seedDemoData(
  db: DbExecutor,
  options: { ownerUserId: string; ownerEmail: string },
): Promise<DemoSeedResult> {
  const [existing] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.name, DEMO_ORGANIZATION_NAME))
    .limit(1);

  if (existing) return { organizationId: existing.id, created: false };

  await ensureProfile(db, {
    id: options.ownerUserId,
    email: options.ownerEmail,
    displayName: 'Demo Owner',
  });

  const { organization } = await createOrganization(db, options.ownerUserId, {
    name: DEMO_ORGANIZATION_NAME,
    countryCode: 'IL',
  });

  return { organizationId: organization.id, created: true };
}
