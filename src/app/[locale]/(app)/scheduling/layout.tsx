import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function SchedulingLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['scheduling']}>{children}</WithClientMessages>;
}
