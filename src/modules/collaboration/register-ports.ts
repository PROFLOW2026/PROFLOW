import { registerDgCommandCenterPort } from '@/modules/command-center/data/dg-ports';
import { queryCriticalTasksOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_critical_task_overdue', queryCriticalTasksOverdue);
