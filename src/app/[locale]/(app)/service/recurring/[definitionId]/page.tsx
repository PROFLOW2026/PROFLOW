import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getRecurrenceDefinitionDetail } from '@/modules/service';
import { RecurrenceControls } from '@/modules/service/recurrence/ui/recurrence-controls';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  endRecurrenceAction,
  generateRecurrenceAction,
  pauseRecurrenceAction,
  resumeRecurrenceAction,
  skipRecurrenceAction,
} from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'service' });
  return { title: t('recurring.detail.title') };
}

export default async function RecurringDetailPage({
  params,
}: {
  params: Promise<{ locale: string; definitionId: string }>;
}) {
  const { definitionId } = await params;
  const [t, shell] = await Promise.all([
    getTranslations('service.recurring'),
    getShellContext(),
  ]);

  const canManage = shell?.permissions.has(PERMISSIONS.SERVICE_MANAGE) ?? false;

  let detail: Awaited<ReturnType<typeof getRecurrenceDefinitionDetail>> | null = null;
  try {
    detail = await withOrgContext((context) =>
      getRecurrenceDefinitionDetail(context, { definitionId }),
    );
  } catch {
    detail = null;
  }

  if (!detail) notFound();

  const { definition, clientName, occurrences, generatedCount } = detail;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={definition.title}
        description={t('detail.title')}
        actions={
          <Link
            href="/service/recurring"
            className="text-sm text-[var(--pf-text-brand)] underline-offset-4 hover:underline"
          >
            {t('actions.backToList')}
          </Link>
        }
      />

      <Alert tone="info">{t('detail.financialNote')}</Alert>

      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.client')}</dt>
          <dd>{clientName ?? t('fields.noClient')}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.status')}</dt>
          <dd>{t(`status.${definition.status}`)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.frequency')}</dt>
          <dd>
            {t(`frequency.${definition.frequency}`)}
            {definition.intervalCount > 1 ? ` ×${definition.intervalCount}` : ''}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('list.columns.next')}</dt>
          <dd dir="ltr">{definition.nextOccurrenceDate ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.siteAddress')}</dt>
          <dd>{definition.siteAddress ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-secondary)]">{t('fields.startDate')}</dt>
          <dd dir="ltr">
            {definition.startDate}
            {definition.endDate ? ` → ${definition.endDate}` : ''}
          </dd>
        </div>
        {definition.defaultPriceAmount ? (
          <div>
            <dt className="text-xs text-[var(--pf-text-secondary)]">
              {t('detail.templatePriceHint')}
            </dt>
            <dd dir="ltr">
              {definition.defaultPriceAmount} {definition.currency}
            </dd>
          </div>
        ) : null}
      </dl>

      {canManage ? (
        <RecurrenceControls
          definitionId={definition.id}
          status={definition.status}
          nextOccurrenceDate={definition.nextOccurrenceDate}
          generateAction={generateRecurrenceAction}
          pauseAction={pauseRecurrenceAction}
          resumeAction={resumeRecurrenceAction}
          endAction={endRecurrenceAction}
          skipAction={skipRecurrenceAction}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('detail.history')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('detail.generatedCount', { count: generatedCount })}
        </p>

        {occurrences.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noHistory')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fields.startDate')}</TableHead>
                  <TableHead>{t('list.columns.status')}</TableHead>
                  <TableHead>{t('detail.openWorkOrder')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell dir="ltr">{row.occurrenceDate}</TableCell>
                    <TableCell>{t(`occurrenceStatus.${row.status}`)}</TableCell>
                    <TableCell>
                      {row.generatedProjectId ? (
                        <Link
                          href={`/work-orders/${row.generatedProjectId}`}
                          className="text-[var(--pf-text-brand)] underline-offset-4 hover:underline"
                        >
                          {row.generatedProjectName ?? t('detail.openWorkOrder')}
                        </Link>
                      ) : row.skippedReason ? (
                        <span className="text-sm text-[var(--pf-text-secondary)]">
                          {row.skippedReason}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
