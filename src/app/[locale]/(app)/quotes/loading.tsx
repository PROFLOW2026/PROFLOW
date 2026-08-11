export default function QuotesLoading() {
  return (
    <div className="flex flex-col gap-4 p-1" aria-busy="true">
      <div className="h-8 w-48 animate-pulse rounded bg-[var(--pf-bg-muted)]" />
      <div className="h-24 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
      <div className="h-40 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
    </div>
  );
}
