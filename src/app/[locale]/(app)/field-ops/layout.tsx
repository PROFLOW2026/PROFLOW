import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function FieldOpsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['fieldOps', 'reports']}>{children}</WithAppClientMessages>;
}
