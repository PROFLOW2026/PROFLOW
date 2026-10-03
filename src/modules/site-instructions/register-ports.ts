import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryInstructionAcknowledgementOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_acknowledgement_overdue', queryInstructionAcknowledgementOverdue);
