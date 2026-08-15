export function DailyLogCorrectionNotes({
  notes,
  label,
}: {
  notes: string | null;
  label: string;
}) {
  if (!notes?.trim()) return null;
  return (
    <div data-testid="daily-log-correction-notes">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap">{notes}</p>
    </div>
  );
}
