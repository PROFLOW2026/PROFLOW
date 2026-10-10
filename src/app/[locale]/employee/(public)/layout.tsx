import type { ReactNode } from 'react';
import { EMPLOYEE_AUTH_CLIENT_MESSAGE_NAMESPACES } from '@/shared/i18n/config';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

/** Employee login / set-pin — no org shell; client islands need `employeeApp` messages. */
export default async function EmployeePublicLayout({ children }: { children: ReactNode }) {
  return (
    <WithClientMessages namespaces={[...EMPLOYEE_AUTH_CLIENT_MESSAGE_NAMESPACES]}>
      {children}
    </WithClientMessages>
  );
}
