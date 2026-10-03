import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { queryInstructionAcknowledgementOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_acknowledgement_overdue', queryInstructionAcknowledgementOverdue);
