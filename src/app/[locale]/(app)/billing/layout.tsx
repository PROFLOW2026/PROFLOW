import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function BillingLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['invoicingIntegration']}>{children}</WithClientMessages>;
}
