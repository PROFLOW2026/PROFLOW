import { CalendarClock, ChevronLeft, FileText, MapPin, Timer } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { requireExternalContext } from '@/modules/contractor-access';
import { getContractorEventDetail } from '@/modules/coordination';
import { ContractorRespondForm } from '@/modules/coordination/ui/contractor-respond-form';
import { partyTone, statusTone } from '@/modules/coordination/ui/tones';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { formatInstant } from '@/shared/dates';
import { NotFoundError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';

export default async function ContractorEventPage({
  params,
}: {
  params: Promise<{ projectId: string; eventId: string }>;
}) {
  const { projectId, eventId } = await params;
  const context = await requireExternalContext();
  let detail;
  try {
    detail = await getContractorEventDetail(context, projectId, eventId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const [t, locale] = await Promise.all([getTranslations('coordination'), getLocale()]);
  const fmt = (value: Date) => formatInstant(value, locale, detail.timeZone);
  const doneKeysFor = (participantId: string) =>
    new Set(
      detail.responses
        .filter((response) => response.participantId === participantId)
        .flatMap((response) => response.acknowledgedKeys),
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        breadcrumb={
          <Link
            href={`/contractor/projects/${projectId}/schedule`}
            className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--pf-text-secondary)]"
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('portal.backToSchedule')}
          </Link>
        }
        title={detail.title}
        meta={
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{t(`kinds.${detail.kind}`)}</Badge>
            <Badge tone={statusTone(detail.status)}>{t(`statuses.${detail.status}`)}</Badge>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('portal.eventDetails')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <span className="inline-flex items-center gap-2">
            <CalendarClock className="size-4" aria-hidden />
            {fmt(detail.startsAt)}
            {detail.endsAt ? ` – ${fmt(detail.endsAt)}` : ''}
          </span>
          {detail.preparationDeadline ? (
            <span className="inline-flex items-center gap-2">
              <Timer className="size-4" aria-hidden />
              {t('list.prepareBy', { date: fmt(detail.preparationDeadline) })}
            </span>
          ) : null}
          {detail.locationName || detail.locationNote ? (
            <span className="inline-flex items-center gap-2">
              <MapPin className="size-4" aria-hidden />
              {[detail.locationName, detail.locationNote].filter(Boolean).join(' · ')}
            </span>
          ) : null}
          {detail.description ? <p className="whitespace-pre-line">{detail.description}</p> : null}
        </CardContent>
      </Card>

      <WithPortalClientMessages extra={['coordination']}>
        {detail.invitations.map((invitation) => {
          const latest = detail.responses.find(
            (response) => response.participantId === invitation.participantId && !response.superseded,
          );
          const done = doneKeysFor(invitation.participantId);
          return (
            <Card key={invitation.participantId}>
              <CardHeader>
                <CardTitle>{invitation.tradeLabel ?? invitation.partyName}</CardTitle>
                <CardDescription>
                  {invitation.isRequired ? t('portal.required') : t('portal.optional')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[var(--pf-text-secondary)]">{t('portal.yourStatus')}:</span>
                  <Badge tone={partyTone(invitation.latestStatus ?? 'waiting')}>
                    {invitation.latestStatus ? t(`partyStatus.${invitation.latestStatus}`) : t('portal.notAnswered')}
                  </Badge>
                  {invitation.latestRespondedAt ? (
                    <span className="text-xs text-[var(--pf-text-muted)]">{fmt(invitation.latestRespondedAt)}</span>
                  ) : null}
                </div>

                {invitation.canRespond ? (
                  <ContractorRespondForm
                    view={{
                      projectId,
                      eventId: detail.id,
                      participantId: invitation.participantId,
                      partyName: invitation.partyName,
                      latestStatus: invitation.latestStatus,
                      acknowledgements: detail.requiredAcknowledgements.map((item) => ({
                        ...item,
                        done: done.has(item.key),
                      })),
                    }}
                  />
                ) : (
                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    {detail.status === 'scheduled' ? t('portal.noRespondPermission') : t('portal.cannotRespond')}
                  </p>
                )}

                {latest ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">{t('portal.attachEvidence')}</p>
                    <EvidenceGallery
                      organizationId={detail.organizationId}
                      entityType="coordination_response"
                      entityId={latest.id}
                      viewer="external"
                    />
                    {invitation.canRespond ? (
                      <EvidenceUploader
                        organizationId={detail.organizationId}
                        projectId={projectId}
                        entityType="coordination_response"
                        entityId={latest.id}
                        viewer="external"
                        accept={['photo', 'video', 'document']}
                      />
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">{t('portal.discussion')}</p>
                  <EntityDiscussion
                    organizationId={detail.organizationId}
                    projectId={projectId}
                    entityType="coordination_participant"
                    entityId={invitation.participantId}
                    viewer="external"
                  />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </WithPortalClientMessages>

      <Card>
        <CardHeader>
          <CardTitle>{t('portal.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {detail.responses.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('portal.historyEmpty')}</p>
          ) : (
            <ol className="flex flex-col gap-3 border-s border-[var(--pf-border-default)] ps-4">
              {detail.responses.map((response) => (
                <li key={response.id} className="flex flex-col gap-0.5 text-sm">
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={partyTone(response.status)}>{t(`partyStatus.${response.status}`)}</Badge>
                    {response.superseded ? <Badge tone="neutral">{t('detail.superseded')}</Badge> : null}
                  </span>
                  {response.note ? <span>{response.note}</span> : null}
                  <span className="text-xs text-[var(--pf-text-muted)]">{fmt(response.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {detail.issues.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.issues')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {detail.issues.map((issue) => (
                <li key={issue.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{issue.title}</span>
                  <Badge tone={issue.status === 'open' ? 'warning' : 'success'}>{t(`issue.statuses.${issue.status}`)}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {detail.documents.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.documents')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {detail.documents.map((document) => (
                <li key={document.id} className="inline-flex min-h-11 items-center gap-2">
                  <FileText className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{document.title}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {detail.reschedules.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('portal.reschedules')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2 text-sm">
              {detail.reschedules.map((row) => (
                <li key={row.id} className="flex flex-col">
                  <span>{t('portal.movedFrom', { from: fmt(row.previousStartsAt), to: fmt(row.newStartsAt) })}</span>
                  <span className="text-xs text-[var(--pf-text-muted)]">{row.reason}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
