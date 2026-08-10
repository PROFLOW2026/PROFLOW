import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listLeadsForOrg, listProspectsForOrg } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { NewOpportunityForm } from './new-opportunity-form';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('opportunity.new') };
}

export default async function NewOpportunityPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const t = await getTranslations('crm');
  const params = await searchParams;
  const { prospects, leads, currency } = await withOrgContext(async (context) => {
    const [prospectRows, leadRows] = await Promise.all([
      listProspectsForOrg(context),
      listLeadsForOrg(context, { includeArchived: false }),
    ]);
    return {
      prospects: prospectRows,
      leads: leadRows,
      currency: context.organization.baseCurrency,
    };
  });

  const defaultLeadId =
    params.leadId && leads.some((lead) => lead.id === params.leadId) ? params.leadId : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('opportunity.new')}
        breadcrumb={
          <Link href="/crm" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />
      <NewOpportunityForm
        prospects={prospects.map((p) => ({ id: p.id, name: p.name }))}
        leads={leads.map((lead) => ({ id: lead.id, title: lead.title }))}
        defaultCurrency={currency}
        defaultLeadId={defaultLeadId}
      />
    </div>
  );
}
