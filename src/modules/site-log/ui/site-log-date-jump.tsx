'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRouter } from '@/shared/i18n/navigation';

/** Jump to any date of the log (no future dates). */
export function SiteLogDateJump({
  basePath,
  defaultDate,
  maxDate,
  label,
  submitLabel,
}: {
  readonly basePath: string;
  readonly defaultDate: string;
  readonly maxDate: string;
  readonly label: string;
  readonly submitLabel: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultDate);
  return (
    <form
      className="flex min-w-0 flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value <= maxDate) router.push(`${basePath}/${value}`);
      }}
    >
      <label className="flex min-w-0 flex-col gap-1 text-sm">
        <span className="font-medium">{label}</span>
        <Input type="date" value={value} max={maxDate} onChange={(event) => setValue(event.target.value)} />
      </label>
      <Button type="submit" variant="secondary">
        {submitLabel}
      </Button>
    </form>
  );
}
