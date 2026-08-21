'use client';

import { Building2 } from 'lucide-react';

/**
 * Subtle org mark for shell chrome. Document brand colors are NOT applied here.
 */
export function OrgShellMark({
  organizationName,
  logoUrl,
}: {
  organizationName: string;
  logoUrl?: string | null;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
      <img
        src={logoUrl}
        alt=""
        className="size-7 shrink-0 rounded-md object-contain"
        title={organizationName}
      />
    );
  }

  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--pf-action-primary)] text-[var(--pf-action-primary-fg)]"
      title={organizationName}
      aria-hidden
    >
      <Building2 className="size-3.5" />
    </span>
  );
}
