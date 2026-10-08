import { getTranslations } from 'next-intl/server';
import {
  EXECUTION_NAV_GROUP_IDS,
  EXECUTION_ROUTE_CATALOG,
  type ExecutionNavGroupId,
  type ExecutionNavLink,
} from '@/modules/project-workspace';
import {
  ProjectExecutionNavList,
  type ResolvedExecutionNavLink,
} from './project-execution-nav-list';

async function resolveExecutionNavLabels(
  links: readonly ExecutionNavLink[],
): Promise<ResolvedExecutionNavLink[]> {
  const routeByKey = new Map(EXECUTION_ROUTE_CATALOG.map((route) => [route.key, route]));
  const translatorCache = new Map<string, ReturnType<typeof getTranslations>>();

  async function translatorFor(namespace: string) {
    let pending = translatorCache.get(namespace);
    if (!pending) {
      pending = getTranslations(namespace);
      translatorCache.set(namespace, pending);
    }
    return pending;
  }

  return Promise.all(
    links.map(async (link) => {
      const route = routeByKey.get(link.key);
      if (!route) return { ...link, label: link.key };
      const t = await translatorFor(route.label.namespace);
      return {
        key: link.key,
        href: link.href,
        label: t(route.label.key as never),
      };
    }),
  );
}

interface ProjectExecutionNavProps {
  readonly links: readonly ExecutionNavLink[];
  readonly dir?: 'rtl' | 'ltr';
}

/** Secondary nav for Developer / GC execution routes (path-based, not `?tab=`). */
export async function ProjectExecutionNav({ links, dir }: ProjectExecutionNavProps) {
  if (links.length === 0) return null;

  const [t, resolved] = await Promise.all([
    getTranslations('projectWorkspace'),
    resolveExecutionNavLabels(links),
  ]);
  const groupLabels = Object.fromEntries(
    EXECUTION_NAV_GROUP_IDS.map((id) => [id, t(`execution.groups.${id}`)]),
  ) as Record<ExecutionNavGroupId, string>;

  return (
    <nav
      aria-label={t('execution.navAriaLabel')}
      dir={dir}
      className="min-w-0 max-w-full space-y-3 rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3 sm:p-4"
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-[var(--pf-text-primary)]">{t('execution.identityTitle')}</h2>
        <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('execution.identityHint')}</p>
      </div>
      <ProjectExecutionNavList links={resolved} groupLabels={groupLabels} />
    </nav>
  );
}
