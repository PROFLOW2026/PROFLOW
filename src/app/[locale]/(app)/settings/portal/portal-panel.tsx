'use client';

import { useActionState } from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CUSTOMER_PORTAL_SCOPES,
  VENDOR_PORTAL_SCOPES,
  type ExternalAccessGrantListItem,
} from '@/modules/portal';
import {
  createCustomerGrantAction,
  createVendorGrantAction,
  revokeCustomerGrantAction,
  revokeVendorGrantAction,
  type PortalActionState,
} from './actions';

function GrantTable({
  grants,
  canEdit,
  kind,
  revokeAction,
  revokePending,
}: {
  grants: ExternalAccessGrantListItem[];
  canEdit: boolean;
  kind: 'customer' | 'vendor';
  revokeAction: (payload: FormData) => void;
  revokePending: boolean;
}) {
  const t = useTranslations('portal');

  if (grants.length === 0) {
    return (
      <p className="mt-2 text-sm text-[var(--pf-text-muted)]">
        {kind === 'customer' ? t('empty') : t('vendorEmpty')}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <ResponsiveTable
        items={grants}
        getRowKey={(grant) => grant.id}
        desktop={
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
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
                      <div className="font-medium" dir="ltr">
                        {grant.principalEmail}
                      </div>
                      <div className="text-xs text-[var(--pf-text-muted)]">
                        {kind === 'customer'
                          ? [grant.clientName, grant.projectName].filter(Boolean).join(' · ') ||
                            t('fields.none')
                          : grant.vendorName || t('fields.none')}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {grant.scopes.map((scope) => (
                          <Badge key={scope} tone="neutral">
                            {t(`scopes.${scope}` as 'scopes.project.summary')}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{t(`statuses.${grant.status}`)}</TableCell>
                    <TableCell>
                      {canEdit && grant.status === 'active' ? (
                        <form action={revokeAction}>
                          <input type="hidden" name="grantId" value={grant.id} />
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
        renderMobileCard={(grant) => (
          <div className="flex min-h-11 flex-col gap-3 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
            <div>
              <p className="font-semibold" dir="ltr">
                {grant.principalEmail}
              </p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {kind === 'customer'
                  ? [grant.clientName, grant.projectName].filter(Boolean).join(' · ') ||
                    t('fields.none')
                  : grant.vendorName || t('fields.none')}
              </p>
              <p className="mt-1 text-sm">{t(`statuses.${grant.status}`)}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {grant.scopes.map((scope) => (
                <Badge key={scope} tone="neutral">
                  {t(`scopes.${scope}` as 'scopes.project.summary')}
                </Badge>
              ))}
            </div>
            {canEdit && grant.status === 'active' ? (
              <form action={revokeAction}>
                <input type="hidden" name="grantId" value={grant.id} />
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
  );
}

export function PortalGrantsPanel({
  customerGrants,
  vendorGrants,
  clients,
  projects,
  vendors,
  canEdit,
}: {
  customerGrants: ExternalAccessGrantListItem[];
  vendorGrants: ExternalAccessGrantListItem[];
  clients: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const t = useTranslations('portal');
  const [createState, createAction, createPending] = useActionState(
    createCustomerGrantAction,
    {} as PortalActionState,
  );
  const [vendorCreateState, vendorCreateAction, vendorCreatePending] = useActionState(
    createVendorGrantAction,
    {} as PortalActionState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeCustomerGrantAction,
    {} as PortalActionState,
  );
  const [vendorRevokeState, vendorRevokeAction, vendorRevokePending] = useActionState(
    revokeVendorGrantAction,
    {} as PortalActionState,
  );

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        <p className="mt-1 text-xs text-[var(--pf-text-muted)]">{t('externalNote')}</p>
      </div>

      <section className="flex flex-col gap-6">
        <h2 className="text-base font-semibold">{t('customerSection')}</h2>

        {canEdit ? (
          <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('addGrant')}</h3>
            <form action={createAction} className="mt-3 flex max-w-lg flex-col gap-3">
              {createState.error ? <Alert tone="danger">{createState.error}</Alert> : null}
              {createState.ok ? (
                <Alert tone="success" role="status">
                  {t('saved')}
                </Alert>
              ) : null}

              <Field label={t('fields.email')} required>
                {(props) => <Input {...props} name="email" type="email" dir="ltr" required />}
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

              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium">{t('fields.scopes')}</legend>
                {CUSTOMER_PORTAL_SCOPES.map((scope) => (
                  <label key={scope} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="scopes"
                      value={scope}
                      defaultChecked={scope === 'project.summary'}
                      className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
                    />
                    {t(`scopes.${scope}`)}
                  </label>
                ))}
              </fieldset>

              <Field label={t('fields.expiresAt')}>
                {(props) => <Input {...props} name="expiresAt" type="datetime-local" dir="ltr" />}
              </Field>

              <Button type="submit" loading={createPending}>
                {t('addGrant')}
              </Button>
            </form>
          </section>
        ) : null}

        <section>
          <h3 className="text-sm font-semibold">{t('listTitle')}</h3>
          {revokeState.error ? <Alert tone="danger">{revokeState.error}</Alert> : null}
          <GrantTable
            grants={customerGrants}
            canEdit={canEdit}
            kind="customer"
            revokeAction={revokeAction}
            revokePending={revokePending}
          />
        </section>
      </section>

      <section className="flex flex-col gap-6 border-t border-[var(--pf-border-default)] pt-8">
        <div>
          <h2 className="text-base font-semibold">{t('vendorSection')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('vendorSubtitle')}</p>
        </div>

        {canEdit ? (
          <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <h3 className="font-medium">{t('addVendorGrant')}</h3>
            <form action={vendorCreateAction} className="mt-3 flex max-w-lg flex-col gap-3">
              {vendorCreateState.error ? (
                <Alert tone="danger">{vendorCreateState.error}</Alert>
              ) : null}
              {vendorCreateState.ok ? (
                <Alert tone="success" role="status">
                  {t('vendorSaved')}
                </Alert>
              ) : null}

              <Field label={t('fields.vendorEmail')} required>
                {(props) => <Input {...props} name="email" type="email" dir="ltr" required />}
              </Field>
              <Field label={t('fields.displayName')}>
                {(props) => <Input {...props} name="displayName" />}
              </Field>

              <Field label={t('fields.vendor')} required>
                {(props) => (
                  <Select name="vendorId" required>
                    <SelectTrigger id={props.id}>
                      <SelectValue placeholder={t('fields.vendorPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.map((vendor) => (
                        <SelectItem key={vendor.id} value={vendor.id}>
                          {vendor.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Field>

              <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium">{t('fields.scopes')}</legend>
                {VENDOR_PORTAL_SCOPES.map((scope) => (
                  <label key={scope} className="flex min-h-11 items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      name="vendorScopes"
                      value={scope}
                      defaultChecked={scope === 'vendor.summary'}
                      className="size-5 shrink-0 rounded border-[var(--pf-border-strong)]"
                    />
                    {t(`scopes.${scope}`)}
                  </label>
                ))}
              </fieldset>

              <Field label={t('fields.expiresAt')}>
                {(props) => <Input {...props} name="expiresAt" type="datetime-local" dir="ltr" />}
              </Field>

              <Button type="submit" loading={vendorCreatePending}>
                {t('addVendorGrant')}
              </Button>
            </form>
          </section>
        ) : null}

        <section>
          <h3 className="text-sm font-semibold">{t('vendorListTitle')}</h3>
          {vendorRevokeState.error ? <Alert tone="danger">{vendorRevokeState.error}</Alert> : null}
          <GrantTable
            grants={vendorGrants}
            canEdit={canEdit}
            kind="vendor"
            revokeAction={vendorRevokeAction}
            revokePending={vendorRevokePending}
          />
        </section>
      </section>
    </div>
  );
}
