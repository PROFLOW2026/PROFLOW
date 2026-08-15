import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import {
  DOCUMENT_OWNER_TYPES,
  isStorageConfigured,
  listDocumentsForOrg,
  listFolders,
  type DocumentOwnerType,
} from '@/modules/documents';
import { DocumentFoldersPanel } from '@/modules/documents/ui';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { OcrEntryLink } from '@/modules/ocr/ui/ocr-entry-link';
import { DocumentListFilters } from './document-list-filters';
import { DocumentOrgList } from './document-org-list';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'documents' });
  return { title: t('title') };
}

function parseOwnerType(raw: string | undefined): DocumentOwnerType | 'all' {
  if (!raw || raw === 'all') return 'all';
  return (DOCUMENT_OWNER_TYPES as readonly string[]).includes(raw)
    ? (raw as DocumentOwnerType)
    : 'all';
}

function parseFolderId(raw: string | undefined): string | 'all' | 'none' {
  if (!raw || raw === 'all') return 'all';
  if (raw === 'none') return 'none';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return raw;
  }
  return 'all';
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ownerType?: string; folderId?: string }>;
}) {
  const [t, tCommon, search, shell] = await Promise.all([
    getTranslations('documents'),
    getTranslations('common'),
    searchParams,
    getShellContext(),
  ]);
  const { q, ownerType: ownerTypeRaw, folderId: folderIdRaw } = search;
  const ownerType = parseOwnerType(ownerTypeRaw);
  const folderId = parseFolderId(folderIdRaw);
  const filtersActive = Boolean(q?.trim()) || ownerType !== 'all' || folderId !== 'all';
  const storageConfigured = isStorageConfigured();
  const vendorsEnabled = Boolean(shell?.modules?.vendors);

  const loaded = await withOrgContext(async (context) => {
    const [documents, folders] = await Promise.all([
      listDocumentsForOrg(context, {
        search: q,
        ownerType,
        folderId,
      }),
      listFolders(context, {}),
    ]);
    return {
      documents,
      folders,
      canRead: hasPermission(context, PERMISSIONS.DOCUMENTS_READ),
      canManage: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<OcrEntryLink workflow="general" />}
      />

      {!storageConfigured ? <Alert tone="info">{t('storageNotConfigured')}</Alert> : null}

      <DocumentListFilters
        initialQuery={q ?? ''}
        initialOwnerType={ownerType}
        initialFolderId={folderId}
        folders={loaded.folders}
      />

      <DocumentFoldersPanel
        folders={loaded.folders}
        canManage={loaded.canManage}
        selectedFolderId={folderId}
      />

      {loaded.documents.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', { query: q?.trim() || t('list.filterActive') })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href="/documents">{tCommon('actions.clearFilters')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FileText}
            title={t('empty.title')}
            description={t('empty.body')}
            action={
              <Button asChild variant="secondary">
                <Link href="/projects">{t('empty.action')}</Link>
              </Button>
            }
          />
        )
      ) : (
        <DocumentOrgList
          documents={loaded.documents}
          canRead={loaded.canRead}
          canManage={loaded.canManage}
          storageConfigured={storageConfigured}
          folders={loaded.folders}
        />
      )}

      {loaded.documents.length > 0 && vendorsEnabled ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">
          {t('list.hint')}{' '}
          <Link href="/vendors" className="underline">
            {t('list.hintLink')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
