import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChangesOrgListView } from '@/modules/commercial/ui/changes-org-list-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('changes');
  return { title: t('pageTitle') };
}

export default function ChangesPage() {
  return <ChangesOrgListView routeBase="/changes" surface="owner" />;
}
