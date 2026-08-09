import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectsForOrg } from '@/modules/projects';
import { listVendorsForOrg } from '@/modules/vendors';
import { listEmployeesForOrg } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { ArtifactForm, type ComplianceSubjectOptions } from '../artifact-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'compliance' });
  return { title: t('create.title') };
}

async function loadSubjectOptions(): Promise<ComplianceSubjectOptions> {
  return withOrgContext(async (context) => {
    const [projects, vendors, employees] = await Promise.all([
      listProjectsForOrg(context, { includeArchived: false }).catch(() => []),
      listVendorsForOrg(context, {}).catch(() => []),
      listEmployeesForOrg(context, { status: 'active' }).catch(() => []),
    ]);
    return {
      projects: projects.map((project) => ({ id: project.id, name: project.name })),
      vendors: vendors.map((vendor) => ({ id: vendor.id, name: vendor.name })),
      employees: employees.map((employee) => ({
        id: employee.id,
        name: employee.name,
      })),
    };
  });
}

export default async function NewComplianceArtifactPage() {
  const t = await getTranslations('compliance');
  const subjects = await loadSubjectOptions();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <Link href="/compliance" className="text-sm text-[var(--pf-text-secondary)] hover:underline">
            {t('title')}
          </Link>
        }
      />
      <ArtifactForm mode="create" subjects={subjects} />
    </div>
  );
}
