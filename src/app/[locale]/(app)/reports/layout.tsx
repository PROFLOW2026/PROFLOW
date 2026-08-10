import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['dashboard', 'exports']}>{children}</WithClientMessages>;
}
