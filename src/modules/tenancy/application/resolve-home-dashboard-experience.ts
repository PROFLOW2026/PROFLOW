import { loadShellOrgSettings } from './shell-org-settings';
import type { OrgContext } from '@/shared/auth/context';
import {
  ALL_CAPABILITIES_CARD_SUPPLEMENTS,
  resolveDashboardLayout,
  type DashboardLayoutMode,
} from '../domain/experience-dashboard-layout';
import { resolveExperienceFamily } from '../domain/experience-family';
import type { BusinessProfileKey } from '../domain/business-profiles';
import type { WorkMix } from '../domain/work-mix';
import {
  buildExperienceUiContext,
  isExperienceUiVisible,
  type ExperienceUiContext,
} from '../domain/experience-ui-registry';

export type HomeDashboardExperienceSlice = {
  readonly experienceFamily: ReturnType<typeof resolveExperienceFamily>;
  readonly dashboardLayoutMode: DashboardLayoutMode;
  readonly allCapabilitiesSupplements: readonly (typeof ALL_CAPABILITIES_CARD_SUPPLEMENTS)[number][];
  readonly experienceUiContext: ExperienceUiContext;
};

export async function resolveHomeDashboardExperience(
  context: OrgContext,
  input: {
    readonly effectiveProfileKey: BusinessProfileKey | null;
    readonly effectiveWorkMix: WorkMix;
    readonly preferServiceSurface: boolean;
  },
): Promise<HomeDashboardExperienceSlice> {
  const orgSettings = await loadShellOrgSettings(context.db, context.organizationId);

  const experienceFamily = resolveExperienceFamily({
    businessProfileKey: input.effectiveProfileKey,
    workMix: input.effectiveWorkMix,
    preferServiceSurface: input.preferServiceSurface,
    customizationMode: orgSettings.customizationMode,
    storedFamily: orgSettings.experienceFamily,
    projectsPrimary: orgSettings.experienceProjectsPrimary,
  });

  const dashboardLayoutMode = resolveDashboardLayout({
    family: experienceFamily,
    workMix: input.effectiveWorkMix,
    preferServiceSurface: input.preferServiceSurface,
    projectsPrimary: orgSettings.experienceProjectsPrimary,
  });

  const experienceUiContext = buildExperienceUiContext({
    customizationMode: orgSettings.customizationMode,
    family: experienceFamily,
    overrides: orgSettings.experienceUiOverrides,
  });

  const allCapabilitiesSupplements =
    dashboardLayoutMode === 'all_capabilities'
      ? ALL_CAPABILITIES_CARD_SUPPLEMENTS.filter((card) =>
          isExperienceUiVisible(`card.${card}`, experienceUiContext),
        )
      : [];

  return {
    experienceFamily,
    dashboardLayoutMode,
    allCapabilitiesSupplements,
    experienceUiContext,
  };
}
