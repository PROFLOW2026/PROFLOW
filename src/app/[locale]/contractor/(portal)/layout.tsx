import { DemoModeBanner } from '@/modules/demo/ui/demo-mode-banner';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import {
  loadPortalSession,
  loadPortalShellData,
} from '@/modules/contractor-portal/application/load-portal-session';
import { ContractorPortalShell } from '@/modules/contractor-portal/ui/portal-shell';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';
import { DesignProductFrame } from '@/shared/theme/design/design-product-frame';

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
  const organizationId = session.projects[0]?.organizationId ?? null;
  const { readDemoKind } = await import("@/modules/demo/application/guards");
  const { isDemoOrganization } = await import("@/modules/demo/domain/demo-org");
  const { getAdminDb } = await import("@/shared/db/client");
  const demoActive = organizationId
    ? isDemoOrganization(await readDemoKind(getAdminDb(), organizationId))
    : false;

  return (
    <WithPortalClientMessages>
      <DemoModeBanner active={demoActive} />
      <ContractorPortalShell shell={shell}>
        <DesignProductFrame>{children}</DesignProductFrame>
      </ContractorPortalShell>
    </WithPortalClientMessages>
  );
}
