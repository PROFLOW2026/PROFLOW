import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { OverheadNavigationHub } from '@/modules/expenses/ui/overhead-navigation-hub';
import { withOrgContext } from '@/shared/auth/session';
import { canAccessOverheadHome } from '@/modules/expenses/domain/overhead-home';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'expenses' });
  return { title: t('overheadHome.title') };
}

export default async function OverheadPage() {
  const t = await getTranslations('expenses.overheadHome');

  const allowed = await withOrgContext(async (context) =>
    canAccessOverheadHome(context.permissions),
  );

  if (!allowed) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <EmptyState title={t('notAllowed.title')} description={t('notAllowed.body')} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <OverheadNavigationHub />
    </div>
  );
}
