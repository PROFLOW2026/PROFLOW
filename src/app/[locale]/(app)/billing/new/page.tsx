import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listBillingContractOptionsForOrg, listBillingProjectOptions } from '@/modules/billing';
import { BillingRecordForm } from '@/modules/billing/ui/billing-record-form';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('form.title') };
}

export default async function NewBillingRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; contractId?: string }>;
}) {
  const { projectId, contractId } = await searchParams;
  const t = await getTranslations('billing');

  const { projects, contracts, defaultIssueDate, defaultCurrency } = await withOrgContext(async (context) => ({
    projects: await listBillingProjectOptions(context),
    contracts: await listBillingContractOptionsForOrg(context),
    defaultIssueDate: todayInTimeZone(context.organization.timezone),
    defaultCurrency: context.organization.baseCurrency,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('form.title')} description={t('subtitle')} />
      <p className="text-xs text-[var(--pf-text-muted)]">{t('statutoryDisclosure')}</p>
      <BillingRecordForm
        projects={projects}
        contracts={contracts}
        defaultProjectId={projectId}
        defaultContractId={contractId}
        defaultCurrency={defaultCurrency}
        defaultIssueDate={defaultIssueDate}
      />
    </div>
  );
}
