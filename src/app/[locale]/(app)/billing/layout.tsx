import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function BillingLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['invoicingIntegration']}>{children}</WithAppClientMessages>;
}
