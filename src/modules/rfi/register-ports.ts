import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryRfisOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_rfi_overdue', queryRfisOverdue);
