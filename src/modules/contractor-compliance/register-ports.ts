import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryComplianceExpiring } from './application/command-center';

registerDgCommandCenterPort('dg_compliance_expiring', queryComplianceExpiring);
