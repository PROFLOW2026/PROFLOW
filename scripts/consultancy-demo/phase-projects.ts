import { SEED_MARKER, STAGE_NAMES } from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import type { ProjectSpec } from './generate-specs.ts';

function documentNumberFor(docNum: string): string {
  return `CNS-${docNum}`;
}

export async function seedProjects(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
  projectSpecs: readonly ProjectSpec[],
): Promise<void> {
  await runPhase('project inventory check', target.organizationId, target.userId, async (context) => {
    const { projects } = await import('@drizzle/schema');
    const { and, eq, like } = await import('drizzle-orm');
    const rows = await context.db
      .select({ id: projects.id, documentNumber: projects.documentNumber })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, target.organizationId),
          like(projects.description, `${SEED_MARKER}%`),
        ),
      );
    for (const row of rows) {
      const docNum = row.documentNumber?.replace(/^CNS-/, '');
      if (docNum) maps.projectIds.set(docNum, row.id);
    }
    if (rows.length >= projectSpecs.length) {
      stats.notes.push(`Projects already seeded (${rows.length}); skipping create loop.`);
      return;
    }
  });

  if (maps.projectIds.size >= projectSpecs.length) {
    return;
  }

  for (const spec of projectSpecs) {
    await runPhase(`project ${spec.docNum}`, target.organizationId, target.userId, async (context) => {
      const { createProject } = await import('../../src/modules/projects/index.ts');
      const { projects, projectStageTransitions } = await import('@drizzle/schema');
      const { and, desc, eq } = await import('drizzle-orm');

      const docNumber = documentNumberFor(spec.docNum);
      const clientId = maps.clientIds.get(spec.clientKey);
      if (!clientId) throw new Error(`Missing client ${spec.clientKey}`);

      const [byDoc] = await context.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.documentNumber, docNumber)))
        .limit(1);
      if (byDoc) {
        maps.projectIds.set(spec.docNum, byDoc.id);
        return;
      }

      const created = await createProject(context, {
        name: spec.name,
        clientId,
        location: spec.location,
        description: `${SEED_MARKER}:project:${spec.docNum}`,
        contractValueAmount: spec.contractNet,
        contractValueCurrency: 'ILS',
        amountIncludesTax: false,
        startDate: spec.startDate,
        targetEndDate: spec.targetEndDate,
      });

      await context.db.update(projects).set({ documentNumber: docNumber }).where(eq(projects.id, created.projectId));
      maps.projectIds.set(spec.docNum, created.projectId);
      stats.projects += 1;

      const stageName = STAGE_NAMES[spec.stageIndex];
      const stageId = stageName ? maps.stageIds.get(stageName) : undefined;
      if (!stageId) return;

      const [latest] = await context.db
        .select({ toStageId: projectStageTransitions.toStageId })
        .from(projectStageTransitions)
        .where(
          and(
            eq(projectStageTransitions.projectId, created.projectId),
            eq(projectStageTransitions.organizationId, target.organizationId),
          ),
        )
        .orderBy(desc(projectStageTransitions.transitionedAt), desc(projectStageTransitions.id))
        .limit(1);

      if (latest?.toStageId === stageId) return;

      await context.db.insert(projectStageTransitions).values({
        organizationId: target.organizationId,
        projectId: created.projectId,
        fromStageId: latest?.toStageId ?? null,
        toStageId: stageId,
        transitionedAt: new Date(`${spec.startDate}T10:00:00.000Z`),
        transitionedByOrgMemberId: context.membershipId,
        notes: `${SEED_MARKER}:stage`,
      });
    });
  }

  await runPhase('project id refresh', target.organizationId, target.userId, async (context) => {
    const { projects } = await import('@drizzle/schema');
    const { and, eq } = await import('drizzle-orm');
    for (const spec of projectSpecs) {
      if (maps.projectIds.has(spec.docNum)) continue;
      const docNumber = documentNumberFor(spec.docNum);
      const [row] = await context.db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.organizationId, target.organizationId), eq(projects.documentNumber, docNumber)))
        .limit(1);
      if (row) maps.projectIds.set(spec.docNum, row.id);
    }
  });
}
