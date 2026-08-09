import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Alert } from '@/components/ui/alert';
import { getComplianceArtifactById, isMissingEvidence } from '@/modules/compliance';
import { complianceStatusShape, missingEvidenceShape } from '@/modules/compliance/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ArchiveArtifactButton } from '../archive-artifact-button';
import { ArtifactForm } from '../artifact-form';
import { ComplianceDocumentAttachments } from './compliance-document-attachments';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; artifactId: string }>;
}): Promise<Metadata> {
  const { locale, artifactId } = await params;
  const t = await getTranslations({ locale, namespace: 'compliance' });

  try {
    const artifact = await withOrgContext((context) => getComplianceArtifactById(context, artifactId));
    return { title: artifact.name };
  } catch {
    return { title: t('detail.title') };
  }
}

export default async function ComplianceArtifactPage({
  params,
}: {
  params: Promise<{ artifactId: string }>;
}) {
  const { artifactId } = await params;
  const t = await getTranslations('compliance');
  const tStatus = await getTranslations('status.compliance');

  const loaded = await withOrgContext(async (context) => {
    try {
      const artifact = await getComplianceArtifactById(context, artifactId);
      const documentsPanel = await getEntityDocumentPanelData(
        context,
        'compliance_artifact',
        artifactId,
      );
      return {
        artifact,
        documentsPanel,
        canManage: hasPermission(context, PERMISSIONS.COMPLIANCE_MANAGE),
      };
    } catch {
      return null;
    }
  });

  if (!loaded) notFound();

  const { artifact, documentsPanel, canManage } = loaded;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={artifact.name}
        description={t('detail.title')}
        meta={
          <>
            <StatusBadge
              shape={complianceStatusShape(artifact.status)}
              label={tStatus(artifact.status)}
            />
            {isMissingEvidence(artifact) ? (
              <StatusBadge
                shape={missingEvidenceShape()}
                label={t('list.evidenceMissing')}
              />
            ) : null}
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {t(`kinds.${artifact.artifactKind}`)}
            </span>
          </>
        }
        breadcrumb={
          <Link href="/compliance" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
        actions={canManage && !artifact.archivedAt ? <ArchiveArtifactButton artifactId={artifact.id} /> : null}
      />

      {isMissingEvidence(artifact) ? (
        <Alert tone="warning">{t('detail.missingEvidence')}</Alert>
      ) : null}

      {canManage ? (
        <ArtifactForm mode="edit" artifact={artifact} />
      ) : (
        <dl className="grid max-w-lg gap-3 text-sm">
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('form.kindLabel')}</dt>
            <dd>{t(`kinds.${artifact.artifactKind}`)}</dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('form.subjectTypeLabel')}</dt>
            <dd>{t(`subjects.${artifact.subjectType}`)}</dd>
          </div>
          {artifact.referenceNumber ? (
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('form.referenceLabel')}</dt>
              <dd>{artifact.referenceNumber}</dd>
            </div>
          ) : null}
          {artifact.issuer ? (
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('form.issuerLabel')}</dt>
              <dd>{artifact.issuer}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[var(--pf-text-secondary)]">{t('form.expiresOnLabel')}</dt>
            <dd>{artifact.expiresOn ?? t('list.noExpiry')}</dd>
          </div>
          {artifact.notes ? (
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('form.notesLabel')}</dt>
              <dd>{artifact.notes}</dd>
            </div>
          ) : null}
        </dl>
      )}

      <ComplianceDocumentAttachments
        artifactId={artifact.id}
        ownerType="compliance_artifact"
        ownerId={artifact.id}
        documents={documentsPanel.documents}
        linkCandidates={documentsPanel.linkCandidates}
        canRead={documentsPanel.canRead}
        canManage={documentsPanel.canManage && canManage}
        storageConfigured={documentsPanel.storageConfigured}
      />
    </div>
  );
}
