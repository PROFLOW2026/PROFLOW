import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function MonthCloseLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['monthClose']}>{children}</WithAppClientMessages>;
}
