'use client';

import { useActionState, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmAction } from '@/components/patterns/confirm-action';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatInstant } from '@/shared/dates/format';
import { ROLE_TEMPLATE_KEYS, type RoleTemplateKey } from '@/shared/permissions/role-templates';
import {
  inviteMemberAction,
  removeMemberAction,
  revokeInvitationAction,
  type SettingsActionState,
} from '../actions';
import type { OrganizationMember } from '@/modules/tenancy/application/members';

interface PendingInvitation {
  id: string;
  email: string;
  roleId: string;
  expiresAt: Date;
}

export function PeopleSettingsPanel({
  members,
  pendingInvitations,
  roleIdToKey,
  currentUserId,
  canManage,
  canInvite,
  canInviteOwner,
  timezone,
}: {
  members: OrganizationMember[];
  pendingInvitations: PendingInvitation[];
  roleIdToKey: Record<string, string>;
  currentUserId: string;
  canManage: boolean;
  canInvite: boolean;
  canInviteOwner: boolean;
  timezone: string;
}) {
  const t = useTranslations('organization');
  const tPeople = useTranslations('settings.people');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [roleKey, setRoleKey] = useState<RoleTemplateKey>('manager');
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteMemberAction,
    {} as SettingsActionState,
  );
  const [copied, setCopied] = useState(false);

  const inviteRoleOptions = ROLE_TEMPLATE_KEYS.filter(
    (key) => key !== 'owner' || canInviteOwner,
  );

  async function handleRemove(membershipId: string) {
    const result = await removeMemberAction(membershipId);
    if (result.error) {
      return { error: result.error };
    }
    return { ok: true };
  }

  async function handleRevoke(invitationId: string) {
    await revokeInvitationAction(invitationId);
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="text-base font-semibold">{t('members.title')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('members.subtitle')}</p>

        {members.length === 0 ? (
          <EmptyState title={t('members.empty')} description={t('members.emptyHint')} className="mt-4" />
        ) : (
          <div className="mt-4">
            <ResponsiveTable
              items={members}
              getRowKey={(member) => member.membershipId}
              desktop={
                <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('members.columnName')}</TableHead>
                        <TableHead>{t('members.columnEmail')}</TableHead>
                        <TableHead>{t('members.columnRole')}</TableHead>
                        {canManage ? <TableHead>{tCommon('labels.status')}</TableHead> : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.membershipId}>
                          <TableCell>
                            {member.displayName ?? member.email}
                            {member.userId === currentUserId ? (
                              <span className="ms-2 text-xs text-[var(--pf-text-muted)]">
                                ({t('members.you')})
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <span dir="ltr">{member.email}</span>
                          </TableCell>
                          <TableCell>
                            {member.roleKeys
                              .map((key) => t(`roles.${key as RoleTemplateKey}.name`))
                              .join(', ')}
                          </TableCell>
                          {canManage ? (
                            <TableCell>
                              {member.userId !== currentUserId ? (
                                <ConfirmAction
                                  title={t('members.remove')}
                                  description={t('members.removeConfirm', {
                                    name: member.displayName ?? member.email,
                                  })}
                                  confirmLabel={t('members.remove')}
                                  successMessage={t('members.removeSuccess')}
                                  onConfirm={() => handleRemove(member.membershipId)}
                                  trigger={
                                    <Button type="button" variant="ghost" size="sm">
                                      {t('members.remove')}
                                    </Button>
                                  }
                                />
                              ) : null}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              }
              renderMobileCard={(member) => (
                <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
                  <p className="text-sm font-medium">
                    {member.displayName ?? member.email}
                    {member.userId === currentUserId ? (
                      <span className="ms-2 text-xs text-[var(--pf-text-muted)]">
                        ({t('members.you')})
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                    {member.email}
                  </p>
                  <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                    {member.roleKeys
                      .map((key) => t(`roles.${key as RoleTemplateKey}.name`))
                      .join(', ')}
                  </p>
                  {canManage && member.userId !== currentUserId ? (
                    <div className="mt-3">
                      <ConfirmAction
                        title={t('members.remove')}
                        description={t('members.removeConfirm', {
                          name: member.displayName ?? member.email,
                        })}
                        confirmLabel={t('members.remove')}
                        successMessage={t('members.removeSuccess')}
                        onConfirm={() => handleRemove(member.membershipId)}
                        trigger={
                          <Button type="button" variant="ghost" size="sm">
                            {t('members.remove')}
                          </Button>
                        }
                      />
                    </div>
                  ) : null}
                </div>
              )}
            />
          </div>
        )}
      </section>

      {canInvite ? (
        <section>
          <h2 className="text-base font-semibold">{t('invitations.title')}</h2>

          {pendingInvitations.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {pendingInvitations.map((invitation) => {
                const role = roleIdToKey[invitation.roleId] as RoleTemplateKey | undefined;
                return (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
                  >
                    <span>
                      <span dir="ltr">{invitation.email}</span>
                      {role ? ` · ${t(`roles.${role}.name`)}` : ''}
                    </span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRevoke(invitation.id)}>
                      {t('invitations.revoke')}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          <form action={inviteAction} className="mt-4 flex w-full max-w-md flex-col gap-3">
            {inviteState.error ? <Alert tone="danger">{inviteState.error}</Alert> : null}
            {inviteState.ok && !inviteState.invitationLink ? (
              <Alert tone="success" role="status" aria-live="polite">
                {t('invitations.sent', { email: inviteState.invitationEmail ?? '' })}
              </Alert>
            ) : null}

            <Field label={t('invitations.email')} required>
              {(props) => <Input {...props} name="email" type="email" dir="ltr" required />}
            </Field>

            <Field label={t('invitations.role')} required>
              {(props) => (
                <>
                  <input type="hidden" name="roleKey" value={roleKey} />
                  <Select value={roleKey} onValueChange={(value) => setRoleKey(value as RoleTemplateKey)}>
                    <SelectTrigger id={props.id} aria-describedby={props['aria-describedby']}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {inviteRoleOptions.map((key) => (
                        <SelectItem key={key} value={key}>
                          {t(`roles.${key}.name`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </Field>

            <Button type="submit" loading={invitePending}>
              {t('invitations.send')}
            </Button>
          </form>

          {inviteState.invitationLink ? (
            <div className="mt-4 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-4">
              <p className="text-sm font-medium">{t('invitations.linkFallbackTitle')}</p>
              <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                {t('invitations.linkFallbackBody', {
                  email: `\u2066${inviteState.invitationEmail ?? ''}\u2069`,
                  date: inviteState.invitationExpires
                    ? `\u2066${formatInstant(inviteState.invitationExpires, locale, timezone, { withTime: false })}\u2069`
                    : '',
                })}
              </p>
              <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Input
                  readOnly
                  value={inviteState.invitationLink}
                  className="min-w-0 flex-1 font-mono text-xs"
                  dir="ltr"
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={() => copyLink(inviteState.invitationLink!)}
                >
                  {copied ? tPeople('linkCopied') : tCommon('actions.copyLink')}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
