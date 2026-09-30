import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function QuoteSettingsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['quotes']}>{children}</WithClientMessages>;
}
