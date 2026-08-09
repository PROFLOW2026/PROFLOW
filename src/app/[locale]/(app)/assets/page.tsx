import { Plus, Wrench } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listAssetsForOrg, type AssetStatus } from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AssetsSectionNav } from './assets-section-nav';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'assets' });
  return { title: t('title') };
}

function assetShape(status: AssetStatus): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'in_maintenance':
      return 'pending';
    case 'retired':
      return 'onHold';
    case 'disposed':
      return 'archived';
    default:
      return 'archived';
  }
}

export default async function AssetsPage() {
  const t = await getTranslations('assets');
  const tStatus = await getTranslations('status.asset');

  const { items, canManage } = await withOrgContext(async (context) => ({
    items: await listAssetsForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.ASSETS_MANAGE),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/assets/new">
                <Plus aria-hidden />
                {t('newAsset')}
              </Link>
            </Button>
          ) : null
        }
      />
      <AssetsSectionNav active="assets" />

      {items.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t('empty.assets.title')}
          description={t('empty.assets.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/assets/new">{t('empty.assets.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={items}
          getRowKey={(item) => item.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.kind')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead>{t('list.columns.identifier')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link href={`/assets/${item.id}`} className="font-medium hover:underline">
                          {item.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`kinds.${item.assetKind}`)}</TableCell>
                      <TableCell>
                        <StatusBadge shape={assetShape(item.status)} label={tStatus(item.status)} />
                      </TableCell>
                      <TableCell>{item.identifier ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(item) => (
            <Link
              href={`/assets/${item.id}`}
              className="block rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold">{item.name}</span>
                <StatusBadge shape={assetShape(item.status)} label={tStatus(item.status)} />
              </div>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t(`kinds.${item.assetKind}`)}
                {item.identifier ? ` · ${item.identifier}` : ''}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
