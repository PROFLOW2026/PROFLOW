import { sql } from 'drizzle-orm';
import { organizationMemberships, profiles } from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { createClient } from '@/modules/clients';
import { createExpense, finalizeExpense } from '@/modules/expenses';
import { createProject } from '@/modules/projects';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createOrganization, resolveOrgContext } from '@/modules/tenancy';
import type { Database, Transaction } from '@/shared/db/types';
import { OTHER_OWNER, OWNER, WORKER } from './config';

/**
 * Builds the world the end-to-end specs assert against.
 *
 * Everything is created through the real use cases as the real acting user, so
 * the seed exercises the same permission checks and RLS policies as production
 * rather than inserting rows behind their backs.
 */

export interface SeededWorld {
  organizationId: string;
  otherOrganizationId: string;
  projectId: string;
  otherProjectId: string;
}

async function asUser<T>(db: Database, userId: string, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('request.jwt.claim.sub', ${userId}, true)`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    await tx.execute(sql`set local role authenticated`);
    return fn(tx as Transaction);
  });
}

export async function seedWorld(db: Database): Promise<SeededWorld> {
  await seedSystemData(db);

  // Profiles normally arrive from Supabase Auth on first sign-in.
  await db
    .insert(profiles)
    .values(
      [OWNER, OTHER_OWNER, WORKER].map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      })),
    )
    .onConflictDoNothing();

  const primary = await asUser(db, OWNER.id, (tx) =>
    createOrganization(tx, OWNER.id, { name: 'חשמל דנה בע"מ', countryCode: 'IL' }),
  );

  const secondary = await asUser(db, OTHER_OWNER.id, (tx) =>
    createOrganization(tx, OTHER_OWNER.id, { name: 'לוי שיפוצים', countryCode: 'IL' }),
  );

  // A worker in the primary tenant, so permission gating can be driven from the UI.
  await asUser(db, OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: OWNER.id,
      organizationId: primary.organization.id,
      locale: 'he-IL',
    });

    const workerRole = await findRoleByKey(tx, context.organizationId, 'worker');
    if (!workerRole) throw new Error('worker role missing after provisioning');

    const [membership] = await tx
      .insert(organizationMemberships)
      .values({ organizationId: context.organizationId, userId: WORKER.id, status: 'active' })
      .returning({ id: organizationMemberships.id });

    await assignRole(tx, {
      organizationId: context.organizationId,
      membershipId: membership!.id,
      userId: WORKER.id,
      roleId: workerRole.id,
    });
  });

  const primaryProject = await asUser(db, OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: OWNER.id,
      organizationId: primary.organization.id,
      locale: 'he-IL',
    });

    const client = await createClient(context, {
      name: 'משפחת אברהמי',
      email: 'avrahami@example.test',
      phone: '050-1234567',
    });

    const project = await createProject(context, {
      name: 'שיפוץ דירה ברמת גן',
      clientId: client.id,
      contractValueAmount: '150000',
      location: 'רמת גן',
      status: 'active',
    });

    // One finalized cost so the financial panels have something honest to show.
    const expense = await createExpense(context, {
      amount: '12000',
      currency: 'ILS',
      description: 'כבלים וחומרי חשמל',
      projectId: project.projectId,
      supplierName: 'אלקטרו ספקים',
    });
    await finalizeExpense(context, expense.id);

    return project.projectId;
  });

  const secondaryProject = await asUser(db, OTHER_OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: OTHER_OWNER.id,
      organizationId: secondary.organization.id,
      locale: 'he-IL',
    });

    const project = await createProject(context, {
      name: 'פרויקט של דייר אחר',
      contractValueAmount: '90000',
      status: 'active',
    });

    return project.projectId;
  });

  return {
    organizationId: primary.organization.id,
    otherOrganizationId: secondary.organization.id,
    projectId: primaryProject,
    otherProjectId: secondaryProject,
  };
}
