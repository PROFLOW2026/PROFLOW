import { cn } from '@/shared/ui/cn';

/** Production EXLFY wordmark — typographic only (no manual letter SVG). */
export function ExlfyWordmarkClean({
  height = 28,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    <span
      className={cn('exlfy-wordmark-type inline-block shrink-0 select-none', className)}
      style={{
        fontSize: height,
        lineHeight: 1,
        height,
      }}
      aria-hidden
    >
      EXLFY
    </span>
  );
}
