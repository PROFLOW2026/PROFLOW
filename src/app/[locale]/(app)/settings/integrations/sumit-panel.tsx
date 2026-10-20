'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useState, useTransition, type FocusEvent } from 'react';
import { MainAppFormGrid, MainAppSection, mainAppFieldSpan } from '@/components/patterns/main-app';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  connectSumitTestAction,
  disconnectSumitTestAction,
} from './sumit-actions';
import { updateExpenseIngestionSettingsAction } from './expense-ingestion-actions';
import { isValidSumitCompanyIdInput } from './sumit-form-validation';
import type { ExpenseIngestionProvider } from '@/modules/expense-ingestion';

/** Prevent password managers from treating credential fields as login inputs. */
function unlockAutofillGuard(event: FocusEvent<HTMLInputElement>): void {
  event.currentTarget.removeAttribute('readonly');
}

export function SumitIntegrationPanel({
  connected,
  companyId,
  canManage,
  expenseIngestionProvider = 'none',
  ocrLive = false,
}: {
  connected: boolean;
  companyId: number | null;
  canManage: boolean;
  expenseIngestionProvider?: ExpenseIngestionProvider;
  ocrLive?: boolean;
}) {
  const t = useTranslations('invoicingIntegration');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [companyIdInput, setCompanyIdInput] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <MainAppSection
      title={t('settings.sumitTitle')}
      actions={
        <StatusBadge
          shape={connected ? 'active' : 'void'}
          label={connected ? t('status.providerConnected') : t('status.connectionRequired')}
        />
      }
    >
      <div className="flex w-full min-w-0 flex-col gap-4 text-sm">
        <p className="text-[var(--pf-text-secondary)]">{t('settings.sumitDescription')}</p>
        <details className="text-xs text-[var(--pf-text-muted)]">
          <summary className="cursor-pointer font-medium text-[var(--pf-text-secondary)]">
            {t('settings.sumitTechnicalSummary')}
          </summary>
          <p className="mt-2">{t('settings.sumitTechnicalNote')}</p>
        </details>
        <Alert tone="warning">{t('settings.testOnlyNotice')}</Alert>
        {connected && companyId != null ? (
          <p className="text-[var(--pf-text-secondary)]">
            {t('settings.connectedAs', { companyId })}
          </p>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {canManage && !connected ? (
          <form
            className="flex w-full min-w-0 flex-col gap-4"
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
            <MainAppFormGrid dense className="gap-4">
              <Field label={t('settings.companyId')} className={mainAppFieldSpan.lg}>
                {(control) => (
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
                    aria-describedby={control['aria-describedby']}
                  />
                )}
              </Field>
              <Field label={t('settings.apiKey')} className={mainAppFieldSpan.lg}>
                {(control) => (
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
                    aria-describedby={control['aria-describedby']}
                  />
                )}
              </Field>
              <div className={mainAppFieldSpan.full}>
                <Button type="submit" disabled={pending}>
                  {t('settings.connect')}
                </Button>
              </div>
            </MainAppFormGrid>
          </form>
        ) : null}
        {connected ? (
          <div className="flex flex-col gap-4 rounded-md border border-[var(--pf-border-default)] p-3">
            <p className="font-medium">{t('settings.expenseIngestionTitle')}</p>
            <p className="text-[var(--pf-text-secondary)]">
              {t('settings.expenseIngestionDescription')}
            </p>
            {!ocrLive ? (
              <Alert tone="warning">{t('settings.expenseIngestionOcrRequired')}</Alert>
            ) : null}
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={expenseIngestionProvider === 'sumit' ? 'primary' : 'secondary'}
                  disabled={pending || !ocrLive}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await updateExpenseIngestionSettingsAction({
                        provider: 'sumit',
                      });
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                >
                  {t('settings.expenseIngestionEnable')}
                </Button>
                <Button
                  type="button"
                  variant={expenseIngestionProvider === 'none' ? 'primary' : 'secondary'}
                  disabled={pending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await updateExpenseIngestionSettingsAction({
                        provider: 'none',
                      });
                      if (result.error) {
                        setError(result.error);
                        return;
                      }
                      router.refresh();
                    });
                  }}
                >
                  {t('settings.expenseIngestionDisable')}
                </Button>
              </div>
            ) : expenseIngestionProvider === 'sumit' ? (
              <StatusBadge shape="active" label={t('settings.expenseIngestionEnabled')} />
            ) : (
              <StatusBadge shape="void" label={t('settings.expenseIngestionDisabled')} />
            )}
          </div>
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
      </div>
    </MainAppSection>
  );
}
