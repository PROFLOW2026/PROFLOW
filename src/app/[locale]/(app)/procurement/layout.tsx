import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function ProcurementLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['procurement', 'ap']}>{children}</WithAppClientMessages>;
}
