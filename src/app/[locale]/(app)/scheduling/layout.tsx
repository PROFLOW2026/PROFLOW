import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function SchedulingLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['scheduling']}>{children}</WithAppClientMessages>;
}
