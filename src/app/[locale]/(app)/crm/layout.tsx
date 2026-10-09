import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['crm', 'quotes']}>{children}</WithAppClientMessages>;
}
