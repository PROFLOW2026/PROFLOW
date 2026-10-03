import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { queryComplianceExpiring } from './application/command-center';

registerDgCommandCenterPort('dg_compliance_expiring', queryComplianceExpiring);
