import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getHomeDashboard } from '@/modules/financials';
import { HomeDashboardContent } from '@/modules/financials/ui';
import { getShellContext, withOrgContext } from '@/shared/auth/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('title') };
}

export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const shell = await getShellContext();
  const name = shell?.user.displayName;

  const data = await withOrgContext((context) => getHomeDashboard(context));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={name ? t('greeting', { name }) : t('greetingNoName')} />
      <HomeDashboardContent data={data} />
    </div>
  );
}
