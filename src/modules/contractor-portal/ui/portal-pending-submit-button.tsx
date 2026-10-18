'use client';

import type { ReactNode } from 'react';
import { SubmitButton } from '@/components/ui/submit-button';
import { portalSecondaryButtonClass } from '@/modules/contractor-portal/ui/portal-surface';
import { cn } from '@/shared/ui/cn';

/** Portal chrome submit that shows shared loading state for server-action forms. */
export function PortalPendingSubmitButton({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <SubmitButton variant="secondary" className={cn(portalSecondaryButtonClass, className)}>
      {children}
    </SubmitButton>
  );
}
