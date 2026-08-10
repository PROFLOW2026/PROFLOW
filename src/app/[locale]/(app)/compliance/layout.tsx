import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function ComplianceLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['compliance']}>{children}</WithClientMessages>;
}
