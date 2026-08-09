import { getTranslations } from 'next-intl/server';
import { DashboardSkeleton } from './dashboard-skeleton';

export default async function HomeLoading() {
  const t = await getTranslations('common');
  return <DashboardSkeleton label={t('states.loading')} />;
}
