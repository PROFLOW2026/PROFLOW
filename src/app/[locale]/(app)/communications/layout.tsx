import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function CommunicationsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['communications']}>{children}</WithClientMessages>;
}
