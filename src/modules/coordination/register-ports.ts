import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { queryCoordinationAcknowledgementOverdue, queryCoordinationBlocked } from './application/command-center';

registerDgCommandCenterPort('dg_coordination_blocked', queryCoordinationBlocked);
registerDgCommandCenterPort('dg_acknowledgement_overdue', queryCoordinationAcknowledgementOverdue);
