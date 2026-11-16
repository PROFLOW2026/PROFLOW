import type { DemoRoleKey } from '@/modules/demo/domain/demo-org';
import { getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';
import {
  isOnboardingBusinessType,
  ONBOARDING_BUSINESS_TYPES,
  type OnboardingBusinessType,
} from '@/modules/tenancy/domain/onboarding-experience';

export function demoBusinessProfileOptions(): ReadonlyArray<{
  readonly key: OnboardingBusinessType;
  readonly label: string;
}> {
  return ONBOARDING_BUSINESS_TYPES.map((key) => ({
    key,
    label: getBusinessProfile(key)?.domains[0]?.nameHe ?? key,
  }));
}

export function resolveDemoBusinessProfileKey(raw: unknown): OnboardingBusinessType | null {
  return typeof raw === 'string' && isOnboardingBusinessType(raw) ? raw : null;
}

/** Public marketing homepage for the active locale (`/[locale]`). */
export function demoExitMarketingHref(): string {
  return '/';
}

export type DemoSessionApplyPlan = 'none' | 'switch-role' | 'replace-session';

/** One apply covers both selectors. A business change replaces the visitor's session; a role change does not. */
export function planDemoSessionApply(input: {
  readonly currentProfileKey: string;
  readonly currentRoleKey: DemoRoleKey;
  readonly nextProfileKey: OnboardingBusinessType;
  readonly nextRoleKey: DemoRoleKey;
}): DemoSessionApplyPlan {
  const profileChanged = input.nextProfileKey !== input.currentProfileKey;
  const roleChanged = input.nextRoleKey !== input.currentRoleKey;
  if (!profileChanged && !roleChanged) return 'none';
  if (!profileChanged) return 'switch-role';
  return 'replace-session';
}