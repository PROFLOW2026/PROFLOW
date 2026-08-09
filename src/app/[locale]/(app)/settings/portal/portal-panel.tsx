'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CUSTOMER_PORTAL_SCOPES,
  type ExternalAccessGrantListItem,
} from '@/modules/portal';
import {
  createCustomerGrantAction,
  revokeCustomerGrantAction,
  type PortalActionState,
} from './actions';

export function PortalGrantsPanel({
  grants,
  clients,
  projects,
  canEdit,
}: {
  grants: ExternalAccessGrantListItem[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const t = useTranslations('portal');
  const [createState, createAction, createPending] = useActionState(
    createCustomerGrantAction,
    {} as PortalActionState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeCustomerGrantAction,
    {} as PortalActionState,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('externalNote')}</p>
      </div>

      {canEdit ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-medium">{t('addGrant')}</h2>
          <form action={createAction} className="mt-3 flex max-w-lg flex-col gap-3">
            {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
            {createState.ok ? (
              <Alert tone="success" role="status">
                {t('saved')}
              </Alert>
            ) : null}

            <Field label={t('fields.email')} required>
              {(props) => <Input {...props} name="email" type="email" required />}
            </Field>
            <Field label={t('fields.displayName')}>
              {(props) => <Input {...props} name="displayName" />}
            </Field>

            <Field label={t('fields.client')}>
              {(props) => (
                <Select name="clientId" defaultValue="none">
                  <SelectTrigger id={props.id}>
                    <SelectValue placeholder={t('fields.none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.none')}</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label={t('fields.project')}>
              {(props) => (
                <Select name="projectId" defaultValue="none">
                  <SelectTrigger id={props.id}>
                    <SelectValue placeholder={t('fields.none')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.none')}</SelectItem>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{t('fields.scopes')}</legend>
              {CUSTOMER_PORTAL_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={scope}
                    defaultChecked={scope === 'project.summary'}
                    className="size-4 rounded border-[var(--pf-border-strong)]"
                  />
                  {t(`scopes.${scope}`)}
                </label>
              ))}
            </fieldset>

            <Field label={t('fields.expiresAt')}>
              {(props) => <Input {...props} name="expiresAt" type="datetime-local" />}
            </Field>

            <Button type="submit" loading={createPending}>
              {t('addGrant')}
            </Button>
          </form>
        </section>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold">{t('listTitle')}</h2>
        {revokeState.error ? <Alert tone="danger">{revokeState.error}</Alert> : null}
        {grants.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('empty')}</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.principal')}</TableHead>
                  <TableHead>{t('columns.scope')}</TableHead>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grants.map((grant) => (
                  <TableRow key={grant.id}>
                    <TableCell>
                      <div className="font-medium">{grant.principalEmail}</div>
                      <div className="text-xs text-[var(--pf-text-muted)]">
                        {[grant.clientName, grant.projectName].filter(Boolean).join(' · ') ||
                          t('fields.none')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {grant.scopes.map((scope) => (
                          <Badge key={scope} tone="neutral">
                            {t(`scopes.${scope}`)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{t(`statuses.${grant.status}`)}</TableCell>
                    <TableCell>
                      {canEdit && grant.status === 'active' ? (
                        <form action={revokeAction}>
                          <input type="hidden" name="grantId" value={grant.id} />
                          <Button type="submit" variant="secondary" size="sm" loading={revokePending}>
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
        )}
      </section>
    </div>
  );
}
