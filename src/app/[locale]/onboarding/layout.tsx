import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['onboarding', 'auth']}>{children}</WithClientMessages>;
}
