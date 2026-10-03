import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { queryRfisOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_rfi_overdue', queryRfisOverdue);
