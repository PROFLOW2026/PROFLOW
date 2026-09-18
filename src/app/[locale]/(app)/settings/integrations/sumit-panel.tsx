'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useState, useTransition } from 'react';
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
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              startTransition(async () => {
                const result = await connectSumitTestAction({
                  companyId: Number(companyIdInput),
                  apiKey: apiKeyInput,
                });
                if (result.error) {
                  setError(result.error);
                  return;
                }
                setApiKeyInput('');
                router.refresh();
              });
            }}
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor="sumit-company-id">{t('settings.companyId')}</Label>
              <Input
                id="sumit-company-id"
                inputMode="numeric"
                value={companyIdInput}
                onChange={(event) => setCompanyIdInput(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="sumit-api-key">{t('settings.apiKey')}</Label>
              <Input
                id="sumit-api-key"
                type="password"
                autoComplete="off"
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
