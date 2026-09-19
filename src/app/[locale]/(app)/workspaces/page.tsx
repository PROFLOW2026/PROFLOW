import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Layers } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { listWorkspaces } from '@/modules/workspaces';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { pressableCardLinkClassName } from '@/components/ui/pressable';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('workspaces.pageTitle') };
}

const VISIBILITY_TONE: Record<
  string,
  'neutral' | 'info' | 'warning'
> = {
  organization: 'info',
  restricted: 'warning',
  team: 'neutral',
};

/**
 * Workspace list page — shows all workspaces the user can view.
 * Each workspace card links to its boards list.
 */
export default async function WorkspacesPage() {
  const t = await getTranslations('tasks');

  const workspaces = await withOrgContext(async (context) => {
    return listWorkspaces(context, {});
  });

  const activeWorkspaces = workspaces.filter((ws) => !ws.isArchived);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('workspaces.pageTitle')}
        description={t('workspaces.pageDescription')}
      />

      {activeWorkspaces.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t('workspaces.empty.title')}
          description={t('workspaces.empty.description')}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeWorkspaces.map((ws) => (
            <li key={ws.id}>
              <Link
                href={`/workspaces/${ws.id}/boards`}
                className={cn(pressableCardLinkClassName, 'flex flex-col gap-2')}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">{ws.name}</span>
                  <div className="flex shrink-0 gap-1.5">
                    <Badge
                      tone={VISIBILITY_TONE[ws.workspaceVisibility] ?? 'neutral'}
                      className="text-xs"
                    >
                      {ws.workspaceType.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
                <p className="mt-auto text-xs text-[var(--pf-text-muted)]">
                  {t('workspaces.viewBoards')} →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
