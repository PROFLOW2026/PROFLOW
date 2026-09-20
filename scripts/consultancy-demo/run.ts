import { config } from 'dotenv';

import {
  CONSULTANCY_ORG_NAME,
  EXCLUDED_ORG_NAME,
  PRIMARY_USER_EMAIL,
  SECONDARY_USER_EMAIL,
  SEED_MARKER,
} from './constants.ts';
import {
  buildContractorRunPhase,
  buildRunPhase,
  createMaps,
  createStats,
} from './context.ts';
import { setupConsultancyAccounts } from './phase-accounts.ts';
import { applyConsultancyCorrections } from './phase-corrections.ts';
import { generateClients, generateProjects } from './generate-specs.ts';
import { disableContractorWorkManagement } from './phase-contractor.ts';
import { seedFinancial } from './phase-financial.ts';
import { seedFoundation } from './phase-foundation.ts';
import { seedLabor } from './phase-labor.ts';
import { ensureConsultancyOrganization } from './phase-org.ts';
import { seedProjects } from './phase-projects.ts';
import { seedUwm } from './phase-uwm.ts';
import { validateConsultancyDemo } from './validate.ts';

config({ path: '.env.local' });

function assertSeedEnvironment(): void {
  const isProduction =
    process.env.NODE_ENV === 'production' ||
    process.env.VERCEL_ENV === 'production' ||
    process.env.VERCEL === '1';
  if (isProduction && process.env.ALLOW_CONSULTANCY_DEMO_SEED !== 'true') {
    throw new Error(
      'Refusing consultancy demo seed in production without ALLOW_CONSULTANCY_DEMO_SEED=true',
    );
  }
}

async function terminateStaleSeedSessions() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) return;
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const idleTx = await sql.unsafe(`
      SELECT pid, left(query, 160) AS query_snippet, application_name
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND xact_start IS NOT NULL
        AND now() - xact_start > interval '30 seconds'
        AND state IN ('idle in transaction', 'active')
    `);
    for (const row of idleTx as Array<{ pid: number; query_snippet: string | null; application_name: string | null }>) {
      const hay = `${row.query_snippet ?? ''} ${row.application_name ?? ''}`.toLowerCase();
      if (hay.includes('consultancy') || hay.includes('pf-con') || hay.includes('seed-consultancy')) {
        await sql.unsafe(`SELECT pg_terminate_backend(${row.pid})`);
      }
    }
  } finally {
    await sql.end();
  }
}

export async function main(): Promise<void> {
  assertSeedEnvironment();
  await terminateStaleSeedSessions();

  const stats = createStats();
  const maps = createMaps();
  const { resolveUserByEmail } = await import('./context.ts');
  const primary = await resolveUserByEmail(PRIMARY_USER_EMAIL);
  const secondary = await resolveUserByEmail(SECONDARY_USER_EMAIL);

  const { CONTRACTOR_DEMO_ORG_ID } = await import('./constants.ts');
  const contractorRunPhase = buildContractorRunPhase(secondary.userId, CONTRACTOR_DEMO_ORG_ID);
  await disableContractorWorkManagement(contractorRunPhase, secondary.userId, stats);

  const organizationId = await ensureConsultancyOrganization(secondary.userId, stats);
  const accounts = await setupConsultancyAccounts(stats, secondary.userId);

  const userId = primary.userId;
  const userEmail = primary.userEmail;
  const runPhase = buildRunPhase(userId, organizationId);
  const target = { userId, organizationId, userEmail };

  const clients = generateClients();
  const projectSpecs = generateProjects(clients);

  await seedFoundation(runPhase, target, stats, maps);
  await seedProjects(runPhase, target, stats, maps, projectSpecs);
  await seedUwm(runPhase, target, stats, maps, projectSpecs);
  await seedFinancial(runPhase, target, stats, maps, projectSpecs);
  await seedLabor(runPhase, target, stats, maps, projectSpecs);

  await runPhase('refresh maps for corrections', organizationId, userId, async (context) => {
    const { projects, employees, clients } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');
    const markerLike = `%${SEED_MARKER}%`;
    const projectRows = await context.db
      .select({ id: projects.id, documentNumber: projects.documentNumber })
      .from(projects)
      .where(and(eq(projects.organizationId, organizationId), like(projects.description, markerLike)));
    for (const row of projectRows) {
      const docNum = row.documentNumber?.replace(/^CNS-/, '');
      if (docNum) maps.projectIds.set(docNum, row.id);
    }
    const employeeRows = await context.db
      .select({ id: employees.id, employeeNumber: employees.employeeNumber })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), like(employees.notes, markerLike)));
    for (const row of employeeRows) {
      for (const emp of (await import('./constants.ts')).EMPLOYEES) {
        if (emp.employeeNumber === row.employeeNumber) maps.employeeIds.set(emp.key, row.id);
      }
    }
    void clients;
  });

  const correctionReport = await applyConsultancyCorrections(
    runPhase,
    target,
    stats,
    maps,
    projectSpecs,
  );

  const report = await validateConsultancyDemo(organizationId, userId);
  const summary = {
    seedMarker: SEED_MARKER,
    primaryUserEmail: PRIMARY_USER_EMAIL,
    secondaryUserEmail: SECONDARY_USER_EMAIL,
    accounts,
    targetOrganizationId: organizationId,
    targetOrganizationName: CONSULTANCY_ORG_NAME,
    realBusinessOrgTouched: 'NO' as const,
    excludedOrgName: EXCLUDED_ORG_NAME,
    phaseStats: stats,
    correctionReport,
    validation: report,
  };

  console.info(JSON.stringify(summary, null, 2));
}
