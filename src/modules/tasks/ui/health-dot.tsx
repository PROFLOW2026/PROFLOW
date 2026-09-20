import { cn } from '@/shared/ui/cn';
import type { PortfolioHealthLevel } from '../application/get-portfolio';

interface HealthDotProps {
  level: PortfolioHealthLevel;
  score: number;
  /** aria-label for screen readers */
  label?: string;
}

/**
 * Colored health dot for the portfolio table.
 *
 * - green  (score = 0):   no issues
 * - amber  (score 1–3):   minor issues
 * - red    (score ≥ 4):   critical issues
 *
 * Formula shown on hover: "Overdue×2 + Blocked"
 */
export function HealthDot({ level, score, label }: HealthDotProps) {
  const colorClass =
    level === 'green'
      ? 'bg-green-500'
      : level === 'amber'
        ? 'bg-amber-400'
        : 'bg-red-500';

  const title = label ?? String(score);

  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 rounded-full flex-shrink-0', colorClass)}
      title={title}
      aria-label={title}
      role="img"
    />
  );
}
