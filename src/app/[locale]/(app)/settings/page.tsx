import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SettingsHubPage } from './settings-hub-page';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('settings');
  return { title: t('title') };
}

export default function SettingsIndexPage() {
  return <SettingsHubPage />;
}
