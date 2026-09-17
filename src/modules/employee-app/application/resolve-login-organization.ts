import 'server-only';

import { sql } from 'drizzle-orm';
import { organizations } from '@drizzle/schema';
import { getAdminDb } from '@/shared/db/client';
import { DomainRuleError } from '@/shared/errors';
import { normalizeUsername } from '../domain/username';
import { findActiveEmployeeAppAccountsByUsername } from '../data/accounts.repository';

export async function resolveEmployeeLoginOrganizationId(input: {
  organizationId: string;
  companyName: string;
  username: string;
}): Promise<string> {
  const trimmedOrgId = input.organizationId.trim();
  if (trimmedOrgId) return trimmedOrgId;

  const db = getAdminDb();
  const usernameNormalized = normalizeUsername(input.username);
  const companyName = input.companyName.trim();

  if (companyName) {
    const [org] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(sql`lower(${organizations.name}) = lower(${companyName})`)
      .limit(1);
    if (!org) {
      throw new DomainRuleError('Company not found', 'employeeApp.errors.companyNotFound');
    }
    return org.id;
  }

  const matches = await findActiveEmployeeAppAccountsByUsername(db, usernameNormalized);
  if (matches.length === 1) return matches[0]!.organizationId;
  if (matches.length === 0) {
    throw new DomainRuleError('Company name required', 'employeeApp.errors.companyRequired');
  }
  throw new DomainRuleError('Company name required', 'employeeApp.errors.companyAmbiguous');
}
