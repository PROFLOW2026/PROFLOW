import { z } from 'zod';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findProjectById } from '../data/projects.repository';
import { listMilestonesByProject } from '../data/milestones.repository';
import { listPhasesByProject } from '../data/phases.repository';
import { listWorkPackagesByProject } from '../data/work-packages.repository';
import { countActiveWorkPackages } from '../domain/work-package-visibility';
import { createMilestone } from './milestones';
import { createPhase } from './phases';
import { splitProjectIntoWorkPackages } from './work-packages';

const cloneSchema = z.object({
  targetProjectId: z.string().uuid(),
  sourceProjectId: z.string().uuid(),
});

export interface ProjectStructureSnapshot {
  readonly sourceProjectId: string;
  readonly sourceProjectName: string;
  readonly workPackages: readonly {
    readonly name: string;
    readonly phases: readonly string[];
  }[];
  readonly milestones: readonly {
    readonly name: string;
    readonly targetDate: string | null;
  }[];
}

/**
 * Read-only structure preview for clone UI.
 * Does not include financials, expenses, documents, or assignments.
 */
export async function previewProjectStructureSnapshot(
  context: OrgContext,
  sourceProjectId: string,
): Promise<ProjectStructureSnapshot> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const project = await findProjectById(context.db, context.organizationId, sourceProjectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const workPackages = await listWorkPackagesByProject(
    context.db,
    context.organizationId,
    sourceProjectId,
  );
  const phases = await listPhasesByProject(context.db, context.organizationId, sourceProjectId);
  const milestones = await listMilestonesByProject(
    context.db,
    context.organizationId,
    sourceProjectId,
  );

  const activePackages = workPackages.filter((pkg) => !pkg.archivedAt);
  return {
    sourceProjectId: project.id,
    sourceProjectName: project.name,
    workPackages: activePackages.map((pkg) => ({
      name: pkg.name,
      phases: phases
        .filter((phase) => phase.workPackageId === pkg.id && !phase.archivedAt)
        .map((phase) => phase.name),
    })),
    milestones: milestones
      .filter((m) => !m.archivedAt)
      .map((m) => ({ name: m.name, targetDate: m.targetDate })),
  };
}

/**
 * Clones work areas, phases, and milestones onto a simple (unsplit) project.
 * Creates editable copies only — no live link to the source.
 */
export async function cloneProjectStructure(
  context: OrgContext,
  rawInput: { targetProjectId: string; sourceProjectId: string },
): Promise<ProjectStructureSnapshot> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = cloneSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  if (parsed.data.targetProjectId === parsed.data.sourceProjectId) {
    throw new ValidationError([
      { path: 'sourceProjectId', message: 'Cannot clone a project onto itself' },
    ]);
  }

  const target = await findProjectById(
    context.db,
    context.organizationId,
    parsed.data.targetProjectId,
  );
  if (!target || target.archivedAt) throw new NotFoundError('Project');
  assertSameOrganization(context, target, 'Project');

  const existingPackages = await listWorkPackagesByProject(
    context.db,
    context.organizationId,
    parsed.data.targetProjectId,
  );
  if (countActiveWorkPackages(existingPackages) > 1) {
    throw new DomainRuleError(
      'Structure templates can only be applied before the project is split into multiple work areas.',
      'projects.errors.templateRequiresSimpleProject',
    );
  }

  const snapshot = await previewProjectStructureSnapshot(context, parsed.data.sourceProjectId);
  if (snapshot.workPackages.length === 0) {
    throw new ValidationError([
      { path: 'sourceProjectId', message: 'Source project has no work areas to clone' },
    ]);
  }

  const packageNames = snapshot.workPackages.map((pkg) => pkg.name);
  const [defaultName, ...additional] = packageNames;
  const packages = await splitProjectIntoWorkPackages(context, {
    projectId: parsed.data.targetProjectId,
    defaultPackageName: defaultName,
    additionalPackages: additional,
  });

  let phaseCount = 0;
  for (const draft of snapshot.workPackages) {
    const match = packages.find((pkg) => pkg.name === draft.name && !pkg.archivedAt);
    if (!match) continue;
    for (const phaseName of draft.phases) {
      await createPhase(context, {
        workPackageId: match.id,
        name: phaseName,
      });
      phaseCount += 1;
    }
  }

  const milestoneNames: string[] = [];
  for (const milestone of snapshot.milestones) {
    const created = await createMilestone(context, {
      projectId: parsed.data.targetProjectId,
      name: milestone.name,
      targetDate: milestone.targetDate,
    });
    milestoneNames.push(created.name);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_TEMPLATE_APPLIED,
    entityType: 'project',
    entityId: target.id,
    after: {
      source: 'clone_project',
      sourceProjectId: snapshot.sourceProjectId,
      workPackageNames: packageNames,
      milestoneNames,
      phaseCount,
    },
  });

  return snapshot;
}
