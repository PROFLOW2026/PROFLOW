import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
import { getOpportunityById } from '@/modules/crm';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { QuoteCreateForm } from './quote-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'quotes' });
  return { title: t('create.title') };
}

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: Promise<{ opportunityId?: string }>;
}) {
  const t = await getTranslations('quotes');
  const shell = await getShellContext();
  const { opportunityId: rawOpportunityId } = await searchParams;
  const opportunityId =
    rawOpportunityId && /^[0-9a-f-]{36}$/i.test(rawOpportunityId) ? rawOpportunityId : undefined;

  const { clients, opportunity } = await withOrgContext(async (context) => {
    const listed = hasPermission(context, PERMISSIONS.CLIENTS_READ)
      ? await listClientsForOrg(context, { status: 'active' }).catch(() => [])
      : [];
    let linked: Awaited<ReturnType<typeof getOpportunityById>> | null = null;
    if (opportunityId && hasPermission(context, PERMISSIONS.CRM_READ)) {
      try {
        linked = await getOpportunityById(context, opportunityId);
      } catch {
        linked = null;
      }
    }
    return { clients: listed, opportunity: linked };
  });

  const defaultClientId =
    opportunity?.convertedClientId ?? opportunity?.prospect?.convertedClientId ?? null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={
          opportunity ? t('create.fromOpportunity', { name: opportunity.name }) : t('create.description')
        }
        breadcrumb={
          <Link href="/quotes" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('disclaimer')}</p>
      <QuoteCreateForm
        defaultCurrency={opportunity?.currency ?? shell?.organization.baseCurrency ?? 'ILS'}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        opportunityId={opportunity?.id ?? opportunityId}
        defaultTitle={opportunity?.name}
        defaultClientId={defaultClientId}
      />
    </div>
  );
}
