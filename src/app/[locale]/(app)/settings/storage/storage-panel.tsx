'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import type { StorageConnectionRecord, StorageProviderKey } from '@/modules/external-storage/client';
import { readProjectTemplateCapability } from '@/modules/external-storage/client';
import type { StorageProvisionProgress } from '@/modules/external-storage/domain/project-folder-placement';
import { formatFileSize } from '@/modules/documents/domain/format-file-size';
import {
  disconnectStorageConnectionAction,
  setPrimaryStorageConnectionAction,
  validateStorageConnectionAction,
  approveProjectTemplateAction,
  openProjectTemplateAction,
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

function storageLastErrorMessage(
  lastError: string | null | undefined,
  t: ReturnType<typeof useTranslations<'externalStorage'>>,
): string | null {
  if (!lastError) return null;
  if (lastError === 'root_folder_missing') return t('errors.rootFolderMissing');
  if (lastError.startsWith('provision_kick_failed')) return t('errors.provisionKickFailed');
  if (lastError === 'unauthorized' || lastError === 'token_expired' || lastError === 'missing_credentials') {
    return t('errors.reconnectRequired');
  }
  return lastError;
}

export function StorageSettingsPanel({
  connections,
  configuredProviders,
  storageActive,
  canManage,
  provisionProgress,
}: {
  connections: readonly StorageConnectionRecord[];
  configuredProviders: readonly StorageProviderKey[];
  storageActive: boolean;
  canManage: boolean;
  provisionProgress: Readonly<Record<string, StorageProvisionProgress>>;
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
          const template =
            connection && status === 'connected'
              ? readProjectTemplateCapability(connection.capabilitiesJson)
              : null;
          const progress = connection ? provisionProgress[connection.id] : undefined;
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
                  (status === 'reconnect_required' ||
                    status === 'error' ||
                    connection.lastError.startsWith('provision_kick_failed')) ? (
                    <Alert tone="warning">
                      {storageLastErrorMessage(connection.lastError, t) ?? connection.lastError}
                    </Alert>
                  ) : null}
                  {connection &&
                  status === 'connected' &&
                  !connection.isPrimary &&
                  !storageActive ? (
                    <Alert tone="warning">{t('primaryRequiredNotice')}</Alert>
                  ) : null}
                  {connection && template && template.status !== 'approved' ? (
                    <ProjectTemplateGate
                      connectionId={connection.id}
                      status={template.status}
                      canManage={canManage}
                      pending={pending}
                      startTransition={startTransition}
                      router={router}
                      t={t}
                    />
                  ) : connection && progress ? (
                    <StorageProvisionStatus progress={progress} t={t} />
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

function ProjectTemplateGate({
  connectionId,
  status,
  canManage,
  pending,
  startTransition,
  router,
  t,
}: {
  connectionId: string;
  status: 'pending_approval' | 'editing';
  canManage: boolean;
  pending: boolean;
  startTransition: (fn: () => Promise<void>) => void;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations<'externalStorage'>>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-[var(--pf-border)] bg-[var(--pf-surface-muted)] p-3">
      <p className="font-medium text-[var(--pf-text)]">
        {status === 'editing'
          ? t('templateGate.waitingApproval')
          : t('templateGate.connectedNeedChoice')}
      </p>
      <p className="text-[var(--pf-text-secondary)]">{t('templateGate.explanation')}</p>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          {status === 'editing' ? (
            <Button
              type="button"
              size="sm"
              loading={pending}
              onClick={() =>
                startTransition(async () => {
                  await approveProjectTemplateAction(connectionId);
                  router.refresh();
                })
              }
            >
              {t('actions.templateReadyConfirm')}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    await approveProjectTemplateAction(connectionId);
                    router.refresh();
                  })
                }
              >
                {t('actions.useReadyTemplate')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                loading={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await openProjectTemplateAction(connectionId);
                    if (result.webUrl) {
                      window.open(result.webUrl, '_blank', 'noopener,noreferrer');
                    }
                    router.refresh();
                  })
                }
              >
                {t('actions.openProjectTemplate')}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StorageProvisionStatus({
  progress,
  t,
}: {
  progress: StorageProvisionProgress;
  t: ReturnType<typeof useTranslations<'externalStorage'>>;
}) {
  if (progress.state === 'ready') {
    return <p className="text-[var(--pf-text-secondary)]">{t('provisioning.ready')}</p>;
  }
  return (
    <div className="flex flex-col gap-1 text-[var(--pf-text-secondary)]">
      <p>{t('provisioning.preparingProjects')}</p>
      <p>{t('provisioning.clients', { done: progress.clientsProvisioned, total: progress.clientsTotal })}</p>
      <p>{t('provisioning.projects', { done: progress.projectsProvisioned, total: progress.projectsTotal })}</p>
      <p>{t('provisioning.folders', { done: progress.projectFoldersProvisioned, total: progress.projectFoldersTotal })}</p>
      <p>{t('provisioning.pending')}</p>
    </div>
  );
}
