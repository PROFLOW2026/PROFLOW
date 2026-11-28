import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

/** The shared takeoff review screen needs the takeoff catalog on this route. */
export default function ProfessionalToolsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['takeoff']}>{children}</WithAppClientMessages>;
}
