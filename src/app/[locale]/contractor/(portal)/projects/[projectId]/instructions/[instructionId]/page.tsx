import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EntityDiscussion } from '@/modules/collaboration/ui';
import { requireExternalContext } from '@/modules/contractor-access';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { getContractorInstruction } from '@/modules/site-instructions';
import { INSTRUCTION_STATUS_TONE } from '@/modules/site-instructions/ui/status-tone';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { FieldActionForm } from '@/modules/site-log/ui/field-action-form';
import { Link } from '@/shared/i18n/navigation';
import { WithPortalClientMessages } from '@/shared/i18n/with-client-messages';
import { contractorInstructionAction } from '../actions';

export default async function ContractorInstructionPage({
  params,
}: {
  params: Promise<{ projectId: string; instructionId: string }>;
}) {
  const { projectId, instructionId } = await params;
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const detail = await loadOrNotFound(async () => {
    const context = await requireExternalContext();
    return getContractorInstruction(context, projectId, instructionId);
  });
  const { instruction } = detail;
  const hidden = { projectId, instructionId };

  return (
    <WithPortalClientMessages extra={['siteOps', 'projectPlans', 'collaboration']}>
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <PageHeader
        breadcrumb={
          <Link href={`/contractor/projects/${projectId}/instructions`} className="text-sm text-[var(--pf-text-brand)] hover:underline">
            {t('portal.instructions.back')}
          </Link>
        }
        title={`#${instruction.instructionNumber} · ${instruction.title}`}
        meta={
          <>
            <Badge tone={INSTRUCTION_STATUS_TONE[instruction.status]}>{t(`instructionStatus.${instruction.status}`)}</Badge>
            {instruction.category === 'urgent_before_price' ? (
              <Badge tone="warning">{t('instructionCategory.urgent_before_price')}</Badge>
            ) : null}
          </>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 text-sm">
          <p className="whitespace-pre-wrap break-words">{instruction.description || t('common.none')}</p>
          <p className="text-xs text-[var(--pf-text-secondary)]">
            {t('instructions.fields.issuedAt')}: {format.dateTime(instruction.issuedAt, { dateStyle: 'medium', timeStyle: 'short' })}
            {instruction.dueDate ? ` · ${t('instructions.dueOn', { date: instruction.dueDate })}` : ''}
          </p>
        </CardContent>
      </Card>

      {detail.canAcknowledge ? (
        <FieldActionForm
          action={contractorInstructionAction}
          hidden={{ ...hidden, intent: 'acknowledged' }}
          submitLabel={t('portal.instructions.acknowledge')}
          size="md"
          block
        >
          <Input name="note" placeholder={t('portal.instructions.notePlaceholder')} maxLength={4000} />
        </FieldActionForm>
      ) : null}
      {detail.canReportPerformed ? (
        <FieldActionForm
          action={contractorInstructionAction}
          hidden={{ ...hidden, intent: 'performed' }}
          submitLabel={t('portal.instructions.reportPerformed')}
          variant={detail.canAcknowledge ? 'secondary' : 'primary'}
          block
        >
          <Input name="note" placeholder={t('portal.instructions.notePlaceholder')} maxLength={4000} />
        </FieldActionForm>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('instructions.media')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <EvidenceGallery organizationId={instruction.organizationId} entityType="site_instruction" entityId={instruction.id} viewer="external" />
          {instruction.status !== 'closed' && instruction.status !== 'cancelled' ? (
            <EvidenceUploader
              organizationId={instruction.organizationId}
              projectId={projectId}
              entityType="site_instruction"
              entityId={instruction.id}
              viewer="external"
              locationId={instruction.locationId}
              accept={['photo', 'video', 'document']}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('instructions.history')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3 border-s border-[var(--pf-border-default)] ps-4">
            {detail.events.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t(`instructionEvents.${event.eventType}`)}</span>
                  <span className="text-xs text-[var(--pf-text-secondary)]">
                    {format.dateTime(event.occurredAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}
                    {t(event.byContractor ? 'portal.instructions.byYou' : 'portal.instructions.bySiteTeam')}
                  </span>
                </p>
                {event.note ? <p className="whitespace-pre-wrap break-words text-[var(--pf-text-secondary)]">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <EntityDiscussion
        organizationId={instruction.organizationId}
        projectId={projectId}
        entityType="site_instruction"
        entityId={instruction.id}
        viewer="external"
      />
    </div>
    </WithPortalClientMessages>
  );
}
