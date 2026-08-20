import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function ImportsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['imports']}>{children}</WithClientMessages>;
}
