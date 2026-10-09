import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function ImportsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['imports']}>{children}</WithAppClientMessages>;
}
