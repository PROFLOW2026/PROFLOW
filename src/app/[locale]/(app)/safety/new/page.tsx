import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listProjectsForOrg } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { SafetyRecordForm } from '../safety-record-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'safety' });
  return { title: t('create.title') };
}

export default async function NewSafetyRecordPage({
  searchParams,
}: {
  searchParams: Promise<{
    fromDailyLogId?: string;
    projectId?: string;
    title?: string;
    description?: string;
  }>;
}) {
  const t = await getTranslations('safety');
  const params = await searchParams;
  const projects = await withOrgContext(async (context) => {
    const rows = await listProjectsForOrg(context, {}).catch(() => []);
    return rows.map((project) => ({ id: project.id, name: project.name }));
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('create.title')}
        description={t('create.description')}
        breadcrumb={
          <Link href="/safety" className={textNavLinkMutedClassName}>
            {t('title')}
          </Link>
        }
      />
      <SafetyRecordForm
        mode="create"
        projects={projects}
        defaultOccurredAt={new Date()}
        defaults={{
          fromDailyLogId: params.fromDailyLogId,
          projectId: params.projectId,
          title: params.title,
          description: params.description,
        }}
      />
    </div>
  );
}
