import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listRecurrenceDefinitionsForOrg } from '@/modules/service';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'service' });
  return { title: t('recurring.title') };
}

interface RecurringListPageProps {
  searchParams: Promise<{ status?: string; includeEnded?: string }>;
}

export default async function RecurringListPage({ searchParams }: RecurringListPageProps) {
  const [t, params, shell] = await Promise.all([
    getTranslations('service.recurring'),
    searchParams,
    getShellContext(),
  ]);

  const canManage = shell?.permissions.has(PERMISSIONS.SERVICE_MANAGE) ?? false;
  const canRead = shell?.permissions.has(PERMISSIONS.SERVICE_READ) ?? false;

  const statusFilter =
    params.status === 'active' || params.status === 'paused' || params.status === 'ended'
      ? params.status
      : undefined;
  const includeEnded = params.includeEnded === '1' || statusFilter === 'ended';

  const definitions = canRead
    ? await withOrgContext((context) =>
        listRecurrenceDefinitionsForOrg(context, {
          status: statusFilter,
          includeEnded,
        }),
      )
    : [];

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild className="min-h-11">
              <Link href="/service/recurring/new">
                <Plus className="size-4" aria-hidden />
                {t('new')}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ['', t('list.filters.allOpen')],
            ['active', t('list.filters.active')],
            ['paused', t('list.filters.paused')],
            ['ended', t('list.filters.ended')],
          ] as const
        ).map(([value, label]) => {
          const href =
            value === ''
              ? '/service/recurring'
              : `/service/recurring?status=${value}${value === 'ended' ? '' : ''}`;
          const active = (params.status ?? '') === value;
          return (
            <Link
              key={value || 'all'}
              href={href}
              className={cn(
                'min-h-11 rounded-md border px-3 py-2',
                active
                  ? 'border-[var(--pf-border-strong)] bg-[var(--pf-bg-muted)]'
                  : 'border-[var(--pf-border-default)]',
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {!canRead ? (
        <EmptyState title={t('empty.title')} description={t('empty.body')} />
      ) : definitions.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            canManage ? (
              <Button asChild>
                <Link href="/service/recurring/new">{t('empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('list.columns.title')}</TableHead>
                <TableHead>{t('list.columns.client')}</TableHead>
                <TableHead>{t('list.columns.frequency')}</TableHead>
                <TableHead>{t('list.columns.next')}</TableHead>
                <TableHead>{t('list.columns.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {definitions.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Link
                      href={`/service/recurring/${row.id}`}
                      className={textNavLinkClassName}
                    >
                      {row.title}
                    </Link>
                    {row.siteAddress ? (
                      <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{row.siteAddress}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{row.clientName ?? t('fields.noClient')}</TableCell>
                  <TableCell>
                    {t(`frequency.${row.frequency}`)}
                    {row.intervalCount > 1 ? ` ×${row.intervalCount}` : ''}
                  </TableCell>
                  <TableCell dir="ltr">{row.nextOccurrenceDate ?? '-'}</TableCell>
                  <TableCell>{t(`status.${row.status}`)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
