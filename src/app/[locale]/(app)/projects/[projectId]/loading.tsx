import { getTranslations } from 'next-intl/server';
import { TabPanelSkeleton } from './tab-panel-skeleton';

/** Instant feedback when entering a project workspace from the list or shell. */
export default async function ProjectWorkspaceLoading() {
  const t = await getTranslations('common');
  return <TabPanelSkeleton label={t('states.loading')} />;
}
