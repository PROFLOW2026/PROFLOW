import { ChevronLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import type { MetricCount } from '../domain/metric-value';

export function ExecutionMetricCard({
  label,
  metric,
  href,
  unavailableLabel,
}: {
  readonly label: string;
  readonly metric: MetricCount;
  readonly href: string;
  readonly unavailableLabel: string;
}) {
  return (
    <Link href={href} className="block min-h-11 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
      <Card className="transition-colors hover:bg-[var(--pf-surface-hover)]">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-[var(--pf-text-primary)]">{label}</span>
            <span className="text-2xl font-semibold tabular-nums text-[var(--pf-text-primary)]">
              {metric.kind === 'count' ? metric.value : unavailableLabel}
            </span>
          </div>
          <ChevronLeft className="size-5 shrink-0 rotate-180 text-[var(--pf-text-secondary)]" aria-hidden />
        </CardContent>
      </Card>
    </Link>
  );
}
