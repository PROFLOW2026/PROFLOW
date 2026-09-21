'use client';

import { ChevronRight } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useActionState, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  previewCloneStructureAction,
  previewUwmProjectTemplateAction,
} from '@/app/[locale]/(app)/projects/actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { pickPracticalClientContact } from '@/modules/clients/domain/practical-contact';
import type { ClientContactRecord } from '@/modules/clients/domain/types';
import {
  PROJECT_TEMPLATE_KEYS,
  previewProjectTemplate,
  type ProjectTemplateKey,
} from '@/modules/projects/domain/templates';
import { listProfessionStarterTemplates } from '@/modules/billing-plan/domain/templates';
import { ContractAmountFields } from '@/modules/projects/ui/contract-amount-fields';
import { ProjectCreateTeamPicker } from '@/modules/projects/ui/project-create-team-picker';
import type { ProjectCreateTeamPickerOption } from '@/modules/projects/domain/project-create-team';
import { rtlFlipClassName } from '@/shared/i18n/ltr-island';
import type { ProjectFormState } from '@/app/[locale]/(app)/projects/actions';

type ClientMode = 'none' | 'new' | 'existing';
type ContactMode = 'none' | 'existing' | 'new';
type BillingPlanCreateMode = 'none' | 'simple' | 'template';
type LaunchMode = 'none' | 'structure' | 'uwm' | 'clone';

export interface ProjectCreateUwmTemplateOption {
  id: string;
  name: string;
  description: string | null;
  stageCount: number;
  taskCount: number;
}

export interface ProjectCreateCloneSourceOption {
  id: string;
  name: string;
}

export interface ProjectCreateClientOption {
  id: string;
  name: string;
  contacts: {
    id: string;
    name: string;
    phone: string | null;
    role: string;
    createdAt?: string;
  }[];
}

export interface ProjectCreateFormCapabilities {
  readonly canSelectClient?: boolean;
  readonly canCreateClient?: boolean;
  readonly showFinance?: boolean;
  readonly showBillingPlan?: boolean;
  /** When false, work-structure section shows Agent D stub instead of template picker. */
  readonly showTemplatePicker?: boolean;
  readonly showTeamSection?: boolean;
  readonly showWorkStructureSection?: boolean;
  readonly showSummarySection?: boolean;
}

export interface ProjectCreateFormProps {
  formAction: (prev: ProjectFormState, formData: FormData) => Promise<ProjectFormState>;
  baseCurrency: string;
  currencySymbol: string;
  clients: ProjectCreateClientOption[];
  taxRatePercent?: string | null;
  uwmTemplates?: ProjectCreateUwmTemplateOption[];
  cloneSourceProjects?: ProjectCreateCloneSourceOption[];
  teamCandidates?: ProjectCreateTeamPickerOption[];
  capabilities?: ProjectCreateFormCapabilities;
  submitLabel?: string;
}

const DEFAULT_CAPABILITIES: Required<ProjectCreateFormCapabilities> = {
  canSelectClient: true,
  canCreateClient: true,
  showFinance: true,
  showBillingPlan: true,
  showTemplatePicker: true,
  showTeamSection: true,
  showWorkStructureSection: true,
  showSummarySection: true,
};

function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-3">
      <legend className="px-1 text-sm font-medium">{title}</legend>
      {hint ? <p className="text-xs text-[var(--pf-text-muted)]">{hint}</p> : null}
      {children}
    </fieldset>
  );
}

function suggestContactId(contacts: ProjectCreateClientOption['contacts']): string {
  if (contacts.length === 0) return '';
  const mapped: ClientContactRecord[] = contacts.map((contact) => ({
    id: contact.id,
    organizationId: '00000000-0000-4000-8000-000000000000',
    clientId: '00000000-0000-4000-8000-000000000001',
    name: contact.name,
    role: (contact.role as ClientContactRecord['role']) ?? 'other',
    email: null,
    phone: contact.phone,
    notes: null,
    createdAt: contact.createdAt ? new Date(contact.createdAt) : new Date(0),
    updatedAt: new Date(0),
  }));
  return pickPracticalClientContact(mapped)?.id ?? '';
}

