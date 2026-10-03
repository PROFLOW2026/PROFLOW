import type { BadgeTone } from '@/components/ui/badge';
import type { SiteInstructionStatus } from '../domain/lifecycle';

export const INSTRUCTION_STATUS_TONE: Record<SiteInstructionStatus, BadgeTone> = {
  issued: 'warning',
  acknowledged: 'info',
  performed: 'pending',
  closed: 'success',
  cancelled: 'neutral',
};
