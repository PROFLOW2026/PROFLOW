import { EMPLOYEES, INTERNAL_WORKSPACES, SEED_MARKER, STAGE_NAMES } from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import { generateClients } from './generate-specs.ts';

export async function seedFoundation(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
): Promise<void> {
  const clients = generateClients();

  await runPhase('clients', target.organizationId, target.userId, async (context) => {
    const { createClient } = await import('../../src/modules/clients/index.ts');
    const { clients: clientsTable } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    for (const spec of clients) {
      const marker = `${SEED_MARKER}:client:${spec.key}`;
      const [existing] = await context.db
        .select({ id: clientsTable.id })
        .from(clientsTable)
        .where(and(eq(clientsTable.organizationId, target.organizationId), eq(clientsTable.name, spec.name)))
        .limit(1);
      if (existing) {
        maps.clientIds.set(spec.key, existing.id);
        continue;
      }

      const created = await createClient(context, {
        name: spec.name,
        legalName: spec.name,
        city: spec.city,
        countryCode: 'IL',
        notes: marker,
      });
      maps.clientIds.set(spec.key, created.id);
      stats.clients += 1;
    }
  });

  await runPhase('employees', target.organizationId, target.userId, async (context) => {
    const { createEmployee, bootstrapOpenPeriodWorkforceCostingForEmployee } = await import(
      '../../src/modules/workforce/index.ts'
    );
    const { employees } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    for (const spec of EMPLOYEES) {
      const [existing] = await context.db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.organizationId, target.organizationId),
            eq(employees.employeeNumber, spec.employeeNumber),
          ),
        )
        .limit(1);
      if (existing) {
        maps.employeeIds.set(spec.key, existing.id);
        continue;
      }

      const created = await createEmployee(context, {
        name: spec.name,
        jobTitle: spec.jobTitle,
        employeeNumber: spec.employeeNumber,
        hireDate: '2026-01-01',
        rateUnit: 'monthly',
        baseRate: spec.baseRate,
        currency: 'ILS',
        burdenPercent: '25',
        defaultLaborAllocationIntent: spec.companyOnly ? 'company_only' : 'project_allocate',
        notes: `${SEED_MARKER}:employee:${spec.key}`,
      });
      maps.employeeIds.set(spec.key, created.id);
      await bootstrapOpenPeriodWorkforceCostingForEmployee(context, created.id);
      stats.employees += 1;
    }
  });

  await runPhase('stage map', target.organizationId, target.userId, async (context) => {
    const { projectStageDefinitions } = await import('@drizzle/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await context.db
      .select({ id: projectStageDefinitions.id, name: projectStageDefinitions.name })
      .from(projectStageDefinitions)
      .where(eq(projectStageDefinitions.organizationId, target.organizationId));
    for (const row of rows) {
      maps.stageIds.set(row.name, row.id);
    }
    for (const name of STAGE_NAMES) {
      if (!maps.stageIds.has(name)) {
        stats.notes.push(`Missing stage definition: ${name}`);
      }
    }
  });

  await runPhase('internal workspaces', target.organizationId, target.userId, async (context) => {
    const { createWorkspace } = await import('../../src/modules/workspaces/index.ts');
    const { workspaces } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');

    for (const name of INTERNAL_WORKSPACES) {
      const [existing] = await context.db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            eq(workspaces.organizationId, target.organizationId),
            eq(workspaces.name, name),
            eq(workspaces.workspaceType, 'org_internal'),
          ),
        )
        .limit(1);
      if (existing) {
        maps.workspaceIds.set(name, existing.id);
        continue;
      }

      const created = await createWorkspace(context, {
        name,
        workspaceType: 'org_internal',
        workspaceVisibility: 'organization',
      });
      maps.workspaceIds.set(name, created.id);
      stats.workspaces += 1;
    }
  });
}
