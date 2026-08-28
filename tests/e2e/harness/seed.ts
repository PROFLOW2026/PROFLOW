import { eq, sql } from 'drizzle-orm';
import { costCategories, organizationMemberships, profiles } from '@drizzle/schema';
import { seedSystemData } from '@drizzle/seed/system';
import { createClient } from '@/modules/clients';
import { createExpense, finalizeExpense } from '@/modules/expenses';
import { activateBoq, createProjectBoq, upsertBoqNode } from '@/modules/boq';
import {
  approveChangeRequest,
  createChangeRequest,
  submitChangeRequestForApproval,
} from '@/modules/commercial';
import { createProject } from '@/modules/projects';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createOrganization, resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { createVendor, createVendorEngagement } from '@/modules/vendors';
import type { Database, Transaction } from '@/shared/db/types';
import {
  ELECTRICAL_OWNER,
  FIELD_OWNER,
  FINANCE,
  GC_OWNER,
  MAINTENANCE_OWNER,
  MANAGER,
  MIXED_OWNER,
  OTHER_OWNER,
  OWNER,
  PLUMBING_OWNER,
  WORKER,
} from './config';
import type { BusinessProfileKey } from '@/modules/tenancy/domain/business-profiles';

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
  vendorId: string;
  advancedProjectId: string;
  changeProjectId: string;
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
      [
        OWNER,
        OTHER_OWNER,
        WORKER,
        MANAGER,
        FINANCE,
        GC_OWNER,
        ELECTRICAL_OWNER,
        PLUMBING_OWNER,
        MAINTENANCE_OWNER,
        FIELD_OWNER,
        MIXED_OWNER,
      ].map((user) => ({
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

    const managerRole = await findRoleByKey(tx, context.organizationId, 'manager');
    if (!managerRole) throw new Error('manager role missing after provisioning');
    const [managerMembership] = await tx
      .insert(organizationMemberships)
      .values({ organizationId: context.organizationId, userId: MANAGER.id, status: 'active' })
      .returning({ id: organizationMemberships.id });
    await assignRole(tx, {
      organizationId: context.organizationId,
      membershipId: managerMembership!.id,
      userId: MANAGER.id,
      roleId: managerRole.id,
    });

    const financeRole = await findRoleByKey(tx, context.organizationId, 'finance');
    if (!financeRole) throw new Error('finance role missing after provisioning');
    const [financeMembership] = await tx
      .insert(organizationMemberships)
      .values({ organizationId: context.organizationId, userId: FINANCE.id, status: 'active' })
      .returning({ id: organizationMemberships.id });
    await assignRole(tx, {
      organizationId: context.organizationId,
      membershipId: financeMembership!.id,
      userId: FINANCE.id,
      roleId: financeRole.id,
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
    const categoryRows = await tx
      .select({ id: costCategories.id, key: costCategories.key })
      .from(costCategories)
      .where(eq(costCategories.organizationId, context.organizationId));
    const materialsCategoryId = categoryRows.find((row) => row.key === 'materials')?.id;
    if (!materialsCategoryId) {
      throw new Error('materials cost category missing after organization provisioning');
    }

    const expense = await createExpense(context, {
      amount: '12000',
      currency: 'ILS',
      description: 'כבלים וחומרי חשמל',
      projectId: project.projectId,
      supplierName: 'אלקטרו ספקים',
      costCategoryId: materialsCategoryId,
      costFamily: 'direct_project',
      vatMode: 'zero',
    });
    await finalizeExpense(context, expense.id);

    // Enable optional workspace tabs used by authenticated product flows / perf verification.
    for (const moduleKey of ['changes', 'billing', 'documents', 'boq'] as const) {
      await setModuleVisibility(context, { moduleKey, enabled: true });
    }

    // Reproducible BOQ draft for Playwright (activate / progress covered in integration + panel smoke).
    const boq = await createProjectBoq(context, {
      projectId: project.projectId,
      title: 'כתב כמויות בדיקה',
      progressMode: 'simple',
    });
    if (boq) {
      await upsertBoqNode(context, {
        boqId: boq.id,
        nodeKind: 'item',
        itemCode: '1.01',
        description: 'סעיף בדיקה',
        unit: 'יח׳',
        pricingType: 'quantity_unit_price',
        quantity: '10',
        unitPrice: '100',
      });
    }

    return project.projectId;
  });

  const vendorId = await asUser(db, OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: OWNER.id,
      organizationId: primary.organization.id,
      locale: 'he-IL',
    });
    const vendor = await createVendor(context, {
      name: 'Fixture Supplies Ltd',
    });
    return vendor.id;
  });

  const advancedProjectId = await asUser(db, OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: OWNER.id,
      organizationId: primary.organization.id,
      locale: 'he-IL',
    });
    const project = await createProject(context, {
      name: 'BOQ Advanced E2E',
      contractValueAmount: '80000',
      status: 'active',
    });
    const boq = await createProjectBoq(context, {
      projectId: project.projectId,
      title: 'Advanced BOQ',
      progressMode: 'advanced',
    });
    if (boq) {
      await upsertBoqNode(context, {
        boqId: boq.id,
        nodeKind: 'item',
        itemCode: 'A.01',
        description: 'סעיף מתקדם',
        unit: 'יח׳',
        pricingType: 'quantity_unit_price',
        quantity: '10',
        unitPrice: '100',
      });
    }
    return project.projectId;
  });

  const changeProjectId = await asUser(db, OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: OWNER.id,
      organizationId: primary.organization.id,
      locale: 'he-IL',
    });
    const project = await createProject(context, {
      name: 'BOQ Change Sub E2E',
      contractValueAmount: '100000',
      status: 'active',
    });
    const boq = await createProjectBoq(context, {
      projectId: project.projectId,
      title: 'Change BOQ',
      progressMode: 'simple',
    });
    if (boq) {
      await upsertBoqNode(context, {
        boqId: boq.id,
        nodeKind: 'item',
        itemCode: 'C.01',
        description: 'סעיף שינוי',
        unit: 'יח׳',
        pricingType: 'quantity_unit_price',
        quantity: '10',
        unitPrice: '100',
      });
      await activateBoq(context, { boqId: boq.id });
    }
    const change = await createChangeRequest(context, {
      projectId: project.projectId,
      title: 'E2E addition',
      direction: 'addition',
      requestedAmount: '500',
    });
    await submitChangeRequestForApproval(context, change.changeRequestId);
    await approveChangeRequest(context, {
      changeRequestId: change.changeRequestId,
      effectiveDate: '2026-08-01',
    });
    await createVendorEngagement(context, {
      vendorId,
      projectId: project.projectId,
      role: 'subcontractor',
    });
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

  const profileOrgs: ReadonlyArray<{
    user: { id: string; email: string; displayName: string };
    profile: BusinessProfileKey;
    name: string;
  }> = [
    { user: GC_OWNER, profile: 'GENERAL_CONTRACTOR', name: 'קבלן ראשי בדיקה' },
    { user: ELECTRICAL_OWNER, profile: 'ELECTRICAL', name: 'חשמל בדיקה' },
    { user: PLUMBING_OWNER, profile: 'PLUMBING', name: 'אינסטלציה בדיקה' },
    { user: MAINTENANCE_OWNER, profile: 'MAINTENANCE', name: 'תחזוקה בדיקה' },
    { user: FIELD_OWNER, profile: 'FIELD_SERVICE', name: 'שירות שטח בדיקה' },
    { user: MIXED_OWNER, profile: 'MIXED_PROJECT_SERVICE', name: 'מעורב בדיקה' },
  ];
  for (const row of profileOrgs) {
    await asUser(db, row.user.id, (tx) =>
      createOrganization(tx, row.user.id, {
        name: row.name,
        countryCode: 'IL',
        businessProfile: row.profile,
      }),
    );
  }

  return {
    organizationId: primary.organization.id,
    otherOrganizationId: secondary.organization.id,
    projectId: primaryProject,
    otherProjectId: secondaryProject,
    vendorId,
    advancedProjectId,
    changeProjectId,
  };
}
