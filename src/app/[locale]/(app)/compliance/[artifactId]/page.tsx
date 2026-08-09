import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { getComplianceArtifactById } from '@/modules/compliance';
import { complianceStatusShape } from '@/modules/compliance/ui';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ArchiveArtifactButton } from '../archive-artifact-button';
import { ArtifactForm } from '../artifact-form';

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

  let artifact;
  let canManage = false;

  try {
    const result = await withOrgContext(async (context) => ({
      artifact: await getComplianceArtifactById(context, artifactId),
      canManage: hasPermission(context, PERMISSIONS.COMPLIANCE_MANAGE),
    }));
    artifact = result.artifact;
    canManage = result.canManage;
  } catch {
    notFound();
  }

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
    </div>
  );
}
