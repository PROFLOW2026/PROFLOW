import { getTranslations } from 'next-intl/server';
import { TabPanelSkeleton } from '../tab-panel-skeleton';

export default async function ProjectFinancialsLoading() {
  const t = await getTranslations('common');
  return <TabPanelSkeleton label={t('states.loading')} />;
}
