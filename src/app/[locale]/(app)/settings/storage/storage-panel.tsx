'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StorageConnectionRecord, StorageProviderKey } from '@/modules/external-storage/client';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import {
  disconnectStorageConnectionAction,
  setPrimaryStorageConnectionAction,
  validateStorageConnectionAction,
} from './actions';

const PROVIDERS: StorageProviderKey[] = ['onedrive', 'google_drive', 'dropbox', 'box'];

function statusShape(
  status: StorageConnectionRecord['status'],
): 'pending' | 'active' | 'void' {
  if (status === 'connected') return 'active';
  if (status === 'connecting') return 'pending';
  return 'void';
}

function canManageConnection(status: StorageConnectionRecord['status']): boolean {
  return status !== 'disconnected';
}

function connectActionLabel(
  status: StorageConnectionRecord['status'],
  labels: { connect: string; reconnect: string },
): string {
  if (status === 'connected' || status === 'reconnect_required' || status === 'error') {
    return labels.reconnect;
  }
  return labels.connect;
}

export function StorageSettingsPanel({
  connections,
  configuredProviders,
  storageActive,
  canManage,
}: {
  connections: readonly StorageConnectionRecord[];
  configuredProviders: readonly StorageProviderKey[];
  storageActive: boolean;
  canManage: boolean;
}) {
  const t = useTranslations('externalStorage');
  const tStatus = useTranslations('externalStorage.status');
  const tFileSize = useTranslations('documents.fileSize');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const byProvider = new Map(connections.map((c) => [c.provider, c]));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      <ul className="flex flex-col gap-3">
        {PROVIDERS.map((provider) => {
          const connection = byProvider.get(provider);
          const configured = configuredProviders.includes(provider);
          const status = connection?.status ?? 'disconnected';
          return (
            <li key={provider}>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                  <CardTitle className="text-base">{t(`providers.${provider}`)}</CardTitle>
                  <StatusBadge shape={statusShape(status)} label={tStatus(status)} />
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  {connection?.externalAccountEmail ? (
                    <p className="text-[var(--pf-text-secondary)]">{connection.externalAccountEmail}</p>
                  ) : null}
                  {connection?.quotaTotalBytes != null && connection.quotaUsedBytes != null ? (
                    <p className="text-[var(--pf-text-secondary)]">
                      {t('quota.used', {
                        used: formatFileSize(connection.quotaUsedBytes, tFileSize),
                      })}{' '}
                      ·{' '}
                      {t('quota.available', {
                        available: formatFileSize(
                          connection.quotaTotalBytes - connection.quotaUsedBytes,
                          tFileSize,
                        ),
                      })}
                    </p>
                  ) : status === 'connected' ? (
                    <p className="text-[var(--pf-text-secondary)]">{t('quota.unknown')}</p>
                  ) : null}
                  {!configured ? (
                    <Alert tone="info">{t('errors.providerNotConfigured')}</Alert>
                  ) : null}
                  {connection?.lastError &&
                  (status === 'reconnect_required' || status === 'error') ? (
                    <Alert tone="warning">{connection.lastError}</Alert>
                  ) : null}
                  {connection &&
                  status === 'connected' &&
                  !connection.isPrimary &&
                  !storageActive ? (
                    <Alert tone="warning">{t('primaryRequiredNotice')}</Alert>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {canManage && configured ? (
                      <Button
                        asChild
                        size="sm"
                        variant={status === 'connected' ? 'secondary' : 'primary'}
                        disabled={pending || status === 'connecting'}
                      >
                        <a href={`/api/org-storage/oauth/${provider}/start`}>
                          {connectActionLabel(status, {
                            connect: t('actions.connect'),
                            reconnect: t('actions.reconnect'),
                          })}
                        </a>
                      </Button>
                    ) : null}
                    {canManage && connection && status === 'connected' ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          loading={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await validateStorageConnectionAction(connection.id);
                              router.refresh();
                            })
                          }
                        >
                          {t('actions.validate')}
                        </Button>
                        {!connection.isPrimary ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            loading={pending}
                            onClick={() =>
                              startTransition(async () => {
                                await setPrimaryStorageConnectionAction(connection.id);
                                router.refresh();
                              })
                            }
                          >
                            {t('actions.setPrimary')}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                    {canManage && connection && canManageConnection(status) ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        loading={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await disconnectStorageConnectionAction(connection.id);
                            router.refresh();
                          })
                        }
                      >
                        {t('actions.disconnect')}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
