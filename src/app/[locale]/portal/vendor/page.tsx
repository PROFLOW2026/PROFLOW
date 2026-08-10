import { redirect } from 'next/navigation';
import { isExternalPublicAccessEnabled } from '@/modules/portal';

/**
 * Vendor public portal — hard-disabled until ExternalPrincipal auth is safe.
 * Never falls through to the internal app shell. Candidates remain admin-mediated.
 */
export default async function VendorPublicPortalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isExternalPublicAccessEnabled()) {
    redirect(`/${locale}/portal`);
  }
  redirect(`/${locale}/portal`);
}
