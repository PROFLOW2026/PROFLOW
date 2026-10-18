import { cn } from '@/shared/ui/cn';

export function IdentityAvatar({
  previewUrl,
  displayName,
  size = 'md',
  className,
}: {
  readonly previewUrl: string | null | undefined;
  readonly displayName: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
}) {
  const initial = displayName.trim().charAt(0).toUpperCase() || '?';
  const sizeClass =
    size === 'lg' ? 'size-12 text-lg' : size === 'sm' ? 'size-7 text-xs' : 'size-9 text-sm';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--pf-teal-100)] font-semibold text-[var(--pf-teal-800)] ring-1 ring-[var(--pf-teal-200)]',
        sizeClass,
        className,
      )}
      aria-hidden
    >
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img src={previewUrl} alt="" className="size-full object-cover" />
      ) : (
        <span>{initial}</span>
      )}
    </span>
  );
}
