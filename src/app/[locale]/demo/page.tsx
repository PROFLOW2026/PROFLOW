import { notFound } from 'next/navigation';
import { getBusinessProfile } from '@/modules/tenancy/domain/business-profiles';
import { ONBOARDING_BUSINESS_TYPES } from '@/modules/tenancy/domain/onboarding-experience';
import { enterDemoAction } from '@/modules/demo/application/actions';
import { isDemoEntryEnabled } from '@/modules/demo/application/flags';
import { DemoEntryScreen } from '@/modules/demo/ui/demo-entry-screen';
import { LandingFooter } from '@/modules/marketing/ui/landing-footer';

export default function DemoEntryPage() {
  if (!isDemoEntryEnabled()) notFound();

  const businessChoices = ONBOARDING_BUSINESS_TYPES.map((key) => ({
    key,
    label: getBusinessProfile(key)?.domains[0]?.nameHe ?? key,
  }));

  return (
    <DemoEntryScreen
      action={enterDemoAction}
      businessChoices={businessChoices}
      footer={<LandingFooter />}
    />
  );
}