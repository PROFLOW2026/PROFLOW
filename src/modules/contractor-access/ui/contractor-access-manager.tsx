'use client';

import type { ReactNode } from 'react';
import { ChevronDown, KeyRound, UserPlus } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useActionState, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { LOCALES, LOCALE_METADATA } from '@/shared/i18n/config';
import type { ContractorAccessOverview, ContractorAccountSummary, ContractorGrantSummary } from '../application/manage-contractor-access';
import { CapabilityPicker, capabilityLabelKey } from './capability-picker';
import {
  ContractorCredentialsShareDialog,
  type ContractorShareDialogPayload,
} from './contractor-credentials-share-dialog';

export interface ContractorAccessActionStateView {
  readonly error?: string;
  readonly success?: string;
  readonly link?: {
    readonly kind: 'invite' | 'reset';
    readonly path: string;
    readonly expiresAt: string;
    readonly username?: string;
    readonly displayName?: string;
    readonly contactEmail?: string | null;
    readonly phone?: string | null;
    readonly locale?: string | null;
  };
}

type Action = (state: ContractorAccessActionStateView, formData: FormData) => Promise<ContractorAccessActionStateView>;

export interface ContractorAccessActions {
  readonly invite: Action;
  readonly grant: Action;
  readonly update: Action;
  readonly revoke: Action;
  readonly principalCommand: Action;
  readonly updatePrincipal: Action;
}

const selectClassName =
  'min-h-11 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 text-sm';

const STATUS_TONE: Record<string, BadgeTone> = { invited: 'pending', active: 'success', disabled: 'danger' };

function sharePayloadFromLink(
  link: NonNullable<ContractorAccessActionStateView['link']>,
  fallback?: Pick<ContractorAccountSummary, 'displayName' | 'username' | 'contactEmail' | 'phone' | 'locale'>,
): ContractorShareDialogPayload | null {
  const username = link.username ?? fallback?.username;
  if (!username) return null;
  const displayName = link.displayName ?? fallback?.displayName ?? username;
  return {
    kind: link.kind,
    path: link.path,
    expiresAt: link.expiresAt,
    username,
    displayName,
    contactEmail: link.contactEmail ?? fallback?.contactEmail,
    phone: link.phone ?? fallback?.phone,
    locale: link.locale ?? fallback?.locale,
  };
}

function ActionFeedback({ state }: { state: ContractorAccessActionStateView }) {
  const t = useTranslations('contractorAccess.manage');
  if (state.error) return <Alert tone="danger">{state.error}</Alert>;
  if (!state.success) return null;
  if (state.link) {
    return (
      <Alert tone="success" title={state.success}>
        {t('inviteResult.dialogHint')}
      </Alert>
    );
  }
  return <Alert tone="success">{state.success}</Alert>;
}

