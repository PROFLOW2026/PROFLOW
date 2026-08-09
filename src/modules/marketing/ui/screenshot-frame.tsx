import { cn } from '@/shared/ui/cn';

export function ScreenshotFrame({
  src,
  alt,
  caption,
  className,
  priority = false,
  mobile = false,
}: {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  priority?: boolean;
  mobile?: boolean;
}) {
  return (
    <figure className={cn('min-w-0', className)} data-pf-screenshot-frame={mobile ? 'mobile' : 'desktop'}>
      <div
        className={cn(
          'overflow-hidden border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] shadow-[var(--pf-shadow-sm)]',
          mobile ? 'mx-auto max-w-[280px] rounded-[1.25rem]' : 'rounded-xl',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG marketing placeholders; swap to next/image when raster shots land */}
        <img
          src={src}
          alt={alt}
          width={mobile ? 390 : 1280}
          height={mobile ? 844 : 800}
          className="h-auto w-full"
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
        />
      </div>
      {caption ? (
        <figcaption className="mt-3 text-center text-sm text-[var(--pf-text-secondary)]">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
