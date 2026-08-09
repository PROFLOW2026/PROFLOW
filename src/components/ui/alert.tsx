import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/shared/ui/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<AlertTone, { icon: LucideIcon; className: string; role: 'status' | 'alert' }> = {
  info: {
    icon: Info,
    className:
      'border-[var(--pf-status-info-border)] bg-[var(--pf-status-info-bg)] text-[var(--pf-status-info-fg)]',
    role: 'status',
  },
  success: {
    icon: CheckCircle2,
    className:
      'border-[var(--pf-status-success-border)] bg-[var(--pf-status-success-bg)] text-[var(--pf-status-success-fg)]',
    role: 'status',
  },
  warning: {
    icon: AlertTriangle,
    className:
      'border-[var(--pf-status-warning-border)] bg-[var(--pf-status-warning-bg)] text-[var(--pf-status-warning-fg)]',
    role: 'status',
  },
  danger: {
    icon: XCircle,
    className:
      'border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] text-[var(--pf-status-danger-fg)]',
    role: 'alert',
  },
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  title?: React.ReactNode;
  icon?: LucideIcon | null;
}

export function Alert({ tone = 'info', title, icon, className, children, ...props }: AlertProps) {
  const config = TONES[tone];
  const Icon = icon === null ? null : (icon ?? config.icon);

  return (
    <div
      role={config.role}
      className={cn('flex gap-3 rounded-md border p-3 text-sm text-start', config.className, className)}
      {...props}
    >
      {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5')}>{children}</div> : null}
      </div>
    </div>
  );
}
