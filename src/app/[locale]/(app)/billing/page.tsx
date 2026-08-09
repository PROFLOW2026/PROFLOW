import { Receipt, ShieldX } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listBillingRecords, getOrganizationReceivablesAging } from '@/modules/billing';
import { BillingListTable } from '@/modules/billing/ui/billing-list-table';
import { ReceivablesAgingPanel } from '@/modules/billing/ui/receivables-aging-panel';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import type { BillingListFilter } from '@/modules/billing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('title') };
}

const FILTERS: BillingListFilter[] = ['all', 'paid', 'outstanding', 'overdue'];

export default async function BillingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const { locale } = await params;
  const { filter: rawFilter } = await searchParams;
  const filter = (FILTERS.includes(rawFilter as BillingListFilter) ? rawFilter : 'all') as BillingListFilter;

  const t = await getTranslations('billing');
  const { canRead, records, canManage, aging } = await withOrgContext(async (context) => {
    const allowed = hasPermission(context, PERMISSIONS.BILLING_READ);
    return {
      canRead: allowed,
      records: allowed ? await listBillingRecords(context, { filter }) : [],
      canManage: hasPermission(context, PERMISSIONS.BILLING_MANAGE),
      aging: allowed ? await getOrganizationReceivablesAging(context) : null,
    };
  });

  if (!canRead) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('subtitle')} />
        <EmptyState
          icon={ShieldX}
          title={t('notAllowed.title')}
          description={t('notAllowed.body')}
          size="md"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/billing/payments/new">{t('paymentForm.title')}</Link>
              </Button>
              <Button asChild>
                <Link href="/billing/new">{t('panel.addBilling')}</Link>
              </Button>
            </div>
          ) : undefined
        }
      />

      {aging && (aging.totalOutstanding.amount !== '0.000000') ? (
        <ReceivablesAgingPanel aging={aging} />
      ) : null}

      <Tabs value={filter}>
        <TabsList aria-label={t('title')}>
          {FILTERS.map((value) => (
            <TabsTrigger key={value} value={value} asChild>
              <Link href={value === 'all' ? '/billing' : `/billing?filter=${value}`}>
                {t(`list.filters.${value}`)}
              </Link>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={filter} className="mt-4">
          {records.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title={t('list.emptyTitle')}
              description={t('list.emptyBody')}
              action={
                canManage ? (
                  <Button asChild>
                    <Link href="/billing/new">{t('list.emptyAction')}</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <BillingListTable records={records} locale={locale} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
