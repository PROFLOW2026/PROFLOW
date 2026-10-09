import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function SalesLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['quotes']}>{children}</WithAppClientMessages>;
}
