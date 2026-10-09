import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['calendar']}>{children}</WithAppClientMessages>;
}
