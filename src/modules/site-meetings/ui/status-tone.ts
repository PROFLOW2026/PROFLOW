import type { BadgeTone } from '@/components/ui/badge';
import type { SiteMeetingStatus } from '../domain/meeting';

export const MEETING_STATUS_TONE: Record<SiteMeetingStatus, BadgeTone> = {
  scheduled: 'info',
  held: 'pending',
  published: 'success',
  cancelled: 'neutral',
};
