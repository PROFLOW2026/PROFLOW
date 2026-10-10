import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CrmOpportunitiesHubView } from '@/modules/crm/ui/crm-opportunities-hub-view';
import { CrmSectionNav, CrmShell } from './crm-shell';
import { CrmPipelineHint } from './crm-pipeline-hint';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('title') };
}

export default async function CrmOpportunitiesPage() {
  return (
    <CrmShell>
      <CrmOpportunitiesHubView
        surface="owner"
        afterHeader={
          <>
            <CrmSectionNav active="opportunities" />
            <CrmPipelineHint />
          </>
        }
      />
    </CrmShell>
  );
}
