import type { ProjectTabKey, ProjectTabVisibility } from './project-tab-order';
import { applyProjectProfileToTabVisibility } from './project-tab-order';
import { visibleHubSections } from './project-hub-order';
import type { ProjectHubKey } from './project-hub-order';
import type { ProjectExperienceProfileKey } from '@/modules/tenancy/domain/project-profiles';
import type { ProjectDetail } from '@/modules/projects/application/get-project-detail';
import {
  inferProjectTabDataPresenceFromDetail,
} from '@/modules/projects/application/project-tab-data-presence';
import { applyExperienceUiToProjectTabVisibility } from '@/modules/tenancy/domain/experience-ui-project-tabs';
import {
  buildExperienceUiContext,
  type ExperienceUiContext,
} from '@/modules/tenancy/domain/experience-ui-registry';
import type { CapabilityCustomizationMode } from '@/modules/tenancy/domain/capability-overrides';
import type { ExperienceFamilyKey, ExperienceUiOverrides } from '@/modules/tenancy/domain/experience-family';

export type ResolveProjectTabVisibilityInput = {
  readonly moduleVisibility: ProjectTabVisibility;
  readonly experienceProfile: ProjectExperienceProfileKey;
  readonly detail: ProjectDetail;
  readonly experienceFamily: ExperienceFamilyKey;
  readonly customizationMode: CapabilityCustomizationMode | null;
  readonly experienceUiOverrides: ExperienceUiOverrides;
};

export type ResolvedProjectTabVisibility = {
  readonly base: ProjectTabVisibility;
  readonly display: ProjectTabVisibility;
  readonly experienceUiContext: ExperienceUiContext;
  readonly experienceHiddenTabs: readonly ProjectTabKey[];
};

export function resolveProjectTabVisibility(
  input: ResolveProjectTabVisibilityInput,
): ResolvedProjectTabVisibility {
  const base = applyProjectProfileToTabVisibility(
    input.moduleVisibility,
    input.experienceProfile,
  );
  const presence = inferProjectTabDataPresenceFromDetail(input.detail);
  const experienceUiContext = buildExperienceUiContext({
    customizationMode: input.customizationMode,
    family: input.experienceFamily,
    overrides: input.experienceUiOverrides,
  });
  const display = applyExperienceUiToProjectTabVisibility(base, experienceUiContext, presence);

  const experienceHiddenTabs = (
    Object.keys(base) as (keyof ProjectTabVisibility)[]
  ).filter((key) => base[key] && !display[key]) as ProjectTabKey[];

  return { base, display, experienceUiContext, experienceHiddenTabs };
}

export function hubSectionsForDisplay(
  hub: ProjectHubKey,
  resolved: ResolvedProjectTabVisibility,
  showExperienceHidden: boolean,
): ProjectTabKey[] {
  const visibility = showExperienceHidden ? resolved.base : resolved.display;
  return visibleHubSections(hub, visibility);
}
