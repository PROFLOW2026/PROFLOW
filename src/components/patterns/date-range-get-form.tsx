'use client';

import * as React from 'react';
import { DateRangeSelector, type DateRangeSelectorProps } from '@/components/patterns/date-range-selector';
import { cn } from '@/shared/ui/cn';

export interface DateRangeGetFormProps extends Omit<DateRangeSelectorProps, 'onRangeCommit'> {
  readonly className?: string;
  readonly formClassName?: string;
  readonly actions?: React.ReactNode;
}

/** GET filter form: preset chips submit immediately; custom range uses inline apply. */
export function DateRangeGetForm({
  className,
  formClassName,
  actions,
  ...selectorProps
}: DateRangeGetFormProps) {
  const formRef = React.useRef<HTMLFormElement>(null);

  const commitForm = React.useCallback(() => {
    formRef.current?.requestSubmit();
  }, []);

  return (
    <form ref={formRef} method="get" className={cn('flex min-w-0 max-w-full flex-col gap-2', formClassName)}>
      <DateRangeSelector {...selectorProps} onRangeCommit={commitForm} className={className} />
      {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
    </form>
  );
}
