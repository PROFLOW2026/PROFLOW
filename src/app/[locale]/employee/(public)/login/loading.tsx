export default function EmployeeLoginLoading() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-56 animate-pulse rounded bg-[var(--pf-bg-muted)]" />
      <div className="h-4 w-40 animate-pulse rounded bg-[var(--pf-bg-muted)]" />
      <div className="h-11 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
      <div className="h-11 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
      <div className="h-11 animate-pulse rounded-lg bg-[var(--pf-bg-muted)]" />
    </div>
  );
}
