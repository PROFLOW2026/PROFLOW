import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function ProcurementLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['procurement', 'ap']}>{children}</WithClientMessages>;
}
