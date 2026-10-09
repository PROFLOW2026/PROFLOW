import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function FormsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['forms']}>{children}</WithAppClientMessages>;
}
