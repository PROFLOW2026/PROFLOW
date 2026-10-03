export function selectClassName() {
  return 'mt-1 w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-primary)] px-3 py-2 text-sm';
}

export function FormRow({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-[var(--pf-text-primary)]">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--pf-text-secondary)]">{hint}</span> : null}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-[var(--pf-danger-border)] bg-[var(--pf-danger-bg)] px-3 py-2 text-sm text-[var(--pf-danger-text)]">
      {message}
    </p>
  );
}
