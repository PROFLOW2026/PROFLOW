import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { SkeletonText } from '@/components/ui/skeleton';
import { getProjectEarlyWarnings } from '@/modules/forecast';
import type { EarlyWarning, EarlyWarningClass, EarlyWarningDriver } from '@/modules/forecast';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { pressableCardLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

function classShape(warningClass: EarlyWarningClass): StatusShape {
  if (warningClass === 'confirmed') return 'overdue';
  if (warningClass === 'projected') return 'pending';
  return 'draft';
}

function severityShape(severity: EarlyWarning['severity']): StatusShape {
  if (severity === 'critical') return 'overdue';
  if (severity === 'warning') return 'onHold';
  return 'draft';
}

function DriverValue({ driver }: { readonly driver: EarlyWarningDriver }) {
  if (driver.amount && driver.currency) {
    return <MoneyText value={{ amount: driver.amount, currency: driver.currency }} />;
  }
  if (driver.percent) {
    if (driver.labelKey === 'drivers.confidence') {
      return <span>{driver.percent}</span>;
    }
    return <span className="tabular-nums" dir="ltr">{driver.percent}%</span>;
  }
  return <span>—</span>;
}

export function ProjectEarlyWarningsFallback() {
  return <SkeletonText lines={3} />;
}

export async function ProjectEarlyWarningsPanel({
  projectId,
}: {
  readonly projectId: string;
}) {
  const [t, tForecast, warnings] = await Promise.all([
    getTranslations('projects.overview.earlyWarnings'),
    getTranslations('forecast'),
    withOrgContext((context) => getProjectEarlyWarnings(context, projectId)).catch(
      () => [] as readonly EarlyWarning[],
    ),
  ]);

  if (warnings.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label={t('title')}>
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <ul className="flex min-w-0 flex-col gap-3">
        {warnings.map((warning) => (
          <li key={`${warning.kind}:${warning.projectId}`}>
            <Card className="min-w-0 max-w-full">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge
                    shape={classShape(warning.warningClass)}
                    label={tForecast(`class.${warning.warningClass}`)}
                  />
                  <StatusBadge
                    shape={severityShape(warning.severity)}
                    label={tForecast(`severity.${warning.severity}`)}
                  />
                </div>
                <CardTitle>{tForecast(warning.titleKey)}</CardTitle>
              </CardHeader>
              <CardContent className="flex min-w-0 flex-col gap-3 text-sm">
                <p className="text-[var(--pf-text-secondary)]">{tForecast(warning.whyKey)}</p>
                {warning.drivers.length > 0 ? (
                  <dl className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
                    {warning.drivers.map((driver) => (
                      <div
                        key={`${warning.kind}:${driver.labelKey}`}
                        className="flex min-w-0 justify-between gap-2"
                      >
                        <dt className="min-w-0 text-[var(--pf-text-muted)]">
                          {tForecast(driver.labelKey)}
                        </dt>
                        <dd className="min-w-0 max-w-[55%] overflow-x-auto text-end">
                          <DriverValue driver={driver} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                {warning.recommendationKey ? (
                  <p className="text-sm text-[var(--pf-text-secondary)]">
                    <span className="font-medium">{tForecast('recommendationNote')}</span>{' '}
                    {tForecast(warning.recommendationKey)}
                  </p>
                ) : null}
                <Link
                  href={warning.href}
                  className={cn(
                    pressableCardLinkClassName,
                    'inline-flex min-h-11 w-fit items-center justify-center px-3 py-2 text-sm font-medium',
                  )}
                >
                  {t('open')}
                </Link>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
