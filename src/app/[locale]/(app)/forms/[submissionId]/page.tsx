import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { DocumentAttachments } from '@/modules/documents/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import {
  documentOwnerForFormOwner,
  getFormSubmissionForOrg,
  getFormTemplateForOrg,
  type FormSubmissionStatus,
} from '@/modules/forms';
import { FormFillPanel } from '@/modules/forms/ui';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';

function statusShape(status: FormSubmissionStatus): StatusShape {
  switch (status) {
    case 'draft':
      return 'pending';
    case 'submitted':
      return 'completed';
    case 'void':
      return 'void';
    default:
      return 'archived';
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('forms');
  return { title: t('fill.title') };
}

export default async function FormSubmissionDetailPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
  const [t, locale] = await Promise.all([getTranslations('forms'), getLocale()]);

  const data = await withOrgContext(async (context) => {
    try {
      const submission = await getFormSubmissionForOrg(context, submissionId);
      const template = await getFormTemplateForOrg(context, submission.templateId);
      const docOwner = documentOwnerForFormOwner(submission.ownerType, submission.ownerId);
      const documentsPanel = docOwner
        ? await getEntityDocumentPanelData(context, docOwner.ownerType, docOwner.ownerId)
        : null;
      return {
        submission,
        template,
        docOwner,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.FORMS_MANAGE),
        canReadDocs: hasPermission(context, PERMISSIONS.DOCUMENTS_READ),
        canManageDocs: hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE),
      };
    } catch {
      return null;
    }
  });

  if (!data) notFound();

  const hasPhotoFields = data.template.schema.fields.some((field) => field.type === 'photo');

  return (
    <MainAppPage>
      <div className="min-w-0">
        <Link href="/forms" className={textNavLinkMutedClassName}>
          {t('list.title')}
        </Link>
        <PageHeader
          title={data.template.name}
          description={`${t(`ownerTypes.${data.submission.ownerType}`)} · ${t(`status.${data.submission.status}`)}`}
          actions={
            <StatusBadge
              shape={statusShape(data.submission.status)}
              label={t(`status.${data.submission.status}`)}
            />
          }
        />
      </div>

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('list.columns.template')}>{data.template.name}</MainAppSummaryItem>
          <MainAppSummaryItem label={t('new.ownerType')}>
            {t(`ownerTypes.${data.submission.ownerType}`)}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('list.columns.status')}>
            {t(`status.${data.submission.status}`)}
          </MainAppSummaryItem>
          {data.submission.submittedAt ? (
            <MainAppSummaryItem label={t('status.submitted')}>
              <span className="pf-ltr-island" dir="ltr">
                {intlDateTimeFormat(locale, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }).format(data.submission.submittedAt)}
              </span>
            </MainAppSummaryItem>
          ) : null}
        </MainAppSummaryGrid>
      </MainAppSection>

      <MainAppSection>
        <FormFillPanel
          submission={data.submission}
          template={data.template}
          canManage={data.canManage}
        />

        {hasPhotoFields ? (
          data.documentsPanel && data.docOwner ? (
            <DocumentAttachments
              ownerType={data.docOwner.ownerType}
              ownerId={data.docOwner.ownerId}
              documents={data.documentsPanel.documents}
              linkCandidates={data.documentsPanel.linkCandidates}
              canRead={data.canReadDocs}
              canManage={data.canManageDocs && data.submission.status === 'draft'}
              storageConfigured={data.documentsPanel.storageConfigured}
              titleKey="title"
            />
          ) : (
            <Alert tone="info" title={t('photoNote.title')}>
              {t('photoNote.body')}
            </Alert>
          )
        ) : null}
      </MainAppSection>
    </MainAppPage>
  );
}
