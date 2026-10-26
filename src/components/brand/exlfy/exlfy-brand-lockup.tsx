import { cn } from '@/shared/ui/cn';
import { exlfyWordmarkFont } from './exlfy-wordmark-font';
import { ExlfyMonogramMark } from './exlfy-monogram-mark';
import { ExlfyWordmarkClean } from './wordmarks/exlfy-wordmark-clean';

export type ExlfyBrandSize = 'header' | 'auth';

const MARK_HEIGHT: Record<ExlfyBrandSize, number> = {
  header: 30,
  auth: 38,
};

const WORDMARK_HEIGHT: Record<ExlfyBrandSize, number> = {
  header: 26,
  auth: 32,
};

const GAP: Record<ExlfyBrandSize, string> = {
  header: 'gap-2',
  auth: 'gap-2.5',
};

export type ExlfyBrandLockupProps = {
  size: ExlfyBrandSize;
  label?: string;
  className?: string;
  surface?: 'auto' | 'light' | 'dark';
};

export function ExlfyBrandLockup({
  size,
  label = 'EXLFY',
  className,
  surface = 'auto',
}: ExlfyBrandLockupProps) {
  const markH = MARK_HEIGHT[size];
  const wordH = WORDMARK_HEIGHT[size];

  return (
    <span
      dir="ltr"
      className={cn(
        exlfyWordmarkFont.variable,
        'exlfy-brand-scoped inline-flex items-center',
        GAP[size],
        surface === 'dark' && 'exlfy-on-dark',
        surface === 'light' && 'exlfy-on-light',
        className,
      )}
      role="img"
      aria-label={label}
    >
      <span className="inline-flex shrink-0 items-center" style={{ height: markH }}>
        <ExlfyMonogramMark height={markH} />
      </span>
      <span className="exlfy-wordmark-wrap inline-flex shrink-0 items-center">
        <ExlfyWordmarkClean height={wordH} />
      </span>
    </span>
  );
}
