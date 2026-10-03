import { randomUUID } from 'node:crypto';
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
import { createMilestone, createProject } from '@/modules/projects';
import { addProjectMember } from '@/modules/project-team';
import { activateContractorAccount, inviteContractor } from '@/modules/contractor-access';
import type { ContractorAuthPort } from '@/modules/contractor-access/application/auth-port';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { createOrganization, resolveOrgContext, setModuleVisibility } from '@/modules/tenancy';
import { createOpportunity } from '@/modules/crm';
import { createQuote } from '@/modules/quotes';
import { createTask } from '@/modules/tasks';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import { createSubcontract, createVendor, createVendorEngagement } from '@/modules/vendors';
import type { Database, Transaction } from '@/shared/db/types';
import { buildEmployeeAuthEmail } from '@/modules/employee-app/domain/username';
import { employeeSupabaseAuthPassword } from '@/modules/employee-app/domain/auth-password';
import { insertEmployeeAppAccount } from '@/modules/employee-app/data/accounts.repository';
import { upsertEmployeePermissionGrant } from '@/modules/employee-app/data/grants.repository';
import { employeePreset } from '@/modules/employee-app/application/presets';
import { createEmployee } from '@/modules/workforce/application/employees';
import { insertEmployeeProjectAssignment } from '@/modules/workforce/data/project-team.repository';
import { setActiveOrganizationPreference } from '@/modules/identity';
import { registerStubAuthUser } from './auth-stub';
import {
  DUAL_ORG_USER,
  E2E_DUAL_EMPLOYEE,
  E2E_DUAL_ORG_A_PROJECT,
  E2E_DUAL_ORG_B_SECRET_PROJECT,
  E2E_GC_CONTRACTOR,
  E2E_GC_OPS_EMPLOYEE,
  E2E_SINGLE_EMPLOYEE,
  ELECTRICAL_OWNER,
  FIELD_OWNER,
  FINANCE,
  GC_OPS_EMPLOYEE,
  GC_OWNER,
  MAINTENANCE_OWNER,
  MANAGER,
  MIXED_OWNER,
  OTHER_OWNER,
  OWNER,
  PLUMBING_OWNER,
  SEED_PASSWORD,
  SINGLE_EMPLOYEE_USER,
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
  gcOrganizationId: string;
  gcProjectId: string;
  gcAgreementId: string;
  gcContractorUsername: string;
  gcOpsUsername: string;
}

