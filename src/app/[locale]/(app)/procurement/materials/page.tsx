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
import { money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ProcurementSectionNav } from '../procurement-section-nav';
import { MaterialCreateForm } from './material-create-form';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

/**
 * UX: materials catalog + vendor prices stay under /procurement/materials.
 * Operational inventory stock is under /assets/inventory.
 */
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
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('materialsTitle')}
        description={t('materialsDescription')}
        actions={
          <Button asChild variant="secondary" className="max-w-full">
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
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.sku')}</TableHead>
                    <TableHead>{t('list.columns.manufacturer')}</TableHead>
                    <TableHead>{t('list.columns.model')}</TableHead>
                    <TableHead>{t('list.columns.unit')}</TableHead>
                    <TableHead numeric>{t('list.columns.defaultPrice')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[14rem] truncate font-medium">
                        <Link
                          href={`/procurement/materials/${item.id}`}
                          className={cn(textNavLinkClassName, 'rounded-sm')}
                        >
                          {item.name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {item.sku ? (
                          <span dir="ltr" className="pf-numeric">
                            {item.sku}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="max-w-[10rem] truncate">
                        {item.manufacturer ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[8rem] truncate">{item.model ?? '—'}</TableCell>
                      <TableCell>{item.unit}</TableCell>
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
            <Link
              href={`/procurement/materials/${item.id}`}
              className={cn(pressableCardLinkClassName, 'min-w-0')}
            >
              <p className="break-words font-semibold">{item.name}</p>
              <p className="mt-1 break-words text-sm text-[var(--pf-text-secondary)]">
                {[item.sku, item.manufacturer, item.model, item.unit].filter(Boolean).join(' · ') ||
                  '—'}
              </p>
              {item.defaultUnitPrice && item.currency ? (
                <p className="mt-2 text-sm">
                  <MoneyText value={money(item.defaultUnitPrice, item.currency)} />
                </p>
              ) : null}
            </Link>
          )}
        />
      )}

      {canManage ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--pf-text-secondary)]">
            <Plus aria-hidden className="size-4 shrink-0" />
            {t('newMaterial')}
          </p>
          <MaterialCreateForm defaultCurrency={defaultCurrency} />
        </div>
      ) : null}
    </div>
  );
}
