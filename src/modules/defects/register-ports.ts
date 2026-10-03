import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryDefectsAwaitingVerification } from './application/command-center';

registerDgCommandCenterPort('dg_defect_awaiting_verification', queryDefectsAwaitingVerification);
