'use client';

import { Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/shared/i18n/navigation';
import { useState, useTransition } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { DocumentFolder, DocumentOwnerType } from '../domain/types';
import { createDocumentFolderAction } from '../application/document-actions';

export interface DocumentFoldersPanelProps {
  folders: readonly DocumentFolder[];
  canManage: boolean;
  ownerType?: DocumentOwnerType | null;
  ownerId?: string | null;
  selectedFolderId?: string | 'all' | 'none';
  onSelectFolder?: (folderId: string | 'all') => void;
  loading?: boolean;
  error?: string | null;
  embedded?: boolean;
}

export function DocumentFoldersPanel({
  folders,
  canManage,
  ownerType,
  ownerId,
  selectedFolderId = 'all',
  onSelectFolder,
  loading = false,
  error = null,
  embedded = false,
}: DocumentFoldersPanelProps) {
  const t = useTranslations('documents.folders');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setLocalError(null);
    startTransition(async () => {
      const result = await createDocumentFolderAction({
        name: trimmed,
        ownerType: ownerType ?? null,
        ownerId: ownerId ?? null,
      });
      if (result.error) {
        setLocalError(result.error);
        return;
      }
      setName('');
      router.refresh();
    });
  };

  const body = (
    <div className="flex flex-col gap-3">
      {canManage ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label={t('namePlaceholder')} className="min-w-0 flex-1">
            {(control) => (
              <Input
                {...control}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('namePlaceholder')}
                maxLength={120}
                disabled={pending}
              />
            )}
          </Field>
          <Button type="button" size="sm" loading={pending} onClick={handleCreate} disabled={!name.trim()}>
            {t('create')}
          </Button>
        </div>
      ) : null}

      {localError || error ? (
        <Alert tone="danger" role="alert">
          {localError ?? error}
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--pf-text-secondary)]">
          <Spinner className="size-4" />
          {tCommon('states.loading')}
        </div>
      ) : null}

      {!loading && folders.length === 0 ? (
        <EmptyState size="sm" title={t('empty')} className="py-4" />
      ) : null}

      {!loading && folders.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {onSelectFolder ? (
            <li>
              <Button
                type="button"
                variant={selectedFolderId === 'all' ? 'secondary' : 'ghost'}
                size="sm"
                className="w-full justify-start"
                onClick={() => onSelectFolder('all')}
              >
                {t('all')}
              </Button>
            </li>
          ) : null}
          {folders.map((folder) => (
            <li key={folder.id}>
              {onSelectFolder ? (
                <Button
                  type="button"
                  variant={selectedFolderId === folder.id ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => onSelectFolder(folder.id)}
                >
                  <Folder className="size-4 shrink-0" aria-hidden />
                  <span className="truncate">{folder.name}</span>
                </Button>
              ) : (
                <p className="flex items-center gap-2 rounded-md px-3 py-2 text-sm">
                  <Folder className="size-4 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />
                  <span className="truncate">{folder.name}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">{t('title')}</p>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
