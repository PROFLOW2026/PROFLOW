/**
 * Corrections-only pass — skips full seed phases.
 */
import { config } from 'dotenv';

import {
  CONSULTANCY_ORG_NAME,
  CONSULTANCY_DEMO_ORG_ID,
  PRIMARY_USER_EMAIL,
  SECONDARY_USER_EMAIL,
  SEED_MARKER,
} from './consultancy-demo/constants.ts';
import { buildRunPhase, createMaps, createStats, resolveUserByEmail } from './consultancy-demo/context.ts';
import { generateClients, generateProjects } from './consultancy-demo/generate-specs.ts';
import { setupConsultancyAccounts } from './consultancy-demo/phase-accounts.ts';
import { applyConsultancyCorrections } from './consultancy-demo/phase-corrections.ts';
import { seedLabor } from './consultancy-demo/phase-labor.ts';
import { validateConsultancyDemo } from './consultancy-demo/validate.ts';

config({ path: '.env.local' });

async function terminateStaleSeedSessions() {
  const postgres = (await import('postgres')).default;
  const cs = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!cs) return;
  const sql = postgres(cs, { prepare: false, max: 1 });
  try {
    const idleTx = await sql.unsafe(`
      SELECT pid FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid != pg_backend_pid()
        AND xact_start IS NOT NULL
        AND now() - xact_start > interval '20 seconds'
        AND state IN ('idle in transaction', 'active')
    `);
    for (const row of idleTx as Array<{ pid: number }>) {
      await sql.unsafe(`SELECT pg_terminate_backend(${row.pid})`);
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  if (process.env.ALLOW_CONSULTANCY_DEMO_SEED !== 'true') {
    throw new Error('Refusing corrections in production without ALLOW_CONSULTANCY_DEMO_SEED=true');
  }
  await terminateStaleSeedSessions();

  const stats = createStats();
  const maps = createMaps();
  const primary = await resolveUserByEmail(PRIMARY_USER_EMAIL);
  const secondary = await resolveUserByEmail(SECONDARY_USER_EMAIL);
  const accounts = await setupConsultancyAccounts(stats, secondary.userId);

  const organizationId = CONSULTANCY_DEMO_ORG_ID;
  const runPhase = buildRunPhase(primary.userId, organizationId);
  const target = { userId: primary.userId, organizationId, userEmail: primary.userEmail };
  const projectSpecs = generateProjects(generateClients());

  await runPhase('refresh maps for corrections', organizationId, primary.userId, async (context) => {
    const { projects, employees } = await import('@drizzle/schema');
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
      for (const emp of (await import('./consultancy-demo/constants.ts')).EMPLOYEES) {
        if (emp.employeeNumber === row.employeeNumber) maps.employeeIds.set(emp.key, row.id);
      }
    }
  });

  const [{ timeEntryCount }] = await runPhase(
    'count existing time entries',
    organizationId,
    primary.userId,
    async (context) => {
      const { timeEntries } = await import('@drizzle/schema');
      const { and, eq, like, sql } = await import('drizzle-orm');
      return context.db
        .select({ timeEntryCount: sql<number>`count(*)::int` })
        .from(timeEntries)
        .where(and(eq(timeEntries.organizationId, organizationId), like(timeEntries.description, `%${SEED_MARKER}%`)));
    },
  );
  const laborTarget = 550;
  if ((timeEntryCount ?? 0) < laborTarget) {
    await seedLabor(runPhase, target, stats, maps, projectSpecs, {
      skipAttendance: true,
      skipMonthCost: true,
      timeEntryWeeks: 'w2-only',
    });
  } else {
    stats.notes.push(`Time entries ${timeEntryCount} >= ${laborTarget}; labor enrich skipped.`);
  }

  const correctionReport = await applyConsultancyCorrections(
    runPhase,
    target,
    stats,
    maps,
    projectSpecs,
  );
  const validation = await validateConsultancyDemo(organizationId, primary.userId);

  console.info(
    JSON.stringify(
      {
        organizationName: CONSULTANCY_ORG_NAME,
        accounts,
        correctionReport,
        validation,
        phaseStats: stats,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
