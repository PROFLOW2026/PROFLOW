import type { OrgContext } from '../../src/shared/auth/context.ts';
import {
  CONSULTANCY_ORG_NAME,
  CONTRACTOR_DEMO_ORG_NAME,
  DEMO_USER_EMAIL,
  EXCLUDED_ORG_NAME,
  SEED_MARKER,
} from './constants.ts';

export interface SeedTarget {
  readonly userId: string;
  readonly organizationId: string;
  readonly userEmail: string;
}

export interface SeedMaps {
  clientIds: Map<string, string>;
  employeeIds: Map<string, string>;
  projectIds: Map<string, string>;
  stageIds: Map<string, string>;
  workspaceIds: Map<string, string>;
}

export function createMaps(): SeedMaps {
  return {
    clientIds: new Map(),
    employeeIds: new Map(),
    projectIds: new Map(),
    stageIds: new Map(),
    workspaceIds: new Map(),
  };
}

export interface SeedStats {
  notes: string[];
  clients: number;
  projects: number;
  employees: number;
  workspaces: number;
  tasks: number;
  meetings: number;
  milestones: number;
  billings: number;
  payments: number;
  vendors: number;
  expenses: number;
  changes: number;
  decisions: number;
  approvals: number;
}

export function createStats(): SeedStats {
  return {
    notes: [],
    clients: 0,
    projects: 0,
    employees: 0,
    workspaces: 0,
    tasks: 0,
    meetings: 0,
    milestones: 0,
    billings: 0,
    payments: 0,
    vendors: 0,
    expenses: 0,
    changes: 0,
    decisions: 0,
    approvals: 0,
  };
}

export function assertSafeOrg(context: OrgContext, organizationId: string): void {
  if (context.organization.name === EXCLUDED_ORG_NAME) {
    throw new Error(`Refusing real business org: ${EXCLUDED_ORG_NAME}`);
  }
  if (context.organization.id !== organizationId) {
    throw new Error('Context org mismatch');
  }
  if (context.organization.name !== CONSULTANCY_ORG_NAME) {
    throw new Error(`Expected consultancy org "${CONSULTANCY_ORG_NAME}", got "${context.organization.name}"`);
  }
}

export async function resolveDemoUser() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const [profile] = await sql<{ id: string; email: string }[]>`
      select id, email from public.profiles where lower(email) = lower(${DEMO_USER_EMAIL}) limit 1
    `;
    if (!profile) throw new Error(`No profile for ${DEMO_USER_EMAIL}`);
    return { userId: profile.id, userEmail: profile.email };
  } finally {
    await sql.end();
  }
}

export async function findConsultancyOrgId(userId: string): Promise<string | null> {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) throw new Error('DATABASE_URL missing');
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const [row] = await sql<{ id: string; name: string }[]>`
      select o.id, o.name
      from public.organizations o
      join public.organization_memberships m on m.organization_id = o.id
      where m.user_id = ${userId}::uuid
        and m.status = 'active'
        and o.name = ${CONSULTANCY_ORG_NAME}
      limit 1
    `;
    if (row?.name === EXCLUDED_ORG_NAME) throw new Error('Refusing real business org');
    return row?.id ?? null;
  } finally {
    await sql.end();
  }
}

export function markerRef(suffix: string): string {
  return `${SEED_MARKER}/${suffix}`;
}

export type RunPhase = <T>(
  label: string,
  organizationId: string,
  userId: string,
  fn: (context: OrgContext) => Promise<T>,
) => Promise<T>;

export function buildRunPhase(userId: string, organizationId: string): RunPhase {
  return buildRunPhaseForOrg(userId, organizationId, CONSULTANCY_ORG_NAME, true);
}

export function buildContractorRunPhase(userId: string, organizationId: string): RunPhase {
  return buildRunPhaseForOrg(userId, organizationId, CONTRACTOR_DEMO_ORG_NAME, false);
}

function buildRunPhaseForOrg(
  userId: string,
  organizationId: string,
  expectedOrgName: string,
  assertConsultancy: boolean,
): RunPhase {
  return async (label, orgId, uid, fn) => {
    console.info(`[consultancy-seed] ${label}`);
    const { withUserContext } = await import('../../src/shared/db/client.ts');
    const { resolveOrgContext } = await import('../../src/modules/tenancy/index.ts');
    return withUserContext(uid, async (tx) => {
      const context = await resolveOrgContext(tx, {
        userId: uid,
        organizationId: orgId,
        locale: 'he-IL',
      });
      if (context.organization.name === EXCLUDED_ORG_NAME) {
        throw new Error(`Refusing real business org: ${EXCLUDED_ORG_NAME}`);
      }
      if (context.organization.id !== organizationId) {
        throw new Error('Context org mismatch');
      }
      if (context.organization.name !== expectedOrgName) {
        throw new Error(`Expected org "${expectedOrgName}", got "${context.organization.name}"`);
      }
      if (assertConsultancy) {
        assertSafeOrg(context, organizationId);
      }
      return fn(context);
    });
  };
}
