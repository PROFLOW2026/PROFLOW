import { cn } from '@/shared/ui/cn';

export interface ProjectCoverImageProps {
  readonly projectName: string;
  readonly imageUrl?: string | null;
  readonly className?: string;
}

/**
 * 16:9 project cover — placeholder when no image or storage/0191 not ready (U12).
 */
export function ProjectCoverImage({
  projectName,
  imageUrl,
  className,
}: ProjectCoverImageProps) {
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
