import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function QuotesLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['quotes', 'reports']}>{children}</WithClientMessages>;
}
