import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

export default function SafetyLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['safety']}>{children}</WithAppClientMessages>;
}
