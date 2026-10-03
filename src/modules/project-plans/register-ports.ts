import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryPlanAcknowledgementOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_acknowledgement_overdue', queryPlanAcknowledgementOverdue);
