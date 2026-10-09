import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import {
  loadPortalSession,
  loadPortalShellData,
} from '@/modules/contractor-portal/application/load-portal-session';
import { ContractorPortalShell } from '@/modules/contractor-portal/ui/portal-shell';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return {
    title: { default: t('shell.title'), template: `%s · ${t('shell.title')}` },
    robots: { index: false, follow: false },
  };
}

/** Contractor portal shell. External session only - an OrgContext is never loaded here. */
export default async function ContractorPortalLayout({ children }: { children: ReactNode }) {
  const session = await loadPortalSession();
  const shell = await loadPortalShellData(session);

  return (
    <WithPortalClientMessages>
      <ContractorPortalShell shell={shell}>{children}</ContractorPortalShell>
    </WithPortalClientMessages>
  );
}
