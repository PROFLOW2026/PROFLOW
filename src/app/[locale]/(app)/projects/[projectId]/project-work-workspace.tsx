import { listProjectsForOrg } from '@/modules/projects';
import {
  listOrgPhasePacks,
  listOrgProjectTemplatesForApply,
  listOrgWorkPackagePacks,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadProjectDetail } from './load-project-detail';
import { projectDetailForClient } from './project-detail-client';
import { WorkTab } from './work-tab';

export async function ProjectWorkWorkspace({
  projectId,
  locale,
}: {
  readonly projectId: string;
  readonly locale: string;
}) {
  return withOrgContext(async (context) => {
    const canEditProjects = context.permissions.has(PERMISSIONS.PROJECTS_UPDATE);
    const detail = projectDetailForClient(await loadProjectDetail(projectId, true));
    const uiLocale = locale === 'he-IL' ? 'he-IL' : 'en';

    const [orgTemplates, phasePacks, workPackagePacks, projects] = canEditProjects
      ? await Promise.all([
          listOrgProjectTemplatesForApply(context).catch(() => []),
          listOrgPhasePacks(context).catch(() => []),
          listOrgWorkPackagePacks(context).catch(() => []),
          listProjectsForOrg(context, {}).catch(() => []),
        ])
      : [[], [], [], []];

    const cloneCandidates = projects
      .filter((row) => row.id !== projectId)
      .map((row) => ({ id: row.id, name: row.name }));

    return (
      <WorkTab
        detail={detail}
        canEdit={canEditProjects}
        locale={uiLocale}
        orgTemplates={orgTemplates}
        phasePacks={phasePacks}
        workPackagePacks={workPackagePacks}
        cloneCandidates={cloneCandidates}
      />
    );
  });
}
