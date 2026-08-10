import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function AssetsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['assets']}>{children}</WithClientMessages>;
}
