import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';

/**
 * Authenticated application frame for all product routes under (app).
 * The public homepage lives at `[locale]/page.tsx` (outside this group)
 * so anonymous visitors never enter AppShell — and never reach ungated
 * product pages through an anonymous layout pass-through.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
