import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function QuotesLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['quotes', 'reports']}>{children}</WithAppClientMessages>;
}
