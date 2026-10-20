import type { ReactNode } from 'react';
import { cn } from '@/shared/ui/cn';

type FormGridDensity = 'comfortable' | 'dense';

const densityClass: Record<FormGridDensity, string> = {
  comfortable: 'sm:grid-cols-2 lg:grid-cols-3',
  dense: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
};

/** Responsive field grid for main-app forms. Pair with Field `data-pf-field-span`. */
export function MainAppFormGrid({
  children,
  density: densityProp = 'comfortable',
  dense,
  className,
}: {
  children: ReactNode;
  density?: FormGridDensity;
  /** Alias for `density="dense"`. */
  dense?: boolean;
  className?: string;
}) {
  const density = dense ? 'dense' : densityProp;
  return (
    <div
      data-pf-ma-form-grid=""
      className={cn('grid grid-cols-1 gap-3', densityClass[density], className)}
    >
      {children}
    </div>
  );
}

/** Span helpers for grid children (`Field` className). Prefer `lg` for typical inputs; `full` for textarea/tables. */
export const mainAppFieldSpan = {
  sm: 'min-w-0 w-full sm:max-w-[8rem]',
  md: 'min-w-0 w-full sm:max-w-[12rem]',
  lg: 'min-w-0 w-full',
  full: 'min-w-0 col-span-full w-full',
} as const;
