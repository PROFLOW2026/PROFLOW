import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function FieldOpsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['fieldOps']}>{children}</WithClientMessages>;
}
