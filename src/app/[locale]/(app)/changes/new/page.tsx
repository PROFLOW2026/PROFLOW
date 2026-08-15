import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { ChangeRequestForm } from '@/modules/commercial/ui/change-request-form';
import { listContractsForProjects, listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createChangeRequestAction } from '../actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('changes');
  return { title: t('form.createTitle') };
}

export default async function NewChangePage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const t = await getTranslations('changes');
  const { projectId } = await searchParams;

  const { projects, contracts } = await withOrgContext(async (context) => {
    const listed = await listProjectsForOrg(context, { status: 'active' });
    const liveContracts = hasPermission(context, PERMISSIONS.CONTRACTS_READ)
      ? await listContractsForProjects(
          context.db,
          context.organizationId,
          listed.map((project) => project.id),
        )
      : [];
    return {
      projects: listed,
      contracts: liveContracts.map((contract) => ({
        id: contract.id,
        projectId: contract.projectId,
        name: contract.name,
        contractNumber: contract.contractNumber,
        isPrimary: contract.isPrimary,
        contractType: contract.contractType,
        status: contract.status,
      })),
    };
  });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t('form.createTitle')} description={t('form.createDescription')} />
      <ChangeRequestForm
        action={createChangeRequestAction}
        projectId={projectId}
        projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        contracts={contracts}
      />
    </div>
  );
}
