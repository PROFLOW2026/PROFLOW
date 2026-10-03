import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { querySubmittalsPending } from './application/command-center';

registerDgCommandCenterPort('dg_submittal_pending', querySubmittalsPending);
