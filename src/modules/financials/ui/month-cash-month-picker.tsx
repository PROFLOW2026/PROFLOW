'use client';

import { useRouter } from '@/shared/i18n/navigation';

export function MonthCashMonthPicker({
  selectedMonth,
  workKindFilter,
  label,
}: {
  readonly selectedMonth: string;
  readonly workKindFilter: string | null;
  readonly label: string;
}) {
  const router = useRouter();
  const maxMonth = new Date().toISOString().slice(0, 7);

  return (
    <label className="flex min-w-0 flex-col gap-1 text-center">
      <span className="text-xs font-medium text-[var(--pf-text-secondary)]">{label}</span>
      <input
        type="month"
        name="month"
        aria-label={label}
        value={selectedMonth}
        max={maxMonth}
        className="min-h-11 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2 text-sm font-medium"
        onChange={(event) => {
          const month = event.target.value;
          if (!/^\d{4}-\d{2}$/.test(month) || month > maxMonth) return;
          const params = new URLSearchParams();
          params.set('month', month);
          if (workKindFilter && workKindFilter !== 'all') {
            params.set('workKind', workKindFilter);
          }
          router.push(`/?${params.toString()}`);
        }}
      />
    </label>
  );
}
