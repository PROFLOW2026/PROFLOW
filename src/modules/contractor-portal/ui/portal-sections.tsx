import { getLocale, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { PortalProjectAccess } from '../domain/project-access';
import { portalHref } from '../domain/routes';
import type { ComposedPortalSection, PortalItemTone, PortalSectionItem } from '../domain/sections';
import { portalProjectLabel } from './labels';
import {
  portalLinkQuietClass,
  portalListPanelClass,
  portalListRowLinkClass,
  portalMetricCellClass,
  portalMetricGridClass,
  portalPanelClass,
} from './portal-surface';

const TONE_SHAPE: Record<PortalItemTone, StatusShape> = {
  neutral: 'draft',
  attention: 'pending',
  danger: 'overdue',
  success: 'approved',
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
    <div className="flex flex-col gap-4 md:gap-5">
      {sections.map((section) => {
        const viewAll = projectId && section.projectRoute ? portalHref(section.projectRoute, { projectId }) : null;
        return (
          <section
            key={section.id}
            className={cn(portalPanelClass, 'space-y-3.5')}
            aria-labelledby={`pf-portal-section-${section.id}`}
            data-pf-portal-section={section.id}
          >
            <header className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 id={`pf-portal-section-${section.id}`} className="text-base font-semibold tracking-tight text-[var(--pf-text-primary)]">
                  {t(`sections.${section.id}.title`)}
                </h2>
                <p className="text-xs leading-relaxed text-[var(--pf-text-secondary)]">
                  {t(`sections.${section.id}.description`)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {section.attentionCount > 0 ? (
                  <StatusBadge
                    shape="overdue"
                    label={t('sections.attention', { count: section.attentionCount })}
                  />
                ) : null}
                <Badge tone="neutral" className="tabular-nums">
                  {section.count}
                </Badge>
              </div>
            </header>

            {section.metrics.length > 0 && section.count > 0 ? (
              <dl className={portalMetricGridClass}>
                {section.metrics.map((metric) => (
                  <div key={metric.labelKey} className={portalMetricCellClass}>
                    <dt className="text-xs text-[var(--pf-text-secondary)]">{tAny(metric.labelKey)}</dt>
                    <dd className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-[var(--pf-text-primary)]">
                      {metric.value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}

            {section.items.length > 0 ? (
              <ul className={portalListPanelClass}>
                {section.items.map((item) => {
                  const body = (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-sm font-medium text-[var(--pf-text-primary)]">{item.title}</p>
                        {item.subtitle ? (
                          <p className="truncate text-xs text-[var(--pf-text-secondary)]">{item.subtitle}</p>
                        ) : null}
                        {!projectId && projectNames.get(item.projectId) ? (
                          <p className="truncate text-xs font-medium text-[var(--pf-accent)]">
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
                          <StatusBadge shape={TONE_SHAPE[item.tone ?? 'neutral']} label={tAny(item.statusKey)} />
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
                        <Link href={item.href} className={portalListRowLinkClass}>
                          {body}
                        </Link>
                      ) : (
                        <div className="px-4 py-3.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : section.count === 0 ? (
              <p className="rounded-xl bg-[var(--pf-bg-muted)]/50 px-3 py-3 text-sm text-[var(--pf-text-secondary)]">
                {t(`sections.${section.id}.empty`)}
              </p>
            ) : null}

            {section.partial ? (
              <p role="status">
                <StatusBadge shape="pending" label={t('sections.partial')} />
              </p>
            ) : null}

            {viewAll ? (
              <Link href={viewAll} className={portalLinkQuietClass}>
                {t('sections.viewAll')}
              </Link>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