async function seedDualOrgEmployeeScenario(
  db: Database,
  input: { orgAId: string; orgBId: string },
): Promise<void> {
  const dualUsernameNorm = E2E_DUAL_EMPLOYEE.username.toLowerCase();
  const singleUsernameNorm = E2E_SINGLE_EMPLOYEE.username.toLowerCase();

  await asUser(db, OTHER_OWNER.id, async (tx) => {
    const contextB = await resolveOrgContext(tx, {
      userId: OTHER_OWNER.id,
      organizationId: input.orgBId,
      locale: 'he-IL',
    });
    const ownerRole = await findRoleByKey(tx, contextB.organizationId, 'owner');
    if (!ownerRole) throw new Error('owner role missing in secondary org');
    const [membership] = await tx
      .insert(organizationMemberships)
      .values({ organizationId: contextB.organizationId, userId: DUAL_ORG_USER.id, status: 'active' })
      .returning({ id: organizationMemberships.id });
    await assignRole(tx, {
      organizationId: contextB.organizationId,
      membershipId: membership!.id,
      userId: DUAL_ORG_USER.id,
      roleId: ownerRole.id,
    });
    await createProject(contextB, {
      name: E2E_DUAL_ORG_B_SECRET_PROJECT,
      contractValueAmount: '1',
      status: 'active',
    });
  });

  await asUser(db, DUAL_ORG_USER.id, async (tx) => {
    await setActiveOrganizationPreference(tx, DUAL_ORG_USER.id, input.orgBId);
  });

  let dualAuthEmail = '';
  await asUser(db, OWNER.id, async (tx) => {
    const contextA = await resolveOrgContext(tx, {
      userId: OWNER.id,
      organizationId: input.orgAId,
      locale: 'he-IL',
    });
    const employeeRole = await findRoleByKey(tx, contextA.organizationId, 'employee');
    if (!employeeRole) throw new Error('employee role missing in primary org');
    const [dualMembershipA] = await tx
      .insert(organizationMemberships)
      .values({ organizationId: contextA.organizationId, userId: DUAL_ORG_USER.id, status: 'active' })
      .returning({ id: organizationMemberships.id });
    await assignRole(tx, {
      organizationId: contextA.organizationId,
      membershipId: dualMembershipA!.id,
      userId: DUAL_ORG_USER.id,
      roleId: employeeRole.id,
    });

    const employee = await createEmployee(contextA, { name: 'עובד דו-ארגוני', rateUnit: 'hourly' });
    dualAuthEmail = buildEmployeeAuthEmail(contextA.organizationId, dualUsernameNorm);
    await insertEmployeeAppAccount(tx, {
      organizationId: contextA.organizationId,
      employeeId: employee.id,
      userId: DUAL_ORG_USER.id,
      username: E2E_DUAL_EMPLOYEE.username.toUpperCase(),
      usernameNormalized: dualUsernameNorm,
      authEmail: dualAuthEmail,
      status: 'active',
      pinMustChange: false,
      temporaryPinExpiresAt: null,
      createdByUserId: OWNER.id,
    });
    const preset = employeePreset('project_manager');
    for (const grant of preset.grants) {
      await upsertEmployeePermissionGrant(tx, {
        organizationId: contextA.organizationId,
        employeeId: employee.id,
        permissionKey: grant.permissionKey,
        scope: grant.scope,
        granted: true,
        grantedByUserId: OWNER.id,
      });
    }
    const orgAProject = await createProject(contextA, {
      name: E2E_DUAL_ORG_A_PROJECT,
      contractValueAmount: '1',
      status: 'active',
    });
    await insertEmployeeProjectAssignment(tx, {
      organizationId: contextA.organizationId,
      projectId: orgAProject.projectId,
      employeeId: employee.id,
      startDate: new Date().toISOString().slice(0, 10),
      role: 'field',
    });
  });

  registerStubAuthUser(
    { id: DUAL_ORG_USER.id, email: dualAuthEmail, displayName: DUAL_ORG_USER.displayName },
    employeeSupabaseAuthPassword(E2E_DUAL_EMPLOYEE.pin),
  );

  let singleAuthEmail = '';
  await asUser(db, OWNER.id, async (tx) => {
    const contextA = await resolveOrgContext(tx, {
      userId: OWNER.id,
      organizationId: input.orgAId,
      locale: 'he-IL',
    });
    const employeeRole = await findRoleByKey(tx, contextA.organizationId, 'employee');
    if (!employeeRole) throw new Error('employee role missing');
    const [membership] = await tx
      .insert(organizationMemberships)
      .values({
        organizationId: contextA.organizationId,
        userId: SINGLE_EMPLOYEE_USER.id,
        status: 'active',
      })
      .returning({ id: organizationMemberships.id });
    await assignRole(tx, {
      organizationId: contextA.organizationId,
      membershipId: membership!.id,
      userId: SINGLE_EMPLOYEE_USER.id,
      roleId: employeeRole.id,
    });
    const employee = await createEmployee(contextA, { name: 'עובד יחיד', rateUnit: 'hourly' });
    singleAuthEmail = buildEmployeeAuthEmail(contextA.organizationId, singleUsernameNorm);
    await insertEmployeeAppAccount(tx, {
      organizationId: contextA.organizationId,
      employeeId: employee.id,
      userId: SINGLE_EMPLOYEE_USER.id,
      username: E2E_SINGLE_EMPLOYEE.username.toUpperCase(),
      usernameNormalized: singleUsernameNorm,
      authEmail: singleAuthEmail,
      status: 'active',
      pinMustChange: false,
      temporaryPinExpiresAt: null,
      createdByUserId: OWNER.id,
    });
    const preset = employeePreset('field_worker');
    for (const grant of preset.grants) {
      await upsertEmployeePermissionGrant(tx, {
        organizationId: contextA.organizationId,
        employeeId: employee.id,
        permissionKey: grant.permissionKey,
        scope: grant.scope,
        granted: true,
        grantedByUserId: OWNER.id,
      });
    }
  });

  registerStubAuthUser(
    {
      id: SINGLE_EMPLOYEE_USER.id,
      email: singleAuthEmail,
      displayName: SINGLE_EMPLOYEE_USER.displayName,
    },
    employeeSupabaseAuthPassword(E2E_SINGLE_EMPLOYEE.pin),
  );
}

