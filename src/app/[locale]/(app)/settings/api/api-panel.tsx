'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  API_KEY_SCOPES,
  type ApiClientRecord,
  type ApiKeyListItem,
  type WebhookDeliveryRecord,
  type WebhookEndpointListItem,
} from '@/modules/api';
import {
  createApiClientAction,
  createApiKeyAction,
  enqueueDeliveryAction,
  registerWebhookAction,
  revokeApiKeyAction,
  type ApiActionState,
} from './actions';

export function ApiSettingsPanel({
  clients,
  keys,
  endpoints,
  deliveries,
  canEdit,
}: {
  clients: ApiClientRecord[];
  keys: ApiKeyListItem[];
  endpoints: WebhookEndpointListItem[];
  deliveries: WebhookDeliveryRecord[];
  canEdit: boolean;
}) {
  const t = useTranslations('api');
  const [clientState, clientAction, clientPending] = useActionState(
    createApiClientAction,
    {} as ApiActionState,
  );
  const [keyState, keyAction, keyPending] = useActionState(createApiKeyAction, {} as ApiActionState);
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeApiKeyAction,
    {} as ApiActionState,
  );
  const [hookState, hookAction, hookPending] = useActionState(
    registerWebhookAction,
    {} as ApiActionState,
  );
  const [deliveryState, deliveryAction, deliveryPending] = useActionState(
    enqueueDeliveryAction,
    {} as ApiActionState,
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('versionNote')}</p>
      </div>

      {canEdit ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-medium">{t('addClient')}</h2>
          <form action={clientAction} className="mt-3 flex max-w-lg flex-col gap-3">
            {clientState.error ? <Alert tone="danger">{clientState.error}</Alert> : null}
            {clientState.ok ? (
              <Alert tone="success" role="status">
                {t('clientSaved')}
              </Alert>
            ) : null}
            <Field label={t('fields.clientName')} required>
              {(props) => <Input {...props} name="name" required />}
            </Field>
            <Button type="submit" loading={clientPending}>
              {t('addClient')}
            </Button>
          </form>
        </section>
      ) : null}

      {canEdit && clients.length > 0 ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-medium">{t('addKey')}</h2>
          <form action={keyAction} className="mt-3 flex max-w-lg flex-col gap-3">
            {keyState.error ? <Alert tone="danger">{keyState.error}</Alert> : null}
            {keyState.plaintextKey ? (
              <Alert tone="warning">
                <p>{t('keyOnce')}</p>
                <code dir="ltr" className="mt-2 block break-all text-sm">
                  {keyState.plaintextKey}
                </code>
              </Alert>
            ) : null}
            <Field label={t('fields.apiClient')} required>
              {(props) => (
                <Select name="apiClientId" defaultValue={clients[0]?.id}>
                  <SelectTrigger id={props.id}>
                    <SelectValue />
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
            <Field label={t('fields.keyName')} required>
              {(props) => <Input {...props} name="name" required />}
            </Field>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium">{t('fields.scopes')}</legend>
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    defaultChecked={scope === 'projects.read'}
                    className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
                  />
                  <span dir="ltr">{t(`scopes.${scope}`)}</span>
                </label>
              ))}
            </fieldset>
            <Button type="submit" loading={keyPending}>
              {t('addKey')}
            </Button>
          </form>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">{t('keysTitle')}</h2>
        {revokeState.error ? <Alert tone="danger">{revokeState.error}</Alert> : null}
        {keys.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('keysEmpty')}</p>
        ) : (
          <div className="mt-3">
            <ResponsiveTable
              items={keys}
              getRowKey={(key) => key.id}
              desktop={
                <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('columns.name')}</TableHead>
                        <TableHead>{t('columns.prefix')}</TableHead>
                        <TableHead>{t('columns.status')}</TableHead>
                        <TableHead>{t('columns.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keys.map((key) => (
                        <TableRow key={key.id}>
                          <TableCell>{key.name}</TableCell>
                          <TableCell>
                            <code dir="ltr">{key.keyPrefix}…</code>
                          </TableCell>
                          <TableCell>
                            {key.revokedAt ? t('status.revoked') : t('status.active')}
                          </TableCell>
                          <TableCell>
                            {canEdit && !key.revokedAt ? (
                              <form action={revokeAction}>
                                <input type="hidden" name="keyId" value={key.id} />
                                <Button
                                  type="submit"
                                  variant="secondary"
                                  size="sm"
                                  loading={revokePending}
                                  className="min-h-11 md:min-h-8"
                                >
                                  {t('revoke')}
                                </Button>
                              </form>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              }
              renderMobileCard={(key) => (
                <div className="flex min-h-11 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                  <div>
                    <p className="font-semibold">{key.name}</p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                      <code dir="ltr">{key.keyPrefix}…</code>
                      {' · '}
                      {key.revokedAt ? t('status.revoked') : t('status.active')}
                    </p>
                  </div>
                  {canEdit && !key.revokedAt ? (
                    <form action={revokeAction}>
                      <input type="hidden" name="keyId" value={key.id} />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        loading={revokePending}
                        className="min-h-11"
                      >
                        {t('revoke')}
                      </Button>
                    </form>
                  ) : null}
                </div>
              )}
            />
          </div>
        )}
      </section>

      {canEdit ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-medium">{t('addWebhook')}</h2>
          <form action={hookAction} className="mt-3 flex max-w-lg flex-col gap-3">
            {hookState.error ? <Alert tone="danger">{hookState.error}</Alert> : null}
            {hookState.plaintextSecret ? (
              <Alert tone="warning">
                <p>{t('secretOnce')}</p>
                <code dir="ltr" className="mt-2 block break-all text-sm">
                  {hookState.plaintextSecret}
                </code>
              </Alert>
            ) : null}
            <Field label={t('fields.url')} required>
              {(props) => (
                <Input {...props} name="url" type="url" required placeholder="https://" dir="ltr" />
              )}
            </Field>
            <Field label={t('fields.eventTypes')} required>
              {(props) => (
                <Input
                  {...props}
                  name="eventTypes"
                  placeholder="project.updated"
                  required
                  dir="ltr"
                />
              )}
            </Field>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('eventTypesHint')}</p>
            <Button type="submit" loading={hookPending}>
              {t('addWebhook')}
            </Button>
          </form>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">{t('webhooksTitle')}</h2>
        {endpoints.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('webhooksEmpty')}</p>
        ) : (
          <div className="mt-3">
            <ResponsiveTable
              items={endpoints}
              getRowKey={(endpoint) => endpoint.id}
              desktop={
                <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('columns.url')}</TableHead>
                        <TableHead>{t('columns.events')}</TableHead>
                        <TableHead>{t('columns.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {endpoints.map((endpoint) => (
                        <TableRow key={endpoint.id}>
                          <TableCell className="max-w-xs truncate" dir="ltr">
                            {endpoint.url}
                          </TableCell>
                          <TableCell>
                            <span dir="ltr">{endpoint.eventTypes.join(', ')}</span>
                          </TableCell>
                          <TableCell>
                            {canEdit ? (
                              <form action={deliveryAction}>
                                <input type="hidden" name="endpointId" value={endpoint.id} />
                                <input type="hidden" name="eventType" value="test.ping" />
                                <Button
                                  type="submit"
                                  variant="secondary"
                                  size="sm"
                                  loading={deliveryPending}
                                  className="min-h-11 md:min-h-8"
                                >
                                  {t('enqueueTest')}
                                </Button>
                              </form>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              }
              renderMobileCard={(endpoint) => (
                <div className="flex min-h-11 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                  <div>
                    <p className="break-all font-semibold" dir="ltr">
                      {endpoint.url}
                    </p>
                    <p className="mt-1 text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                      {endpoint.eventTypes.join(', ')}
                    </p>
                  </div>
                  {canEdit ? (
                    <form action={deliveryAction}>
                      <input type="hidden" name="endpointId" value={endpoint.id} />
                      <input type="hidden" name="eventType" value="test.ping" />
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        loading={deliveryPending}
                        className="min-h-11"
                      >
                        {t('enqueueTest')}
                      </Button>
                    </form>
                  ) : null}
                </div>
              )}
            />
          </div>
        )}
        {deliveryState.ok ? (
          <Alert tone="success" className="mt-2" role="status">
            {t('deliveryQueued')}
          </Alert>
        ) : null}
      </section>

      <section>
        <h2 className="text-sm font-semibold">{t('deliveriesTitle')}</h2>
        {deliveries.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('deliveriesEmpty')}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm text-[var(--pf-text-secondary)]">
            {deliveries.map((delivery) => (
              <li key={delivery.id} className="min-h-11 py-2">
                <span dir="ltr">{delivery.eventType}</span> · {delivery.status}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
