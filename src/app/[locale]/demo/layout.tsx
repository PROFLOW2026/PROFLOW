import type { ReactNode } from 'react';
import type { MessageNamespace } from '@/shared/i18n/config';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';

const DEMO_CLIENT_MESSAGE_NAMESPACES = [
  'common',
  'marketing',
  'demo',
  'errors',
  'offline',
] as const satisfies readonly MessageNamespace[];

/** Public demo entry — marketing header + demo catalog for client islands. */
export default async function DemoLayout({ children }: { children: ReactNode }) {
  return (
    <WithClientMessages namespaces={[...DEMO_CLIENT_MESSAGE_NAMESPACES]}>
      {children}
    </WithClientMessages>
  );
}