import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <WithClientMessages
      extra={[
        'settings',
        'api',
        'portal',
        'organization',
        'tax',
        'onboarding',
        'auth',
        'imports',
        'procurement',
        'banking',
        'exports',
        'forms',
      ]}
    >
      {children}
    </WithClientMessages>
  );
}
