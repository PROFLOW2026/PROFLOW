import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryCoordinationAcknowledgementOverdue, queryCoordinationBlocked } from './application/command-center';

registerDgCommandCenterPort('dg_coordination_blocked', queryCoordinationBlocked);
registerDgCommandCenterPort('dg_acknowledgement_overdue', queryCoordinationAcknowledgementOverdue);
