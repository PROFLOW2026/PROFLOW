import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listProspectsForOrg } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { NewOpportunityForm } from './new-opportunity-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('opportunity.new') };
}

export default async function NewOpportunityPage() {
  const t = await getTranslations('crm');
  const { prospects, currency } = await withOrgContext(async (context) => ({
    prospects: await listProspectsForOrg(context),
    currency: context.organization.baseCurrency,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('opportunity.new')}
        breadcrumb={
          <Link href="/crm" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
      />
      <NewOpportunityForm
        prospects={prospects.map((p) => ({ id: p.id, name: p.name }))}
        defaultCurrency={currency}
      />
    </div>
  );
}