export function ProjectCreateForm({
  formAction,
  baseCurrency,
  currencySymbol,
  clients,
  taxRatePercent = null,
  uwmTemplates = [],
  cloneSourceProjects = [],
  teamCandidates = [],
  capabilities: capabilitiesInput,
  submitLabel,
}: ProjectCreateFormProps) {
  const capabilities = { ...DEFAULT_CAPABILITIES, ...capabilitiesInput };
  const t = useTranslations('projects');
  const tBillingPlan = useTranslations('billingPlan');
  const tCommon = useTranslations('common');
  const locale = useLocale() === 'he-IL' ? 'he-IL' : 'en';
  const [state, boundAction, pending] = useActionState<ProjectFormState, FormData>(
    formAction,
    {},
  );
  const [clientMode, setClientMode] = useState<ClientMode>('none');
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [contactMode, setContactMode] = useState<ContactMode>('none');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [projectName, setProjectName] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [launchMode, setLaunchMode] = useState<LaunchMode>('none');
  const [structureTemplateKey, setStructureTemplateKey] = useState<string>(
    PROJECT_TEMPLATE_KEYS[0] ?? 'design_studio',
  );
  const [uwmTemplateId, setUwmTemplateId] = useState<string>(uwmTemplates[0]?.id ?? '');
  const [cloneSourceProjectId, setCloneSourceProjectId] = useState<string>(
    cloneSourceProjects[0]?.id ?? '',
  );
  const [uwmPreview, setUwmPreview] = useState<Awaited<
    ReturnType<typeof previewUwmProjectTemplateAction>
  >['preview'] | null>(null);
  const [clonePreview, setClonePreview] = useState<Awaited<
    ReturnType<typeof previewCloneStructureAction>
  >['snapshot'] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [billingPlanMode, setBillingPlanMode] = useState<BillingPlanCreateMode>('none');
  const [billingPlanTemplateKey, setBillingPlanTemplateKey] = useState('small_works');
  const [projectManagerKey, setProjectManagerKey] = useState<string | null>(null);
  const [participantKeys, setParticipantKeys] = useState<string[]>([]);
  const billingPlanTemplates = listProfessionStarterTemplates();

  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId],
  );
  const structurePreview = useMemo(
    () =>
      launchMode === 'structure'
        ? previewProjectTemplate(structureTemplateKey as ProjectTemplateKey, locale)
        : null,
    [launchMode, structureTemplateKey, locale],
  );

  useEffect(() => {
    if (launchMode !== 'uwm' || !uwmTemplateId) return;
    let cancelled = false;
    void (async () => {
      setPreviewLoading(true);
      try {
        const result = await previewUwmProjectTemplateAction(uwmTemplateId);
        if (!cancelled) setUwmPreview(result.preview ?? null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launchMode, uwmTemplateId]);

  useEffect(() => {
    if (launchMode !== 'clone' || !cloneSourceProjectId) return;
    let cancelled = false;
    void (async () => {
      setPreviewLoading(true);
      try {
        const result = await previewCloneStructureAction(cloneSourceProjectId);
        if (!cancelled) setClonePreview(result.snapshot ?? null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [launchMode, cloneSourceProjectId]);

  const displayedUwmPreview = launchMode === 'uwm' && uwmTemplateId ? uwmPreview : null;
  const displayedClonePreview =
    launchMode === 'clone' && cloneSourceProjectId ? clonePreview : null;

  const launchModeOptions = useMemo(() => {
    const options: { value: LaunchMode; label: string }[] = [
      { value: 'none', label: t('create.launchNone') },
      { value: 'structure', label: t('create.launchStructure') },
    ];
    if (uwmTemplates.length > 0) {
      options.push({ value: 'uwm', label: t('create.launchUwm') });
    }
    if (cloneSourceProjects.length > 0) {
      options.push({ value: 'clone', label: t('create.launchClone') });
    }
    return options;
  }, [cloneSourceProjects.length, t, uwmTemplates.length]);

  const summaryClientLabel = useMemo(() => {
    if (clientMode === 'new' && newClientName.trim()) return newClientName.trim();
    if (clientMode === 'existing' && selectedClient) return selectedClient.name;
    return t('create.clientNone');
  }, [clientMode, newClientName, selectedClient, t]);

  const clientModeOptions = useMemo(() => {
    const options: { value: ClientMode; label: string }[] = [
      { value: 'none', label: t('create.clientNone') },
    ];
    if (capabilities.canCreateClient) {
      options.push({ value: 'new', label: t('create.clientNew') });
    }
    if (capabilities.canSelectClient && clients.length > 0) {
      options.push({ value: 'existing', label: t('create.clientSelect') });
    }
    return options;
  }, [capabilities.canCreateClient, capabilities.canSelectClient, clients.length, t]);

  return (
    <form action={boundAction} className="mx-auto flex w-full min-w-0 max-w-lg flex-col gap-4">
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <FormSection title={t('create.sections.details')}>
        <Field label={t('create.nameLabel')} required error={state.fieldErrors?.name}>
          {(control) => (
            <Input
              {...control}
              name="name"
              placeholder={t('create.namePlaceholder')}
              autoFocus
              required
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
            />
          )}
        </Field>

        <Field label={t('create.clientLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => (
            <>
              <input type="hidden" name="clientMode" value={clientMode} />
              <Select
                value={clientMode}
                onValueChange={(value) => {
                  setClientMode(value as ClientMode);
                  setSelectedClientId('');
                  setContactMode('none');
                  setSelectedContactId('');
                  setNewClientName('');
                }}
              >
                <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clientModeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </Field>

        {clientMode === 'new' ? (
          <div className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-3">
            <Field label={t('create.clientNew')} error={state.fieldErrors?.clientName}>
              {(control) => (
                <Input
                  {...control}
                  name="clientName"
                  placeholder={t('create.clientNameExample')}
                  value={newClientName}
                  onChange={(event) => setNewClientName(event.target.value)}
                />
              )}
            </Field>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.contactPersonHint')}</p>
            <Field
              label={t('create.contactNameLabel')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.contactName}
            >
              {(control) => (
                <Input
                  {...control}
                  name="contactName"
                  placeholder={t('create.contactNamePlaceholder')}
                />
              )}
            </Field>
            <Field
              label={t('create.contactPhoneLabel')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.contactPhone}
            >
              {(control) => (
                <Input
                  {...control}
                  name="contactPhone"
                  type="tel"
                  dir="ltr"
                  placeholder={t('create.contactPhonePlaceholder')}
                />
              )}
            </Field>
            <Field
              label={t('create.contactEmailLabel')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.contactEmail}
            >
              {(control) => <Input {...control} name="contactEmail" type="email" dir="ltr" />}
            </Field>
          </div>
        ) : null}

        {clientMode === 'existing' ? (
          <div className="flex flex-col gap-4">
            <Field label={t('create.clientSelect')} error={state.fieldErrors?.clientId}>
              {(control) => (
                <Select
                  name="clientId"
                  value={selectedClientId || undefined}
                  onValueChange={(value) => {
                    setSelectedClientId(value);
                    const client = clients.find((row) => row.id === value);
                    const suggested = client ? suggestContactId(client.contacts) : '';
                    if (suggested) {
                      setContactMode('existing');
                      setSelectedContactId(suggested);
                    } else {
                      setContactMode('none');
                      setSelectedContactId('');
                    }
                  }}
                >
                  <SelectTrigger id={control.id} aria-invalid={control['aria-invalid']}>
                    <SelectValue placeholder={t('create.clientSelect')} />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            {selectedClientId ? (
              <div className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-3">
                <p className="text-sm font-medium">{t('create.contactPersonLabel')}</p>
                <p className="text-sm text-[var(--pf-text-secondary)]">{t('create.contactPersonHint')}</p>
                <input type="hidden" name="contactMode" value={contactMode} />
                <Field label={t('create.contactModeLabel')}>
                  {(control) => (
                    <Select
                      value={contactMode}
                      onValueChange={(value) => {
                        const mode = value as ContactMode;
                        setContactMode(mode);
                        if (mode === 'existing' && selectedClient) {
                          setSelectedContactId(suggestContactId(selectedClient.contacts));
                        } else {
                          setSelectedContactId('');
                        }
                      }}
                    >
                      <SelectTrigger id={control.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('create.contactNone')}</SelectItem>
                        {(selectedClient?.contacts.length ?? 0) > 0 ? (
                          <SelectItem value="existing">{t('create.contactSelect')}</SelectItem>
                        ) : null}
                        {capabilities.canCreateClient ? (
                          <SelectItem value="new">{t('create.contactQuickAdd')}</SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                  )}
                </Field>

                {contactMode === 'existing' && selectedClient ? (
                  <Field label={t('create.contactSelect')} error={state.fieldErrors?.contactId}>
                    {(control) => (
                      <Select
                        name="contactId"
                        value={selectedContactId || undefined}
                        onValueChange={setSelectedContactId}
                      >
                        <SelectTrigger id={control.id} aria-invalid={control['aria-invalid']}>
                          <SelectValue placeholder={t('create.contactSelect')} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedClient.contacts.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {contact.name}
                              {contact.phone ? ` · ${contact.phone}` : ''}
                              {contact.role === 'primary'
                                ? ` (${t('create.contactClientPrimaryHint')})`
                                : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </Field>
                ) : null}

                {contactMode === 'new' ? (
                  <>
                    <Field label={t('create.contactNameLabel')} error={state.fieldErrors?.contactName}>
                      {(control) => (
                        <Input
                          {...control}
                          name="contactName"
                          required
                          placeholder={t('create.contactNamePlaceholder')}
                        />
                      )}
                    </Field>
                    <Field
                      label={t('create.contactPhoneLabel')}
                      error={state.fieldErrors?.contactPhone}
                    >
                      {(control) => (
                        <Input
                          {...control}
                          name="contactPhone"
                          type="tel"
                          dir="ltr"
                          required
                          placeholder={t('create.contactPhonePlaceholder')}
                        />
                      )}
                    </Field>
                    <Field
                      label={t('create.contactEmailLabel')}
                      optionalLabel={tCommon('labels.optional')}
                      error={state.fieldErrors?.contactEmail}
                    >
                      {(control) => (
                        <Input {...control} name="contactEmail" type="email" dir="ltr" />
                      )}
                    </Field>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <Field
          label={t('create.domainLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.domainName}
        >
          {(control) => (
            <Input {...control} name="domainName" placeholder={t('create.domainPlaceholder')} />
          )}
        </Field>

        <Field
          label={t('create.locationLabel')}
          optionalLabel={tCommon('labels.optional')}
          error={state.fieldErrors?.location}
        >
          {(control) => (
            <Input {...control} name="location" placeholder={t('create.locationPlaceholder')} />
          )}
        </Field>

        <Button
          type="button"
          variant="ghost"
          className="self-start"
          onClick={() => setShowMore((open) => !open)}
        >
          {showMore ? tCommon('actions.showLess') : t('create.moreDetails')}
          <ChevronRight
            className={showMore ? 'size-4 rotate-90' : rtlFlipClassName('size-4')}
            aria-hidden
          />
        </Button>

        {showMore ? (
          <div className="flex flex-col gap-4 border-t border-[var(--pf-border-default)] pt-4">
            <Field
              label={t('details.descriptionLabel')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.description}
            >
              {(control) => <Textarea {...control} name="description" rows={3} />}
            </Field>
            <Field
              label={t('details.startDate')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.startDate}
            >
              {(control) => <Input {...control} name="startDate" type="date" dir="ltr" />}
            </Field>
            <Field
              label={t('details.targetEndDate')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.targetEndDate}
            >
              {(control) => <Input {...control} name="targetEndDate" type="date" dir="ltr" />}
            </Field>
            <Field
              label={t('details.notesLabel')}
              optionalLabel={tCommon('labels.optional')}
              error={state.fieldErrors?.notes}
            >
              {(control) => <Textarea {...control} name="notes" rows={2} />}
            </Field>
          </div>
        ) : null}
      </FormSection>

      {capabilities.showTeamSection ? (
        <FormSection title={t('create.sections.team')} hint={t('create.sections.teamHint')}>
          <ProjectCreateTeamPicker
            options={teamCandidates}
            projectManagerKey={projectManagerKey}
            participantKeys={participantKeys}
            onProjectManagerChange={setProjectManagerKey}
            onParticipantsChange={setParticipantKeys}
          />
        </FormSection>
      ) : null}

      {capabilities.showWorkStructureSection ? (
        <FormSection
          title={t('create.sections.workStructure')}
          hint={
            capabilities.showTemplatePicker
              ? t('create.templateHint')
              : t('create.sections.workStructureStub')
          }
        >
          {capabilities.showTemplatePicker ? (
            <>
              <input type="hidden" name="launchMode" value={launchMode} />
              <Field label={t('create.launchModeLabel')} optionalLabel={tCommon('labels.optional')}>
                {(control) => (
                  <Select
                    value={launchMode}
                    onValueChange={(value) => setLaunchMode(value as LaunchMode)}
                  >
                    <SelectTrigger id={control.id} aria-describedby={control['aria-describedby']}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {launchModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              {launchMode === 'structure' ? (
                <Field label={t('create.fromTemplate')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => (
                    <>
                      <input type="hidden" name="structureTemplateKey" value={structureTemplateKey} />
                      <Select value={structureTemplateKey} onValueChange={setStructureTemplateKey}>
                        <SelectTrigger id={control.id}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PROJECT_TEMPLATE_KEYS.map((key) => (
                            <SelectItem key={key} value={key}>
                              {t(`templates.keys.${key}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </Field>
              ) : null}

              {launchMode === 'uwm' ? (
                <Field label={t('create.uwmTemplateLabel')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => (
                    <>
                      <input type="hidden" name="uwmTemplateId" value={uwmTemplateId} />
                      <Select value={uwmTemplateId || undefined} onValueChange={setUwmTemplateId}>
                        <SelectTrigger id={control.id}>
                          <SelectValue placeholder={t('create.uwmTemplatePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          {uwmTemplates.map((template) => (
                            <SelectItem key={template.id} value={template.id}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </Field>
              ) : null}

              {launchMode === 'clone' ? (
                <Field label={t('clone.source')} optionalLabel={tCommon('labels.optional')}>
                  {(control) => (
                    <>
                      <input type="hidden" name="cloneSourceProjectId" value={cloneSourceProjectId} />
                      <Select
                        value={cloneSourceProjectId || undefined}
                        onValueChange={setCloneSourceProjectId}
                      >
                        <SelectTrigger id={control.id}>
                          <SelectValue placeholder={t('clone.chooseSource')} />
                        </SelectTrigger>
                        <SelectContent>
                          {cloneSourceProjects.map((project) => (
                            <SelectItem key={project.id} value={project.id}>
                              {project.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </Field>
              ) : null}

              {previewLoading ? (
                <p className="text-sm text-[var(--pf-text-muted)]">{t('clone.loadingPreview')}</p>
              ) : null}

              {structurePreview ? (
                <div className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm text-[var(--pf-text-secondary)]">
                  <p>{structurePreview.description}</p>
                  <p className="mt-2">
                    <span className="font-medium text-[var(--pf-text-primary)]">
                      {t('templates.previewPackages')}:{' '}
                    </span>
                    {structurePreview.workPackageNames.join(', ')}
                  </p>
                  {structurePreview.folderNames.length > 0 ? (
                    <p className="mt-1">
                      <span className="font-medium text-[var(--pf-text-primary)]">
                        {t('templates.previewFolders')}:{' '}
                      </span>
                      {structurePreview.folderNames.join(', ')}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {displayedUwmPreview ? (
                <div className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm text-[var(--pf-text-secondary)]">
                  {displayedUwmPreview.description ? <p>{displayedUwmPreview.description}</p> : null}
                  <p className="mt-2">
                    <span className="font-medium text-[var(--pf-text-primary)]">
                      {t('create.uwmPreviewStages')}:{' '}
                    </span>
                    {displayedUwmPreview.stages.map((stage) => stage.name).join(', ') || t('clone.none')}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-[var(--pf-text-primary)]">
                      {t('create.uwmPreviewTasks')}:{' '}
                    </span>
                    {displayedUwmPreview.tasks.length}
                  </p>
                </div>
              ) : null}

              {displayedClonePreview ? (
                <div className="rounded-md border border-[var(--pf-border-default)] p-3 text-sm text-[var(--pf-text-secondary)]">
                  <p className="font-medium text-[var(--pf-text-primary)]">{displayedClonePreview.sourceProjectName}</p>
                  <p className="mt-2">
                    <span className="font-medium text-[var(--pf-text-primary)]">
                      {t('clone.previewPackages')}:{' '}
                    </span>
                    {displayedClonePreview.workPackages.map((pkg) => pkg.name).join(', ') || t('clone.none')}
                  </p>
                  <p className="mt-1">
                    <span className="font-medium text-[var(--pf-text-primary)]">
                      {t('clone.previewMilestones')}:{' '}
                    </span>
                    {displayedClonePreview.milestones.map((m) => m.name).join(', ') || t('clone.none')}
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('create.sections.workStructureStub')}
            </p>
          )}
        </FormSection>
      ) : null}

      {capabilities.showFinance ? (
        <FormSection title={t('create.sections.finance')}>
          <ContractAmountFields
            baseCurrency={baseCurrency}
            currencySymbol={currencySymbol}
            amountError={state.fieldErrors?.contractValueAmount}
            taxModeError={state.fieldErrors?.amountIncludesTax}
            reductionError={state.fieldErrors?.openingReductionAmount}
            taxRatePercent={taxRatePercent}
          />

          {capabilities.showBillingPlan ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-[var(--pf-text-muted)]">
                {tBillingPlan('projectCreate.sectionHint')}
              </p>
              <input type="hidden" name="billingPlanMode" value={billingPlanMode} />
              {(
                [
                  ['none', tBillingPlan('projectCreate.none')],
                  ['simple', tBillingPlan('projectCreate.simple')],
                  ['template', tBillingPlan('projectCreate.template')],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="billingPlanModeRadio"
                    checked={billingPlanMode === value}
                    onChange={() => setBillingPlanMode(value)}
                  />
                  {label}
                </label>
              ))}
              {billingPlanMode === 'template' ? (
                <Field label={tBillingPlan('projectCreate.templateLabel')}>
                  {(control) => (
                    <>
                      <input
                        type="hidden"
                        name="billingPlanTemplateKey"
                        value={billingPlanTemplateKey}
                      />
                      <Select
                        value={billingPlanTemplateKey}
                        onValueChange={setBillingPlanTemplateKey}
                      >
                        <SelectTrigger id={control.id}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {billingPlanTemplates.map((tpl) => (
                            <SelectItem key={tpl.key} value={tpl.key}>
                              {tBillingPlan(
                                tpl.nameKey.replace(/^billingPlan\./, '') as never,
                              )}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </>
                  )}
                </Field>
              ) : null}
            </div>
          ) : null}
        </FormSection>
      ) : null}

      {capabilities.showSummarySection ? (
        <FormSection title={t('create.sections.summary')} hint={t('create.sections.summaryHint')}>
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--pf-text-secondary)]">{t('create.nameLabel')}</dt>
              <dd className="font-medium text-end">{projectName.trim() || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--pf-text-secondary)]">{t('create.clientLabel')}</dt>
              <dd className="font-medium text-end">{summaryClientLabel}</dd>
            </div>
          </dl>
        </FormSection>
      ) : null}

      <Button type="submit" loading={pending} block>
        {submitLabel ?? t('create.submit')}
      </Button>
    </form>
  );
}
