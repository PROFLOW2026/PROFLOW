import type { ReactNode } from 'react';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';

/** Same takeoff catalog as the owner tools route. The employee shell does not load it by default. */
export default function EmployeeProfessionalToolsLayout({ children }: { children: ReactNode }) {
  return <WithAppClientMessages extra={['takeoff']}>{children}</WithAppClientMessages>;
}
