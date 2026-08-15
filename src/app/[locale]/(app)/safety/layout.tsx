import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function SafetyLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['safety']}>{children}</WithClientMessages>;
}
