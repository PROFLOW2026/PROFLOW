import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function AutomationsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['automations']}>{children}</WithAppClientMessages>;
}
