import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { queryPlanAcknowledgementOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_acknowledgement_overdue', queryPlanAcknowledgementOverdue);
