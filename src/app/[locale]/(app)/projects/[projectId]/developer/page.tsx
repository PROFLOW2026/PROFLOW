import { notFound } from 'next/navigation';
import {
  developerWorkflowHref,
  loadConnectedProjectForLayout,
  visibleDeveloperWorkflowTabs,
} from '@/modules/connected-projects';
import { redirect } from '@/shared/i18n/navigation';

interface PageProps {
  params: Promise<{ locale: string; projectId: string }>;
}

export default async function ConnectedDeveloperHubPage({ params }: PageProps) {
  const { locale, projectId } = await params;
  const connected = await loadConnectedProjectForLayout(projectId);
  if (!connected) notFound();

  const tabs = visibleDeveloperWorkflowTabs(connected.capabilities);
  if (tabs.length === 0) notFound();

  redirect({ href: developerWorkflowHref(projectId, tabs[0]!.segment), locale });
}
