import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { assertOwnerAppSurface } from '@/modules/employee-app/application/session-guard';
import { withOrgContext } from '@/shared/auth/session';

/**
 * Authenticated application frame for all product routes under (app).
 * The public homepage lives at `[locale]/page.tsx` (outside this group)
 * so anonymous visitors never enter AppShell - and never reach ungated
 * product pages through an anonymous layout pass-through.
 *
 * Employee App sessions are redirected server-side before AppShell renders.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  await withOrgContext(async (context) => {
    assertOwnerAppSurface(context);
  });

  return <AppShell>{children}</AppShell>;
}
