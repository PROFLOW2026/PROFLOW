import { FileText } from 'lucide-react';

import type { Metadata } from 'next';

import { getTranslations } from 'next-intl/server';

import { Alert } from '@/components/ui/alert';

import { Button } from '@/components/ui/button';

import { EmptyState } from '@/components/ui/empty-state';

import { PageHeader } from '@/components/ui/page-header';

import { StatusBadge } from '@/components/ui/status-badge';

import { Card, CardContent } from '@/components/ui/card';

import { isStorageConfigured, listDocumentsForOrg } from '@/modules/documents';

import { formatFileSize } from '@/modules/documents/domain/format-file-size';

import { getShellContext, withOrgContext } from '@/shared/auth/session';

import { Link } from '@/shared/i18n/navigation';

import { DocumentListFilters } from './document-list-filters';



export async function generateMetadata({

  params,

}: {

  params: Promise<{ locale: string }>;

}): Promise<Metadata> {

  const { locale } = await params;

  const t = await getTranslations({ locale, namespace: 'documents' });

  return { title: t('title') };

}



function documentStatusShape(status: string): 'pending' | 'active' | 'void' {

  if (status === 'pending') return 'pending';

  if (status === 'deleted') return 'void';

  return 'active';

}



export default async function DocumentsPage({

  searchParams,

}: {

  searchParams: Promise<{ q?: string }>;

}) {

  const t = await getTranslations('documents');

  const tCommon = await getTranslations('common');

  const tFileSize = await getTranslations('documents.fileSize');

  const { q } = await searchParams;

  const filtersActive = Boolean(q?.trim());

  const storageConfigured = isStorageConfigured();

  const shell = await getShellContext();

  const vendorsEnabled = Boolean(shell?.modules?.vendors);



  const documents = await withOrgContext((context) =>

    listDocumentsForOrg(context, { search: q }),

  );



  return (

    <div className="flex flex-col gap-6">

      <PageHeader title={t('title')} description={t('description')} />



      {!storageConfigured ? <Alert tone="info">{t('storageNotConfigured')}</Alert> : null}



      <DocumentListFilters initialQuery={q ?? ''} />



      {documents.length === 0 ? (

        filtersActive ? (

          <EmptyState

            title={tCommon('states.noResultsForQuery', { query: q?.trim() ?? '' })}

            description={tCommon('states.noResultsHint')}

            action={

              <Button asChild variant="secondary">

                <Link href="/documents">{tCommon('actions.clearSearch')}</Link>

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

        <div className="flex flex-col gap-3">

          {documents.map((document) => (

            <Card key={document.id}>

              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">

                <div className="min-w-0">

                  <p className="truncate font-medium">{document.originalFilename}</p>

                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    <span dir="ltr" className="pf-numeric">
                      {formatFileSize(document.sizeBytes, tFileSize)}
                    </span>
                    {document.label ? ` · ${document.label}` : ''}
                  </p>

                </div>

                <StatusBadge

                  shape={documentStatusShape(document.status)}

                  label={t(`status.${document.status}`)}

                />

              </CardContent>

            </Card>

          ))}

        </div>

      )}



      {documents.length > 0 && vendorsEnabled ? (

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


