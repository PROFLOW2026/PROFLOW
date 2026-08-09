import { Package, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listMaterialsForOrg } from '@/modules/procurement';
import { money } from '@/shared/money/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProcurementSectionNav } from '../procurement-section-nav';
import { MaterialCreateForm } from './material-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'procurement' });
  return { title: t('materialsTitle') };
}

export default async function MaterialsCatalogPage() {
  const t = await getTranslations('procurement');

  const { materials, canManage, defaultCurrency } = await withOrgContext(async (context) => ({
    materials: await listMaterialsForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.MATERIALS_MANAGE),
    defaultCurrency: context.organization.baseCurrency,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('materialsTitle')}
        description={t('materialsDescription')}
        actions={
          <Button asChild variant="secondary">
            <Link href="/procurement">{t('title')}</Link>
          </Button>
        }
      />

      <ProcurementSectionNav active="materials" />

      {materials.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t('empty.materials.title')}
          description={t('empty.materials.body')}
        />
      ) : (
        <ResponsiveTable
          items={materials}
          getRowKey={(item) => item.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.sku')}</TableHead>
                    <TableHead>{t('list.columns.unit')}</TableHead>
                    <TableHead>{t('list.columns.manufacturer')}</TableHead>
                    <TableHead numeric>{t('list.columns.defaultPrice')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.sku ?? '—'}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell>{item.manufacturer ?? '—'}</TableCell>
                      <TableCell numeric>
                        {item.defaultUnitPrice && item.currency ? (
                          <MoneyText value={money(item.defaultUnitPrice, item.currency)} />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
              <p className="font-semibold">{item.name}</p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {[item.sku, item.unit, item.manufacturer].filter(Boolean).join(' · ') || '—'}
              </p>
              {item.defaultUnitPrice && item.currency ? (
                <p className="mt-2 text-sm">
                  <MoneyText value={money(item.defaultUnitPrice, item.currency)} />
                </p>
              ) : null}
            </div>
          )}
        />
      )}

      {canManage ? (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--pf-text-secondary)]">
            <Plus aria-hidden className="size-4" />
            {t('newMaterial')}
          </p>
          <MaterialCreateForm defaultCurrency={defaultCurrency} />
        </div>
      ) : null}
    </div>
  );
}
