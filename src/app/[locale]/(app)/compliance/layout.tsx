import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function ComplianceLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['compliance']}>{children}</WithAppClientMessages>;
}
