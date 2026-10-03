import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import {
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeePanelClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import type { PortalProjectAccess } from '../domain/project-access';
import { portalHref } from '../domain/routes';
import type { ComposedPortalSection, PortalItemTone, PortalSectionItem } from '../domain/sections';
import { portalProjectLabel } from './labels';

const TONE_CLASS: Record<PortalItemTone, string> = {
  neutral: 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-secondary)]',
  attention: 'bg-amber-50 text-amber-800',
  danger: 'bg-red-50 text-red-700',
  success: 'bg-emerald-50 text-emerald-700',
};

function formatDue(locale: string, value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    ...(dateOnly ? { timeZone: 'UTC' } : { timeStyle: 'short' }),
  }).format(date);
}

function formatAmount(locale: string, amount: NonNullable<PortalSectionItem['amount']>): string {
  const value = Number(amount.value);
  if (!Number.isFinite(value)) return `${amount.value} ${amount.currency}`;
  return new Intl.NumberFormat(locale, { style: 'currency', currency: amount.currency }).format(value);
}

/**
 * Renders composed sections. `projectId` set = project home ("view all" links into the project);
 * unset = dashboard (each item shows its project).
 */
export async function PortalSectionList({
  sections,
  projects,
  projectId,
}: {
  sections: readonly ComposedPortalSection[];
  projects: readonly PortalProjectAccess[];
  projectId?: string;
}) {
  const t = await getTranslations('contractorPortal');
  const tAny = await getTranslations();
  const locale = await getLocale();
  const projectNames = new Map(projects.map((project) => [project.projectId, portalProjectLabel(t, project)]));

  return (
    <div className="flex flex-col gap-4">
      {sections.map((section) => {
        const viewAll = projectId && section.projectRoute ? portalHref(section.projectRoute, { projectId }) : null;
        return (
          <section
            key={section.id}
            className={cn(employeePanelClass, 'space-y-3')}
            aria-labelledby={`pf-portal-section-${section.id}`}
            data-pf-portal-section={section.id}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <h2 id={`pf-portal-section-${section.id}`} className="text-sm font-semibold">
                  {t(`sections.${section.id}.title`)}
                </h2>
                <p className="text-xs text-[var(--pf-text-secondary)]">{t(`sections.${section.id}.description`)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {section.attentionCount > 0 ? (
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TONE_CLASS.danger)}>
                    {t('sections.attention', { count: section.attentionCount })}
                  </span>
                ) : null}
                <span className="rounded-full bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs font-semibold tabular-nums">
                  {section.count}
                </span>
              </div>
            </header>

            {section.metrics.length > 0 && section.count > 0 ? (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {section.metrics.map((metric) => (
                  <div key={metric.labelKey} className="rounded-lg bg-[var(--pf-bg-subtle)] px-3 py-2">
                    <dt className="text-xs text-[var(--pf-text-secondary)]">{tAny(metric.labelKey)}</dt>
                    <dd
                      className={cn(
                        'text-lg font-bold tabular-nums',
                        metric.value > 0 && metric.tone === 'danger' && 'text-red-600',
                        metric.value > 0 && metric.tone === 'attention' && 'text-amber-700',
                        metric.value > 0 && metric.tone === 'success' && 'text-emerald-700',
                      )}
                    >
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {section.items.length > 0 ? (
              <ul className={employeeListPanelClass}>
                {section.items.map((item) => {
                  const body = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.title}</p>
                        {item.subtitle ? (
                          <p className="truncate text-xs text-[var(--pf-text-secondary)]">{item.subtitle}</p>
                        ) : null}
                        {!projectId && projectNames.get(item.projectId) ? (
                          <p className="truncate text-xs text-[var(--pf-text-secondary)]">
                            {projectNames.get(item.projectId)}
                          </p>
                        ) : null}
                        {item.dueAt ? (
                          <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">
                            {t('sections.dueAt', { date: formatDue(locale, item.dueAt) })}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {item.statusKey ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-xs font-medium',
                              TONE_CLASS[item.tone ?? 'neutral'],
                            )}
                          >
                            {tAny(item.statusKey)}
                          </span>
                        ) : null}
                        {section.financial && item.amount ? (
                          <span className="text-sm font-semibold tabular-nums" dir="ltr">
                            {formatAmount(locale, item.amount)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                  return (
                    <li key={`${item.projectId}:${item.id}`}>
                      {item.href ? (
                        <Link href={item.href} className={employeeListRowLinkClass}>
                          {body}
                        </Link>
                      ) : (
                        <div className="px-4 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : section.count === 0 ? (
              <p className="text-sm text-[var(--pf-text-secondary)]">{t(`sections.${section.id}.empty`)}</p>
            ) : null}

            {section.partial ? (
              <p className="text-xs text-amber-800" role="status">
                {t('sections.partial')}
              </p>
            ) : null}

            {viewAll ? (
              <Link href={viewAll} className="text-sm font-medium text-[var(--pf-primary)] hover:underline">
                {t('sections.viewAll')}
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
