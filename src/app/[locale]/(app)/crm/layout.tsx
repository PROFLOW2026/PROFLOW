import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function CrmLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['crm', 'quotes']}>{children}</WithClientMessages>;
}
