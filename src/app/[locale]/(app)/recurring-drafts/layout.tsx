import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function RecurringDraftsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['recurringDrafts']}>{children}</WithAppClientMessages>;
}
