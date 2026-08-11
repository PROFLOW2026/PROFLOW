import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function MonthCloseLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['monthClose']}>{children}</WithClientMessages>;
}
