export default function PortalAccessLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <div className="h-7 w-48 animate-pulse rounded bg-[var(--pf-bg-muted)]" />
      <div className="h-4 w-72 animate-pulse rounded bg-[var(--pf-bg-muted)]" />
      <div className="grid grid-cols-1 gap-3">
        <div className="min-h-11 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
        <div className="min-h-11 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
      </div>
    </div>
  );
}
