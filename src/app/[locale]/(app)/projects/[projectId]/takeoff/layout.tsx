import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import { loadProjectLayoutIdentity } from '../load-project-detail';
import { ProjectOperationalContextHeader } from '@/modules/project-workspace/ui/project-operational-context-header';
import { localeDirection } from '@/shared/i18n/config';
import { OwnerTakeoffSectionNav } from './owner-takeoff-section-nav';

interface TakeoffLayoutProps {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}

/** Focused takeoff workspace chrome (paired with {@link ProjectOwnerWorkspaceShell} takeoff mode). */
export default async function OwnerProjectTakeoffLayout({ children, params }: TakeoffLayoutProps) {
  const { projectId } = await params;
  const identity = await loadProjectLayoutIdentity(projectId);
  if (!identity) notFound();

  const locale = await getLocale();
  const dir = localeDirection(locale);
  const projectHref = `/projects/${projectId}`;

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-1">
      <ProjectOperationalContextHeader
        projectName={identity.name}
        documentNumber={identity.documentNumber ?? ''}
        backToProjectHref={projectHref}
        workspaceKind="takeoff"
        compact
      />
      <OwnerTakeoffSectionNav projectId={projectId} dir={dir} />
      <div className="flex min-h-0 min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden lg:overflow-hidden">{children}</div>
    </div>
  );
}