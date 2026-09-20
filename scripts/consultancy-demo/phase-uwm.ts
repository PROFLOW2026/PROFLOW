import type { TaskStatus } from '../../src/modules/tasks/domain/types.ts';
import { TASK_TARGET_MAX, TASK_TARGET_MIN } from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import {
  DECISION_TITLES,
  MILESTONE_NAMES,
  TASK_TITLES,
  type ProjectSpec,
} from './generate-specs.ts';
import { intBetween, mulberry32, pick } from './rng.ts';
import {
  loadSeedRegistry,
  saveSeedRegistry,
  seedAdminTaskRegistryKey,
  seedMeetingRegistryKey,
  seedTaskRegistryKey,
} from './seed-registry.ts';
import {
  pickEstimatedEffortMinutes,
  shouldAssignEffort,
  targetDatesForTask,
  targetStatusForTask,
} from './task-distribution.ts';

interface BucketTemplate {
  readonly name: string;
  readonly statusOnEnter: TaskStatus;
}

interface BoardTemplate {
  readonly name: string;
  readonly buckets: readonly BucketTemplate[];
}

const BOARD_TEMPLATES: readonly BoardTemplate[] = [
  {
    name: 'תכנון',
    buckets: [
      { name: 'לעשות', statusOnEnter: 'todo' },
      { name: 'בעבודה', statusOnEnter: 'in_progress' },
      { name: 'בבדיקה', statusOnEnter: 'in_review' },
      { name: 'הושלם', statusOnEnter: 'done' },
    ],
  },
  {
    name: 'אישורים ותיאומים',
    buckets: [
      { name: 'ממתין', statusOnEnter: 'todo' },
      { name: 'בתיאום', statusOnEnter: 'in_progress' },
      { name: 'חסום', statusOnEnter: 'blocked' },
      { name: 'אושר', statusOnEnter: 'done' },
    ],
  },
  {
    name: 'פיקוח וביצוע',
    buckets: [
      { name: 'פתוח', statusOnEnter: 'todo' },
      { name: 'בביקור', statusOnEnter: 'in_progress' },
      { name: 'לתיקון', statusOnEnter: 'blocked' },
      { name: 'נסגר', statusOnEnter: 'done' },
    ],
  },
];

