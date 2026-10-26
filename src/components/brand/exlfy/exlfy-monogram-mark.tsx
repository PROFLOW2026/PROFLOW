import { cn } from '@/shared/ui/cn';

const MONOGRAM_ASPECT = 1003 / 540;

type ExlfyMonogramMarkProps = {
  /** Visual height in CSS pixels (width follows approved monogram aspect). */
  height: number;
  className?: string;
};

/** Approved E + f + Y monogram, tinted with existing teal semantic tokens. */
export function ExlfyMonogramMark({ height, className }: ExlfyMonogramMarkProps) {
  const width = Math.round(height * MONOGRAM_ASPECT);
  return (
    <span
      aria-hidden
      className={cn('exlfy-monogram-tint inline-block shrink-0', className)}
      style={{
        height,
        width,
        WebkitMaskImage: 'url(/brand/exlfy-logo-monogram.png)',
        maskImage: 'url(/brand/exlfy-logo-monogram.png)',
      }}
    />
  );
}

/** Square app-icon frame using the monogram (PWA / favicon preview). */
export function ExlfyMonogramAppIcon({ size, className }: { size: number; className?: string }) {
  const markHeight = Math.round(size * 0.62);
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-[22%]',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <ExlfyMonogramMark height={markHeight} />
    </span>
  );
}
