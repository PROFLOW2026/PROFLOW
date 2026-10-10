'use client';

import { useFormatter, useTranslations } from 'next-intl';
import { useActionState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ConnectionInvitationSummary } from '../application/create-invitation';

export interface DeveloperConnectionActionState {
  readonly error?: string;
  readonly success?: string;
  readonly code?: string;
  readonly expiresAt?: string;
}

type IssueAction = (
  state: DeveloperConnectionActionState,
  formData: FormData,
) => Promise<DeveloperConnectionActionState>;

type RevokeAction = (
  state: DeveloperConnectionActionState,
  formData: FormData,
) => Promise<DeveloperConnectionActionState>;

export function DeveloperConnectionPanel(props: {
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly invitations: readonly ConnectionInvitationSummary[];
  readonly canIssue: boolean;
  readonly actions: { readonly issue: IssueAction; readonly revoke: RevokeAction };
}) {
  const t = useTranslations('connectedProjects.developer');
  const te = useTranslations('connectedProjects.errors');
  const format = useFormatter();
  const [issueState, issueAction, issuePending] = useActionState(props.actions.issue, {});
  const [revokeState, revokeAction, revokePending] = useActionState(props.actions.revoke, {});
  if (!props.canIssue) return null;
  if (!props.subcontractAgreementId) {
    return <Alert tone="info">{t('noAgreement')}</Alert>;
  }

  const displayCode = issueState.code;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('panelTitle')}</h3>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('panelHint')}</p>
      </div>

      {(issueState.error || revokeState.error) && (
        <Alert tone="danger">{issueState.error ?? revokeState.error}</Alert>
      )}
      {issueState.success && displayCode ? (
        <Alert tone="success" title={t('codeResultTitle')}>
          <p className="font-mono text-base tracking-wide">{displayCode}</p>
          <p className="text-sm">{t('codeResultHint')}</p>
          {issueState.expiresAt ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {t('expiresAt', { date: format.dateTime(new Date(issueState.expiresAt), { dateStyle: 'medium', timeStyle: 'short' }) })}
            </p>
          ) : null}
        </Alert>
      ) : null}

      <form action={issueAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="projectId" value={props.projectId} />
        <input type="hidden" name="vendorId" value={props.vendorId} />
        <input type="hidden" name="subcontractAgreementId" value={props.subcontractAgreementId} />
        <Button type="submit" disabled={issuePending}>
          {t('issue')}
        </Button>
      </form>

      {props.invitations.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">{t('history')}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {props.invitations.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-subtle)] px-2 py-1">
                <span>
                  {row.status} · {format.dateTime(row.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                {row.status === 'valid' || row.status === 'issued' ? (
                  <form action={revokeAction}>
                    <input type="hidden" name="projectId" value={props.projectId} />
                    <input type="hidden" name="invitationId" value={row.id} />
                    <Button type="submit" variant="ghost" size="sm" disabled={revokePending}>
                      {t('revoke')}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {issueState.error?.startsWith('connectedProjects') ? null : issueState.error ? (
        <span className="sr-only">{te('generic')}</span>
      ) : null}
    </section>
  );
}
