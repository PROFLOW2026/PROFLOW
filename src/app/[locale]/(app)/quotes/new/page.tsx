import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
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

export default async function NewQuotePage() {
  const t = await getTranslations('quotes');
  const shell = await getShellContext();

  const clients = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.CLIENTS_READ)) return [];
    try {
      return await listClientsForOrg(context, { status: 'active' });
    } catch {
      return [];
    }
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <Link href="/quotes" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('disclaimer')}</p>
      <QuoteCreateForm
        defaultCurrency={shell?.organization.baseCurrency ?? 'ILS'}
        clients={clients.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
