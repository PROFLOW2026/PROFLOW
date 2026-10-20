'use client';

import {
  MainAppFormGrid,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
  mainAppFieldSpan,
} from '@/components/patterns/main-app';
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { localizeCode } from '@/shared/i18n/code-display';
import { useActionState, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CONTACT_ROLES,
  IDENTIFIER_TYPES,
  type ClientContactRecord,
  type ClientDetail,
} from '@/modules/clients/domain/types';
import { type ClientTimelineEventView } from '@/modules/clients/domain/timeline';
import { type CustomFieldValueView } from '@/modules/custom-fields/domain/types';
import { EntityCustomFieldsPanel } from '@/modules/custom-fields/ui';
import { Link } from '@/shared/i18n/navigation';
import { workEntityHref } from '@/modules/search/domain/hrefs';
import type { OrgListSurface } from '@/modules/employee-app/application/org-list-permissions';
import type { ClientDetailTabKey } from '@/modules/clients/ui/client-detail-tab-order';
import { upsertEntityFieldValueAction } from '../../settings/custom-fields/actions';
import { ClientTimeline } from './client-timeline';
import {
  addClientContactAction,
  archiveClientAction,
  deleteContactAction,
  deleteIdentifierAction,
  markClientContactPrimaryAction,
  restoreClientAction,
  updateClientAction,
  updateClientContactAction,
  upsertIdentifierAction,
  type ClientFormState,
} from '../actions';

const EMPTY = '—';

export interface ClientLinkedProject {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly workKind: string;
}

interface ClientDetailViewProps {
  client: ClientDetail;
  customFields?: CustomFieldValueView[];
  linkedProjects?: readonly ClientLinkedProject[];
  canManage?: boolean;
  timelineEvents?: readonly ClientTimelineEventView[];
  timelineState?: 'ready' | 'loading' | 'error';
  clientTypes?: readonly { id: string; name: string }[];
  paymentTerms?: readonly { id: string; name: string }[];
  quotes?: readonly { id: string; title: string; status: string }[];
  routeBase?: string;
  quotesRouteBase?: string;
  projectsRouteBase?: string;
  surface?: OrgListSurface;
  afterProjects?: ReactNode;
  afterSales?: ReactNode;
  /** Owner tabbed layout; `all` keeps legacy single-scroll (employee app). */
  activeTab?: ClientDetailTabKey | 'all';
}

