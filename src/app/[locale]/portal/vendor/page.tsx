import { notFound } from 'next/navigation';
import { isExternalPublicAccessEnabled } from '@/modules/portal';

/**
 * Vendor public portal - hard-disabled until ExternalPrincipal auth is safe.
 * Never falls through to the internal app shell. Candidates remain admin-mediated.
 */
export default function VendorPublicPortalPage() {
  if (!isExternalPublicAccessEnabled()) {
    notFound();
  }
  notFound();
}
