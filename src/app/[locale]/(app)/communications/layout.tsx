import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function CommunicationsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['communications']}>{children}</WithAppClientMessages>;
}
