import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { requireExternalContext } from '@/modules/contractor-access';
import { EvidenceUploader } from '@/modules/evidence/ui';
import { getContractorDailyReports } from '@/modules/site-log';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { FieldActionForm, FieldLabel, fieldSelectClassName } from '@/modules/site-log/ui/field-action-form';
import { listContractorMeetingMinutes } from '@/modules/site-meetings';
import { todayInTimeZone } from '@/shared/dates';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { submitDailyReportAction } from './actions';

/** Portal default for the report date; the server accepts any date that is "today" somewhere. */
const PORTAL_DEFAULT_TIME_ZONE = 'Asia/Jerusalem';

const REPORT_TEXT_FIELDS = ['workPerformed', 'equipment', 'deliveries', 'delays', 'blockingIssues', 'safetyNotes', 'notes'] as const;

export default async function ContractorSiteLogPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const { reports, minutes } = await loadOrNotFound(async () => {
    const context = await requireExternalContext();
    const reportsView = await getContractorDailyReports(context, projectId);
    const minutesView = await listContractorMeetingMinutes(context, projectId);
    return { reports: reportsView, minutes: minutesView };
  });
  const today = todayInTimeZone(PORTAL_DEFAULT_TIME_ZONE);
  const latest = reports.reports.filter((report) => report.isLatest);

  return (
    <WithClientMessages extra={['siteOps', 'projectPlans']}>
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <PageHeader title={t('portal.siteLog.title')} description={t('portal.siteLog.description')} />

      {reports.targets.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.siteLog.submitTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldActionForm
              action={submitDailyReportAction}
              hidden={{ projectId }}
              submitLabel={t('portal.siteLog.submit')}
              successMessage={t('portal.siteLog.submitted')}
              block
            >
              {reports.targets.length > 1 ? (
                <FieldLabel label={t('portal.siteLog.reportFor')}>
                  <select name="party" className={fieldSelectClassName} required defaultValue="">
                    <option value="" disabled>
                      {t('common.select')}
                    </option>
                    {reports.targets.map((target, index) => (
                      <option key={`${target.vendorId}:${target.subcontractAgreementId ?? ''}`} value={`${target.vendorId}:${target.subcontractAgreementId ?? ''}`}>
                        {t('portal.siteLog.scopeOption', { index: index + 1 })}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <FieldLabel label={t('portal.siteLog.date')}>
                  <Input name="reportDate" type="date" required defaultValue={today} />
                </FieldLabel>
                <FieldLabel label={t('reportFields.manpower')}>
                  <Input name="manpowerCount" type="number" min={0} step={1} inputMode="numeric" numeric />
                </FieldLabel>
              </div>
              {REPORT_TEXT_FIELDS.map((key) => (
                <FieldLabel key={key} label={t(`reportFields.${key}`)}>
                  <Textarea name={key} rows={key === 'workPerformed' ? 3 : 2} />
                </FieldLabel>
              ))}
              <p className="text-xs text-[var(--pf-text-muted)]">{t('portal.siteLog.revisionHint')}</p>
            </FieldActionForm>
          </CardContent>
        </Card>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t('portal.siteLog.myReports')}</h2>
        {latest.length === 0 ? (
          <EmptyState size="sm" title={t('portal.siteLog.noReportsTitle')} description={t('portal.siteLog.noReportsDescription')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {latest.map((report) => (
              <li key={report.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2 p-4 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {format.dateTime(new Date(`${report.reportDate}T12:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })}
                      </span>
                      <Badge tone="neutral">{t('siteLog.reports.revision', { revision: report.revision })}</Badge>
                    </div>
                    {report.manpowerCount !== null ? (
                      <p className="text-xs text-[var(--pf-text-secondary)]">
                        {t('reportFields.manpower')}: <span className="pf-numeric">{report.manpowerCount}</span>
                      </p>
                    ) : null}
                    {report.workPerformed ? <p className="whitespace-pre-wrap break-words">{report.workPerformed}</p> : null}
                    {report.blockingIssues ? (
                      <p className="whitespace-pre-wrap break-words text-[var(--pf-status-danger-fg)]">{report.blockingIssues}</p>
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-xs text-[var(--pf-text-brand)]">{t('portal.siteLog.addPhotos')}</summary>
                      <div className="mt-2">
                        <EvidenceUploader
                          organizationId={report.organizationId}
                          projectId={projectId}
                          entityType="site_daily_report"
                          entityId={report.id}
                          viewer="external"
                          locationId={report.locationId}
                          accept={['photo', 'video']}
                        />
                      </div>
                    </details>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">{t('portal.minutes.title')}</h2>
        {minutes.length === 0 ? (
          <EmptyState size="sm" title={t('portal.minutes.emptyTitle')} description={t('portal.minutes.emptyDescription')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {minutes.map((item) => (
              <li key={item.publicationId}>
                <Card>
                  <CardContent className="p-4 text-sm">
                    <details>
                      <summary className="cursor-pointer">
                        <span className="font-medium">{item.title}</span>
                        <span className="block text-xs text-[var(--pf-text-secondary)]">
                          {t(`meetingTypes.${item.meetingType}`)}
                          {' · '}
                          {format.dateTime(item.heldAt ?? item.scheduledAt, { dateStyle: 'medium' })}
                          {item.myActions.length > 0 ? ` · ${t('portal.minutes.myActionsCount', { count: item.myActions.length })}` : ''}
                        </span>
                      </summary>
                      <div className="mt-3 flex flex-col gap-3">
                        {item.minutes ? <p className="whitespace-pre-wrap break-words">{item.minutes}</p> : null}
                        {item.decisions.length > 0 ? (
                          <div>
                            <h3 className="text-xs font-semibold">{t('meetings.decisions.title')}</h3>
                            <ol className="list-decimal ps-5">
                              {item.decisions.map((decision, index) => (
                                <li key={index}>
                                  {decision.title}
                                  {decision.body ? <p className="text-xs text-[var(--pf-text-secondary)]">{decision.body}</p> : null}
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : null}
                        {item.myActions.length > 0 ? (
                          <div>
                            <h3 className="text-xs font-semibold">{t('portal.minutes.myActions')}</h3>
                            <ul className="list-disc ps-5">
                              {item.myActions.map((action, index) => (
                                <li key={index}>
                                  {action.title}
                                  {action.dueDate ? ` · ${t('meetings.actions.due', { date: action.dueDate })}` : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        <p className="text-xs text-[var(--pf-text-muted)]">
                          {t('portal.minutes.publishedAt', {
                            version: item.version,
                            date: format.dateTime(item.publishedAt, { dateStyle: 'medium' }),
                          })}
                        </p>
                      </div>
                    </details>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
    </WithClientMessages>
  );
}
