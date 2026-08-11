import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function RecurringDraftsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['recurringDrafts']}>{children}</WithClientMessages>;
}
