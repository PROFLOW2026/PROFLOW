'use client';

import { useTranslations } from 'next-intl';
import { useActionState, useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
}

export function ClientDetailView({
  client,
  customFields = [],
  linkedProjects = [],
  canManage = false,
  timelineEvents = [],
  timelineState = 'ready',
}: ClientDetailViewProps) {
  const t = useTranslations('clients.detail');
  const tClients = useTranslations('clients');
  const tCommon = useTranslations('common');
  const tProjectStatus = useTranslations('status.project');
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    updateClientAction,
    {},
  );
  const [lifecyclePending, startLifecycle] = useTransition();
  const isArchived = client.archivedAt != null;

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
        <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-4">
          <input type="hidden" name="clientId" value={client.id} />
          {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

          <Field label={tCommon('labels.name')} required>
            {(control) => <Input {...control} name="name" defaultValue={client.name} required />}
          </Field>
          <Field label={tClients('create.legalNameLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input {...control} name="legalName" defaultValue={client.legalName ?? ''} />
            )}
          </Field>
          <Field label={t('companyEmailLabel')} optionalLabel={tCommon('labels.optional')}>
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
          <Field label={t('companyPhoneLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input {...control} name="phone" defaultValue={client.phone ?? ''} dir="ltr" />
            )}
          </Field>
          <Field label={tClients('create.websiteLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Input {...control} name="website" defaultValue={client.website ?? ''} dir="ltr" />
            )}
          </Field>

          <Field
            label={tClients('create.addressLine1Label')}
            optionalLabel={tCommon('labels.optional')}
          >
            {(control) => (
              <Input {...control} name="addressLine1" defaultValue={client.addressLine1 ?? ''} />
            )}
          </Field>
          <Field
            label={tClients('create.addressLine2Label')}
            optionalLabel={tCommon('labels.optional')}
          >
            {(control) => (
              <Input {...control} name="addressLine2" defaultValue={client.addressLine2 ?? ''} />
            )}
          </Field>
          <Field label={tClients('create.cityLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="city" defaultValue={client.city ?? ''} />}
          </Field>
          <Field label={tClients('create.regionLabel')} optionalLabel={tCommon('labels.optional')}>
            {(control) => <Input {...control} name="region" defaultValue={client.region ?? ''} />}
          </Field>
          <Field
            label={tClients('create.postalCodeLabel')}
            optionalLabel={tCommon('labels.optional')}
          >
            {(control) => (
              <Input {...control} name="postalCode" defaultValue={client.postalCode ?? ''} dir="ltr" />
            )}
          </Field>
          <Field label={tClients('create.countryLabel')} optionalLabel={tCommon('labels.optional')}>
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

          <Field label={tCommon('labels.notes')} optionalLabel={tCommon('labels.optional')}>
            {(control) => (
              <Textarea {...control} name="notes" rows={2} defaultValue={client.notes ?? ''} />
            )}
          </Field>

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
        </form>
      ) : null}

      <EntityCustomFieldsPanel
        entityId={client.id}
        fields={customFields}
        revalidatePath={`/clients/${client.id}`}
        saveAction={upsertEntityFieldValueAction}
      />

      <ClientTimeline events={timelineEvents} state={timelineState} />

      <Card>
        <CardHeader>
          <CardTitle>{t('contactsSection')}</CardTitle>
          {client.contacts.length === 0 ? (
            <CardDescription>{t('contactsEmpty')}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {client.contacts.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              clientId={client.id}
              canManage={canManage}
            />
          ))}
          {canManage ? <AddContactForm clientId={client.id} /> : null}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('identifiersSection')}</CardTitle>
            <CardDescription>{t('identifiersHint')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('projectsSection')}</CardTitle>
        </CardHeader>
        <CardContent>
          {linkedProjects.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('noProjects')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {linkedProjects.map((project) => (
                <li key={project.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link
                    href={
                      project.workKind === 'job'
                        ? `/jobs/${project.id}`
                        : `/projects/${project.id}`
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
        </CardContent>
      </Card>
    </div>
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
      <form action={formAction} className="flex flex-col gap-3 border-b pb-3 last:border-0">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="contactId" value={contact.id} />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
        {state.ok ? <Alert tone="success">{t('saveContact')}</Alert> : null}
        <Field label={tCommon('labels.name')} required>
          {(control) => (
            <Input {...control} name="name" defaultValue={contact.name} required />
          )}
        </Field>
        <Field label={tClients('create.contactRoleLabel')}>
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
        <Field label={tCommon('labels.phone')} optionalLabel={tCommon('labels.optional')}>
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
        <Field label={tCommon('labels.email')} optionalLabel={tCommon('labels.optional')}>
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
    <form action={formAction} className="flex flex-col gap-3 border-t pt-4">
      <input type="hidden" name="clientId" value={clientId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={tCommon('labels.name')} required>
        {(control) => <Input {...control} name="name" required />}
      </Field>
      <Field label={tCommon('labels.phone')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="phone" type="tel" dir="ltr" />}
      </Field>
      <Field label={tCommon('labels.email')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="email" type="email" dir="ltr" />}
      </Field>
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
    <form action={formAction} className="flex flex-col gap-3 border-t pt-4">
      <input type="hidden" name="clientId" value={clientId} />
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <Field label={t('addIdentifier')}>
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
      <Field label={t('addIdentifier')} required>
        {(control) => <Input {...control} name="value" required />}
      </Field>
      <Button type="submit" loading={pending} variant="secondary" size="sm">
        {t('addIdentifier')}
      </Button>
    </form>
  );
}
