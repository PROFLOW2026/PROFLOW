import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { EntityDiscussion, EntityLinkedTasksSection } from '@/modules/collaboration/ui';
import { WithAppClientMessages } from '@/shared/i18n/with-client-messages';
import { EvidenceGallery, EvidenceUploader } from '@/modules/evidence/ui';
import { INSTRUCTION_CONVERSION_TARGETS, getInstructionDetail } from '@/modules/site-instructions';
import { INSTRUCTION_STATUS_TONE } from '@/modules/site-instructions/ui/status-tone';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { FieldActionForm, FieldLabel, fieldSelectClassName } from '@/modules/site-log/ui/field-action-form';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import {
  addInstructionNoteAction,
  linkConversionAction,
  requestConversionAction,
  transitionInstructionAction,
  updateInstructionAction,
} from '../actions';

const STATUS_ACTIONS = ['acknowledged', 'performed', 'closed', 'reopened', 'cancelled', 'conversion_dismissed'] as const;

export async function InstructionDetailScreen({ surfaceRoot,
  params,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string; instructionId: string }>;
}) {
  const { projectId, instructionId } = await params;
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const detail = await loadOrNotFound(() =>
    withOrgContext((context) => getInstructionDetail(context, projectId, instructionId)),
  );
  const { instruction } = detail;
  const editable = detail.canCoordinate && (instruction.status === 'issued' || instruction.status === 'acknowledged');
  const financial = instruction.category !== 'operational';
  const locationName = instruction.locationId
    ? detail.locations.find((location) => location.id === instruction.locationId)?.name ?? null
    : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        breadcrumb={
          <Link href={`${surfaceRoot ?? ('/projects/' + projectId)}/instructions`} className="text-sm text-[var(--pf-text-brand)] hover:underline">
            {t('instructions.back')}
          </Link>
        }
        title={`#${instruction.instructionNumber} · ${instruction.title}`}
        description={detail.vendorName ?? undefined}
        meta={
          <>
            <Badge tone={INSTRUCTION_STATUS_TONE[instruction.status]}>{t(`instructionStatus.${instruction.status}`)}</Badge>
            <Badge tone={financial ? 'warning' : 'neutral'}>{t(`instructionCategory.${instruction.category}`)}</Badge>
            {instruction.conversionState !== 'none' ? (
              <Badge tone={instruction.conversionState === 'converted' ? 'success' : 'pending'}>
                {t(`conversion.${instruction.conversionState}`)}
              </Badge>
            ) : null}
            {detail.overdue ? <Badge tone="danger">{t('instructions.overdue')}</Badge> : null}
          </>
        }
      />

      <Card>
        <CardContent className="grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="whitespace-pre-wrap break-words">{instruction.description || t('common.none')}</p>
          </div>
          <Fact label={t('instructions.fields.issuedAt')} value={format.dateTime(instruction.issuedAt, { dateStyle: 'medium', timeStyle: 'short' })} />
          <Fact label={t('instructions.fields.dueDate')} value={instruction.dueDate ?? t('common.none')} />
          <Fact
            label={t('instructions.fields.acknowledgedAt')}
            value={
              instruction.acknowledgedAt
                ? `${format.dateTime(instruction.acknowledgedAt, { dateStyle: 'medium', timeStyle: 'short' })} · ${t(
                    instruction.acknowledgedActorType === 'external' ? 'instructions.byContractor' : 'instructions.byTeam',
                  )}`
                : t('instructions.notAcknowledged')
            }
          />
          <Fact label={t('common.location')} value={locationName ?? t('common.none')} />
        </CardContent>
      </Card>

      {detail.transitions.some((event) => (STATUS_ACTIONS as readonly string[]).includes(event)) ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('instructions.actions.title')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {STATUS_ACTIONS.filter((event) => detail.transitions.includes(event)).map((event) => (
              <FieldActionForm
                key={event}
                action={transitionInstructionAction}
                hidden={{ projectId, instructionId, event }}
                submitLabel={t(`instructions.actions.${event}`)}
                variant={event === 'cancelled' ? 'dangerGhost' : event === 'closed' ? 'primary' : 'secondary'}
                confirmMessage={event === 'cancelled' ? t('instructions.actions.cancelConfirm') : undefined}
              >
                <Input name="note" placeholder={t('instructions.actions.notePlaceholder')} maxLength={4000} />
              </FieldActionForm>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {financial ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('conversion.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <p className="text-[var(--pf-text-secondary)]">{t(`conversion.explain.${instruction.conversionState}`)}</p>
            {detail.links.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {detail.links.map((link) => (
                  <li key={`${link.targetType}:${link.targetId}`} className="flex flex-wrap gap-2">
                    <Badge tone="success">
                      {link.targetType === 'subcontract_change' || link.targetType === 'unpriced_work'
                        ? t(`conversion.targets.${link.targetType}`)
                        : link.targetType}
                    </Badge>
                    <span className="pf-ltr-island font-mono text-xs">{link.targetId}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {detail.transitions.includes('conversion_requested') ? (
              <FieldActionForm
                action={requestConversionAction}
                hidden={{ projectId, instructionId }}
                submitLabel={t('conversion.request')}
                variant="secondary"
              >
                <FieldLabel label={t('conversion.target')}>
                  <select name="target" className={fieldSelectClassName} defaultValue="change">
                    {INSTRUCTION_CONVERSION_TARGETS.map((target) => (
                      <option key={target} value={target}>
                        {t(`conversion.targetOptions.${target}`)}
                      </option>
                    ))}
                  </select>
                </FieldLabel>
                <Input name="note" placeholder={t('instructions.actions.notePlaceholder')} maxLength={4000} />
              </FieldActionForm>
            ) : null}
            {detail.transitions.includes('converted') ? (
              <CollapsibleSection title={t('conversion.linkExisting')} summary={t('conversion.linkExistingHint')}>
                <div className="p-4">
                  <FieldActionForm action={linkConversionAction} hidden={{ projectId, instructionId }} submitLabel={t('conversion.link')}>
                    <FieldLabel label={t('conversion.target')}>
                      <select name="targetType" className={fieldSelectClassName} defaultValue="subcontract_change">
                        <option value="subcontract_change">{t('conversion.targets.subcontract_change')}</option>
                        <option value="unpriced_work">{t('conversion.targets.unpriced_work')}</option>
                      </select>
                    </FieldLabel>
                    <FieldLabel label={t('conversion.recordId')}>
                      <Input name="targetId" required dir="ltr" pattern="[0-9a-fA-F-]{36}" />
                    </FieldLabel>
                  </FieldActionForm>
                </div>
              </CollapsibleSection>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {editable ? (
        <CollapsibleSection title={t('instructions.edit')}>
          <div className="p-4">
            <FieldActionForm
              action={updateInstructionAction}
              hidden={{ projectId, instructionId }}
              submitLabel={t('common.save')}
              resetOnSuccess={false}
              successMessage={t('common.saved')}
            >
              <FieldLabel label={t('instructions.fields.title')}>
                <Input name="title" required maxLength={300} defaultValue={instruction.title} />
              </FieldLabel>
              <FieldLabel label={t('instructions.fields.description')}>
                <Textarea name="description" rows={3} defaultValue={instruction.description ?? ''} />
              </FieldLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <FieldLabel label={t('instructions.fields.dueDate')}>
                  <Input name="dueDate" type="date" defaultValue={instruction.dueDate ?? ''} />
                </FieldLabel>
                {detail.locations.length > 0 ? (
                  <FieldLabel label={t('common.location')}>
                    <select name="locationId" className={fieldSelectClassName} defaultValue={instruction.locationId ?? ''}>
                      <option value="">{t('common.none')}</option>
                      {detail.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                ) : null}
              </div>
            </FieldActionForm>
          </div>
        </CollapsibleSection>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('instructions.history')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ol className="flex flex-col gap-3 border-s border-[var(--pf-border-default)] ps-4">
            {detail.events.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{t(`instructionEvents.${event.eventType}`)}</span>
                  <span className="text-xs text-[var(--pf-text-secondary)]">
                    {format.dateTime(event.occurredAt, { dateStyle: 'medium', timeStyle: 'short' })}
                    {' · '}
                    {t(event.actorType === 'external' ? 'instructions.byContractor' : 'instructions.byTeam')}
                  </span>
                </p>
                {event.note ? <p className="whitespace-pre-wrap break-words text-[var(--pf-text-secondary)]">{event.note}</p> : null}
              </li>
            ))}
          </ol>
          {detail.canCoordinate ? (
            <FieldActionForm action={addInstructionNoteAction} hidden={{ projectId, instructionId }} submitLabel={t('instructions.addNote')} variant="secondary" size="sm">
              <Textarea name="note" rows={2} required maxLength={4000} aria-label={t('instructions.addNote')} />
            </FieldActionForm>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('instructions.media')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <EvidenceGallery organizationId={instruction.organizationId} entityType="site_instruction" entityId={instruction.id} viewer="internal" />
          {detail.canCoordinate ? (
            <EvidenceUploader
              organizationId={instruction.organizationId}
              projectId={projectId}
              entityType="site_instruction"
              entityId={instruction.id}
              viewer="internal"
              defaultVisibility="contractor"
              locationId={instruction.locationId}
            />
          ) : null}
        </CardContent>
      </Card>

      <WithAppClientMessages extra={['collaboration']}>
        <EntityLinkedTasksSection
          projectId={projectId}
          entityType="site_instruction"
          entityId={instruction.id}
          defaultTaskTitle={`#${instruction.instructionNumber} · ${instruction.title}`}
        />
      </WithAppClientMessages>

      <EntityDiscussion
        organizationId={instruction.organizationId}
        projectId={projectId}
        entityType="site_instruction"
        entityId={instruction.id}
        viewer="internal"
      />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[var(--pf-text-secondary)]">{label}</p>
      <p className="break-words">{value}</p>
    </div>
  );
}

export default function InstructionDetailPage(
  props: Omit<Parameters<typeof InstructionDetailScreen>[0], 'surfaceRoot'>,
) {
  return <InstructionDetailScreen {...props} />;
}
