'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useState, useTransition, type FocusEvent } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  connectSumitTestAction,
  disconnectSumitTestAction,
} from './sumit-actions';
import { isValidSumitCompanyIdInput } from './sumit-form-validation';

/** Prevent password managers from treating credential fields as login inputs. */
function unlockAutofillGuard(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.removeAttribute('readonly');
}

export function SumitIntegrationPanel({
  connected,
  companyId,
  canManage,
}: {
  connected: boolean;
  companyId: number | null;
  canManage: boolean;
}) {
  const t = useTranslations('invoicingIntegration');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [companyIdInput, setCompanyIdInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{t('settings.sumitTitle')}</CardTitle>
        <StatusBadge
          shape={connected ? 'active' : 'void'}
          label={connected ? t('status.providerConnected') : t('status.connectionRequired')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p className="text-[var(--pf-text-secondary)]">{t('settings.sumitDescription')}</p>
        <Alert tone="warning">{t('settings.testOnlyNotice')}</Alert>
        {connected && companyId != null ? (
          <p className="text-[var(--pf-text-secondary)]">
            {t('settings.connectedAs', { companyId })}
          </p>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {canManage && !connected ? (
          <form
            className="flex flex-col gap-3"
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);

              if (!isValidSumitCompanyIdInput(companyIdInput)) {
                setError(t('settings.invalidCompanyId'));
                return;
              }

              startTransition(async () => {
                const result = await connectSumitTestAction({
                  companyId: Number(companyIdInput.trim()),
                  apiKey: apiKeyInput,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setCompanyIdInput('');
                setApiKeyInput('');
                router.refresh();
              });
            }}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-sumit-company-id">{t('settings.companyId')}</Label>
              <Input
                id="pf-sumit-company-id"
                name="pf-sumit-company-id"
                numeric
                inputMode="numeric"
                pattern="[0-9]+"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                readOnly
                onFocus={unlockAutofillGuard}
                value={companyIdInput}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, '');
                  setCompanyIdInput(next);
                }}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="pf-sumit-api-key">{t('settings.apiKey')}</Label>
              <Input
                id="pf-sumit-api-key"
                name="pf-sumit-api-key"
                type="password"
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                readOnly
                onFocus={unlockAutofillGuard}
                value={apiKeyInput}
                onChange={(event) => setApiKeyInput(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={pending}>
              {t('settings.connect')}
            </Button>
          </form>
        ) : null}
        {canManage && connected ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await disconnectSumitTestAction();
                if (result.error) {
                  setError(result.error);
                  return;
                }
                router.refresh();
              });
            }}
          >
            {t('settings.disconnect')}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
