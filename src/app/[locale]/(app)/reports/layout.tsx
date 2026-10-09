import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function ReportsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['dashboard', 'exports', 'reports']}>{children}</WithAppClientMessages>;
}