export function ClientDetailView({
  client,
  customFields = [],
  linkedProjects = [],
  canManage = false,
  timelineEvents = [],
  timelineState = 'ready',
  clientTypes = [],
  paymentTerms = [],
  quotes = [],
  routeBase = '/clients',
  quotesRouteBase = '/quotes',
  projectsRouteBase,
  surface = 'owner',
  afterProjects,
  afterSales,
  activeTab = 'all',
}: ClientDetailViewProps) {
  const t = useTranslations('clients.detail');
  const tClients = useTranslations('clients');
  const tCommon = useTranslations('common');
  const tProjectStatus = useTranslations('status.project');
  const tQuoteStatus = useTranslations('status.estimateQuote');
  const locale = useLocale();
  const [clientTypeId, setClientTypeId] = useState(client.clientTypeId ?? '');
  const [paymentTermId, setPaymentTermId] = useState(client.defaultPaymentTermId ?? '');
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    async (previous, formData) => {
      const result = await updateClientAction(previous, formData);
      if (result.error || (result.fieldErrors && Object.keys(result.fieldErrors).length > 0)) {
        return result;
      }
      return result.ok ? result : { ...result, ok: true };
    },
    {},
  );
  const [lifecyclePending, startLifecycle] = useTransition();
  const isArchived = client.archivedAt != null;
  const tab = activeTab;
  const showDetails = tab === 'all' || tab === 'details';
  const showProjects = tab === 'all' || tab === 'projects';
  const showSales = tab === 'all' || tab === 'sales';
  const showActivity = tab === 'all' || tab === 'activity';
  const clientTypeName =
    clientTypes.find((type) => type.id === client.clientTypeId)?.name ?? EMPTY;
  const paymentTermName =
    paymentTerms.find((term) => term.id === client.defaultPaymentTermId)?.name ?? EMPTY;

  return (
    <>
      {showDetails && !canManage ? (
        <MainAppSection>
          <MainAppSummaryGrid>
            <MainAppSummaryItem label={t('companyEmailLabel')}>
              {client.email?.trim() ? (
                <span dir="ltr" className="pf-ltr-island">
                  {client.email}
                </span>
              ) : (
                EMPTY
              )}
            </MainAppSummaryItem>
            <MainAppSummaryItem label={t('companyPhoneLabel')}>
              {client.phone?.trim() ? (
                <span dir="ltr" className="pf-ltr-island">
                  {client.phone}
                </span>
              ) : (
                EMPTY
              )}
            </MainAppSummaryItem>
            <MainAppSummaryItem label={t('clientTypeLabel')}>{clientTypeName}</MainAppSummaryItem>
            <MainAppSummaryItem label={t('paymentTermLabel')}>{paymentTermName}</MainAppSummaryItem>
          </MainAppSummaryGrid>
        </MainAppSection>
      ) : null}

      {showDetails && canManage ? (
        <MainAppSection>
        <form action={formAction} className="flex w-full min-w-0 flex-col gap-4">
          <input type="hidden" name="clientId" value={client.id} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
          {state.ok && !state.error ? <Alert tone="success">{t('saved')}</Alert> : null}

          <MainAppFormGrid dense>
            <Field label={tCommon('labels.name')} required className={mainAppFieldSpan.lg}>
              {(control) => <Input {...control} name="name" defaultValue={client.name} required />}
            </Field>
            <Field
              label={tClients('create.legalNameLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <Input {...control} name="legalName" defaultValue={client.legalName ?? ''} />
              )}
            </Field>
            <Field
              label={t('companyEmailLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <Input
                  {...control}
                  name="email"
                  type="email"
                  defaultValue={client.email ?? ''}
                  dir="ltr"
                />
              )}
            </Field>
            <Field
              label={t('companyPhoneLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <Input {...control} name="phone" defaultValue={client.phone ?? ''} dir="ltr" />
              )}
            </Field>
            <Field
              label={tClients('create.websiteLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <Input {...control} name="website" defaultValue={client.website ?? ''} dir="ltr" />
              )}
            </Field>

            <Field
              label={tClients('create.addressLine1Label')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <Input {...control} name="addressLine1" defaultValue={client.addressLine1 ?? ''} />
              )}
            </Field>
            <Field
              label={tClients('create.addressLine2Label')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <Input {...control} name="addressLine2" defaultValue={client.addressLine2 ?? ''} />
              )}
            </Field>
            <Field
              label={tClients('create.cityLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => <Input {...control} name="city" defaultValue={client.city ?? ''} />}
            </Field>
            <Field
              label={tClients('create.regionLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => <Input {...control} name="region" defaultValue={client.region ?? ''} />}
            </Field>
            <Field
              label={tClients('create.postalCodeLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.md}
            >
              {(control) => (
                <Input
                  {...control}
                  name="postalCode"
                  defaultValue={client.postalCode ?? ''}
                  dir="ltr"
                />
              )}
            </Field>
            <Field
              label={tClients('create.countryLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.sm}
            >
              {(control) => (
                <Input
                  {...control}
                  name="countryCode"
                  defaultValue={client.countryCode ?? ''}
                  maxLength={2}
                  dir="ltr"
                />
              )}
            </Field>

            <Field
              label={t('clientTypeLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <>
                  <input type="hidden" name="clientTypeId" value={clientTypeId} />
                  <Select
                    value={clientTypeId || '__none__'}
                    onValueChange={(value) => setClientTypeId(value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue placeholder={t('clientTypeNone')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('clientTypeNone')}</SelectItem>
                      {clientTypes.map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>

            <Field
              label={t('paymentTermLabel')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.lg}
            >
              {(control) => (
                <>
                  <input type="hidden" name="defaultPaymentTermId" value={paymentTermId} />
                  <Select
                    value={paymentTermId || '__none__'}
                    onValueChange={(value) => setPaymentTermId(value === '__none__' ? '' : value)}
                  >
                    <SelectTrigger id={control.id}>
                      <SelectValue placeholder={t('paymentTermNone')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">{t('paymentTermNone')}</SelectItem>
                      {paymentTerms.map((term) => (
                        <SelectItem key={term.id} value={term.id}>
                          {term.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>

            <Field
              label={tCommon('labels.notes')}
              optionalLabel={tCommon('labels.optional')}
              className={mainAppFieldSpan.full}
            >
              {(control) => (
                <Textarea {...control} name="notes" rows={2} defaultValue={client.notes ?? ''} />
              )}
            </Field>
          </MainAppFormGrid>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit" loading={pending} size="lg" block className="sm:w-auto sm:min-w-32">
              {t('save')}
            </Button>
            {isArchived ? (
              <Button
                type="button"
                variant="secondary"
                loading={lifecyclePending}
                onClick={() => {
                  startLifecycle(async () => {
                    await restoreClientAction(client.id);
                  });
                }}
              >
                {t('restore')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                loading={lifecyclePending}
                onClick={() => {
                  if (window.confirm(t('archiveConfirm'))) {
                    startLifecycle(async () => {
                      await archiveClientAction(client.id);
                    });
                  }
                }}
              >
                {t('archive')}
              </Button>
            )}
          </div>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('archiveVsInactiveHint')}</p>
        </form>
        </MainAppSection>
      ) : null}

      {showDetails ? (
      <EntityCustomFieldsPanel
        entityId={client.id}
        fields={customFields}
        revalidatePath={`${routeBase}/${client.id}`}
        saveAction={upsertEntityFieldValueAction}
      />
      ) : null}

      {showActivity ? (
        <ClientTimeline events={timelineEvents} state={timelineState} />
      ) : null}

      {showDetails ? (
      <MainAppSection
        title={t('contactsSection')}
        description={client.contacts.length === 0 ? t('contactsEmpty') : undefined}
      >
        <div className="flex flex-col gap-4">
          {client.contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              clientId={client.id}
              canManage={canManage}
            />
          ))}
          {canManage ? <AddContactForm clientId={client.id} /> : null}
        </div>
      </MainAppSection>
      ) : null}

      {showDetails && canManage ? (
        <MainAppSection title={t('identifiersSection')} description={t('identifiersHint')}>
          <div className="flex flex-col gap-4">
            {client.identifiers.map((identifier) => (
              <div
                key={identifier.id}
                className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0"
              >
                <div className="min-w-0 flex-1 text-start">
                  <p className="font-medium">{t(`identifierTypes.${identifier.type}`)}</p>
                  <p className="text-sm" dir="ltr">
                    {identifier.value}
                  </p>
                </div>
                <div className="shrink-0">
                  <ConfirmAction
                    title={tCommon('actions.remove')}
                    description={
                      <>
                        <p>
                          {t('removeIdentifierQuestion', {
                            type: t(`identifierTypes.${identifier.type}`),
                            value: identifier.value,
                          })}
                        </p>
                        <p>{t('removeIdentifierConsequence')}</p>
                      </>
                    }
                    confirmLabel={tCommon('actions.remove')}
                    successMessage={t('removeIdentifierSuccess')}
                    onConfirm={async () => {
                      try {
                        await deleteIdentifierAction(identifier.id, client.id);
                        return { ok: true };
                      } catch {
                        return { error: tCommon('states.errorHint') };
                      }
                    }}
                    trigger={
                      <Button type="button" variant="ghost" size="sm">
                        {tCommon('actions.remove')}
                      </Button>
                    }
                  />
                </div>
              </div>
            ))}
            <AddIdentifierForm clientId={client.id} />
          </div>
        </MainAppSection>
      ) : null}

      {showProjects ? (
      <MainAppSection title={t('projectsSection')}>
          {linkedProjects.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('noProjects')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linkedProjects.map((project) => (
                <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link
                    href={
                      projectsRouteBase
                        ? `${projectsRouteBase}/${project.id}`
                        : workEntityHref(project.workKind, project.id)
                    }
                    className="min-w-0 flex-1 font-medium text-[var(--pf-text-primary)] underline-offset-2 hover:underline"
                  >
                    {project.name}
                  </Link>
                  <span className="shrink-0 text-[var(--pf-text-secondary)]">
                    {tProjectStatus(project.status as 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled' | 'archived')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {linkedProjects.length === 0 && client.projectCount > 0 ? (
            <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
              {t('projectsCount', { count: client.projectCount })}
            </p>
          ) : null}
      </MainAppSection>
      ) : null}

      {showProjects ? afterProjects : null}

      {showSales ? (
      <MainAppSection title={t('salesSection')} description={t('salesHintShort')}>
          {quotes.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('salesEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {quotes.map((quote) => (
                <li
                  key={quote.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <Link
                    href={`${quotesRouteBase}/${quote.id}`}
                    className="min-w-0 flex-1 font-medium text-[var(--pf-text-primary)] underline-offset-2 hover:underline"
                  >
                    {quote.title}
                  </Link>
                  <span className="shrink-0 text-[var(--pf-text-secondary)]">
                    {tQuoteStatus.has(quote.status)
                      ? tQuoteStatus(quote.status)
                      : localizeCode(locale, quote.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </MainAppSection>
      ) : null}

      {showSales ? afterSales : null}

      {showDetails && surface === 'owner' ? (
        <MainAppSection title={t('relatedSection')}>
          <div className="flex flex-col gap-2 text-sm">
            <Link
              href={`/communications?clientId=${client.id}`}
              className="font-medium text-[var(--pf-text-primary)] underline-offset-2 hover:underline"
            >
              {t('communications')}
            </Link>
            <Link
              href={`/warranty?clientId=${client.id}`}
              className="font-medium text-[var(--pf-text-primary)] underline-offset-2 hover:underline"
            >
              {t('warrantyHistory')}
            </Link>
          </div>
        </MainAppSection>
      ) : null}
    </>
  );
}

function ContactRow({
  contact,
  clientId,
  canManage,
}: {
  contact: ClientContactRecord;
  clientId: string;
  canManage: boolean;
}) {
  const t = useTranslations('clients.detail');
  const tClients = useTranslations('clients');
  const tCommon = useTranslations('common');
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<(typeof CONTACT_ROLES)[number]>(contact.role);
  const [primaryPending, startPrimary] = useTransition();
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    updateClientContactAction,
    {},
  );

  if (!canManage) {
    return (
      <div className="border-b pb-3 last:border-0">
        <p className="font-medium">{contact.name}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t(`contactRoles.${contact.role}`)}
          {contact.phone ? (
            <>
              {' · '}
              <span dir="ltr">{contact.phone}</span>
            </>
          ) : null}
          {contact.email ? (
            <>
              {' · '}
              <span dir="ltr">{contact.email}</span>
            </>
          ) : null}
        </p>
      </div>
    );
  }

  if (editing) {
    return (
      <form action={formAction} className="flex flex-col gap-4 border-b pb-3 last:border-0">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="contactId" value={contact.id} />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{t('saveContact')}</Alert> : null}
        <MainAppFormGrid dense>
          <Field label={tCommon('labels.name')} required className={mainAppFieldSpan.lg}>
            {(control) => (
              <Input {...control} name="name" defaultValue={contact.name} required />
            )}
          </Field>
          <Field label={tClients('create.contactRoleLabel')} className={mainAppFieldSpan.lg}>
            {(control) => (
              <>
                <input type="hidden" name="role" value={role} />
                <Select value={role} onValueChange={(value) => setRole(value as typeof role)}>
                  <SelectTrigger id={control.id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTACT_ROLES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {t(`contactRoles.${value}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </Field>
          <Field
            label={tCommon('labels.phone')}
            optionalLabel={tCommon('labels.optional')}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <Input
                {...control}
                name="phone"
                type="tel"
                defaultValue={contact.phone ?? ''}
                dir="ltr"
              />
            )}
          </Field>
          <Field
            label={tCommon('labels.email')}
            optionalLabel={tCommon('labels.optional')}
            className={mainAppFieldSpan.lg}
          >
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                defaultValue={contact.email ?? ''}
                dir="ltr"
              />
            )}
          </Field>
        </MainAppFormGrid>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={pending} size="sm">
            {t('saveContact')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {tCommon('actions.cancel')}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-3 last:border-0">
      <div className="min-w-0 flex-1 text-start">
        <p className="font-medium">{contact.name}</p>
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t(`contactRoles.${contact.role}`)}
          {contact.phone ? (
            <>
              {' · '}
              <span dir="ltr">{contact.phone}</span>
            </>
          ) : null}
          {contact.email ? (
            <>
              {' · '}
              <span dir="ltr">{contact.email}</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {contact.role !== 'primary' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            loading={primaryPending}
            onClick={() => {
              startPrimary(async () => {
                await markClientContactPrimaryAction(contact.id, clientId);
              });
            }}
          >
            {t('markPrimary')}
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          {tCommon('actions.edit')}
        </Button>
        <ConfirmAction
          title={tCommon('actions.remove')}
          description={
            <>
              <p>{t('removeContactQuestion', { name: contact.name })}</p>
              <p>{t('removeContactConsequence')}</p>
            </>
          }
          confirmLabel={tCommon('actions.remove')}
          successMessage={t('removeContactSuccess')}
          onConfirm={async () => {
            try {
              await deleteContactAction(contact.id, clientId);
              return { ok: true };
            } catch {
              return { error: tCommon('states.errorHint') };
            }
          }}
          trigger={
            <Button type="button" variant="ghost" size="sm">
              {tCommon('actions.remove')}
            </Button>
          }
        />
      </div>
    </div>
  );
}

function AddContactForm({ clientId }: { clientId: string }) {
  const t = useTranslations('clients.detail');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    addClientContactAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 border-t pt-4">
      <input type="hidden" name="clientId" value={clientId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={tCommon('labels.name')} required className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="name" required />}
        </Field>
        <Field
          label={tCommon('labels.phone')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="phone" type="tel" dir="ltr" />}
        </Field>
        <Field
          label={tCommon('labels.email')}
          optionalLabel={tCommon('labels.optional')}
          className={mainAppFieldSpan.lg}
        >
          {(control) => <Input {...control} name="email" type="email" dir="ltr" />}
        </Field>
      </MainAppFormGrid>
      <Button type="submit" loading={pending} variant="secondary" size="sm">
        {t('addContact')}
      </Button>
    </form>
  );
}

function AddIdentifierForm({ clientId }: { clientId: string }) {
  const t = useTranslations('clients.detail');
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    upsertIdentifierAction,
    {},
  );

  return (
    <form action={formAction} className="flex flex-col gap-4 border-t pt-4">
      <input type="hidden" name="clientId" value={clientId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <MainAppFormGrid dense>
        <Field label={t('addIdentifier')} className={mainAppFieldSpan.lg}>
          {(control) => (
            <Select name="type" defaultValue="tax_id">
              <SelectTrigger id={control.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDENTIFIER_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`identifierTypes.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field label={t('addIdentifier')} required className={mainAppFieldSpan.lg}>
          {(control) => <Input {...control} name="value" required />}
        </Field>
      </MainAppFormGrid>
      <Button type="submit" loading={pending} variant="secondary" size="sm">
        {t('addIdentifier')}
      </Button>
    </form>
  );
}
