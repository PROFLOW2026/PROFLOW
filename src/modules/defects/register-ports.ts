import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { queryDefectsAwaitingVerification } from './application/command-center';

registerDgCommandCenterPort('dg_defect_awaiting_verification', queryDefectsAwaitingVerification);
