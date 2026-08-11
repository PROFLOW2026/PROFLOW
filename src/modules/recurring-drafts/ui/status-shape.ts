import type { StatusShape } from '@/components/ui/status-badge';
import type { DraftStatus } from '../domain/types';

export function draftStatusShape(status: DraftStatus): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'paused':
      return 'onHold';
    case 'ended':
      return 'archived';
  }
}
