import { redirect } from 'next/navigation';
import { isExternalPublicAccessEnabled } from '@/modules/portal';

/**
 * Customer public portal — hard-disabled until ExternalPrincipal auth is safe.
 * Never falls through to the internal app shell.
 */
export default async function CustomerPublicPortalPage({
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
