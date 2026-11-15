import 'server-only';

import { eq } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import { DomainRuleError } from '@/shared/errors';
import type { DbExecutor } from '@/shared/db/types';
import { isDemoOrganization } from '../domain/demo-org';

export async function readDemoKind(db: DbExecutor, organizationId: string): Promise<string | null> {
  if (typeof db.select !== "function") return null;
  const [row] = await db
    .select({ demoKind: organizations.demoKind })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row?.demoKind ?? null;
}

export async function assertNotDemoOrganization(db: DbExecutor, organizationId: string): Promise<void> {
  const kind = await readDemoKind(db, organizationId);
  if (isDemoOrganization(kind)) {
    throw new DomainRuleError(
      'Demo organizations cannot perform this action',
      'demo.errors.externalBlocked',
    );
  }
}
