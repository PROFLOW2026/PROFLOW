import { Suspense } from 'react';
import {
  listProjectsForOrg,
  type ProjectDetail,
} from '@/modules/projects';
import {
  listOrgPhasePacks,
  listOrgProjectTemplatesForApply,
  listOrgWorkPackagePacks,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { TabPanelSkeleton } from './tab-panel-skeleton';
import { WorkTab } from './work-tab';

interface OverviewWorkSetupProps {
  projectId: string;
  detail: ProjectDetail;
  canEdit: boolean;
  locale: 'en' | 'he-IL';
}

/**
 * Work setup on overview (when there is no Work tab) — loaded behind Suspense
 * so open-project primary flight is not blocked by templates/packs/clone list.
 */
export function OverviewWorkSetup(props: OverviewWorkSetupProps) {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
          <TabPanelSkeleton />
        </div>
      }
    >
      <OverviewWorkSetupInner {...props} />
    </Suspense>
  );
}

async function OverviewWorkSetupInner({
  projectId,
  detail,
  canEdit,
  locale,
}: OverviewWorkSetupProps) {
  if (!canEdit) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
        <WorkTab detail={detail} canEdit={false} locale={locale} />
      </div>
    );
  }

  const extras = await withOrgContext(async (context) => {
    const [templates, phases, wpPacks, projects] = await Promise.all([
      listOrgProjectTemplatesForApply(context).catch(() => []),
      listOrgPhasePacks(context).catch(() => []),
      listOrgWorkPackagePacks(context).catch(() => []),
      listProjectsForOrg(context, {}).catch(() => []),
    ]);
    return {
      orgTemplates: templates,
      phasePacks: phases,
      workPackagePacks: wpPacks,
      cloneCandidates: projects
        .filter((row) => row.id !== projectId)
        .map((row) => ({ id: row.id, name: row.name })),
    };
  });

  return (
    <div className="rounded-lg border border-dashed border-[var(--pf-border-default)] p-4">
      <WorkTab
        detail={detail}
        canEdit={canEdit}
        locale={locale}
        orgTemplates={extras.orgTemplates}
        phasePacks={extras.phasePacks}
        workPackagePacks={extras.workPackagePacks}
        cloneCandidates={extras.cloneCandidates}
      />
    </div>
  );
}
