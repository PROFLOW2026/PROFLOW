import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { canCancelMeeting, canEditMeeting, canMarkHeld, canPublishMinutes, getSiteMeetingDetail, toZonedLocalInput } from '@/modules/site-meetings';
import { MEETING_STATUS_TONE } from '@/modules/site-meetings/ui/status-tone';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { FieldActionForm, FieldLabel, fieldSelectClassName } from '@/modules/site-log/ui/field-action-form';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { SITE_MEETING_ATTENDANCE, SITE_MEETING_TYPES } from '@drizzle/schema';
import {
  addActionItemAction,
  addAttendeeAction,
  meetingLifecycleAction,
  recordDecisionAction,
  removeAttendeeAction,
  saveMinutesAction,
  setActionItemStatusAction,
  setAttendanceAction,
  updateSiteMeetingAction,
} from '../actions';

export async function SiteMeetingDetailScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; meetingId: string }>;
}) {
  const { projectId, meetingId } = await params;
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const { detail, timeZone } = await loadOrNotFound(() =>
    withOrgContext(async (context) => ({
      detail: await getSiteMeetingDetail(context, projectId, meetingId),
      timeZone: context.organization.timezone,
    })),
  );
  const { record, details } = detail.meeting;
  const editable = detail.canManage && canEditMeeting(details.status);
  const hidden = { projectId, meetingId };
  const attendeeVendorIds = new Set(detail.contractorAttendees.map((row) => row.vendorId));
  const attendeeMemberIds = new Set(detail.internalAttendees.map((row) => row.orgMemberId));
  const memberOptions = detail.memberCandidates.filter((m) => !attendeeMemberIds.has(m.membershipId));
  const contractorOptions = detail.contractors.filter((c) => !attendeeVendorIds.has(c.vendorId));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        breadcrumb={
          <Link href={`${surfaceRoot ?? ('/projects/' + projectId)}/site-meetings`} className="text-sm text-[var(--pf-text-brand)] hover:underline">
            {t('meetings.back')}
          </Link>
        }
        title={record.title}
        description={`${t(`meetingTypes.${details.meetingType}`)} · ${format.dateTime(record.scheduledAt, {
          dateStyle: 'full',
          timeStyle: 'short',
        })}${record.location ? ` · ${record.location}` : ''}`}
        meta={
          <>
            <Badge tone={MEETING_STATUS_TONE[details.status]}>{t(`meetingStatus.${details.status}`)}</Badge>
            {details.publishedVersion > 0 ? (
              <Badge tone="neutral">{t('meetings.publishedVersion', { version: details.publishedVersion })}</Badge>
            ) : null}
          </>
        }
      />

      {detail.canManage ? (
        <div className="flex flex-wrap items-start gap-3">
          {canMarkHeld(details.status) ? (
            <FieldActionForm action={meetingLifecycleAction} hidden={{ ...hidden, intent: 'held' }} submitLabel={t('meetings.markHeld')} />
          ) : null}
          {canPublishMinutes(details.status) ? (
            <FieldActionForm
              action={meetingLifecycleAction}
              hidden={{ ...hidden, intent: 'publish' }}
              submitLabel={details.publishedVersion > 0 ? t('meetings.republish') : t('meetings.publish')}
              confirmMessage={t('meetings.publishConfirm')}
            />
          ) : null}
          {canCancelMeeting(details.status) ? (
            <FieldActionForm
              action={meetingLifecycleAction}
              hidden={{ ...hidden, intent: 'cancel' }}
              submitLabel={t('meetings.cancel')}
              variant="dangerGhost"
              confirmMessage={t('meetings.cancelConfirm')}
            />
          ) : null}
          {detail.canIssueInstructions ? (
            <Button asChild variant="secondary">
              <Link href={`${surfaceRoot ?? ('/projects/' + projectId)}/instructions?create=1&meetingId=${meetingId}`}>{t('meetings.issueInstruction')}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('meetings.fields.agenda')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap break-words text-sm">{details.agenda || t('common.none')}</p>
          {editable ? (
            <CollapsibleSection title={t('meetings.editDetails')} className="mt-4">
              <div className="p-4">
                <FieldActionForm
                  action={updateSiteMeetingAction}
                  hidden={hidden}
                  submitLabel={t('common.save')}
                  resetOnSuccess={false}
                  successMessage={t('common.saved')}
                >
                  <FieldLabel label={t('meetings.fields.title')}>
                    <Input name="title" required maxLength={300} defaultValue={record.title} />
                  </FieldLabel>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldLabel label={t('meetings.fields.type')}>
                      <select name="meetingType" className={fieldSelectClassName} defaultValue={details.meetingType}>
                        {SITE_MEETING_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {t(`meetingTypes.${type}`)}
                          </option>
                        ))}
                      </select>
                    </FieldLabel>
                    <FieldLabel label={t('meetings.fields.scheduledAt')}>
                      <Input
                        name="scheduledAt"
                        type="datetime-local"
                        required
                        defaultValue={toZonedLocalInput(record.scheduledAt, timeZone)}
                      />
                    </FieldLabel>
                  </div>
                  <FieldLabel label={t('meetings.fields.location')}>
                    <Input name="location" maxLength={300} defaultValue={record.location ?? ''} />
                  </FieldLabel>
                  <FieldLabel label={t('meetings.fields.agenda')}>
                    <Textarea name="agenda" rows={4} defaultValue={details.agenda ?? ''} />
                  </FieldLabel>
                </FieldActionForm>
              </div>
            </CollapsibleSection>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('meetings.attendees.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('meetings.attendees.internal')}</h3>
            <ul className="flex flex-col gap-2">
              {detail.internalAttendees.map((attendee) => (
                <li key={attendee.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{attendee.displayName ?? attendee.email ?? t('common.unknown')}</span>
                  {editable ? (
                    <FieldActionForm
                      action={removeAttendeeAction}
                      hidden={{ ...hidden, attendeeId: attendee.id, kind: 'internal' }}
                      submitLabel={t('common.remove')}
                      variant="dangerGhost"
                      size="sm"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('meetings.attendees.contractors')}</h3>
            {detail.contractorAttendees.length === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('meetings.attendees.noContractors')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {detail.contractorAttendees.map((attendee) => (
                  <li
                    key={attendee.id}
                    className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="font-medium">{attendee.displayName ?? attendee.vendorName ?? t('common.contractor')}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={attendee.attendance === 'attended' ? 'success' : attendee.attendance === 'absent' ? 'danger' : 'neutral'}>
                        {t(`attendance.${attendee.attendance}`)}
                      </Badge>
                      {editable ? (
                        <>
                          {SITE_MEETING_ATTENDANCE.filter((value) => value !== attendee.attendance).map((value) => (
                            <FieldActionForm
                              key={value}
                              action={setAttendanceAction}
                              hidden={{ ...hidden, attendeeId: attendee.id, attendance: value }}
                              submitLabel={t(`attendanceAction.${value}`)}
                              variant="ghost"
                              size="sm"
                            />
                          ))}
                          <FieldActionForm
                            action={removeAttendeeAction}
                            hidden={{ ...hidden, attendeeId: attendee.id, kind: 'contractor' }}
                            submitLabel={t('common.remove')}
                            variant="dangerGhost"
                            size="sm"
                          />
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {editable && (memberOptions.length > 0 || contractorOptions.length > 0) ? (
            <FieldActionForm action={addAttendeeAction} hidden={hidden} submitLabel={t('meetings.attendees.add')} variant="secondary">
              <FieldLabel label={t('meetings.attendees.choose')}>
                <select name="attendee" required className={fieldSelectClassName} defaultValue="">
                  <option value="" disabled>
                    {t('common.select')}
                  </option>
                  {memberOptions.length > 0 ? (
                    <optgroup label={t('meetings.attendees.internal')}>
                      {memberOptions.map((member) => (
                        <option key={member.membershipId} value={`member:${member.membershipId}`}>
                          {member.displayName ?? member.email}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {contractorOptions.length > 0 ? (
                    <optgroup label={t('meetings.attendees.contractors')}>
                      {contractorOptions.map((contractor) => (
                        <option key={contractor.agreementId} value={`vendor:${contractor.vendorId}:${contractor.agreementId}`}>
                          {contractor.vendorName} · {contractor.agreementTitle}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </FieldLabel>
            </FieldActionForm>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('meetings.minutes.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {editable ? (
            <FieldActionForm
              action={saveMinutesAction}
              hidden={hidden}
              submitLabel={t('meetings.minutes.save')}
              resetOnSuccess={false}
              successMessage={t('common.saved')}
              variant="secondary"
            >
              <Textarea name="minutes" rows={8} defaultValue={details.minutes ?? ''} aria-label={t('meetings.minutes.title')} />
            </FieldActionForm>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm">{details.minutes || t('common.none')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('meetings.decisions.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {detail.decisions.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('meetings.decisions.empty')}</p>
          ) : (
            <ol className="flex list-decimal flex-col gap-2 ps-5 text-sm">
              {detail.decisions.map((decision) => (
                <li key={decision.id}>
                  <span className="font-medium">{decision.title}</span>
                  {decision.body ? <p className="whitespace-pre-wrap text-[var(--pf-text-secondary)]">{decision.body}</p> : null}
                </li>
              ))}
            </ol>
          )}
          {editable ? (
            <FieldActionForm action={recordDecisionAction} hidden={hidden} submitLabel={t('meetings.decisions.add')} variant="secondary">
              <FieldLabel label={t('meetings.decisions.decision')}>
                <Input name="title" required maxLength={300} />
              </FieldLabel>
              <FieldLabel label={t('meetings.decisions.details')}>
                <Textarea name="body" rows={2} />
              </FieldLabel>
            </FieldActionForm>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('meetings.actions.title')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {detail.actionItems.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('meetings.actions.empty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {detail.actionItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className={item.status === 'done' ? 'font-medium line-through' : 'font-medium'}>{item.title}</p>
                    <p className="text-xs text-[var(--pf-text-secondary)]">
                      {[
                        item.assigneeLabel ?? t('meetings.actions.unassigned'),
                        item.dueDate ? t('meetings.actions.due', { date: item.dueDate }) : null,
                        item.taskId ? t('meetings.actions.taskLinked') : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.status === 'done' ? 'success' : item.status === 'cancelled' ? 'neutral' : 'info'}>
                      {t(`actionItemStatus.${item.status}`)}
                    </Badge>
                    {detail.canManage && item.status === 'open' ? (
                      <FieldActionForm
                        action={setActionItemStatusAction}
                        hidden={{ ...hidden, actionItemId: item.id, status: 'done' }}
                        submitLabel={t('meetings.actions.markDone')}
                        variant="ghost"
                        size="sm"
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {editable ? (
            <FieldActionForm action={addActionItemAction} hidden={hidden} submitLabel={t('meetings.actions.add')} variant="secondary">
              <FieldLabel label={t('meetings.actions.item')}>
                <Input name="title" required maxLength={300} />
              </FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldLabel label={t('meetings.actions.assignee')}>
                  <select name="assignee" className={fieldSelectClassName} defaultValue="">
                    <option value="">{t('meetings.actions.unassigned')}</option>
                    {detail.memberCandidates.length > 0 ? (
                      <optgroup label={t('meetings.attendees.internal')}>
                        {detail.memberCandidates.map((member) => (
                          <option key={member.membershipId} value={`member:${member.membershipId}`}>
                            {member.displayName ?? member.email}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {detail.contractors.length > 0 ? (
                      <optgroup label={t('meetings.attendees.contractors')}>
                        {detail.contractors.map((contractor) => (
                          <option key={contractor.agreementId} value={`vendor:${contractor.vendorId}:${contractor.agreementId}`}>
                            {contractor.vendorName} · {contractor.agreementTitle}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </FieldLabel>
                <FieldLabel label={t('meetings.actions.dueDate')}>
                  <Input name="dueDate" type="date" />
                </FieldLabel>
              </div>
              {detail.decisions.length > 0 ? (
                <FieldLabel label={t('meetings.actions.fromDecision')}>
                  <select name="decisionId" className={fieldSelectClassName} defaultValue="">
                    <option value="">{t('common.none')}</option>
                    {detail.decisions.map((decision) => (
                      <option key={decision.id} value={decision.id}>
                        {decision.title}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="createTask" defaultChecked />
                {t('meetings.actions.createTask')}
              </label>
            </FieldActionForm>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('meetings.attachments')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <EvidenceGallery organizationId={record.organizationId} entityType="site_meeting" entityId={record.id} viewer="internal" />
          {editable ? (
            <EvidenceUploader
              organizationId={record.organizationId}
              projectId={projectId}
              entityType="site_meeting"
              entityId={record.id}
              viewer="internal"
              defaultVisibility="internal"
            />
          ) : null}
        </CardContent>
      </Card>

      {detail.publications.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('meetings.publications.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {detail.publications.map((publication) => (
                <li key={publication.id}>
                  <details>
                    <summary className="cursor-pointer">
                      {t('meetings.publishedVersion', { version: publication.version })}
                      {' · '}
                      {format.dateTime(publication.publishedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    </summary>
                    <div className="mt-2 flex flex-col gap-2 border-s ps-3">
                      <p className="whitespace-pre-wrap">{publication.minutes || t('common.none')}</p>
                      {publication.decisions.length > 0 ? (
                        <ol className="list-decimal ps-5">
                          {publication.decisions.map((decision, index) => (
                            <li key={index}>{decision.title}</li>
                          ))}
                        </ol>
                      ) : null}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <EntityDiscussion
        organizationId={record.organizationId}
        projectId={projectId}
        entityType="site_meeting"
        entityId={record.id}
        viewer="internal"
      />
    </div>
  );
}

export default function SiteMeetingDetailPage(
  props: Omit<Parameters<typeof SiteMeetingDetailScreen>[0], 'surfaceRoot'>,
) {
  return <SiteMeetingDetailScreen {...props} />;
}
