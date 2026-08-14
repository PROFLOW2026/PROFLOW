import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from '@/shared/i18n/navigation';
import { reportsHref, type ReportsSection } from '../domain/reports-section';

/**
 * Module-local entry into the existing org reports page.
 */
export function ReportsEntryLink({
  section,
  children,
}: {
  readonly section: ReportsSection;
  readonly children: ReactNode;
}) {
  return (
    <Button asChild variant="secondary" className="max-w-full">
      <Link href={reportsHref({ section })}>{children}</Link>
    </Button>
  );
}
