import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { SITE_MEETING_TYPES, listProjectSiteMeetings } from '@/modules/site-meetings';
import { MEETING_STATUS_TONE } from '@/modules/site-meetings/ui/status-tone';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { FieldActionForm, FieldLabel, fieldSelectClassName } from '@/modules/site-log/ui/field-action-form';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { createSiteMeetingAction } from './actions';

const PAGE_SIZE = 30;

export async function SiteMeetingsScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ page?: string; create?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const page = Math.max(0, Number.parseInt(query.page ?? '0', 10) || 0);
  const data = await loadOrNotFound(() =>
    withOrgContext((context) => listProjectSiteMeetings(context, projectId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })),
  );
  const basePath = `${surfaceRoot ?? ('/projects/' + projectId)}/site-meetings`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('meetings.title')} description={t('meetings.description')} />

      {data.canManage ? (
        <CollapsibleSection title={t('meetings.schedule')} summary={t('meetings.scheduleHint')} defaultOpen={query.create === '1'}>
          <div className="p-4">
            <FieldActionForm action={createSiteMeetingAction} hidden={{ projectId, returnBase: basePath }} submitLabel={t('meetings.scheduleSubmit')}>
              <FieldLabel label={t('meetings.fields.title')}>
                <Input name="title" required maxLength={300} />
              </FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldLabel label={t('meetings.fields.type')}>
                  <select name="meetingType" className={fieldSelectClassName} defaultValue="weekly_contractor">
                    {SITE_MEETING_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {t(`meetingTypes.${type}`)}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <FieldLabel label={t('meetings.fields.scheduledAt')}>
                  <Input name="scheduledAt" type="datetime-local" required />
                </FieldLabel>
              </div>
              <FieldLabel label={t('meetings.fields.location')}>
                <Input name="location" maxLength={300} />
              </FieldLabel>
              <FieldLabel label={t('meetings.fields.agenda')}>
                <Textarea name="agenda" rows={4} />
              </FieldLabel>
            </FieldActionForm>
          </div>
        </CollapsibleSection>
      ) : null}

      {data.rows.length === 0 ? (
        <EmptyState title={t('meetings.emptyTitle')} description={t('meetings.emptyDescription')} />
      ) : (
        <ul className="flex min-w-0 flex-col gap-2">
          {data.rows.map((row) => (
            <li key={row.meetingId}>
              <Link href={`${basePath}/${row.meetingId}`} className="block min-w-0">
                <Card className="transition-colors hover:border-[var(--pf-border-focus)]">
                  <CardContent className="flex min-w-0 flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{row.title}</p>
                      <p className="text-xs text-[var(--pf-text-secondary)]">
                        {t(`meetingTypes.${row.meetingType}`)}
                        {' · '}
                        {format.dateTime(row.scheduledAt, { dateStyle: 'medium', timeStyle: 'short' })}
                        {row.location ? ` · ${row.location}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[var(--pf-text-secondary)]">
                        {t('meetings.counts', { contractors: row.contractorCount, actions: row.openActionCount })}
                      </span>
                      <Badge tone={MEETING_STATUS_TONE[row.status]}>{t(`meetingStatus.${row.status}`)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {page > 0 || data.hasMore ? (
        <nav className="flex justify-between gap-2" aria-label={t('meetings.pagination')}>
          {page > 0 ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`${basePath}?page=${page - 1}`}>{t('common.previous')}</Link>
            </Button>
          ) : (
            <span />
          )}
          {data.hasMore ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={`${basePath}?page=${page + 1}`}>{t('common.next')}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

export default function SiteMeetingsPage(
  props: Omit<Parameters<typeof SiteMeetingsScreen>[0], 'surfaceRoot'>,
) {
  return <SiteMeetingsScreen {...props} />;
}
