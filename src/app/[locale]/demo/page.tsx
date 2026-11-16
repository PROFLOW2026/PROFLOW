import { notFound } from 'next/navigation';
import { ONBOARDING_BUSINESS_TYPES } from '@/modules/tenancy/domain/onboarding-experience';
import { enterDemoAction } from '@/modules/demo/application/actions';
import { isDemoEntryEnabled } from '@/modules/demo/application/flags';
import {
  isDemoEntryErrorCode,
  type DemoEntryErrorCode,
} from '@/modules/demo/domain/demo-entry-error';
import { DemoEntryScreen } from '@/modules/demo/ui/demo-entry-screen';
import { LandingFooter } from '@/modules/marketing/ui/landing-footer';

type DemoEntryPageProps = {
  searchParams: Promise<{ demoError?: string | string[] }>;
};

function parseDemoError(raw: string | string[] | undefined): DemoEntryErrorCode | undefined {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (!code || !isDemoEntryErrorCode(code)) return undefined;
  return code;
}

export default async function DemoEntryPage({ searchParams }: DemoEntryPageProps) {
  if (!isDemoEntryEnabled()) notFound();

  const sp = await searchParams;
  const demoError = parseDemoError(sp.demoError);

  return (
    <DemoEntryScreen
      action={enterDemoAction}
      businessKeys={ONBOARDING_BUSINESS_TYPES}
      demoError={demoError}
      footer={<LandingFooter />}
    />
  );
}