import { ChevronLeft } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { requireExternalContext } from '@/modules/contractor-access';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { formatRfiNumber, getContractorRfi, rfiStatusTone } from '@/modules/rfi';
import { ContractorRfiActions } from '@/modules/rfi/ui/contractor-rfi-actions';
import { statusTone } from '@/modules/rfi/ui/tones';
import { NotFoundError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';
import { formatInstant } from '@/shared/dates';

export default async function ContractorRfiDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; rfiId: string }>;
}) {
  const { projectId, rfiId } = await params;
  const context = await requireExternalContext();
  const organizationId = context.grants.find((g) => g.projectId === projectId || g.projectId === null)?.organizationId;
  if (!organizationId) notFound();

  let detail;
  try {
    detail = await getContractorRfi(context, { organizationId, rfiId });
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  if (detail.projectId !== projectId) notFound();

  const [t, locale] = await Promise.all([getTranslations('rfi'), getLocale()]);
  const base = `/contractor/projects/${projectId}/rfi`;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PageHeader
        breadcrumb={
          <Link href={base} className="inline-flex min-h-11 items-center gap-1 text-sm text-[var(--pf-text-secondary)]">
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
            {t('portal.back')}
          </Link>
        }
        title={`${formatRfiNumber(detail.number)} · ${detail.subject}`}
        meta={<Badge tone={statusTone(rfiStatusTone(detail.status, detail.overdue))}>{t(`status.${detail.status}`)}</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.question')}</CardTitle>
        </CardHeader>
        <CardContent className="whitespace-pre-wrap text-sm">{detail.question}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.answers')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {detail.answers.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.noAnswers')}</p>
          ) : (
            detail.answers.map((answer, index) => (
              <div key={answer.id} className="rounded-lg border border-[var(--pf-border-default)] p-4 text-sm">
                {index === detail.answers.length - 1 ? (
                  <Badge tone="success" className="mb-2">
                    {t('detail.currentAnswer')}
                  </Badge>
                ) : null}
                <p className="whitespace-pre-wrap">{answer.body}</p>
                <p className="mt-2 text-xs text-[var(--pf-text-secondary)]">
                  {t('detail.answeredOn', { date: formatInstant(answer.createdAt, locale, 'UTC') })}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.attachments')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <EvidenceGallery organizationId={organizationId} entityType="rfi" entityId={detail.id} viewer="external" />
          {detail.canEdit ? (
            <EvidenceUploader
              organizationId={organizationId}
              projectId={detail.projectId}
              entityType="rfi"
              entityId={detail.id}
              viewer="external"
            />
          ) : null}
        </CardContent>
      </Card>

      <WithPortalClientMessages extra={['rfi', 'common']}>
        <ContractorRfiActions
          organizationId={organizationId}
          rfiId={detail.id}
          canEdit={detail.canEdit}
          canSubmit={detail.canSubmit}
          subject={detail.subject}
          question={detail.question}
        />
      </WithPortalClientMessages>

      <Card>
        <CardHeader>
          <CardTitle>{t('detail.discussion')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EntityDiscussion
            organizationId={organizationId}
            projectId={detail.projectId}
            entityType="rfi"
            entityId={detail.id}
            viewer="external"
          />
        </CardContent>
      </Card>
    </div>
  );
}
