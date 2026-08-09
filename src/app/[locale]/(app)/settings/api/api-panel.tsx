'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  API_KEY_SCOPES,
  WEBHOOK_EVENT_TYPES,
  type ApiClientRecord,
  type ApiKeyListItem,
  type WebhookDeliveryRecord,
  type WebhookEndpointListItem,
} from '@/modules/api/domain/types';
import {
  createApiClientAction,
  createApiKeyAction,
  enqueueDeliveryAction,
  recordDeliveryAttemptAction,
  registerWebhookAction,
  revokeApiKeyAction,
  revokeWebhookAction,
  rotateApiKeyAction,
  rotateWebhookSecretAction,
  type ApiActionState,
} from './actions';

function formatInstant(value: Date | string | null, neverLabel: string): string {
  if (!value) return neverLabel;
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return neverLabel;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

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
  const [rotateState, rotateAction, rotatePending] = useActionState(
    rotateApiKeyAction,
    {} as ApiActionState,
  );
  const [hookState, hookAction, hookPending] = useActionState(
    registerWebhookAction,
    {} as ApiActionState,
  );
  const [revokeHookState, revokeHookAction, revokeHookPending] = useActionState(
    revokeWebhookAction,
    {} as ApiActionState,
  );
  const [rotateSecretState, rotateSecretAction, rotateSecretPending] = useActionState(
    rotateWebhookSecretAction,
    {} as ApiActionState,
  );
  const [deliveryState, deliveryAction, deliveryPending] = useActionState(
    enqueueDeliveryAction,
    {} as ApiActionState,
  );
  const [attemptState, attemptAction, attemptPending] = useActionState(
    recordDeliveryAttemptAction,
    {} as ApiActionState,
  );

  const shownPlaintextKey = keyState.plaintextKey ?? rotateState.plaintextKey;
  const shownPlaintextSecret =
    hookState.plaintextSecret ?? rotateSecretState.plaintextSecret;

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
            {shownPlaintextKey ? (
              <Alert tone="warning">
                <p>{t('keyOnce')}</p>
                <code dir="ltr" className="mt-2 block break-all text-sm">
                  {shownPlaintextKey}
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
        {rotateState.error ? <Alert tone="danger">{rotateState.error}</Alert> : null}
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
                        <TableHead>{t('columns.scopes')}</TableHead>
                        <TableHead>{t('columns.lastUsed')}</TableHead>
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
                            <span dir="ltr" className="text-xs">
                              {key.scopes.join(', ')}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {formatInstant(key.lastUsedAt, t('neverUsed'))}
                          </TableCell>
                          <TableCell>
                            <StatusBadge
                              shape={key.revokedAt ? 'cancelled' : 'active'}
                              label={key.revokedAt ? t('status.revoked') : t('status.active')}
                            />
                          </TableCell>
                          <TableCell>
                            {canEdit && !key.revokedAt ? (
                              <div className="flex flex-wrap gap-2">
                                <form action={rotateAction}>
                                  <input type="hidden" name="keyId" value={key.id} />
                                  <Button
                                    type="submit"
                                    variant="secondary"
                                    size="sm"
                                    loading={rotatePending}
                                    className="min-h-11 md:min-h-8"
                                  >
                                    {t('rotate')}
                                  </Button>
                                </form>
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
                              </div>
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
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--pf-text-secondary)]">
                      <code dir="ltr">{key.keyPrefix}…</code>
                      <StatusBadge
                        shape={key.revokedAt ? 'cancelled' : 'active'}
                        label={key.revokedAt ? t('status.revoked') : t('status.active')}
                      />
                    </p>
                    <p className="mt-1 text-xs text-[var(--pf-text-muted)]" dir="ltr">
                      {key.scopes.join(', ')}
                    </p>
                    <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                      {t('columns.lastUsed')}: {formatInstant(key.lastUsedAt, t('neverUsed'))}
                    </p>
                  </div>
                  {canEdit && !key.revokedAt ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={rotateAction}>
                        <input type="hidden" name="keyId" value={key.id} />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          loading={rotatePending}
                          className="min-h-11"
                        >
                          {t('rotate')}
                        </Button>
                      </form>
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
                    </div>
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
            {shownPlaintextSecret ? (
              <Alert tone="warning">
                <p>{t('secretOnce')}</p>
                <code dir="ltr" className="mt-2 block break-all text-sm">
                  {shownPlaintextSecret}
                </code>
              </Alert>
            ) : null}
            <Field label={t('fields.url')} required>
              {(props) => (
                <Input {...props} name="url" type="url" required placeholder="https://" dir="ltr" />
              )}
            </Field>
            <fieldset className="flex flex-col gap-1">
              <legend className="text-sm font-medium">{t('fields.eventTypes')}</legend>
              {WEBHOOK_EVENT_TYPES.map((eventType) => (
                <label key={eventType} className="flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="eventTypes"
                    value={eventType}
                    defaultChecked={eventType === 'test.ping'}
                    className="size-4"
                  />
                  <span dir="ltr">{t(`events.${eventType}`)}</span>
                </label>
              ))}
            </fieldset>
            <p className="text-xs text-[var(--pf-text-muted)]">{t('eventTypesHint')}</p>
            <Button type="submit" loading={hookPending}>
              {t('addWebhook')}
            </Button>
          </form>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">{t('webhooksTitle')}</h2>
        {revokeHookState.error ? <Alert tone="danger">{revokeHookState.error}</Alert> : null}
        {rotateSecretState.error ? (
          <Alert tone="danger">{rotateSecretState.error}</Alert>
        ) : null}
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
                        <TableHead>{t('columns.status')}</TableHead>
                        <TableHead>{t('columns.actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {endpoints.map((endpoint) => {
                        const testEvent =
                          endpoint.eventTypes.find((event) => event === 'test.ping') ??
                          endpoint.eventTypes[0];
                        return (
                          <TableRow key={endpoint.id}>
                            <TableCell className="max-w-xs truncate" dir="ltr">
                              {endpoint.url}
                            </TableCell>
                            <TableCell>
                              <span dir="ltr">{endpoint.eventTypes.join(', ')}</span>
                            </TableCell>
                            <TableCell>
                              <StatusBadge
                                shape={endpoint.status === 'active' ? 'active' : 'cancelled'}
                                label={
                                  endpoint.status === 'active'
                                    ? t('status.active')
                                    : t('status.revoked')
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {canEdit && endpoint.status === 'active' ? (
                                <div className="flex flex-wrap gap-2">
                                  {testEvent ? (
                                    <form action={deliveryAction}>
                                      <input type="hidden" name="endpointId" value={endpoint.id} />
                                      <input type="hidden" name="eventType" value={testEvent} />
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
                                  <form action={rotateSecretAction}>
                                    <input type="hidden" name="endpointId" value={endpoint.id} />
                                    <Button
                                      type="submit"
                                      variant="secondary"
                                      size="sm"
                                      loading={rotateSecretPending}
                                      className="min-h-11 md:min-h-8"
                                    >
                                      {t('rotateSecret')}
                                    </Button>
                                  </form>
                                  <form action={revokeHookAction}>
                                    <input type="hidden" name="endpointId" value={endpoint.id} />
                                    <Button
                                      type="submit"
                                      variant="secondary"
                                      size="sm"
                                      loading={revokeHookPending}
                                      className="min-h-11 md:min-h-8"
                                    >
                                      {t('revoke')}
                                    </Button>
                                  </form>
                                </div>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              }
              renderMobileCard={(endpoint) => {
                const testEvent =
                  endpoint.eventTypes.find((event) => event === 'test.ping') ??
                  endpoint.eventTypes[0];
                return (
                  <div className="flex min-h-11 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                    <div>
                      <p className="break-all font-semibold" dir="ltr">
                        {endpoint.url}
                      </p>
                      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                        {endpoint.eventTypes.join(', ')}
                      </p>
                      <div className="mt-2">
                        <StatusBadge
                          shape={endpoint.status === 'active' ? 'active' : 'cancelled'}
                          label={
                            endpoint.status === 'active' ? t('status.active') : t('status.revoked')
                          }
                        />
                      </div>
                    </div>
                    {canEdit && endpoint.status === 'active' ? (
                      <div className="flex flex-wrap gap-2">
                        {testEvent ? (
                          <form action={deliveryAction}>
                            <input type="hidden" name="endpointId" value={endpoint.id} />
                            <input type="hidden" name="eventType" value={testEvent} />
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
                        <form action={rotateSecretAction}>
                          <input type="hidden" name="endpointId" value={endpoint.id} />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            loading={rotateSecretPending}
                            className="min-h-11"
                          >
                            {t('rotateSecret')}
                          </Button>
                        </form>
                        <form action={revokeHookAction}>
                          <input type="hidden" name="endpointId" value={endpoint.id} />
                          <Button
                            type="submit"
                            variant="secondary"
                            size="sm"
                            loading={revokeHookPending}
                            className="min-h-11"
                          >
                            {t('revoke')}
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                );
              }}
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
        {attemptState.error ? <Alert tone="danger">{attemptState.error}</Alert> : null}
        {attemptState.ok ? (
          <Alert tone="success" className="mt-2" role="status">
            {t('deliveryAttemptRecorded')}
          </Alert>
        ) : null}
        {deliveries.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('deliveriesEmpty')}</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm text-[var(--pf-text-secondary)]">
            {deliveries.map((delivery) => {
              const canRecordAttempt =
                canEdit && (delivery.status === 'pending' || delivery.status === 'failed');
              return (
                <li
                  key={delivery.id}
                  className="flex min-h-11 flex-col gap-2 border-b border-[var(--pf-border-default)] py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <span dir="ltr">{delivery.eventType}</span> · {delivery.status}
                    {delivery.lastHttpStatus != null ? (
                      <>
                        {' · '}
                        <span dir="ltr">HTTP {delivery.lastHttpStatus}</span>
                      </>
                    ) : null}
                    {delivery.attemptCount > 0 ? (
                      <>
                        {' · '}
                        {t('attempts', { count: delivery.attemptCount })}
                      </>
                    ) : null}
                  </div>
                  {canRecordAttempt ? (
                    <div className="flex flex-wrap gap-2">
                      <form action={attemptAction}>
                        <input type="hidden" name="deliveryId" value={delivery.id} />
                        <input type="hidden" name="outcome" value="success" />
                        <Button
                          type="submit"
                          variant="secondary"
                          size="sm"
                          loading={attemptPending}
                          className="min-h-11 md:min-h-8"
                        >
                          {t('markDeliverySuccess')}
                        </Button>
                      </form>
                      <form action={attemptAction}>
                        <input type="hidden" name="deliveryId" value={delivery.id} />
                        <input type="hidden" name="outcome" value="failure" />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          loading={attemptPending}
                          className="min-h-11 md:min-h-8"
                        >
                          {t('markDeliveryFailure')}
                        </Button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
