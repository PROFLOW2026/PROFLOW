import { Handshake, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listOpportunitiesForOrg } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { CrmSectionNav, CrmShell } from './crm-shell';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('title') };
}

export default async function CrmOpportunitiesPage() {
  const t = await getTranslations('crm');
  const { opportunities, canManage } = await withOrgContext(async (context) => ({
    opportunities: await listOpportunitiesForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
  }));

  return (
    <CrmShell>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/crm/opportunities/new">
                <Plus aria-hidden />
                {t('opportunity.new')}
              </Link>
            </Button>
          ) : null
        }
      />
      <CrmSectionNav active="opportunities" />

      {opportunities.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title={t('empty.opportunities.title')}
          description={t('empty.opportunities.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/crm/opportunities/new">{t('empty.opportunities.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={opportunities}
          getRowKey={(row) => row.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.stage')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                    <TableHead numeric>{t('list.columns.value')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link
                          href={`/crm/opportunities/${row.id}`}
                          className={cn(textNavLinkClassName, 'font-medium')}
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`stages.${row.stage}`)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={row.status === 'open' ? 'active' : 'archived'}
                          label={t(`statuses.opportunity.${row.status}`)}
                        />
                      </TableCell>
                      <TableCell numeric>
                        {row.expectedValueAmount ? (
                          <span dir="ltr">
                            {`${row.expectedValueAmount} ${row.currency ?? ''}`.trim()}
                          </span>
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
          renderMobileCard={(row) => (
            <Link
              href={`/crm/opportunities/${row.id}`}
              className={pressableCardLinkClassName}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-start font-semibold">{row.name}</span>
                <StatusBadge
                  className="shrink-0"
                  shape={row.status === 'open' ? 'active' : 'archived'}
                  label={t(`statuses.opportunity.${row.status}`)}
                />
              </div>
              <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
                {t(`stages.${row.stage}`)}
                {row.expectedValueAmount ? (
                  <>
                    {' · '}
                    <span dir="ltr">
                      {`${row.expectedValueAmount} ${row.currency ?? ''}`.trim()}
                    </span>
                  </>
                ) : null}
              </p>
            </Link>
          )}
        />
      )}
    </CrmShell>
  );
}
