'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { IDENTIFIER_TYPES, type ClientDetail } from '@/modules/clients';
import {
  addClientContactAction,
  deleteContactAction,
  deleteIdentifierAction,
  updateClientAction,
  upsertIdentifierAction,
  type ClientFormState,
} from '../actions';

interface ClientDetailViewProps {
  client: ClientDetail;
}

export function ClientDetailView({ client }: ClientDetailViewProps) {
  const t = useTranslations('clients.detail');
  const tClients = useTranslations('clients');
  const tCommon = useTranslations('common');
  const [state, formAction, pending] = useActionState<ClientFormState, FormData>(
    updateClientAction,
    {},
  );

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="mx-auto flex w-full max-w-xl flex-col gap-4">
        <input type="hidden" name="clientId" value={client.id} />
        {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

        <Field label={tCommon('labels.name')} required>
          {(control) => <Input {...control} name="name" defaultValue={client.name} required />}
        </Field>
        <Field label={tClients('create.legalNameLabel')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="legalName" defaultValue={client.legalName ?? ''} />}
        </Field>
        <Field label={tCommon('labels.email')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="email" type="email" defaultValue={client.email ?? ''} />}
        </Field>
        <Field label={tCommon('labels.phone')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Input {...control} name="phone" defaultValue={client.phone ?? ''} />}
        </Field>
        <Field label={tCommon('labels.notes')} optionalLabel={tCommon('labels.optional')}>
          {(control) => <Textarea {...control} name="notes" rows={2} defaultValue={client.notes ?? ''} />}
        </Field>

        <Button type="submit" loading={pending}>
          {t('save')}
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>{t('contactsSection')}</CardTitle>
          {client.contacts.length === 0 ? (
            <CardDescription>{t('contactsEmpty')}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {client.contacts.map((contact) => (
            <div key={contact.id} className="flex items-start justify-between gap-2 border-b pb-3 last:border-0">
              <div>
                <p className="font-medium">{contact.name}</p>
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {t(`contactRoles.${contact.role}`)}
                  {contact.email ? ` · ${contact.email}` : ''}
                </p>
              </div>
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
                    await deleteContactAction(contact.id, client.id);
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
          ))}
          <AddContactForm clientId={client.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('identifiersSection')}</CardTitle>
          <CardDescription>{t('identifiersHint')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {client.identifiers.map((identifier) => (
            <div key={identifier.id} className="flex items-start justify-between gap-2 border-b pb-3 last:border-0">
              <div>
                <p className="font-medium">{t(`identifierTypes.${identifier.type}`)}</p>
                <p className="text-sm">{identifier.value}</p>
              </div>
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
          ))}
          <AddIdentifierForm clientId={client.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('projectsSection')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {client.projectCount > 0
              ? t('projectsCount', { count: client.projectCount })
              : t('noProjects')}
          </p>
        </CardContent>
      </Card>
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
      <Field label={tCommon('labels.email')} optionalLabel={tCommon('labels.optional')}>
        {(control) => <Input {...control} name="email" type="email" />}
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
