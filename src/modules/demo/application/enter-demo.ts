import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  contractorGrants,
  contractorPrincipals,
  demoSessionActors,
  demoSessions,
  employeeAppAccounts,
  employees,
  notifications,
  organizations,
} from '@drizzle/schema';
import { applyEmployeePresetGrants, type EmployeePresetKey } from '@/modules/employee-app';
import { ensureProfile } from '@/modules/identity/application/ensure-profile';
import { EVENT_DOMAIN } from '@/modules/notifications/domain/types';
import { assignRole, ensureRoleAssigned, findRoleByKey } from '@/modules/rbac';
import { insertMembership } from '@/modules/tenancy';
import { isOnboardingBusinessType, type OnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';
import { DomainRuleError } from '@/shared/errors';
import type { DbExecutor } from '@/shared/db/types';
import { isDemoRoleKey, type DemoRoleKey } from '../domain/demo-org';
import { buildDemoFixture } from '../fixtures/fixture-builder';
import { deleteDemoSessionOrganization } from './delete-session';
import { insertDemoOrganization, withDemoProvisioner } from './provision';
import { seedDemoFixture } from './seed-fixture';

const MEMBER_ROLES = ['owner', 'manager', 'finance', 'worker', 'employee'] as const;

const DEMO_ACTOR_DISPLAY_NAMES: Record<DemoRoleKey, string> = {
  owner: 'נועה בעלים',
  manager: 'איתי מנהל',
  finance: 'מיכל כספים',
  employee: 'דנה משרד',
  worker: 'יוסי שטח',
  contractor: 'רן קבלן',
};

const DEMO_EMPLOYEE_APP_PORTAL_ROLES = ['manager', 'finance', 'worker', 'employee'] as const;

type DemoEmployeeAppPortalRole = (typeof DEMO_EMPLOYEE_APP_PORTAL_ROLES)[number];

const DEMO_EMPLOYEE_APP_PRESETS: Record<DemoEmployeeAppPortalRole, EmployeePresetKey> = {
  manager: 'management',
  finance: 'office_admin',
  worker: 'field_worker',
  employee: 'secretary',
};

export interface DemoAuthPort {
  createConfirmedUser(email: string): Promise<{ userId: string }>;
  signIn(email: string): Promise<{ userId: string; emailSent: boolean; exposedSecret: boolean }>;
  deleteUser(userId: string): Promise<void>;
}

export interface EnterDemoResult {
  readonly sessionId: string;
  readonly profileKey: OnboardingBusinessType;
  readonly roleKey: DemoRoleKey;
  readonly signedInUserId: string;
}

function emailFor(sessionId: string, role: DemoRoleKey): string {
  if (role === 'employee') return `demo.${sessionId}.employee@employees.pf.internal`;
  if (role === 'contractor') return `demo.${sessionId}.contractor@contractors.pf.internal`;
  return `${sessionId}.${role}@demo.pf.internal`;
}

async function findTemplateId(db: DbExecutor, name: string): Promise<string | null> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.demoKind, 'template'), eq(organizations.name, name)))
    .limit(1);
  return row?.id ?? null;
}

