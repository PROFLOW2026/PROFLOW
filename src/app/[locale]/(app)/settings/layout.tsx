import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <WithAppClientMessages
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
        'safety',
        'integrations',
        'invoicingIntegration',
      ]}
    >
      {children}
    </WithAppClientMessages>
  );
}
