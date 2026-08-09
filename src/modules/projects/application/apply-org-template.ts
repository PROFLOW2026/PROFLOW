import { z } from 'zod';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  getOrgProjectTemplateById,
  listOrgPhasePacks,
  listOrgWorkPackagePacks,
  resolveOrgTemplateApplyCopy,
} from '@/modules/tenancy/application/org-structure-templates';
import { findProjectById } from '../data/projects.repository';
import { listWorkPackagesByProject } from '../data/work-packages.repository';
import { countActiveWorkPackages } from '../domain/work-package-visibility';
import { offsetBusinessDate } from '../domain/templates';
import { createMilestone } from './milestones';
import { createPhase } from './phases';
import { splitProjectIntoWorkPackages, createWorkPackage } from './work-packages';

const applyOrgTemplateSchema = z.object({
  projectId: z.string().uuid(),
  orgTemplateId: z.string().uuid(),
});

export interface ApplyOrgProjectTemplateResult {
  readonly orgTemplateId: string;
  readonly workPackageNames: readonly string[];
  readonly milestoneNames: readonly string[];
  readonly phaseCount: number;
}

async function assertSimpleProject(context: OrgContext, projectId: string) {
  const packages = await listWorkPackagesByProject(context.db, context.organizationId, projectId);
  if (countActiveWorkPackages(packages) > 1) {
    throw new DomainRuleError(
      'Structure templates can only be applied before the project is split into multiple work areas.',
      'projects.errors.templateRequiresSimpleProject',
    );
  }
}

/**
 * Applies an org-owned structure template as editable copies.
 * Catalog / settings rows are never mutated by apply.
 */
export async function applyOrgProjectTemplate(
  context: OrgContext,
  rawInput: { projectId: string; orgTemplateId: string },
): Promise<ApplyOrgProjectTemplateResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = applyOrgTemplateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');
  await assertSimpleProject(context, parsed.data.projectId);

  const template = await getOrgProjectTemplateById(context, parsed.data.orgTemplateId);
  if (!template) throw new NotFoundError('Template');

  const copy = resolveOrgTemplateApplyCopy(template);
  const packageNames = copy.workPackages.map((pkg) => pkg.name);
  if (packageNames.length === 0) {
    return {
      orgTemplateId: template.id,
      workPackageNames: [],
      milestoneNames: [],
      phaseCount: 0,
    };
  }

  const [defaultName, ...additional] = packageNames;
  const packages = await splitProjectIntoWorkPackages(context, {
    projectId: parsed.data.projectId,
    defaultPackageName: defaultName,
    additionalPackages: additional,
  });

  let phaseCount = 0;
  for (const draft of copy.workPackages) {
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
  for (const milestone of copy.milestones) {
    const targetDate = offsetBusinessDate(project.startDate, milestone.offsetDaysFromStart);
    const created = await createMilestone(context, {
      projectId: parsed.data.projectId,
      name: milestone.name,
      targetDate,
    });
    milestoneNames.push(created.name);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_TEMPLATE_APPLIED,
    entityType: 'project',
    entityId: project.id,
    after: {
      source: 'org_template',
      orgTemplateId: template.id,
      workPackageNames: packageNames,
      milestoneNames,
      phaseCount,
    },
  });

  return {
    orgTemplateId: template.id,
    workPackageNames: packageNames,
    milestoneNames,
    phaseCount,
  };
}

const applyPhasePackSchema = z.object({
  workPackageId: z.string().uuid(),
  phasePackId: z.string().uuid(),
});

/** Instantiates a reusable phase pack onto one work area as copies. */
export async function applyOrgPhasePack(
  context: OrgContext,
  rawInput: { workPackageId: string; phasePackId: string },
): Promise<{ readonly phaseNames: readonly string[] }> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = applyPhasePackSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const packs = await listOrgPhasePacks(context);
  const pack = packs.find((p) => p.id === parsed.data.phasePackId);
  if (!pack) throw new NotFoundError('Phase pack');

  const phaseNames: string[] = [];
  for (const name of pack.phases) {
    const created = await createPhase(context, {
      workPackageId: parsed.data.workPackageId,
      name,
    });
    phaseNames.push(created.name);
  }

  return { phaseNames };
}

const applyWpPackSchema = z.object({
  projectId: z.string().uuid(),
  workPackagePackId: z.string().uuid(),
});

/**
 * Adds work areas from an org pack onto a project that may already be split.
 * Does not rename the default package when already multi-WP.
 */
export async function applyOrgWorkPackagePack(
  context: OrgContext,
  rawInput: { projectId: string; workPackagePackId: string },
): Promise<{ readonly workPackageNames: readonly string[] }> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = applyWpPackSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const packs = await listOrgWorkPackagePacks(context);
  const pack = packs.find((p) => p.id === parsed.data.workPackagePackId);
  if (!pack) throw new NotFoundError('Work package pack');

  const existing = await listWorkPackagesByProject(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );
  const activeCount = countActiveWorkPackages(existing);

  if (activeCount <= 1) {
    const [defaultName, ...additional] = pack.workPackageNames;
    await splitProjectIntoWorkPackages(context, {
      projectId: parsed.data.projectId,
      defaultPackageName: defaultName,
      additionalPackages: additional,
    });
    return { workPackageNames: pack.workPackageNames };
  }

  const createdNames: string[] = [];
  for (const name of pack.workPackageNames) {
    const created = await createWorkPackage(context, {
      projectId: parsed.data.projectId,
      name,
    });
    createdNames.push(created.name);
  }
  return { workPackageNames: createdNames };
}
