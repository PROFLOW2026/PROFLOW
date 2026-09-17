'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EMPLOYEE_PRESETS } from '@/modules/employee-app/application/presets';
import {
  activateEmployeeAppAction,
  blockEmployeeAppAction,
  disableEmployeeAppAction,
  resetEmployeeAppPinAction,
  resumeEmployeeAppAction,
  revokeEmployeeAppSessionsAction,
  suspendEmployeeAppAction,
} from '@/app/[locale]/(app)/workforce/employees/employee-app-actions';
import type { EmployeeAppAccountRecord } from '@/modules/employee-app/domain/types';

interface Props {
  readonly employeeId: string;
  readonly account: EmployeeAppAccountRecord | null;
}

export function EmployeeAppAccessPanel({ employeeId, account }: Props) {
  const t = useTranslations('employeeApp.admin');
  const tStatus = useTranslations('employeeApp.status');
  const [credentials, setCredentials] = useState<{ username: string; pin: string; loginPath: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<unknown>) {
    startTransition(() => {
      void action();
    });
  }

  return (
    <Card className="space-y-4 p-4">
      <h2 className="text-lg font-semibold">{t('title')}</h2>

      {account ? (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[var(--pf-text-secondary)]">{t('status')}</dt>
          <dd>{tStatus(account.status)}</dd>
          <dt className="text-[var(--pf-text-secondary)]">{t('username')}</dt>
          <dd>{account.username}</dd>
          {account.firstLoginAt ? (
            <>
              <dt className="text-[var(--pf-text-secondary)]">{t('firstLogin')}</dt>
              <dd>{account.firstLoginAt.toLocaleString('he-IL')}</dd>
            </>
          ) : null}
          {account.lastLoginAt ? (
            <>
              <dt className="text-[var(--pf-text-secondary)]">{t('lastLogin')}</dt>
              <dd>{account.lastLoginAt.toLocaleString('he-IL')}</dd>
            </>
          ) : null}
          {account.temporaryPinExpiresAt ? (
            <>
              <dt className="text-[var(--pf-text-secondary)]">{t('tempPinExpiry')}</dt>
              <dd>{account.temporaryPinExpiresAt.toLocaleString('he-IL')}</dd>
            </>
          ) : null}
        </dl>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!account || account.status === 'inactive' ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await activateEmployeeAppAction(employeeId, 'field_worker');
                setCredentials({
                  username: result.username,
                  pin: result.temporaryPin,
                  loginPath: result.loginPath,
                });
              })
            }
          >
            {t('activate')}
          </Button>
        ) : null}
        {account && account.status === 'active' ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => suspendEmployeeAppAction(employeeId))}>
            {t('suspend')}
          </Button>
        ) : null}
        {account && account.status === 'suspended' ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => resumeEmployeeAppAction(employeeId))}>
            {t('resume')}
          </Button>
        ) : null}
        {account && account.status !== 'blocked' ? (
          <Button type="button" variant="danger" disabled={pending} onClick={() => run(() => blockEmployeeAppAction(employeeId))}>
            {t('block')}
          </Button>
        ) : null}
        {account ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const result = await resetEmployeeAppPinAction(employeeId);
                  setCredentials({
                    username: account.username,
                    pin: result.temporaryPin,
                    loginPath: `/${'he-IL'}/employee/login?org=${account.organizationId}`,
                  });
                })
              }
            >
              {t('resetPin')}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => revokeEmployeeAppSessionsAction(employeeId))}>
              {t('revokeSessions')}
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => disableEmployeeAppAction(employeeId))}>
              {t('disable')}
            </Button>
          </>
        ) : null}
      </div>

      {credentials ? (
        <div className="rounded-lg border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3 text-sm">
          <p className="font-medium">{t('credentialsTitle')}</p>
          <p>
            {t('username')}: <strong>{credentials.username}</strong>
          </p>
          <p>
            PIN: <strong>{credentials.pin}</strong>
          </p>
          <p className="break-all text-[var(--pf-text-secondary)]">{credentials.loginPath}</p>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium">{t('preset')}</p>
        <p className="text-xs text-[var(--pf-text-secondary)]">
          {EMPLOYEE_PRESETS.map((preset) => preset.labelKey).join(' · ')}
        </p>
      </div>
    </Card>
  );
}