function harnessContractorAuth(): ContractorAuthPort {
  const users = new Map<string, { email: string; password: string; displayName: string }>();
  return {
    async createUser({ email, password, displayName }) {
      const authUserId = randomUUID();
      const name = displayName ?? email;
      users.set(authUserId, { email, password, displayName: name });
      registerStubAuthUser({ id: authUserId, email, displayName: name }, password);
      return { authUserId };
    },
    async deleteUser(authUserId) {
      users.delete(authUserId);
    },
    async setPassword(authUserId, password) {
      const user = users.get(authUserId);
      if (!user) throw new Error('harness contractor auth user missing');
      user.password = password;
      registerStubAuthUser({ id: authUserId, email: user.email, displayName: user.displayName }, password);
    },
    async setBanned() {},
    async signInWithPassword() {
      return { ok: false, reason: 'invalid_credentials' };
    },
    async verifyPassword() {
      return false;
    },
    async signOutCurrent() {},
  };
}

/** GC project, agreement, contractor portal account, and an operational employee. */
async function seedGcBrowserWorld(
  db: Database,
  organizationId: string,
): Promise<{ projectId: string; agreementId: string }> {
  const auth = harnessContractorAuth();
  const invited = await asUser(db, GC_OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: GC_OWNER.id,
      organizationId,
      locale: 'he-IL',
    });
    const project = await createProject(context, {
      name: 'מגדל הבדיקה',
      contractValueAmount: '500000',
      location: 'תל אביב',
      status: 'active',
    });
    await createMilestone(context, {
      projectId: project.projectId,
      name: 'אבן דרך גג',
      targetDate: '2026-12-01',
    });
    const vendor = await createVendor(context, {
      name: 'קבלן שלד בדיקה',
      type: 'subcontractor',
    });
    const agreement = await createSubcontract(context, {
      title: 'הסכם שלד',
      vendorId: vendor.id,
      projectId: project.projectId,
      originalAmount: '246810',
    });
    const invite = await inviteContractor(context, { auth }, {
      displayName: E2E_GC_CONTRACTOR.displayName,
      username: E2E_GC_CONTRACTOR.username,
      projectId: project.projectId,
      vendorId: vendor.id,
      subcontractAgreementId: agreement.id,
      template: 'contractor_admin',
      locale: 'he-IL',
    });
    return {
      projectId: project.projectId,
      agreementId: agreement.id,
      activationPath: invite.activationPath,
    };
  });

  const token = new URL(invited.activationPath, 'http://127.0.0.1').searchParams.get('token');
  if (!token) throw new Error('contractor activation token missing');
  const activated = await activateContractorAccount(
    { db, auth, now: () => new Date() },
    { token, password: SEED_PASSWORD, confirmation: SEED_PASSWORD },
  );
  if (!activated.ok) throw new Error(`contractor activation failed: ${activated.reason}`);

  const usernameNorm = E2E_GC_OPS_EMPLOYEE.username.toLowerCase();
  await asUser(db, GC_OWNER.id, async (tx) => {
    const context = await resolveOrgContext(tx, {
      userId: GC_OWNER.id,
      organizationId,
      locale: 'he-IL',
    });
    const employeeRole = await findRoleByKey(tx, context.organizationId, 'employee');
    if (!employeeRole) throw new Error('employee role missing in GC org');
    const [membership] = await tx
      .insert(organizationMemberships)
      .values({ organizationId, userId: GC_OPS_EMPLOYEE.id, status: 'active' })
      .returning({ id: organizationMemberships.id });
    await assignRole(tx, {
      organizationId,
      membershipId: membership!.id,
      userId: GC_OPS_EMPLOYEE.id,
      roleId: employeeRole.id,
    });
    const employee = await createEmployee(context, {
      name: GC_OPS_EMPLOYEE.displayName,
      rateUnit: 'hourly',
      userId: GC_OPS_EMPLOYEE.id,
    });
    const authEmail = buildEmployeeAuthEmail(organizationId, usernameNorm);
    await insertEmployeeAppAccount(tx, {
      organizationId,
      employeeId: employee.id,
      userId: GC_OPS_EMPLOYEE.id,
      username: E2E_GC_OPS_EMPLOYEE.username,
      usernameNormalized: usernameNorm,
      authEmail,
      status: 'active',
      pinMustChange: false,
      temporaryPinExpiresAt: null,
      createdByUserId: GC_OWNER.id,
    });
    const preset = employeePreset('foreman');
    for (const grant of preset.grants) {
      await upsertEmployeePermissionGrant(tx, {
        organizationId,
        employeeId: employee.id,
        permissionKey: grant.permissionKey,
        scope: grant.scope,
        granted: true,
        grantedByUserId: GC_OWNER.id,
      });
    }
    await insertEmployeeProjectAssignment(tx, {
      organizationId,
      projectId: invited.projectId,
      employeeId: employee.id,
      startDate: new Date().toISOString().slice(0, 10),
      role: 'field',
    });
    await addProjectMember(context, {
      projectId: invited.projectId,
      userId: GC_OPS_EMPLOYEE.id,
      templateKey: 'project_manager_operational',
      title: 'מנהל פרויקט תפעולי',
    });
    registerStubAuthUser(
      { id: GC_OPS_EMPLOYEE.id, email: authEmail, displayName: GC_OPS_EMPLOYEE.displayName },
      employeeSupabaseAuthPassword(E2E_GC_OPS_EMPLOYEE.pin),
    );
  });

  await asUser(db, GC_OPS_EMPLOYEE.id, async (tx) => {
    await setActiveOrganizationPreference(tx, GC_OPS_EMPLOYEE.id, organizationId);
  });

  return { projectId: invited.projectId, agreementId: invited.agreementId };
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
        DUAL_ORG_USER,
        SINGLE_EMPLOYEE_USER,
        GC_OPS_EMPLOYEE,
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
    for (const moduleKey of [
      'changes',
      'billing',
      'documents',
      'boq',
      'crm',
      'quotes',
      'work_management',
      'materials',
    ] as const) {
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

    await createOpportunity(context, { name: 'הצעה לשיפוץ משרדים — רמת אביב' });
    await createQuote(context, {
      title: 'הצעת מחיר — שיפוץ דירה ברמת גן',
      lines: [{ description: 'עבודות חשמל וגמר', quantity: '1', unitPriceAmount: '150000' }],
    });
    const { workspace } = await lazyCreateProjectWorkspace(
      context,
      project.projectId,
      'שיפוץ דירה ברמת גן',
    );
    await createTask(context, {
      workspaceId: workspace.id,
      projectId: project.projectId,
      title: 'הכנת לוח חשמל ראשי',
    });

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
  let gcOrganizationId = '';
  for (const row of profileOrgs) {
    const created = await asUser(db, row.user.id, (tx) =>
      createOrganization(tx, row.user.id, {
        name: row.name,
        countryCode: 'IL',
        businessProfile: row.profile,
      }),
    );
    if (row.user.id === GC_OWNER.id) gcOrganizationId = created.organization.id;
  }
  if (!gcOrganizationId) throw new Error('GC organization was not seeded');

  await seedDualOrgEmployeeScenario(db, {
    orgAId: primary.organization.id,
    orgBId: secondary.organization.id,
  });

  const gcWorld = await seedGcBrowserWorld(db, gcOrganizationId);

  return {
    organizationId: primary.organization.id,
    otherOrganizationId: secondary.organization.id,
    projectId: primaryProject,
    otherProjectId: secondaryProject,
    vendorId,
    advancedProjectId,
    changeProjectId,
    gcOrganizationId,
    gcProjectId: gcWorld.projectId,
    gcAgreementId: gcWorld.agreementId,
    gcContractorUsername: E2E_GC_CONTRACTOR.username,
    gcOpsUsername: E2E_GC_OPS_EMPLOYEE.username,
  };
}
