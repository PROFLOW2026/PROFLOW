import { getFormatter, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { SITE_DAILY_LOG_ENTRY_TYPES, getDailyLogDay, isIsoDate, type DailyLogEntryView } from '@/modules/site-log';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { FieldActionForm, FieldLabel, fieldSelectClassName } from '@/modules/site-log/ui/field-action-form';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import {
  addDailyLogEntryAction,
  recordContractorReportAction,
  removeDailyLogEntryAction,
  saveDailyLogHeaderAction,
  setDailyLogClosedAction,
} from '../actions';

export async function SiteLogDayScreen({ surfaceRoot, params }: {
    surfaceRoot?: string;
 params: Promise<{ projectId: string; logDate: string }> }) {
  const { projectId, logDate } = await params;
  if (!isIsoDate(logDate)) notFound();
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const day = await loadOrNotFound(() => withOrgContext((context) => getDailyLogDay(context, projectId, logDate)));
  const basePath = `${surfaceRoot ?? ('/projects/' + projectId)}/site-log`;
  const isFuture = logDate > day.today;
  const title = format.dateTime(new Date(`${logDate}T12:00:00Z`), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const partyOptions = day.contractors.map((c) => ({
    value: `${c.vendorId}:${c.agreementId}`,
    label: `${c.vendorName} · ${c.agreementTitle}`,
  }));
  const entriesByType = new Map<string, DailyLogEntryView[]>();
  for (const entry of day.entries) {
    const list = entriesByType.get(entry.entryType) ?? [];
    list.push(entry);
    entriesByType.set(entry.entryType, list);
  }
  const latestReports = day.reports.filter((report) => report.isLatest);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={title}
        description={t('siteLog.dayDescription')}
        breadcrumb={
          <Link href={basePath} className="text-sm text-[var(--pf-text-brand)] hover:underline">
            {t('siteLog.backToCalendar')}
          </Link>
        }
        meta={
          day.log ? (
            <Badge tone={day.log.status === 'closed' ? 'success' : 'info'}>{t(`siteLog.status.${day.log.status}`)}</Badge>
          ) : (
            <Badge tone="neutral">{t('siteLog.status.notStarted')}</Badge>
          )
        }
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link href={`${basePath}/${day.previousDate}`}>{t('siteLog.previousDay')}</Link>
            </Button>
            {day.nextDate ? (
              <Button asChild variant="secondary" size="sm">
                <Link href={`${basePath}/${day.nextDate}`}>{t('siteLog.nextDay')}</Link>
              </Button>
            ) : null}
          </>
        }
      />

      {isFuture ? <EmptyState title={t('siteLog.futureTitle')} description={t('siteLog.futureDescription')} /> : null}

      <section aria-label={t('siteLog.summary.title')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ['contractorsPresent', day.summary.contractorsPresent],
            ['recordedManpower', day.summary.recordedManpower],
            ['reportedManpower', day.summary.reportedManpower],
            ['blockingIssues', day.summary.blockingIssues],
            ['delays', day.summary.delays],
            ['safetyEvents', day.summary.safetyEvents],
            ['inspections', day.summary.inspections],
            ['contractorReports', day.summary.contractorReports],
          ] as const
        ).map(([key, value]) => (
          <Card key={key}>
            <CardContent className="flex flex-col gap-1 p-3">
              <span className="text-xs text-[var(--pf-text-secondary)]">{t(`siteLog.summary.${key}`)}</span>
              <span className="pf-numeric text-lg font-semibold">{value}</span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{t('siteLog.general.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {day.canEdit && !isFuture ? (
            <FieldActionForm
              action={saveDailyLogHeaderAction}
              hidden={{ projectId, logDate }}
              submitLabel={t('common.save')}
              resetOnSuccess={false}
              successMessage={t('common.saved')}
            >
              <FieldLabel label={t('siteLog.general.weather')}>
                <Input name="weather" defaultValue={day.log?.weather ?? ''} maxLength={500} />
              </FieldLabel>
              <FieldLabel label={t('siteLog.general.notes')}>
                <Textarea name="notes" rows={3} defaultValue={day.log?.notes ?? ''} />
              </FieldLabel>
            </FieldActionForm>
          ) : (
            <dl className="grid gap-2 text-sm">
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{t('siteLog.general.weather')}</dt>
                <dd>{day.log?.weather || t('common.none')}</dd>
              </div>
              <div>
                <dt className="text-[var(--pf-text-secondary)]">{t('siteLog.general.notes')}</dt>
                <dd className="whitespace-pre-wrap">{day.log?.notes || t('common.none')}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('siteLog.entries.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {day.entries.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('siteLog.entries.empty')}</p>
          ) : (
            SITE_DAILY_LOG_ENTRY_TYPES.filter((type) => entriesByType.has(type)).map((type) => (
              <section key={type} className="flex min-w-0 flex-col gap-2">
                <h3 className="text-sm font-semibold">{t(`entryTypes.${type}`)}</h3>
                <ul className="flex flex-col gap-2">
                  {entriesByType.get(type)!.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 text-sm">
                        {entry.vendorName ? <p className="font-medium">{entry.vendorName}</p> : null}
                        {entry.description ? <p className="whitespace-pre-wrap break-words">{entry.description}</p> : null}
                        <p className="text-xs text-[var(--pf-text-secondary)]">
                          {[
                            entry.headcount !== null ? t('siteLog.entries.headcountValue', { count: entry.headcount }) : null,
                            entry.hours !== null ? t('siteLog.entries.hoursValue', { hours: Number(entry.hours) }) : null,
                            entry.quantity !== null ? `${Number(entry.quantity)} ${entry.unit ?? ''}`.trim() : null,
                            entry.locationId
                              ? day.locations.find((location) => location.id === entry.locationId)?.name ?? null
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      {day.canEdit ? (
                        <FieldActionForm
                          action={removeDailyLogEntryAction}
                          hidden={{ projectId, logDate, entryId: entry.id }}
                          submitLabel={t('common.remove')}
                          variant="dangerGhost"
                          size="sm"
                          confirmMessage={t('siteLog.entries.removeConfirm')}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}

          {day.canEdit && !isFuture ? (
            <CollapsibleSection title={t('siteLog.entries.add')} summary={t('siteLog.entries.addHint')}>
              <div className="p-4">
                <FieldActionForm action={addDailyLogEntryAction} hidden={{ projectId, logDate }} submitLabel={t('siteLog.entries.addSubmit')}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldLabel label={t('siteLog.entries.type')}>
                      <select name="entryType" className={fieldSelectClassName} defaultValue="work_performed">
                        {SITE_DAILY_LOG_ENTRY_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`entryTypes.${type}`)}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel label={t('siteLog.entries.contractor')}>
                      <select name="party" className={fieldSelectClassName} defaultValue="">
                        <option value="">{t('common.none')}</option>
                        {partyOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                  </div>
                  <FieldLabel label={t('siteLog.entries.description')}>
                    <Textarea name="description" rows={2} />
                  </FieldLabel>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <FieldLabel label={t('siteLog.entries.headcount')}>
                      <Input name="headcount" type="number" min={0} step={1} numeric />
                    </FieldLabel>
                    <FieldLabel label={t('siteLog.entries.hours')}>
                      <Input name="hours" type="number" min={0} step="0.25" numeric />
                    </FieldLabel>
                    <FieldLabel label={t('siteLog.entries.quantity')}>
                      <Input name="quantity" type="number" min={0} step="any" numeric />
                    </FieldLabel>
                    <FieldLabel label={t('siteLog.entries.unit')}>
                      <Input name="unit" maxLength={40} />
                    </FieldLabel>
                  </div>
                  {day.locations.length > 0 ? (
                    <FieldLabel label={t('common.location')}>
                      <select name="locationId" className={fieldSelectClassName} defaultValue="">
                        <option value="">{t('common.none')}</option>
                        {day.locations.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.code ? `${location.code} · ${location.name}` : location.name}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                  ) : null}
                </FieldActionForm>
              </div>
            </CollapsibleSection>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('siteLog.reports.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {latestReports.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('siteLog.reports.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {latestReports.map((report) => {
                const history = day.reports.filter(
                  (other) =>
                    !other.isLatest &&
                    other.vendorId === report.vendorId &&
                    other.subcontractAgreementId === report.subcontractAgreementId,
                );
                return (
                  <li key={report.id} className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{report.vendorName ?? t('common.contractor')}</span>
                      <span className="flex items-center gap-2 text-xs text-[var(--pf-text-secondary)]">
                        {report.submittedActorType === 'internal' ? <Badge tone="neutral">{t('siteLog.reports.onBehalf')}</Badge> : null}
                        {t('siteLog.reports.revision', { revision: report.revision })}
                        {' · '}
                        {format.dateTime(report.submittedAt, { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <ReportBody report={report} t={t} />
                    {history.length > 0 ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-[var(--pf-text-brand)]">
                          {t('siteLog.reports.history', { count: history.length })}
                        </summary>
                        <ul className="mt-2 flex flex-col gap-2 border-s ps-3">
                          {history.map((older) => (
                            <li key={older.id} className="text-xs">
                              <span className="text-[var(--pf-text-secondary)]">
                                {t('siteLog.reports.revision', { revision: older.revision })}
                              </span>
                              <ReportBody report={older} t={t} />
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {day.canManage && !isFuture && partyOptions.length > 0 ? (
            <CollapsibleSection title={t('siteLog.reports.recordOnBehalf')} summary={t('siteLog.reports.recordOnBehalfHint')}>
              <div className="p-4">
                <FieldActionForm
                  action={recordContractorReportAction}
                  hidden={{ projectId, reportDate: logDate }}
                  submitLabel={t('siteLog.reports.submit')}
                >
                  <FieldLabel label={t('siteLog.entries.contractor')}>
                    <select name="party" className={fieldSelectClassName} required defaultValue="">
                      <option value="" disabled>
                        {t('common.select')}
                      </option>
                      {partyOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                  <ReportFields t={t} />
                </FieldActionForm>
              </div>
            </CollapsibleSection>
          ) : null}
        </CardContent>
      </Card>

      {day.canSeeInstructions ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>{t('siteLog.instructions.title')}</CardTitle>
            <Button asChild variant="link" size="sm">
              <Link href={`${surfaceRoot ?? ('/projects/' + projectId)}/instructions?create=1&logDate=${logDate}`}>{t('siteLog.instructions.issue')}</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {day.instructions.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('siteLog.instructions.empty')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {day.instructions.map((instruction) => (
                  <li key={instruction.id}>
                    <Link
                      href={`${surfaceRoot ?? ('/projects/' + projectId)}/instructions/${instruction.id}`}
                      className="flex flex-wrap items-center gap-2 text-sm hover:underline"
                    >
                      <span className="pf-numeric text-[var(--pf-text-secondary)]">#{instruction.instructionNumber}</span>
                      <span className="font-medium">{instruction.title}</span>
                      <Badge tone="neutral">{t(`instructionStatus.${instruction.status}`)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {day.log ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('siteLog.media.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <EvidenceGallery organizationId={day.log.organizationId} entityType="daily_log" entityId={day.log.id} viewer="internal" />
            {day.canEdit ? (
              <EvidenceUploader
                organizationId={day.log.organizationId}
                projectId={projectId}
                entityType="daily_log"
                entityId={day.log.id}
                viewer="internal"
                defaultVisibility="internal"
                accept={['photo', 'video', 'document']}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {day.log ? (
        <EntityDiscussion
          organizationId={day.log.organizationId}
          projectId={projectId}
          entityType="daily_log"
          entityId={day.log.id}
          viewer="internal"
        />
      ) : null}

      {day.canManage && !isFuture ? (
        <div className="flex flex-wrap items-center gap-3">
          {day.log?.status === 'closed' ? (
            <FieldActionForm
              action={setDailyLogClosedAction}
              hidden={{ projectId, logDate, intent: 'reopen' }}
              submitLabel={t('siteLog.reopen')}
              variant="secondary"
            />
          ) : (
            <FieldActionForm
              action={setDailyLogClosedAction}
              hidden={{ projectId, logDate, intent: 'close' }}
              submitLabel={t('siteLog.close')}
              confirmMessage={t('siteLog.closeConfirm')}
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations<'siteOps'>>>;

function ReportBody({
  report,
  t,
}: {
  report: {
    manpowerCount: number | null;
    workPerformed: string | null;
    equipment: string | null;
    deliveries: string | null;
    delays: string | null;
    blockingIssues: string | null;
    safetyNotes: string | null;
    notes: string | null;
  };
  t: Translator;
}) {
  const rows = (
    [
      ['manpower', report.manpowerCount !== null ? String(report.manpowerCount) : null],
      ['workPerformed', report.workPerformed],
      ['equipment', report.equipment],
      ['deliveries', report.deliveries],
      ['delays', report.delays],
      ['blockingIssues', report.blockingIssues],
      ['safetyNotes', report.safetyNotes],
      ['notes', report.notes],
    ] as const
  ).filter(([, value]) => value);
  if (rows.length === 0) return <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('siteLog.reports.noDetails')}</p>;
  return (
    <dl className="mt-2 grid gap-1">
      {rows.map(([key, value]) => (
        <div key={key} className="grid gap-0.5 sm:grid-cols-[10rem_1fr]">
          <dt className="text-[var(--pf-text-secondary)]">{t(`reportFields.${key}`)}</dt>
          <dd className="whitespace-pre-wrap break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReportFields({ t }: { t: Translator }) {
  return (
    <>
      <FieldLabel label={t('reportFields.manpower')}>
        <Input name="manpowerCount" type="number" min={0} step={1} numeric />
      </FieldLabel>
      {(['workPerformed', 'equipment', 'deliveries', 'delays', 'blockingIssues', 'safetyNotes', 'notes'] as const).map((key) => (
        <FieldLabel key={key} label={t(`reportFields.${key}`)}>
          <Textarea name={key} rows={2} />
        </FieldLabel>
      ))}
    </>
  );
}

export default function SiteLogDayPage(
  props: Omit<Parameters<typeof SiteLogDayScreen>[0], 'surfaceRoot'>,
) {
  return <SiteLogDayScreen {...props} />;
}
