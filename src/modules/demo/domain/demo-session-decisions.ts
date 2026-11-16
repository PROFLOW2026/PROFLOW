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