export async function enterDemo(
  db: DbExecutor,
  auth: DemoAuthPort,
  input: {
    readonly profileKey: string;
    readonly roleKey: string;
    readonly previousSessionId?: string | null;
  },
): Promise<EnterDemoResult> {
  if (!isOnboardingBusinessType(input.profileKey) || !isDemoRoleKey(input.roleKey)) {
    throw new DomainRuleError('Unknown demo choice', 'demo.errors.invalidChoice');
  }
  const profileKey = input.profileKey;
  const roleKey = input.roleKey;
  const fixture = buildDemoFixture(profileKey);

  if (input.previousSessionId) {
    await withDemoProvisioner(db, (tx) => deleteDemoSessionOrganization(tx, input.previousSessionId as string));
  }

  const sessionId = await withDemoProvisioner(db, async (tx) => {
    let templateId = await findTemplateId(tx, fixture.organizationName);
    if (!templateId) {
      templateId = await insertDemoOrganization(tx, {
        name: fixture.organizationName,
        demoKind: 'template',
        profileKey,
      });
      await seedDemoFixture(tx, templateId, fixture);
    }
    const organizationId = await insertDemoOrganization(tx, {
      name: `${fixture.organizationName} · סשן`,
      demoKind: 'session',
      profileKey,
    });
    await seedDemoFixture(tx, organizationId, fixture);
    const actors: { role: DemoRoleKey; userId: string; email: string }[] = [];
    const membershipIds = new Map<DemoRoleKey, string>();
    for (const role of ['owner', 'manager', 'finance', 'worker', 'employee', 'contractor'] as const) {
      const email = emailFor(organizationId, role);
      const created = await auth.createConfirmedUser(email);
      await ensureProfile(tx, {
        id: created.userId,
        email,
        displayName: DEMO_ACTOR_DISPLAY_NAMES[role],
        localePreference: 'he-IL',
      });
      actors.push({ role, userId: created.userId, email });
      if ((MEMBER_ROLES as readonly string[]).includes(role)) {
        const membership = await insertMembership(tx, {
          organizationId,
          userId: created.userId,
          status: 'active',
        });
        membershipIds.set(role, membership.id);
        const roleRow = await findRoleByKey(tx, organizationId, role === 'worker' ? 'worker' : role);
        if (!roleRow) throw new DomainRuleError('Role missing', 'demo.errors.roleMissing');
        await assignRole(tx, {
          organizationId,
          membershipId: membership.id,
          userId: created.userId,
          roleId: roleRow.id,
        });
      }
    }
    const ownerActor = actors.find((actor) => actor.role === 'owner');
    const employeeRole = await findRoleByKey(tx, organizationId, 'employee');
    if (!employeeRole) throw new DomainRuleError('Role missing', 'demo.errors.roleMissing');
    const employeeRows = await tx
      .select({ id: employees.id })
      .from(employees)
      .where(eq(employees.organizationId, organizationId));
    for (let index = 0; index < DEMO_EMPLOYEE_APP_PORTAL_ROLES.length; index++) {
      const portalRole = DEMO_EMPLOYEE_APP_PORTAL_ROLES[index]!;
      const actor = actors.find((item) => item.role === portalRole);
      const staff = employeeRows[index];
      const membershipId = membershipIds.get(portalRole);
      if (!actor || !staff || !membershipId) {
        throw new DomainRuleError('Demo employee portal wiring failed', 'demo.errors.roleMissing');
      }
      // Grants and the home greeting resolve through employees.user_id.
      await tx
        .update(employees)
        .set({
          userId: actor.userId,
          name: DEMO_ACTOR_DISPLAY_NAMES[portalRole],
        })
        .where(and(eq(employees.id, staff.id), eq(employees.organizationId, organizationId)));
      await ensureRoleAssigned(tx, {
        organizationId,
        membershipId,
        userId: actor.userId,
        roleId: employeeRole.id,
      });
      const usernameSuffix = portalRole === 'employee' ? 'office' : portalRole;
      const username = `demo-${organizationId.slice(0, 8)}-${usernameSuffix}`;
      await tx.insert(employeeAppAccounts).values({
        organizationId,
        employeeId: staff.id,
        userId: actor.userId,
        status: 'active',
        username,
        usernameNormalized: username,
        authEmail: actor.email,
        pinMustChange: false,
      });
      await applyEmployeePresetGrants(tx, {
        organizationId,
        employeeId: staff.id,
        presetKey: DEMO_EMPLOYEE_APP_PRESETS[portalRole],
        grantedByUserId: ownerActor?.userId ?? actor.userId,
      });
    }
    const contractor = actors.find((actor) => actor.role === 'contractor');
    if (contractor) {
      const schema = await import('@drizzle/schema');
      const [project] = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, organizationId))
        .limit(1);
      const [vendor] = await tx
        .select({ id: schema.vendors.id })
        .from(schema.vendors)
        .where(eq(schema.vendors.organizationId, organizationId))
        .limit(1);
      const principalId = randomUUID();
      await tx.insert(contractorPrincipals).values({
        id: principalId,
        email: contractor.email,
        displayName: DEMO_ACTOR_DISPLAY_NAMES.contractor,
        authUserId: contractor.userId,
        principalKind: 'contractor',
        status: 'active',
        username: `demo-${organizationId.slice(0, 8)}`,
        usernameNormalized: `demo-${organizationId.slice(0, 8)}`,
        homeOrganizationId: organizationId,
        homeProjectId: project?.id ?? null,
      });
      if (project && vendor) {
        await tx.insert(contractorGrants).values({
          organizationId,
          principalId,
          portalKind: 'contractor',
          projectId: project.id,
          vendorId: vendor.id,
          scopes: ['ext.project.view', 'ext.schedule.view', 'ext.document.view'],
          status: 'active',
        });
      }
    }
    await tx.insert(demoSessions).values({
      organizationId,
      templateOrganizationId: templateId,
      profileKey,
      browserTokenHash: createHash('sha256').update(organizationId).digest('hex'),
    });
    await tx.insert(demoSessionActors).values(
      actors.map((actor) => ({
        organizationId,
        roleKey: actor.role,
        authUserId: actor.userId,
        email: actor.email,
      })),
    );
    const notifyRoles: DemoRoleKey[] = ['owner', 'manager', 'finance'];
    for (const actor of actors) {
      if (!notifyRoles.includes(actor.role)) continue;
      for (const note of fixture.notifications) {
        await tx.insert(notifications).values({
          id: randomUUID(),
          organizationId,
          recipientUserId: actor.userId,
          type: note.type,
          domain: EVENT_DOMAIN[note.type],
          title: note.title,
          body: note.body,
          severity: note.severity,
          dedupeKey: `${note.dedupeKey}:${actor.role}`,
        });
      }
    }
    return organizationId;
  });

  const email = emailFor(sessionId, roleKey);
  const signedIn = await auth.signIn(email);
  if (signedIn.emailSent || signedIn.exposedSecret) {
    throw new DomainRuleError('Demo sign-in exposed a secret', 'demo.errors.signInUnsafe');
  }
  return { sessionId, profileKey, roleKey, signedInUserId: signedIn.userId };
}
