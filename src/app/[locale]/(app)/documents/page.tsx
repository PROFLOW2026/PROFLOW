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
  type DocumentOwnerType,
} from '@/modules/documents';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
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

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ownerType?: string }>;
}) {
  const t = await getTranslations('documents');
  const tCommon = await getTranslations('common');
  const { q, ownerType: ownerTypeRaw } = await searchParams;
  const ownerType = parseOwnerType(ownerTypeRaw);
  const filtersActive = Boolean(q?.trim()) || ownerType !== 'all';
  const storageConfigured = isStorageConfigured();
  const shell = await getShellContext();
  const vendorsEnabled = Boolean(shell?.modules?.vendors);

  const loaded = await withOrgContext(async (context) => {
    const documents = await listDocumentsForOrg(context, {
      search: q,
      ownerType,
    });
    return {
      documents,
      canRead: hasPermission(context, PERMISSIONS.DOCUMENTS_READ),
      canManage: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link
            href="/documents/ocr-review"
            className="text-sm font-medium text-[var(--pf-text-brand)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
          >
            {t('ocr.reviewLink')}
          </Link>
        }
      />

      {!storageConfigured ? <Alert tone="info">{t('storageNotConfigured')}</Alert> : null}

      <DocumentListFilters
        initialQuery={q ?? ''}
        initialOwnerType={ownerType}
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
