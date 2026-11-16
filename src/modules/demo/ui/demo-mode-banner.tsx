import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { DEMO_ROLE_CHOICES } from '@/modules/demo/domain/demo-roles';
import { openDemoSessionCookie } from '@/modules/demo/application/session-cookie';
import { demoBusinessProfileOptions } from '@/modules/demo/domain/demo-session-decisions';
import { isOnboardingBusinessType } from '@/modules/tenancy/domain/onboarding-experience';
import { DemoLocalMarker } from './demo-local-marker';
import { DemoSessionBar } from './demo-session-bar';

export async function DemoModeBanner({ active }: { active: boolean }) {
  if (!active) return null;
  const t = await getTranslations('demo');
  const current = openDemoSessionCookie((await cookies()).get('demo_session')?.value);
  return (
    <div
      role="status"
      data-demo-banner="active"
      className="w-full max-w-full overflow-x-hidden bg-amber-100 px-1.5 py-1 text-amber-950 sm:px-2"
    >
      <DemoLocalMarker />
      <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center">
        <span className="sr-only">{t('session.banner')}</span>
        {current && isOnboardingBusinessType(current.profileKey) ? (
          <DemoSessionBar
            profileKey={current.profileKey}
            roleKey={current.roleKey}
            businessOptions={demoBusinessProfileOptions()}
            roleChoices={DEMO_ROLE_CHOICES}
          />
        ) : null}
      </div>
    </div>
  );
}