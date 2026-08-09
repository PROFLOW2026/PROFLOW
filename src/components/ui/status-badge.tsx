import {
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleDot,
  Clock,
  FileText,
  PauseCircle,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { Badge, type BadgeTone } from './badge';

/**
 * Status is conveyed by text plus icon, never by colour alone (docs 48 §1.7,
 * 59, 63). Feature modules map their domain status to one of these tones
 * instead of inventing new colours.
 */
export type StatusTone = BadgeTone;

export type StatusShape =
  | 'draft'
  | 'active'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'onHold'
  | 'completed'
  | 'overdue'
  | 'void'
  | 'archived';

const SHAPES: Record<StatusShape, { icon: LucideIcon; tone: StatusTone }> = {
  draft: { icon: FileText, tone: 'neutral' },
  active: { icon: CircleDot, tone: 'info' },
  pending: { icon: Clock, tone: 'pending' },
  approved: { icon: CheckCircle2, tone: 'success' },
  rejected: { icon: XCircle, tone: 'danger' },
  cancelled: { icon: Ban, tone: 'neutral' },
  onHold: { icon: PauseCircle, tone: 'warning' },
  completed: { icon: CheckCircle2, tone: 'success' },
  overdue: { icon: Clock, tone: 'danger' },
  void: { icon: Ban, tone: 'neutral' },
  archived: { icon: CircleDashed, tone: 'neutral' },
};

export interface StatusBadgeProps {
  shape: StatusShape;
  /** Already-translated label. Components never build labels from enum keys. */
  label: string;
  className?: string;
}

export function StatusBadge({ shape, label, className }: StatusBadgeProps) {
  const { icon: Icon, tone } = SHAPES[shape];
  return (
    <Badge tone={tone} className={className}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
