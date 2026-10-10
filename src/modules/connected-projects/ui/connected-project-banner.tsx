import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import type { ConnectedProjectContext } from '../application/resolve-connected-context';
import { developerWorkflowHref, visibleDeveloperWorkflowTabs } from '../domain/developer-workflows';

interface ConnectedProjectBannerProps {
  readonly connected: ConnectedProjectContext;
}

export async function ConnectedProjectBanner({ connected }: ConnectedProjectBannerProps) {
  const t = await getTranslations('projects.connectedDeveloper');
  const tabs = visibleDeveloperWorkflowTabs(connected.capabilities);
  const primaryHref =
    tabs.length > 0
      ? developerWorkflowHref(connected.contractorProjectId, tabs[0]!.segment)
      : `/projects/${connected.contractorProjectId}/developer`;

  const developerLabel =
    connected.developer.organizationName && connected.developer.projectName
      ? t('banner.linkedProject', {
          organization: connected.developer.organizationName,
          project: connected.developer.projectName,
        })
      : t('banner.linkedProjectFallback');

  const statusKey =
    connected.mapping.status === 'sync_degraded'
      ? 'banner.statusDegraded'
      : connected.mapping.status === 'provisioning'
        ? 'banner.statusProvisioning'
        : null;

  return (
    <div
      className="rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-surface-subtle)] px-4 py-3 text-sm"
      data-connected-project={connected.mapping.id}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-[var(--pf-text-primary)]">{t('banner.title')}</p>
          <p className="text-[var(--pf-text-secondary)]">{developerLabel}</p>
          {statusKey ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{t(statusKey)}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tabs.length > 0 ? (
            <Link
              href={primaryHref}
              prefetch
              className="inline-flex items-center rounded-lg bg-[var(--pf-accent)] px-3 py-1.5 text-xs font-medium text-[var(--pf-accent-fg)] hover:opacity-90"
            >
              {t('banner.openDeveloperWork')}
            </Link>
          ) : connected.externalContext ? (
            <span className="text-xs text-[var(--pf-text-muted)]">{t('banner.noGrantedWork')}</span>
          ) : (
            <Link
              href={`/contractor/sign-in?next=${encodeURIComponent(`/contractor/projects/${connected.developer.projectId}`)}`}
              prefetch={false}
              className="text-xs font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
            >
              {t('banner.linkPortalAccount')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
