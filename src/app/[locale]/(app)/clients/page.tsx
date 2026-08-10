import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listClientsForOrg } from '@/modules/clients';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { ClientListFilters } from './client-list-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'clients' });
  return { title: t('title') };
}

interface ClientsPageProps {
  searchParams: Promise<{ q?: string; includeArchived?: string }>;
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const [t, tStatus, params, shell] = await Promise.all([
    getTranslations('clients'),
    getTranslations('status.generic'),
    searchParams,
    getShellContext(),
  ]);
  const canManage = shell?.permissions.has(PERMISSIONS.CLIENTS_MANAGE) ?? false;
  const includeArchived = params.includeArchived === '1';

  const clients = await withOrgContext((context) =>
    listClientsForOrg(context, { search: params.q, includeArchived }),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/clients/new">
                <Plus aria-hidden />
                {t('newClient')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ClientListFilters initialQuery={params.q ?? ''} includeArchived={includeArchived} />

      {clients.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/clients/new">{t('empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={clients}
          getRowKey={(client) => client.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.name')}</TableHead>
                    <TableHead numeric>{t('list.columns.projects')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          href={`/clients/${client.id}`}
                          className={cn(textNavLinkClassName, 'rounded-sm font-medium')}
                        >
                          {client.name}
                        </Link>
                      </TableCell>
                      <TableCell numeric>
                        <span dir="ltr">{client.projectCount}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={
                            client.archivedAt || client.status === 'inactive' ? 'archived' : 'active'
                          }
                          label={
                            client.archivedAt
                              ? t('detail.archivedBadge')
                              : tStatus(client.status)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(client) => (
            <Link
              href={`/clients/${client.id}`}
              className={cn(pressableCardLinkClassName, 'text-start')}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-start font-semibold">{client.name}</span>
                <StatusBadge
                  className="shrink-0"
                  shape={
                    client.archivedAt || client.status === 'inactive' ? 'archived' : 'active'
                  }
                  label={
                    client.archivedAt ? t('detail.archivedBadge') : tStatus(client.status)
                  }
                />
              </div>
              <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
                {t('list.columns.projects')}: <span dir="ltr">{client.projectCount}</span>
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
