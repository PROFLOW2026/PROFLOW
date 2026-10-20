import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
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
import { textNavLinkMutedClassName } from '@/components/ui/pressable';

const EMPTY = '—';

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
    <MainAppPage>
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
              <StatusBadge shape={missingEvidenceShape()} label={t('list.evidenceMissing')} />
            ) : null}
            <span className="text-sm text-[var(--pf-text-secondary)]">
              {t(`kinds.${artifact.artifactKind}`)}
            </span>
          </>
        }
        breadcrumb={
          <Link href="/compliance" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
        actions={canManage && !artifact.archivedAt ? <ArchiveArtifactButton artifactId={artifact.id} /> : null}
      />

      {isMissingEvidence(artifact) ? (
        <MainAppSection>
          <Alert tone="warning">{t('detail.missingEvidence')}</Alert>
        </MainAppSection>
      ) : null}

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('form.kindLabel')}>
            {t(`kinds.${artifact.artifactKind}`)}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('form.subjectTypeLabel')}>
            {t(`subjects.${artifact.subjectType}`)}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('form.referenceLabel')}>
            {artifact.referenceNumber?.trim() ? (
              <span className="pf-ltr-island pf-entity-string" dir="ltr">
                {artifact.referenceNumber}
              </span>
            ) : (
              EMPTY
            )}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('form.issuerLabel')}>
            {artifact.issuer?.trim() ? artifact.issuer : EMPTY}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('form.expiresOnLabel')}>
            {artifact.expiresOn ? (
              <span className="pf-ltr-island" dir="ltr">
                {artifact.expiresOn}
              </span>
            ) : (
              t('list.noExpiry')
            )}
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
        {artifact.notes?.trim() ? (
          <p className="mt-3 text-start text-sm text-[var(--pf-text-secondary)]">{artifact.notes}</p>
        ) : null}
      </MainAppSection>

      {canManage ? (
        <MainAppSection title={t('detail.title')}>
          <ArtifactForm mode="edit" artifact={artifact} />
        </MainAppSection>
      ) : null}

      {(canCreateExpense || linkedExpenseId) && !artifact.archivedAt ? (
        <MainAppSection title={t('detail.financeSection')}>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('detail.financeHint')}</p>
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
        </MainAppSection>
      ) : null}

      <MainAppSection title={t('list.columns.evidence')}>
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
      </MainAppSection>
    </MainAppPage>
  );
}
