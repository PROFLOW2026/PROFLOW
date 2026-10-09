import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function AssetsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['assets']}>{children}</WithAppClientMessages>;
}
