import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PrefetchOnIntentLink } from '@/components/ui/prefetch-on-intent-link';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { parseWorkKindFilter } from '../domain/work-pricing';
import type { ActiveProjectSummary } from '../data/projects.repository';

function recentSectionTitle(
  workKindFilter: string | null | undefined,
  t: (key: string) => string,
): string {
  const filter = parseWorkKindFilter(workKindFilter);
  if (filter === 'job') return t('recentJobs');
  if (filter === 'project') return t('recentProjects');
  return t('recentAll');
}

export async function DashboardRecentProjectsSection({
  projects,
  workKindFilter,
}: {
  projects: readonly ActiveProjectSummary[];
  workKindFilter?: string | null;
}) {
  if (projects.length === 0) return null;

  const t = await getTranslations('dashboard');
  const sectionTitle = recentSectionTitle(workKindFilter, t);

  return (
    <section className="min-w-0 max-w-full">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{sectionTitle}</h2>
        <Link href="/projects" className={cn(textNavLinkClassName, 'text-sm')} prefetch={false}>
          {t('allProjectsLink')}
        </Link>
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.id} className="min-w-0 max-w-full">
            <CardHeader className="py-3">
              <CardTitle className="min-w-0 break-words text-base">
                <PrefetchOnIntentLink
                  href={`/projects/${project.id}`}
                  className={cn(textNavLinkClassName, 'font-medium')}
                >
                  {project.name}
                </PrefetchOnIntentLink>
              </CardTitle>
            </CardHeader>
            <CardContent className="min-w-0 pb-3 text-sm text-[var(--pf-text-secondary)]">
              {project.clientName ?? '-'}
              {project.currentContractValue && project.currency ? (
                <p className="mt-1 min-w-0 max-w-full overflow-x-auto">
                  <MoneyText
                    value={{
                      amount: project.currentContractValue,
                      currency: project.currency,
                    }}
                  />
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
