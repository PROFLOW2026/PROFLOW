import { Contact, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listLeadsForOrg } from '@/modules/crm';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { CrmSectionNav, CrmShell } from '../crm-shell';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'crm' });
  return { title: t('nav.leads') };
}

export default async function CrmLeadsPage() {
  const t = await getTranslations('crm');
  const { leads, canManage } = await withOrgContext(async (context) => ({
    leads: await listLeadsForOrg(context),
    canManage: hasPermission(context, PERMISSIONS.CRM_MANAGE),
  }));

  return (
    <CrmShell>
      <PageHeader
        title={t('nav.leads')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/crm/leads/new">
                <Plus aria-hidden />
                {t('lead.new')}
              </Link>
            </Button>
          ) : null
        }
      />
      <CrmSectionNav active="leads" />

      {leads.length === 0 ? (
        <EmptyState
          icon={Contact}
          title={t('empty.leads.title')}
          description={t('empty.leads.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/crm/leads/new">{t('empty.leads.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={leads}
          getRowKey={(row) => row.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.title')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link href={`/crm/leads/${row.id}`} className={cn(textNavLinkClassName, 'font-medium')}>
                          {row.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={row.status === 'new' || row.status === 'qualified' ? 'active' : 'archived'}
                          label={t(`statuses.lead.${row.status}`)}
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
              href={`/crm/leads/${row.id}`}
              className={pressableCardLinkClassName}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-start font-semibold">{row.title}</span>
                <StatusBadge
                  className="shrink-0"
                  shape={row.status === 'new' || row.status === 'qualified' ? 'active' : 'archived'}
                  label={t(`statuses.lead.${row.status}`)}
                />
              </div>
            </Link>
          )}
        />
      )}
    </CrmShell>
  );
}
