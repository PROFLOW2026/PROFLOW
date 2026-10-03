import type { BadgeTone } from '@/components/ui/badge';
import type { DefectSeverity, DefectStatus } from '../domain/lifecycle';

export function defectStatusTone(status: DefectStatus): BadgeTone {
  switch (status) {
    case 'open':
    case 'reopened':
      return 'danger';
    case 'assigned':
      return 'warning';
    case 'completion_submitted':
    case 'verification':
      return 'info';
    case 'closed':
      return 'success';
    case 'cancelled':
      return 'neutral';
  }
}

export function defectSeverityTone(severity: DefectSeverity): BadgeTone {
  switch (severity) {
    case 'critical':
      return 'danger';
    case 'high':
      return 'warning';
    case 'medium':
      return 'pending';
    case 'low':
      return 'neutral';
  }
}
