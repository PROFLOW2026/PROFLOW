import * as React from 'react';
import { cn } from '@/shared/ui/cn';
import { inputClassName } from './input';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(inputClassName, 'min-h-20 resize-y text-start', className)}
      {...props}
    />
  );
});
