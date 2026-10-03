import { registerDgCommandCenterPort } from '@/modules/command-center';
import { queryCriticalTasksOverdue } from './application/command-center';

registerDgCommandCenterPort('dg_critical_task_overdue', queryCriticalTasksOverdue);
