import type { ReactNode } from 'react';
import { ONBOARDING_CLIENT_MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <WithClientMessages namespaces={[...ONBOARDING_CLIENT_MESSAGE_NAMESPACES]}>
      {children}
    </WithClientMessages>
  );
}
