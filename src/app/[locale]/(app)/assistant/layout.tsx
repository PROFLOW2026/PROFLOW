import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function AssistantLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['assistant']}>{children}</WithAppClientMessages>;
}
