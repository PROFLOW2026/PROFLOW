import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('forms');

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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div>
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
    </div>
  );
}
