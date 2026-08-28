import { Plus, Repeat } from 'lucide-react';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { ContextualBackLink } from '@/components/ui/contextual-back-link';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import {
  DRAFT_KINDS,
  isDraftKind,
  isDraftStatus,
  listRecurringDraftsForOrg,
  readableDraftKinds,
  writableDraftKinds,
} from '@/modules/recurring-drafts';
import { draftStatusShape } from '@/modules/recurring-drafts/ui/status-shape';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'recurringDrafts' });
  return { title: t('title') };
}

export default async function RecurringDraftsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const [t, locale, params, shell] = await Promise.all([
    getTranslations('recurringDrafts'),
    getLocale(),
    searchParams,
    getShellContext(),
  ]);

  const kindFilter = params.kind && isDraftKind(params.kind) ? params.kind : undefined;
  const statusFilter =
    params.status && isDraftStatus(params.status) ? params.status : undefined;
  const includeEnded = statusFilter === 'ended';

  const { drafts, canCreate, readableKinds } = await withOrgContext(async (context) => {
    const kinds = readableDraftKinds(context);
    if (kinds.length === 0) {
      return { drafts: [], canCreate: false, readableKinds: kinds };
    }
    return {
      drafts: await listRecurringDraftsForOrg(context, {
        kind: kindFilter,
        status: statusFilter,
        includeEnded,
      }),
      canCreate: writableDraftKinds(context).length > 0,
      readableKinds: kinds,
    };
  });

  if (!shell || readableKinds.length === 0) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader
          title={t('title')}
          description={t('subtitle')}
          breadcrumb={
            <ContextualBackLink href="/expenses">{t('backToExpenses')}</ContextualBackLink>
          }
        />
        <EmptyState title={t('notAllowed.title')} description={t('notAllowed.body')} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
        breadcrumb={
          <ContextualBackLink href="/expenses">{t('backToExpenses')}</ContextualBackLink>
        }
        actions={
          canCreate ? (
            <Button asChild className="min-h-11">
              <Link href="/recurring-drafts/new">
                <Plus className="size-4" aria-hidden />
                {t('list.new')}
              </Link>
            </Button>
          ) : null
        }
      />

      <p className="text-sm text-[var(--pf-text-secondary)]">
        <Link href="/service/recurring" className="underline underline-offset-2">
          {t('serviceRecurringLink')}
        </Link>
      </p>

      <div className="flex min-w-0 max-w-full flex-wrap gap-2 text-sm">
        {(
          [
            ['', t('list.filters.allOpen')],
            ['active', t('list.filters.active')],
            ['paused', t('list.filters.paused')],
            ['ended', t('list.filters.ended')],
          ] as const
        ).map(([value, label]) => {
          const href = buildHref(kindFilter, value || undefined);
          const active = (statusFilter ?? '') === value;
          return (
            <Link
              key={value || 'open'}
              href={href}
              className={cn(
                textNavLinkClassName,
                'inline-flex min-h-11 items-center rounded-md px-3 no-underline',
                active && 'bg-[var(--pf-bg-muted)] font-semibold',
              )}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {readableKinds.length > 1 ? (
        <div className="flex min-w-0 max-w-full flex-wrap gap-2 text-sm">
          <Link
            href={buildHref(undefined, statusFilter)}
            className={cn(
              textNavLinkClassName,
              'inline-flex min-h-11 items-center rounded-md px-3 no-underline',
              !kindFilter && 'bg-[var(--pf-bg-muted)] font-semibold',
            )}
          >
            {t('list.filters.allKinds')}
          </Link>
          {DRAFT_KINDS.filter((kind) => readableKinds.includes(kind)).map((kind) => (
            <Link
              key={kind}
              href={buildHref(kind, statusFilter)}
              className={cn(
                textNavLinkClassName,
                'inline-flex min-h-11 items-center rounded-md px-3 no-underline',
                kindFilter === kind && 'bg-[var(--pf-bg-muted)] font-semibold',
              )}
            >
              {t(`kind.${kind}`)}
            </Link>
          ))}
        </div>
      ) : null}

      {drafts.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title={t('empty.title')}
          description={t('empty.body')}
          action={
            canCreate ? (
              <Button asChild>
                <Link href="/recurring-drafts/new">{t('empty.action')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ResponsiveTable
          items={drafts}
          getRowKey={(draft) => draft.id}
          desktop={
            <div className="min-w-0 rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('list.columns.title')}</TableHead>
                    <TableHead>{t('list.columns.kind')}</TableHead>
                    <TableHead>{t('list.columns.frequency')}</TableHead>
                    <TableHead>{t('list.columns.next')}</TableHead>
                    <TableHead>{t('list.columns.status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.map((draft) => (
                    <TableRow key={draft.id}>
                      <TableCell>
                        <Link href={`/recurring-drafts/${draft.id}`} className={textNavLinkClassName}>
                          {draft.title}
                        </Link>
                      </TableCell>
                      <TableCell>{t(`kind.${draft.draftKind}`)}</TableCell>
                      <TableCell>{t(`frequency.${draft.frequency}`)}</TableCell>
                      <TableCell dir="ltr">{formatBusinessDate(draft.nextRunDate, locale)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={draftStatusShape(draft.status)}
                          label={t(`status.${draft.status}`)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(draft) => (
            <Link href={`/recurring-drafts/${draft.id}`} className={pressableCardLinkClassName}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{draft.title}</p>
                  <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                    {t(`kind.${draft.draftKind}`)} · {t(`frequency.${draft.frequency}`)}
                  </p>
                  <p className="mt-1 text-sm" dir="ltr">
                    {formatBusinessDate(draft.nextRunDate, locale)}
                  </p>
                </div>
                <StatusBadge shape={draftStatusShape(draft.status)} label={t(`status.${draft.status}`)} />
              </div>
            </Link>
          )}
        />
      )}
    </div>
  );
}

function buildHref(kind: string | undefined, status: string | undefined): string {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (status) params.set('status', status);
  const query = params.toString();
  return query ? `/recurring-drafts?${query}` : '/recurring-drafts';
}
