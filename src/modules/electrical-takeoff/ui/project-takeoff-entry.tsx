import { ChevronLeft } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';

/** Entry from the commercial project page into electrical smart BOQ. */
export async function ProjectTakeoffEntry({
  projectId,
}: {
  readonly projectId: string;
}) {
  const t = await getTranslations('projects.workspace.links');
  const href = `/projects/${projectId}/takeoff`;
  return (
    <section
      aria-labelledby="project-takeoff-entry"
      className="min-w-0 max-w-full rounded-xl border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] p-3"
    >
      <h2 id="project-takeoff-entry" className="text-base font-semibold text-[var(--pf-text-primary)]">
        {t('takeoff')}
      </h2>
      <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">{t('takeoffEntryHint')}</p>
      <Link
        href={href}
        className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--pf-action-primary)] px-4 text-sm font-semibold text-[var(--pf-action-primary-fg)] hover:opacity-95 sm:w-auto"
        data-testid="project-takeoff-entry"
      >
        {t('takeoff')}
        <ChevronLeft className="size-4 shrink-0 rtl:rotate-180" aria-hidden />
      </Link>
    </section>
  );
}