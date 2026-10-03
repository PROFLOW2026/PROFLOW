import 'server-only';

import { getProjectStructure } from '@/modules/project-profile';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { withOrgContext } from '@/shared/auth/session';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { ProjectStructureClient } from './project-structure-client';
import {
  acceptRecommendationsAction,
  archiveLocationAction,
  createLocationAction,
  dismissRecommendationsAction,
  generateLocationsAction,
  moveLocationAction,
  restoreLocationAction,
  restoreRecommendationsAction,
  saveCharacteristicsAction,
  saveDeliveryProfileAction,
  updateLocationAction,
} from './structure-actions';

export interface ProjectStructureScreenProps {
  readonly projectId: string;
  /** Locale-aware path prefix for in-page links (Owner vs Employee shells). */
  readonly basePath: string;
}

/** Reusable RSC for project delivery profile, characteristics, locations and recommendations. */
export async function ProjectStructureScreen({ projectId, basePath }: ProjectStructureScreenProps) {
  const view = await loadOrNotFound(() =>
    withOrgContext((context) => getProjectStructure(context, projectId)),
  );

  return (
    <WithClientMessages extra={['projectProfile']}>
      <ProjectStructureClient
        projectId={view.project.id}
        basePath={basePath}
        hasClient={view.project.hasClient}
        permissions={view.permissions}
        profile={view.profile}
        characteristics={view.characteristics}
        locations={view.locations}
        recommendations={{ items: view.recommendations.items, rulesetVersion: view.recommendations.rulesetVersion }}
        actions={{
          saveProfile: saveDeliveryProfileAction,
          saveCharacteristics: saveCharacteristicsAction,
          createLocation: createLocationAction,
          updateLocation: updateLocationAction,
          moveLocation: moveLocationAction,
          archiveLocation: archiveLocationAction,
          restoreLocation: restoreLocationAction,
          generateLocations: generateLocationsAction,
          acceptRecommendations: acceptRecommendationsAction,
          dismissRecommendations: dismissRecommendationsAction,
          restoreRecommendations: restoreRecommendationsAction,
        }}
      />
    </WithClientMessages>
  );
}
