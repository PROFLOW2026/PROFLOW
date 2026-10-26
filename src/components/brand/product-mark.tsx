import '@/components/brand/exlfy/exlfy-brand-scoped.css';

import { ExlfyBrandLockup } from '@/components/brand/exlfy/exlfy-brand-lockup';
import { ExlfyMonogramMark } from '@/components/brand/exlfy/exlfy-monogram-mark';
import { cn } from '@/shared/ui/cn';

type ProductMarkProps = {
  /** Header / marketing vs auth / employee login. */
  variant?: 'compact' | 'auth' | 'mark-only';
  className?: string;
  /** Accessible label — product name or portal title. */
  label: string;
};

const MONOGRAM_HEIGHT = {
  compact: 28,
  auth: 36,
  'mark-only': 36,
} as const;

/** EXLFY lockup — monogram EYf + typographic wordmark. */
export function ProductMark({ variant = 'compact', className, label }: ProductMarkProps) {
  if (variant === 'mark-only') {
    return (
      <span
        dir="ltr"
        className={cn('exlfy-brand-scoped inline-flex shrink-0', className)}
        role="img"
        aria-label={label}
      >
        <ExlfyMonogramMark height={MONOGRAM_HEIGHT['mark-only']} />
      </span>
    );
  }

  const size = variant === 'auth' ? 'auth' : 'header';

  return (
    <ExlfyBrandLockup size={size} label={label} className={cn('min-w-0 max-w-full', className)} />
  );
}
