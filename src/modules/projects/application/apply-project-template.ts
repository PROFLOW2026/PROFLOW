import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { z } from 'zod';
import { findProjectById } from '../data/projects.repository';
import { listWorkPackagesByProject } from '../data/work-packages.repository';
import {
  cloneProjectTemplateForApply,
  offsetBusinessDate,
  PROJECT_TEMPLATE_KEYS,
  type ProjectTemplateKey,
  type TemplateLocale,
} from '../domain/templates';
import { countActiveWorkPackages } from '../domain/work-package-visibility';
import { createMilestone } from './milestones';
import { createPhase } from './phases';
import { splitProjectIntoWorkPackages } from './work-packages';

const applyProjectTemplateSchema = z.object({
  projectId: z.string().uuid(),
  templateKey: z.enum(PROJECT_TEMPLATE_KEYS),
  locale: z.enum(['en', 'he-IL']).optional(),
});

export interface ApplyProjectTemplateResult {
  readonly templateKey: ProjectTemplateKey;
  readonly workPackageNames: readonly string[];
  readonly milestoneNames: readonly string[];
  readonly phaseCount: number;
}

/**
 * Instantiates a structure template onto a project as editable copies.
 * Catalog definitions are never mutated or live-linked.
 */
export async function applyProjectTemplate(
  context: OrgContext,
  rawInput: {
    projectId: string;
    templateKey: string;
    locale?: TemplateLocale;
  },
): Promise<ApplyProjectTemplateResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = applyProjectTemplateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const locale = parsed.data.locale ?? 'en';
  const copy = cloneProjectTemplateForApply(parsed.data.templateKey, locale);
  if (!copy) {
    throw new ValidationError([{ path: 'templateKey', message: 'Unknown template' }]);
  }

  const project = await findProjectById(context.db, context.organizationId, parsed.data.projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const existing = await listWorkPackagesByProject(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );
  if (countActiveWorkPackages(existing) > 1) {
    throw new DomainRuleError(
      'Structure templates can only be applied before the project is split into multiple work areas.',
      'projects.errors.templateRequiresSimpleProject',
    );
  }

  const packageNames = copy.workPackages.map((pkg) => pkg.name);
  if (packageNames.length === 0) {
    return {
      templateKey: copy.templateKey,
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
      templateKey: copy.templateKey,
      workPackageNames: packageNames,
      milestoneNames,
      phaseCount,
    },
  });

  return {
    templateKey: copy.templateKey,
    workPackageNames: packageNames,
    milestoneNames,
    phaseCount,
  };
}
