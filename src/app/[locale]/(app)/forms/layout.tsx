import type { ReactNode } from 'react';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

export default function FormsLayout({ children }: { children: ReactNode }) {
  return <WithClientMessages extra={['forms']}>{children}</WithClientMessages>;
}
