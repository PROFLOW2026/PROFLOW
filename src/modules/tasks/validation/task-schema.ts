import { z } from 'zod';

const taskStatusValues = ['todo', 'in_progress', 'in_review', 'blocked', 'done', 'cancelled'] as const;
const taskPriorityValues = ['none', 'low', 'medium', 'high', 'urgent'] as const;
const taskSourceValues = ['manual', 'template', 'automation', 'meeting_action', 'recurrence'] as const;

export const createTaskSchema = z.object({
  workspaceId: z.string().uuid('workspaceId must be a UUID'),
  title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
  description: z.string().max(10000).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  boardId: z.string().uuid().nullable().optional(),
  bucketId: z.string().uuid().nullable().optional(),
  priority: z.enum(taskPriorityValues).optional().default('none'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  parentTaskId: z.string().uuid().nullable().optional(),
  estimatedEffortMinutes: z.number().int().positive().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  source: z.enum(taskSourceValues).optional().default('manual'),
  approvalRequired: z.boolean().optional().default(false),
  assigneeKeys: z.array(z.string().min(3)).optional(),
  assignAllProjectTeam: z.boolean().optional(),
});

export type CreateTaskSchema = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z.enum(taskStatusValues).optional(),
  priority: z.enum(taskPriorityValues).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  bucketId: z.string().uuid().nullable().optional(),
  boardId: z.string().uuid().nullable().optional(),
  estimatedEffortMinutes: z.number().int().positive().nullable().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  approvalRequired: z.boolean().optional(),
  ownerOrgMemberId: z.string().uuid().nullable().optional(),
  ownerEmployeeId: z.string().uuid().nullable().optional(),
});

export type UpdateTaskSchema = z.infer<typeof updateTaskSchema>;