function CollapsiblePanel({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]"
      open={defaultOpen || undefined}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">{summary}</div>
        <ChevronDown className="size-5 shrink-0 text-[var(--pf-text-secondary)] transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-[var(--pf-border-default)] px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}

function ScopeFields({
  idPrefix,
  overview,
  vendorId,
  onVendorChange,
}: {
  idPrefix: string;
  overview: ContractorAccessOverview;
  vendorId: string;
  onVendorChange: (vendorId: string) => void;
}) {
  const t = useTranslations('contractorAccess.manage.invite');
  const agreements = overview.agreements.filter((agreement) => agreement.vendorId === vendorId);
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field id={`${idPrefix}-vendor`} label={t('vendor')} required>
        {(control) => (
          <select
            {...control}
            name="vendorId"
            required
            value={vendorId}
            onChange={(event) => onVendorChange(event.target.value)}
            className={selectClassName}
          >
            <option value="" disabled>
              {t('vendorPlaceholder')}
            </option>
            {overview.vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={`${idPrefix}-agreement`} label={t('agreement')}>
        {(control) => (
          <select {...control} name="subcontractAgreementId" defaultValue="" className={selectClassName}>
            <option value="">{t('agreementAny')}</option>
            {agreements.map((agreement) => (
              <option key={agreement.id} value={agreement.id}>
                {agreement.title}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field id={`${idPrefix}-expires`} label={t('expiresAt')} description={t('expiresHint')}>
        {(control) => <Input {...control} name="expiresAt" type="date" dir="ltr" />}
      </Field>
      {overview.authority.isOrgAdmin ? (
        <label className="flex min-h-11 items-start gap-2 text-sm sm:self-end">
          <input type="checkbox" name="allProjects" className="mt-1" />
          <span>
            {t('allProjects')}
            <span className="block text-xs text-[var(--pf-text-secondary)]">{t('allProjectsHint')}</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function InviteForm({
  projectId,
  overview,
  action,
  onShareLink,
}: {
  projectId: string;
  overview: ContractorAccessOverview;
  action: Action;
  onShareLink: (payload: ContractorShareDialogPayload) => void;
}) {
  const t = useTranslations('contractorAccess.manage.invite');
  const tLayout = useTranslations('contractorAccess.manage.layout');
  const [state, formAction, pending] = useActionState<ContractorAccessActionStateView, FormData>(action, {});
  const [vendorId, setVendorId] = useState('');
  const [linkExisting, setLinkExisting] = useState(false);
  const formKey = state.link ? `${state.link.kind}:${state.link.path}` : 'new';

  useEffect(() => {
    if (!state.link) return;
    const payload = sharePayloadFromLink(state.link);
    if (payload) onShareLink(payload);
  }, [state.link, onShareLink]);

  return (
    <CollapsiblePanel
      summary={
        <div className="flex items-center gap-2">
          <UserPlus className="size-5 shrink-0 text-[var(--pf-text-brand)]" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{tLayout('inviteSection')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
          </div>
        </div>
      }
    >
      <ActionFeedback state={state} />
      {overview.vendors.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--pf-text-secondary)]">{t('noVendors')}</p>
      ) : (
        <form key={formKey} action={formAction} className="mt-3 flex flex-col gap-4">
          <input type="hidden" name="projectId" value={projectId} />
          <label className="flex min-h-11 items-start gap-2 text-sm">
            <input
              type="checkbox"
              name="linkExisting"
              className="mt-1"
              checked={linkExisting}
              onChange={(event) => setLinkExisting(event.target.checked)}
            />
            <span>
              {t('linkExisting')}
              <span className="block text-xs text-[var(--pf-text-secondary)]">{t('linkExistingHint')}</span>
            </span>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {!linkExisting ? (
              <Field id="invite-name" label={t('displayName')} required>
                {(control) => <Input {...control} name="displayName" maxLength={120} required />}
              </Field>
            ) : null}
            <Field id="invite-username" label={t('username')} description={t('usernameHint')} required={linkExisting}>
              {(control) => (
                <Input
                  {...control}
                  name="username"
                  dir="ltr"
                  maxLength={32}
                  autoCapitalize="none"
                  spellCheck={false}
                  required={linkExisting}
                />
              )}
            </Field>
            <Field id="invite-email" label={t('contactEmail')}>
              {(control) => <Input {...control} name="contactEmail" type="email" dir="ltr" maxLength={200} />}
            </Field>
            <Field id="invite-phone" label={t('phone')}>
              {(control) => <Input {...control} name="phone" type="tel" dir="ltr" maxLength={40} />}
            </Field>
            <Field id="invite-locale" label={t('language')}>
              {(control) => (
                <select {...control} name="locale" defaultValue="he-IL" className={selectClassName}>
                  {LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {LOCALE_METADATA[locale].label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </div>
          <ScopeFields idPrefix="invite" overview={overview} vendorId={vendorId} onVendorChange={setVendorId} />
          <CapabilityPicker idPrefix="invite" canGrantFinancial={overview.authority.canGrantFinancial} />
          <Button type="submit" loading={pending} className="min-h-11 self-start">
            {t('submit')}
          </Button>
        </form>
      )}
    </CollapsiblePanel>
  );
}

function GrantRow({
  projectId,
  grant,
  overview,
  actions,
}: {
  projectId: string;
  grant: ContractorGrantSummary;
  overview: ContractorAccessOverview;
  actions: ContractorAccessActions;
}) {
  const t = useTranslations('contractorAccess');
  const format = useFormatter();
  const [editing, setEditing] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [updateState, updateAction, updating] = useActionState<ContractorAccessActionStateView, FormData>(actions.update, {});
  const [revokeState, revokeAction, revoking] = useActionState<ContractorAccessActionStateView, FormData>(actions.revoke, {});
  const active = grant.status === 'active';
  const manageable = overview.authority.canManage && (grant.projectId !== null || overview.authority.isOrgAdmin);

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{grant.vendorName}</span>
        <span className="text-[var(--pf-text-secondary)]">
          · {grant.agreementTitle ?? t('manage.list.allAgreements')} ·{' '}
          {grant.projectId ? t('manage.list.thisProject') : t('manage.list.allProjects')}
        </span>
        {active ? null : <Badge tone="neutral">{t('manage.list.revoked')}</Badge>}
        {grant.templateKey ? <Badge tone="brand">{t(`manage.templates.${grant.templateKey}.name`)}</Badge> : null}
        <span className="text-xs text-[var(--pf-text-secondary)]">
          {grant.expiresAt
            ? t('manage.list.expires', { date: format.dateTime(grant.expiresAt, { dateStyle: 'medium' }) })
            : t('manage.list.noExpiry')}
        </span>
      </div>
      <details className="rounded-md border border-[var(--pf-border-default)] p-2">
        <summary className="cursor-pointer text-xs font-medium text-[var(--pf-text-secondary)]">
          {t('manage.list.permissionCount', { count: grant.capabilities.length })}
        </summary>
        <ul className="mt-2 flex flex-wrap gap-1">
          {grant.capabilities.map((capability) => (
            <li key={capability}>
              <Badge tone="neutral">{t(capabilityLabelKey(capability))}</Badge>
            </li>
          ))}
        </ul>
      </details>
      <ActionFeedback state={updateState.error || updateState.success ? updateState : revokeState} />
      {active && manageable ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing((value) => !value)}>
            {t('manage.actions.editCapabilities')}
          </Button>
          {confirmRevoke ? (
            <form action={revokeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="grantId" value={grant.grantId} />
              <Input name="reason" placeholder={t('manage.actions.revokeReason')} className="w-56" maxLength={500} />
              <Button type="submit" size="sm" variant="danger" loading={revoking}>
                {t('manage.actions.revokeConfirm')}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRevoke(false)}>
                {t('manage.actions.cancel')}
              </Button>
            </form>
          ) : (
            <Button type="button" size="sm" variant="dangerGhost" onClick={() => setConfirmRevoke(true)}>
              {t('manage.actions.revoke')}
            </Button>
          )}
        </div>
      ) : null}
      {editing && active && manageable ? (
        <form action={updateAction} className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="grantId" value={grant.grantId} />
          <CapabilityPicker
            idPrefix={`edit-${grant.grantId}`}
            canGrantFinancial={overview.authority.canGrantFinancial}
            initialTemplate={grant.templateKey ?? 'custom'}
            initialCapabilities={grant.capabilities}
          />
          <Field id={`edit-${grant.grantId}-expires`} label={t('manage.invite.expiresAt')}>
            {(control) => (
              <Input
                {...control}
                name="expiresAt"
                type="date"
                dir="ltr"
                defaultValue={grant.expiresAt ? new Date(grant.expiresAt).toISOString().slice(0, 10) : ''}
              />
            )}
          </Field>
          <Button type="submit" size="sm" loading={updating} className="self-start">
            {t('manage.actions.save')}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

function PrincipalCommand({
  projectId,
  principalId,
  command,
  label,
  variant = 'secondary',
  action,
}: {
  projectId: string;
  principalId: string;
  command: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'dangerGhost' | 'ghost';
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="principalId" value={principalId} />
      <input type="hidden" name="command" value={command} />
      <Button type="submit" size="sm" variant={variant}>
        {label}
      </Button>
    </form>
  );
}

function AccountProfileForm({
  projectId,
  account,
  action,
}: {
  projectId: string;
  account: ContractorAccountSummary;
  action: Action;
}) {
  const t = useTranslations('contractorAccess.manage');
  const tInvite = useTranslations('contractorAccess.manage.invite');
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ContractorAccessActionStateView, FormData>(action, {});

  if (!editing) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
        {t('actions.editProfile')}
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="principalId" value={account.principalId} />
      <ActionFeedback state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field id={`profile-name-${account.principalId}`} label={tInvite('displayName')} required>
          {(control) => (
            <Input {...control} name="displayName" maxLength={120} required defaultValue={account.displayName ?? ''} />
          )}
        </Field>
        <Field id={`profile-username-${account.principalId}`} label={tInvite('username')} description={t('actions.usernameChangeHint')} required>
          {(control) => (
            <Input
              {...control}
              name="username"
              dir="ltr"
              maxLength={32}
              required
              defaultValue={account.username ?? ''}
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>
        <Field id={`profile-email-${account.principalId}`} label={tInvite('contactEmail')}>
          {(control) => (
            <Input
              {...control}
              name="contactEmail"
              type="email"
              dir="ltr"
              maxLength={200}
              defaultValue={account.contactEmail ?? ''}
            />
          )}
        </Field>
        <Field id={`profile-phone-${account.principalId}`} label={tInvite('phone')}>
          {(control) => (
            <Input {...control} name="phone" type="tel" dir="ltr" maxLength={40} defaultValue={account.phone ?? ''} />
          )}
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={pending}>
          {t('actions.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}

function AccountCard({
  projectId,
  account,
  overview,
  actions,
  onShareLink,
}: {
  projectId: string;
  account: ContractorAccountSummary;
  overview: ContractorAccessOverview;
  actions: ContractorAccessActions;
  onShareLink: (payload: ContractorShareDialogPayload) => void;
}) {
  const t = useTranslations('contractorAccess.manage');
  const format = useFormatter();
  const [state, commandAction] = useActionState<ContractorAccessActionStateView, FormData>(actions.principalCommand, {});
  const { authority } = overview;
  const canHomeManage = account.isHomeOrganization && authority.canManage;
  const vendorNames = [...new Set(account.grants.map((grant) => grant.vendorName).filter(Boolean))];

  useEffect(() => {
    if (!state.link) return;
    const payload = sharePayloadFromLink(state.link, account);
    if (payload) onShareLink(payload);
  }, [state.link, account, onShareLink]);

  const summaryTitle =
    account.displayName ??
    account.username ??
    t('list.contactPerson');

  return (
    <CollapsiblePanel
      summary={
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {vendorNames.length > 0 ? (
              <p className="text-xs text-[var(--pf-text-secondary)]">
                {vendorNames.join(' · ')}
              </p>
            ) : null}
            <p className="font-semibold">{summaryTitle}</p>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              <bdi dir="ltr" className="font-mono">{account.username}</bdi>
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge tone={STATUS_TONE[account.status] ?? 'neutral'}>{t(`list.status.${account.status}`)}</Badge>
            {account.passwordResetRequestedAt ? <Badge tone="warning">{t('list.resetRequested')}</Badge> : null}
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {account.phone ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            <bdi dir="ltr">{account.phone}</bdi>
          </p>
        ) : null}
        {account.contactEmail ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('invite.contactEmail')}: <bdi dir="ltr">{account.contactEmail}</bdi>
          </p>
        ) : null}
        <p className="text-xs text-[var(--pf-text-secondary)]">
          {t('list.lastSignIn')}{' '}
          {account.lastSignInAt
            ? format.dateTime(account.lastSignInAt, { dateStyle: 'medium', timeStyle: 'short' })
            : t('list.never')}
        </p>
        {account.openLink ? (
          <Badge tone="info">
            {t(account.openLink.purpose === 'invite' ? 'list.inviteOpen' : 'list.resetOpen', {
              date: format.dateTime(account.openLink.expiresAt, { dateStyle: 'short' }),
            })}
          </Badge>
        ) : null}
        {account.lockedUntil && new Date(account.lockedUntil) > new Date() ? (
          <Badge tone="danger">{t('list.locked')}</Badge>
        ) : null}

      <ul className="divide-y divide-[var(--pf-border-default)]">
        {account.grants.map((grant) => (
          <GrantRow key={grant.grantId} projectId={projectId} grant={grant} overview={overview} actions={actions} />
        ))}
      </ul>

      <div className="mt-3 flex flex-col gap-2">
        {canHomeManage ? (
          <AccountProfileForm projectId={projectId} account={account} action={actions.updatePrincipal} />
        ) : null}
        <ActionFeedback state={state} />
        <div className="flex flex-wrap gap-2">
          {account.isHomeOrganization && account.status === 'invited' && authority.canInvite ? (
            <PrincipalCommand projectId={projectId} principalId={account.principalId} command="reissue_invite" label={t('actions.reissueInvite')} action={commandAction} />
          ) : null}
          {canHomeManage && account.status === 'active' ? (
            <>
              <PrincipalCommand
                projectId={projectId}
                principalId={account.principalId}
                command="issue_reset"
                label={t('actions.issueReset')}
                variant="primary"
                action={commandAction}
              />
              <PrincipalCommand projectId={projectId} principalId={account.principalId} command="revoke_sessions" label={t('actions.revokeSessions')} variant="ghost" action={commandAction} />
            </>
          ) : null}
          {canHomeManage && account.status !== 'disabled' ? (
            <PrincipalCommand projectId={projectId} principalId={account.principalId} command="disable" label={t('actions.disable')} variant="dangerGhost" action={commandAction} />
          ) : null}
          {canHomeManage && account.status === 'disabled' ? (
            <PrincipalCommand projectId={projectId} principalId={account.principalId} command="enable" label={t('actions.enable')} action={commandAction} />
          ) : null}
        </div>
        {!account.isHomeOrganization ? <p className="text-xs text-[var(--pf-text-secondary)]">{t('list.homeOrgOnly')}</p> : null}
      </div>
      </div>
    </CollapsiblePanel>
  );
}

function AddAccessForm({ projectId, overview, action }: { projectId: string; overview: ContractorAccessOverview; action: Action }) {
  const t = useTranslations('contractorAccess.manage');
  const tLayout = useTranslations('contractorAccess.manage.layout');
  const [state, formAction, pending] = useActionState<ContractorAccessActionStateView, FormData>(action, {});
  const [vendorId, setVendorId] = useState('');
  const principals = useMemo(
    () => overview.existingPrincipals.filter((principal) => principal.vendorId === vendorId),
    [overview.existingPrincipals, vendorId],
  );
  return (
    <CollapsiblePanel
      summary={
        <div className="flex items-center gap-2">
          <KeyRound className="size-5 shrink-0 text-[var(--pf-text-brand)]" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{tLayout('addAccessSection')}</h2>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('actions.addAccessDescription')}</p>
          </div>
        </div>
      }
    >
      <ActionFeedback state={state} />
      <form action={formAction} className="mt-3 flex flex-col gap-4">
        <input type="hidden" name="projectId" value={projectId} />
        <ScopeFields idPrefix="grant" overview={overview} vendorId={vendorId} onVendorChange={setVendorId} />
        {principals.length > 0 ? (
          <Field id="grant-principal" label={t('actions.existingAccount')}>
            {(control) => (
              <select {...control} name="principalId" defaultValue="" className={selectClassName}>
                <option value="">{t('invite.vendorPlaceholder')}</option>
                {principals.map((principal) => (
                  <option key={principal.principalId} value={principal.principalId}>
                    {principal.label}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : null}
        <Field id="grant-username" label={t('actions.existingUsername')} description={t('actions.existingUsernameHint')}>
          {(control) => (
            <Input {...control} name="existingUsername" dir="ltr" maxLength={32} autoCapitalize="none" spellCheck={false} />
          )}
        </Field>
        <CapabilityPicker idPrefix="grant" canGrantFinancial={overview.authority.canGrantFinancial} initialTemplate="read_only" />
        <Button type="submit" loading={pending} className="min-h-11 self-start">
          {t('actions.addAccess')}
        </Button>
      </form>
    </CollapsiblePanel>
  );
}

export function ContractorAccessManager({
  projectId,
  overview,
  actions,
  organizationName,
}: {
  projectId: string;
  overview: ContractorAccessOverview;
  actions: ContractorAccessActions;
  organizationName: string;
}) {
  const t = useTranslations('contractorAccess.manage');
  const tLayout = useTranslations('contractorAccess.manage.layout');
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePayload, setSharePayload] = useState<ContractorShareDialogPayload | null>(null);

  const openShareLink = useCallback((payload: ContractorShareDialogPayload) => {
    setSharePayload(payload);
    setShareOpen(true);
  }, []);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">{tLayout('accountsSection')}</h2>
        {overview.accounts.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('list.empty')}</p>
        ) : (
          overview.accounts.map((account) => (
            <AccountCard
              key={account.principalId}
              projectId={projectId}
              account={account}
              overview={overview}
              actions={actions}
              onShareLink={openShareLink}
            />
          ))
        )}
      </section>
      {overview.authority.canManage ? (
        <AddAccessForm projectId={projectId} overview={overview} action={actions.grant} />
      ) : null}
      {overview.authority.canInvite ? (
        <InviteForm projectId={projectId} overview={overview} action={actions.invite} onShareLink={openShareLink} />
      ) : null}
      <ContractorCredentialsShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        payload={sharePayload}
        organizationName={organizationName}
      />
    </div>
  );
}
