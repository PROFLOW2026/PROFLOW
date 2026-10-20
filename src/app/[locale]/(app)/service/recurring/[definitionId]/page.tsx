import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
  MainAppTableShell,
} from '@/components/patterns/main-app';
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
import { textNavLinkClassName, textNavLinkMutedClassName } from '@/components/ui/pressable';
import {
  endRecurrenceAction,
  generateRecurrenceAction,
  pauseRecurrenceAction,
  resumeRecurrenceAction,
  skipRecurrenceAction,
} from '../actions';

const EMPTY = '—';

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

  const frequencyLabel = `${t(`frequency.${definition.frequency}`)}${
    definition.intervalCount > 1 ? ` ×${definition.intervalCount}` : ''
  }`;

  const dateRange = definition.endDate
    ? `${definition.startDate} → ${definition.endDate}`
    : definition.startDate;

  return (
    <MainAppPage>
      <PageHeader
        title={definition.title}
        description={t('detail.title')}
        breadcrumb={
          <Link href="/service/recurring" className={textNavLinkMutedClassName}>
            {t('actions.backToList')}
          </Link>
        }
        meta={
          <span className="text-sm text-[var(--pf-text-secondary)]">
            {t(`status.${definition.status}`)}
          </span>
        }
      />

      <MainAppSection>
        <Alert tone="info">{t('detail.financialNote')}</Alert>
        <MainAppSummaryGrid className="mt-3">
          <MainAppSummaryItem label={t('fields.client')}>
            {clientName ?? t('fields.noClient')}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.status')}>
            {t(`status.${definition.status}`)}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('fields.frequency')}>{frequencyLabel}</MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.next')}>
            {definition.nextOccurrenceDate ? (
              <span dir="ltr">{definition.nextOccurrenceDate}</span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('fields.siteAddress')}>
            {definition.siteAddress?.trim() ? definition.siteAddress : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('fields.startDate')}>
            <span dir="ltr">{dateRange}</span>
          </MainAppSummaryItem>
          {definition.defaultPriceAmount ? (
            <MainAppSummaryItem label={t('detail.templatePriceHint')}>
              <span dir="ltr">
                {definition.defaultPriceAmount} {definition.currency}
              </span>
            </MainAppSummaryItem>
          ) : null}
        </MainAppSummaryGrid>
      </MainAppSection>

      {canManage ? (
        <MainAppSection>
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
        </MainAppSection>
      ) : null}

      <MainAppSection
        title={t('detail.history')}
        description={t('detail.generatedCount', { count: generatedCount })}
      >
        {occurrences.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noHistory')}</p>
        ) : (
          <MainAppTableShell>
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
                          className={textNavLinkClassName}
                        >
                          {row.generatedProjectName ?? t('detail.openWorkOrder')}
                        </Link>
                      ) : row.skippedReason ? (
                        <span className="text-sm text-[var(--pf-text-secondary)]">
                          {row.skippedReason}
                        </span>
                      ) : (
                        EMPTY
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </MainAppTableShell>
        )}
      </MainAppSection>
    </MainAppPage>
  );
}
