import { registerDgCommandCenterPort } from '@/modules/command-center';
import { querySubmittalsPending } from './application/command-center';

registerDgCommandCenterPort('dg_submittal_pending', querySubmittalsPending);
