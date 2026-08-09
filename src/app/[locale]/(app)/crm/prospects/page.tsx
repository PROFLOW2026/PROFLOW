import { Building2, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listProspectsForOrg } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { CrmSectionNav, CrmShell } from '../crm-shell';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('nav.prospects') };
}

export default async function CrmProspectsPage() {
  const t = await getTranslations('crm');
  const { prospects, canManage } = await withOrgContext(async (context) => ({
    prospects: await listProspectsForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
  }));

  return (
    <CrmShell>
      <PageHeader
        title={t('nav.prospects')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/crm/prospects/new">
                <Plus aria-hidden />
                {t('prospect.new')}
              </Link>
            </Button>
          ) : null
        }
      />
      <CrmSectionNav active="prospects" />

      {prospects.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={t('empty.prospects.title')}
          description={t('empty.prospects.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/crm/prospects/new">{t('empty.prospects.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={prospects}
          getRowKey={(row) => row.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead>{t('list.columns.company')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prospects.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/crm/prospects/${row.id}`} className="font-medium hover:underline">
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>{row.companyName ?? '—'}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={row.status === 'active' ? 'active' : 'archived'}
                          label={t(`statuses.prospect.${row.status}`)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(row) => (
            <Link
              href={`/crm/prospects/${row.id}`}
              className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4"
            >
              <span className="font-semibold">{row.name}</span>
              {row.companyName ? (
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{row.companyName}</p>
              ) : null}
            </Link>
          )}
        />
      )}
    </CrmShell>
  );
}
