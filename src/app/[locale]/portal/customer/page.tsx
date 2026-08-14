import { notFound } from 'next/navigation';
import { isExternalPublicAccessEnabled } from '@/modules/portal';

/**
 * Customer public portal — hard-disabled until ExternalPrincipal auth is safe.
 * Never falls through to the internal app shell.
 */
export default function CustomerPublicPortalPage() {
  if (!isExternalPublicAccessEnabled()) {
    notFound();
  }
  notFound();
}
