import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function AssistantLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['assistant']}>{children}</WithClientMessages>;
}
