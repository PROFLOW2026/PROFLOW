import { cn } from '@/shared/ui/cn';

export interface ProjectCoverImageProps {
  readonly projectName: string;
  readonly imageUrl?: string | null;
  readonly className?: string;
  /** When false (default), no image means no DOM — avoids a full-width 16:9 empty block in project chrome. */
  readonly showInitialWhenEmpty?: boolean;
}

/**
 * 16:9 project cover — placeholder when no image or storage/0191 not ready (U12).
 */
export function ProjectCoverImage({
  projectName,
  imageUrl,
  className,
  showInitialWhenEmpty = false,
}: ProjectCoverImageProps) {
  if (!imageUrl && !showInitialWhenEmpty) {
    return null;
  }

  return (
    <div
      className={cn(
        'relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)]',
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URL, short TTL
        <img
          src={imageUrl}
          alt={projectName}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-sm text-[var(--pf-text-muted)]"
          aria-hidden={imageUrl ? undefined : true}
        >
          {projectName.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}
