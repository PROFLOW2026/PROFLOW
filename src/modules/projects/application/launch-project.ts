import type { OrgContext } from '@/shared/auth/context';
import { lazyCreateProjectWorkspace } from '@/modules/workspaces';
import {
  applyUwmProjectTemplate,
  ensureDefaultProjectBoard,
  type ApplyUwmProjectTemplateResult,
} from '@/modules/tasks';
import {
  PROJECT_TEMPLATE_KEYS,
  type ProjectTemplateKey,
  type TemplateLocale,
} from '../domain/templates';
import { findProjectById } from '../data/projects.repository';
import { createProject, type CreateProjectResult } from './create-project';
import type { CreateProjectInput } from '../validation/schemas';
import {
  applyStructureProjectTemplate,
  type ApplyProjectTemplateResult as ApplyStructureProjectTemplateResult,
} from './apply-project-template';
import {
  cloneProjectStructure,
  type ProjectStructureSnapshot,
} from './clone-project-structure';

export type ProjectLaunchSource =
  | { kind: 'blank' }
  | { kind: 'structure_template'; templateKey: ProjectTemplateKey; locale?: TemplateLocale }
  | { kind: 'uwm_template'; templateId: string }
  | { kind: 'clone_structure'; sourceProjectId: string };

export interface LaunchProjectInput {
  readonly create: CreateProjectInput;
  readonly launch?: ProjectLaunchSource;
}

export interface LaunchProjectResult extends CreateProjectResult {
  readonly workspaceId: string;
  readonly boardId: string | null;
  readonly structureApplied?: ApplyStructureProjectTemplateResult;
  readonly uwmApplied?: ApplyUwmProjectTemplateResult;
  readonly clonedStructure?: ProjectStructureSnapshot;
}

function isProjectTemplateKey(value: string): value is ProjectTemplateKey {
  return (PROJECT_TEMPLATE_KEYS as readonly string[]).includes(value);
}

/**
 * Unified project launch: create project, provision workspace/board, then apply optional structure.
 */
export async function launchProject(
  context: OrgContext,
  input: LaunchProjectInput,
): Promise<LaunchProjectResult> {
  const launch = input.launch ?? { kind: 'blank' as const };

  const created = await createProject(context, input.create);
  const { ensureProjectCreatorAccess } = await import('./ensure-creator-project-access');
  await ensureProjectCreatorAccess(context, created.projectId);
  const project = await findProjectById(context.db, context.organizationId, created.projectId);
  const projectName = project?.name ?? input.create.name;

  const { workspace } = await lazyCreateProjectWorkspace(context, created.projectId, projectName);

  let boardId: string | null = null;
  let structureApplied: ApplyStructureProjectTemplateResult | undefined;
  let uwmApplied: ApplyUwmProjectTemplateResult | undefined;
  let clonedStructure: ProjectStructureSnapshot | undefined;

  if (launch.kind === 'uwm_template') {
    uwmApplied = await applyUwmProjectTemplate(
      context,
      created.projectId,
      projectName,
      launch.templateId,
      { duringLaunch: true },
    );
    boardId = uwmApplied.boardId;
  } else {
    const board = await ensureDefaultProjectBoard(context, workspace.id, projectName);
    boardId = board?.id ?? null;

    if (launch.kind === 'structure_template') {
      if (!isProjectTemplateKey(launch.templateKey)) {
        throw new Error(`Unknown structure template key: ${launch.templateKey}`);
      }
      structureApplied = await applyStructureProjectTemplate(context, {
        projectId: created.projectId,
        templateKey: launch.templateKey,
        locale: launch.locale,
        duringLaunch: true,
      });
    } else if (launch.kind === 'clone_structure') {
      clonedStructure = await cloneProjectStructure(context, {
        targetProjectId: created.projectId,
        sourceProjectId: launch.sourceProjectId,
        duringLaunch: true,
      });
    }
  }

  return {
    ...created,
    workspaceId: workspace.id,
    boardId,
    structureApplied,
    uwmApplied,
    clonedStructure,
  };
}
