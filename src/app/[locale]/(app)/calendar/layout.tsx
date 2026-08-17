import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function CalendarLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['calendar']}>{children}</WithClientMessages>;
}