function boardCountForActivity(activity: ProjectSpec['activity']): number {
  switch (activity) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

export async function seedUwm(
  runPhase: RunPhase,
  target: SeedTarget,
  stats: SeedStats,
  maps: SeedMaps,
  projectSpecs: readonly ProjectSpec[],
): Promise<void> {
  let skipTaskSeed = false;
  await runPhase('uwm inventory check', target.organizationId, target.userId, async (context) => {
    const { tasks } = await import('@drizzle/schema');
    const { eq, sql } = await import('drizzle-orm');
    const [{ count }] = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.organizationId, target.organizationId));
    if (count >= TASK_TARGET_MIN && count <= TASK_TARGET_MAX) {
      stats.tasks = count;
      skipTaskSeed = true;
      stats.notes.push(`Tasks in target band (${count}); skipping UWM create loop.`);
    } else if (count > TASK_TARGET_MAX) {
      stats.tasks = count;
      skipTaskSeed = true;
      stats.notes.push(`Tasks above target (${count}); cleanup pass will trim — skipping create loop.`);
    }
  });

  if (!skipTaskSeed) await runPhase('project workspaces and tasks', target.organizationId, target.userId, async (context) => {
    const { lazyCreateProjectWorkspace } = await import('../../src/modules/workspaces/index.ts');
    const { insertBoard, insertBucket, listBoardsForWorkspace, listBucketsForBoard } = await import(
      '../../src/modules/tasks/data/boards.repository.ts'
    );
    const { insertTask, updateTaskById, insertTaskAssignee } = await import(
      '../../src/modules/tasks/data/tasks.repository.ts'
    );
    const { generateSortKey } = await import('../../src/modules/tasks/domain/lexorank.ts');
    const { buildCreatorFieldsFromContext } = await import('../../src/modules/tasks/domain/actor.ts');
    const registry = await loadSeedRegistry(context.db, target.organizationId);

    const engineerKeys = ['e1', 'e2', 'e3', 'e4', 'e5'] as const;
    const creatorFields = buildCreatorFieldsFromContext(context);

    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;

      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, spec.name);
      const registryTaskCount = Object.keys(registry).filter((key) =>
        key.startsWith(`task:${spec.docNum}:`),
      ).length;
      if (registryTaskCount >= spec.taskCount) continue;

      const boardsNeeded = boardCountForActivity(spec.activity);
      const templates = BOARD_TEMPLATES.slice(0, boardsNeeded);
      const existingBoards = await listBoardsForWorkspace(context.db, target.organizationId, workspace.id);
      const boardPlans: Array<{ boardId: string; template: BoardTemplate; buckets: Array<{ id: string; name: string }> }> = [];

      for (let i = 0; i < templates.length; i += 1) {
        const template = templates[i]!;
        const existing = existingBoards.find((board) => board.name === template.name);
        const board = existing
          ? existing
          : await insertBoard(context.db, {
              organizationId: target.organizationId,
              workspaceId: workspace.id,
              name: template.name,
              position: i,
              isDefault: i === 0,
            });

        const buckets = (await listBucketsForBoard(context.db, target.organizationId, board.id)).map((bucket) => ({
          id: bucket.id,
          name: bucket.name,
        }));
        if (buckets.length === 0) {
          for (const bucketTemplate of template.buckets) {
            const createdBucket = await insertBucket(context.db, {
              organizationId: target.organizationId,
              boardId: board.id,
              name: bucketTemplate.name,
              sortKey: generateSortKey(),
              statusOnEnter: bucketTemplate.statusOnEnter,
            });
            buckets.push({ id: createdBucket.id, name: createdBucket.name });
          }
        }
        boardPlans.push({ boardId: board.id, template, buckets });
      }

      const rng = mulberry32(Number(spec.docNum));
      let createdForProject = 0;
      for (let i = 0; i < spec.taskCount; i += 1) {
        const registryKey = seedTaskRegistryKey(spec.docNum, i);
        if (registry[registryKey]) continue;

        const boardIndex = i % boardPlans.length;
        const plan = boardPlans[boardIndex]!;
        const bucketTemplate = plan.template.buckets[i % plan.template.buckets.length]!;
        const bucket =
          plan.buckets.find((row) => row.name === bucketTemplate.name) ?? plan.buckets[i % plan.buckets.length];
        const status = targetStatusForTask(i, spec.taskCount, spec.activity, spec.bucket);
        const dates = targetDatesForTask(status, spec, i);
        const assigneeKey = pick(rng, engineerKeys);
        const assigneeId = maps.employeeIds.get(assigneeKey);
        const estimatedEffortMinutes = shouldAssignEffort(spec.docNum, i, status)
          ? pickEstimatedEffortMinutes(spec.docNum, i)
          : null;

        const taskTitle = `${pick(rng, TASK_TITLES)} — ${spec.name.slice(0, 24)}`;
        const task = await insertTask(context.db, {
          organizationId: target.organizationId,
          workspaceId: workspace.id,
          projectId,
          boardId: plan.boardId,
          bucketId: bucket?.id ?? null,
          title: taskTitle,
          description: `משימת פרויקט: ${taskTitle}`,
          priority: i % 7 === 0 ? 'high' : i % 3 === 0 ? 'medium' : 'none',
          startDate: spec.startDate,
          dueDate: dates.dueDate,
          estimatedEffortMinutes,
          source: 'manual',
          sortKey: generateSortKey(),
          ...creatorFields,
        });

        await updateTaskById(context.db, target.organizationId, task.id, {
          status,
          completionDate: dates.completionDate,
        });

        if (assigneeId) {
          await insertTaskAssignee(context.db, {
            taskId: task.id,
            organizationId: target.organizationId,
            employeeId: assigneeId,
            assignedByOrgMemberId: context.membershipId,
          });
        }

        registry[registryKey] = task.id;
        createdForProject += 1;
        stats.tasks += 1;
      }

      if (createdForProject > 0) {
        stats.notes.push(`UWM ${spec.docNum}: +${createdForProject} tasks`);
      }
    }

    await saveSeedRegistry(context.db, target.organizationId, registry);

    const adminWorkspaceId = maps.workspaceIds.get('משימות מנהלה');
    const adminEmployeeId = maps.employeeIds.get('e6');
    if (adminWorkspaceId && adminEmployeeId) {
      const adminRegistry = await loadSeedRegistry(context.db, target.organizationId);
      const existingAdmin = Object.keys(adminRegistry).filter((key) => key.startsWith('admin-task:')).length;
      if (existingAdmin < 8) {
        const adminBoard = await insertBoard(context.db, {
          organizationId: target.organizationId,
          workspaceId: adminWorkspaceId,
          name: 'משרד — משימות שוטפות',
          position: 0,
          isDefault: true,
        });
        const todoBucket = await insertBucket(context.db, {
          organizationId: target.organizationId,
          boardId: adminBoard.id,
          name: 'לטיפול',
          sortKey: generateSortKey(),
          statusOnEnter: 'todo',
        });
        const adminTitles = [
          'הוצאת חשבוניות ללקוחות',
          'מעקב תשלומים פתוחים',
          'הזמנת ציוד משרדי',
          'תיאום ישיבות צוות',
          'עדכון רישיונות מקצועיים',
          'ארכוב תיקי פרויקט',
          'הכנת דוחות חודשיים',
          'תיאום הדרכות בטיחות',
        ] as const;
        for (const [index, title] of adminTitles.entries()) {
          const registryKey = seedAdminTaskRegistryKey(index);
          if (adminRegistry[registryKey]) continue;
          const task = await insertTask(context.db, {
            organizationId: target.organizationId,
            workspaceId: adminWorkspaceId,
            boardId: adminBoard.id,
            bucketId: todoBucket.id,
            title,
            description: `משימת משרד: ${title}`,
            source: 'manual',
            sortKey: generateSortKey(),
            createdByEmployeeId: adminEmployeeId,
          });
          adminRegistry[registryKey] = task.id;
          stats.tasks += 1;
        }
        await saveSeedRegistry(context.db, target.organizationId, adminRegistry);
      }
    }
  });

  await runPhase('meetings decisions milestones', target.organizationId, target.userId, async (context) => {
    const { createMeeting } = await import('../../src/modules/meetings/index.ts');
    const { createMeetingDecision, createMeetingActionItem, addAttendeeToMeeting } = await import(
      '../../src/modules/meetings/index.ts'
    );
    const { createMilestone } = await import('../../src/modules/projects/application/milestones.ts');
    const { meetingRecords, projectMilestones } = await import('@drizzle/schema');
    const { and, eq, sql } = await import('drizzle-orm');
    const registry = await loadSeedRegistry(context.db, target.organizationId);

    const existingMeetings = Object.keys(registry).filter((key) => key.startsWith('meeting:')).length;
    const [{ count: meetingCount }] = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(meetingRecords)
      .where(eq(meetingRecords.organizationId, target.organizationId));

    const meetingsToCreate = Math.max(0, 200 - Math.max(meetingCount, existingMeetings));
    const activeProjects = projectSpecs.filter(
      (spec) => spec.activity !== 'done' && spec.bucket !== 'completed',
    );
    const rng = mulberry32(909090);

    for (let i = 0; i < meetingsToCreate; i += 1) {
      const registryKey = seedMeetingRegistryKey(existingMeetings + i);
      if (registry[registryKey]) continue;

      const spec = pick(rng, activeProjects.length > 0 ? activeProjects : projectSpecs);
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;

      const month = intBetween(rng, 1, 9);
      const day = intBetween(rng, 1, 26);
      const decisionTitle = pick(rng, DECISION_TITLES);
      const meeting = await createMeeting(context, {
        title: `ישיבת תיאום — ${spec.name.slice(0, 40)}`,
        scheduledAt: new Date(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:30:00.000Z`),
        projectId,
        notes: `סיכום ישיבה: ${decisionTitle}. נושאים: לוחות זמנים, תיאום מערכות ומשימות המשך.`,
      });
      registry[registryKey] = meeting.id;
      stats.meetings += 1;

      const attendeeKeys = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'] as const;
      const attendeeCount = intBetween(rng, 2, 6);
      const pickedAttendees = new Set<(typeof attendeeKeys)[number]>();
      while (pickedAttendees.size < attendeeCount) {
        pickedAttendees.add(pick(rng, attendeeKeys));
      }
      for (const employeeKey of pickedAttendees) {
        const employeeId = maps.employeeIds.get(employeeKey);
        if (!employeeId) continue;
        await addAttendeeToMeeting(context, {
          meetingId: meeting.id,
          employeeId,
        });
      }

      if (i % 3 === 0) {
        await createMeetingDecision(context, {
          meetingId: meeting.id,
          title: decisionTitle,
          body: `הוחלט: ${decisionTitle}. יש לעדכן את לוח הזמנים ולתאם עם הלקוח.`,
        });
        stats.decisions += 1;
      }

      if (i % 4 === 0) {
        await createMeetingActionItem(context, {
          meetingId: meeting.id,
          title: pick(rng, TASK_TITLES),
          dueDate: `2026-${String(Math.min(month + 1, 9)).padStart(2, '0')}-20`,
        });
      }
    }

    await saveSeedRegistry(context.db, target.organizationId, registry);

    for (const spec of activeProjects.slice(0, 60)) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;
      const [{ count: milestoneCount }] = await context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(projectMilestones)
        .where(
          and(
            eq(projectMilestones.organizationId, target.organizationId),
            eq(projectMilestones.projectId, projectId),
          ),
        );
      if (milestoneCount >= 2) continue;

      const localRng = mulberry32(Number(spec.docNum) + 7000);
      const names = [pick(localRng, MILESTONE_NAMES), pick(localRng, MILESTONE_NAMES)];
      for (const [idx, name] of names.entries()) {
        await createMilestone(context, {
          projectId,
          name,
          targetDate: `2026-${String(intBetween(localRng, 3, 9)).padStart(2, '0')}-${String(10 + idx * 5).padStart(2, '0')}`,
          notes: `אבן דרך: ${name}`,
        });
        stats.milestones += 1;
      }
    }
  });
}
