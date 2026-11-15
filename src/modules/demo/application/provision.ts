import 'server-only';

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import { seedDefaultCostCategories } from '@/modules/tenancy';
import { applyBusinessProfileConfig } from '@/modules/tenancy/application/apply-business-profile';
import { provisionOrganizationRoles } from '@/modules/rbac';
import type { DbExecutor } from '@/shared/db/types';
import { withTransaction } from '@/shared/db/client';
import type { OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';
import type { DemoKind } from '../domain/demo-org';

export async function withDemoProvisioner<T>(
  db: DbExecutor,
  fn: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  return withTransaction(db, async (tx) => {
    await tx.execute(sql`select set_config('app.demo_provisioner', 'on', true)`);
    return fn(tx);
  });
}

export async function insertDemoOrganization(
  db: DbExecutor,
  input: {
    readonly name: string;
    readonly demoKind: DemoKind;
    readonly profileKey: OnboardingBusinessType;
  },
): Promise<string> {
  const id = randomUUID();
  await db.insert(organizations).values({
    id,
    name: input.name,
    countryCode: 'IL',
    baseCurrency: 'ILS',
    timezone: 'Asia/Jerusalem',
    defaultLocale: 'he-IL',
    demoKind: input.demoKind,
  });
  await provisionOrganizationRoles(db, id);
  await seedDefaultCostCategories(db, id);
  await applyBusinessProfileConfig(db, id, input.profileKey, 'he-IL');
  return id;
}
