import { getTranslations } from 'next-intl/server';
import { TabPanelSkeleton } from './projects/[projectId]/tab-panel-skeleton';

/**
 * Instant route fallback for app-segment navigations (including Dashboard).
 * Keeps the shell visible while the destination page streams in.
 */
export default async function AppSegmentLoading() {
  const t = await getTranslations('common');
  return <TabPanelSkeleton label={t('states.loading')} />;
}
