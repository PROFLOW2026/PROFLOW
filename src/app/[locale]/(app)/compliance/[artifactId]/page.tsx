import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Alert } from '@/components/ui/alert';
import { getComplianceArtifactById, isMissingEvidence } from '@/modules/compliance';
import { complianceStatusShape, missingEvidenceShape } from '@/modules/compliance/ui';
import { getEntityDocumentPanelData } from '@/modules/documents';
import { peekOpsExpenseLinksForRecords } from '@/modules/ops-finance';
import { CreateLinkedExpenseForm } from '@/modules/ops-finance/ui/create-linked-expense-form';
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
      const links = await peekOpsExpenseLinksForRecords(context, 'compliance_artifact', [
        artifactId,
      ]);
      return {
        artifact,
        documentsPanel,
        linkedExpenseId: links[0]?.expenseId ?? null,
        canManage: hasPermission(context, PERMISSIONS.COMPLIANCE_MANAGE),
        canCreateExpense: hasPermission(context, PERMISSIONS.EXPENSES_CREATE),
        baseCurrency: context.organization.baseCurrency,
      };
    } catch {
      return null;
    }
  });

  if (!loaded) notFound();

  const { artifact, documentsPanel, canManage, canCreateExpense, linkedExpenseId, baseCurrency } =
    loaded;

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
          <Link href="/compliance" className="text-sm text-[var(--pf-text-secondary)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]">
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
              <dd>
                <span className="pf-ltr-island pf-entity-string" dir="ltr">
                  {artifact.referenceNumber}
                </span>
              </dd>
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
            <dd>
              {artifact.expiresOn ? (
                <span className="pf-ltr-island" dir="ltr">
                  {artifact.expiresOn}
                </span>
              ) : (
                t('list.noExpiry')
              )}
            </dd>
          </div>
          {artifact.notes ? (
            <div>
              <dt className="text-[var(--pf-text-secondary)]">{t('form.notesLabel')}</dt>
              <dd>{artifact.notes}</dd>
            </div>
          ) : null}
        </dl>
      )}

      {(canCreateExpense || linkedExpenseId) && !artifact.archivedAt ? (
        <section className="rounded-lg border border-[var(--pf-border-default)] p-4">
          <h2 className="font-semibold">{t('detail.financeSection')}</h2>
          <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('detail.financeHint')}</p>
          <div className="mt-3">
            <CreateLinkedExpenseForm
              namespace="compliance"
              opsRecordKind="compliance_artifact"
              opsRecordId={artifact.id}
              defaultCurrency={baseCurrency}
              defaultDescription={artifact.name}
              showAllocationFields={artifact.artifactKind === 'insurance'}
              existingExpenseId={linkedExpenseId}
              revalidatePath={`/compliance/${artifact.id}`}
            />
          </div>
        </section>
      ) : null}

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
