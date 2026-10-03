'use client';

import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import type { ConstructionCharacteristics } from '../domain/characteristics';
import type { LocationNode } from '../domain/locations';
import type { DeliveryProfile } from '../domain/profile';
import type { RecommendationWithStatus } from '../domain/recommendations';
import { CharacteristicsCard } from './characteristics-card';
import { DeliveryProfileCard } from './delivery-profile-card';
import { LocationsCard } from './locations-card';
import { RecommendationsCard } from './recommendations-card';
import type { ProjectStructureActions } from './types';

export interface ProjectStructureClientProps {
  readonly projectId: string;
  readonly basePath: string;
  readonly hasClient: boolean;
  readonly permissions: {
    readonly canManageStructure: boolean;
    readonly canManageSettings: boolean;
    readonly canManageSchedule: boolean;
    readonly canManageTasks: boolean;
  };
  readonly profile: DeliveryProfile;
  readonly characteristics: ConstructionCharacteristics;
  readonly locations: readonly LocationNode[];
  readonly recommendations: { readonly items: readonly RecommendationWithStatus[]; readonly rulesetVersion: string };
  readonly actions: ProjectStructureActions;
}

const SECTIONS = ['profile', 'characteristics', 'locations', 'recommendations'] as const;

export function ProjectStructureClient({
  projectId,
  basePath,
  hasClient,
  permissions,
  profile,
  characteristics,
  locations,
  recommendations,
  actions,
}: ProjectStructureClientProps) {
  const t = useTranslations('projectProfile');
  const readOnly = !permissions.canManageStructure && !permissions.canManageSettings;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <nav
        aria-label={t('page.title')}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
      >
        {SECTIONS.map((section) => (
          <a
            key={section}
            href={`${basePath}#${section}`}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-[var(--pf-border-default)] px-4 text-sm hover:bg-[var(--pf-bg-muted)] md:min-h-9"
          >
            {t(`page.nav.${section}`)}
          </a>
        ))}
      </nav>

      {readOnly ? (
        <Alert tone="info" role="status">
          <p className="text-sm">{t('page.readOnly')}</p>
        </Alert>
      ) : null}

      <DeliveryProfileCard
        projectId={projectId}
        profile={profile}
        hasClient={hasClient}
        canEdit={permissions.canManageSettings}
        saveProfile={actions.saveProfile}
      />
      <CharacteristicsCard
        projectId={projectId}
        characteristics={characteristics}
        canEdit={permissions.canManageStructure}
        saveCharacteristics={actions.saveCharacteristics}
      />
      <LocationsCard
        projectId={projectId}
        locations={locations}
        canEdit={permissions.canManageStructure}
        actions={actions}
      />
      <RecommendationsCard
        projectId={projectId}
        items={recommendations.items}
        rulesetVersion={recommendations.rulesetVersion}
        canManage={permissions.canManageStructure}
        canCreateMilestones={permissions.canManageSchedule}
        canCreateTasks={permissions.canManageTasks}
        actions={actions}
      />
    </div>
  );
}
