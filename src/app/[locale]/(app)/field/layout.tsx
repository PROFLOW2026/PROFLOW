import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function FieldLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['fieldOps']}>{children}</WithAppClientMessages>;
}
