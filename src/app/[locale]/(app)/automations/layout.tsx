import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function AutomationsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['automations']}>{children}</WithClientMessages>;
}
