import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listBillingProjectOptions } from '@/modules/billing';
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
  searchParams: Promise<{ projectId?: string }>;
}) {
  const { projectId } = await searchParams;
  const t = await getTranslations('billing');

  const { projects, defaultIssueDate, defaultCurrency } = await withOrgContext(async (context) => ({
    projects: await listBillingProjectOptions(context),
    defaultIssueDate: todayInTimeZone(context.organization.timezone),
    defaultCurrency: context.organization.baseCurrency,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('form.title')} description={t('subtitle')} />
      <BillingRecordForm
        projects={projects}
        defaultProjectId={projectId}
        defaultCurrency={defaultCurrency}
        defaultIssueDate={defaultIssueDate}
      />
    </div>
  );
}
