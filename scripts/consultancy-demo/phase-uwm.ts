import type { TaskStatus } from '../../src/modules/tasks/domain/types.ts';
import { HISTORY_END, SEED_MARKER } from './constants.ts';
import type { RunPhase, SeedMaps, SeedStats, SeedTarget } from './context.ts';
import {
  DECISION_TITLES,
  MILESTONE_NAMES,
  TASK_TITLES,
  type ProjectSpec,
} from './generate-specs.ts';
import { intBetween, mulberry32, pick } from './rng.ts';

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

function taskStatusForIndex(index: number, total: number, activity: ProjectSpec['activity']): TaskStatus {
  if (activity === 'done') return index < total - 2 ? 'done' : 'in_progress';
  if (activity === 'waiting') return index === 0 ? 'in_progress' : 'todo';
  const ratio = index / Math.max(total - 1, 1);
  if (ratio < 0.45) return 'done';
  if (ratio < 0.7) return 'in_progress';
  if (ratio < 0.85) return 'in_review';
  return 'todo';
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
    const { and, eq, like, sql } = await import('drizzle-orm');
    const [{ count }] = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.organizationId, target.organizationId), like(tasks.description, `%${SEED_MARKER}%`)));
    if (count >= 1000) {
      stats.tasks = count;
      skipTaskSeed = true;
      stats.notes.push(`Tasks already seeded (${count}); skipping UWM create loop.`);
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
    const { tasks } = await import('@drizzle/schema');
    const { and, eq, like, sql } = await import('drizzle-orm');

    const engineerKeys = ['e1', 'e2', 'e3', 'e4', 'e5'] as const;
    const creatorFields = buildCreatorFieldsFromContext(context);

    for (const spec of projectSpecs) {
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;

      const { workspace } = await lazyCreateProjectWorkspace(context, projectId, spec.name);
      const [{ count: existingTaskCount }] = await context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, target.organizationId),
            eq(tasks.workspaceId, workspace.id),
            like(tasks.description, `%${SEED_MARKER}%`),
          ),
        );
      if (existingTaskCount >= spec.taskCount) continue;

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
        const boardIndex = i % boardPlans.length;
        const plan = boardPlans[boardIndex]!;
        const bucketTemplate = plan.template.buckets[i % plan.template.buckets.length]!;
        const bucket =
          plan.buckets.find((row) => row.name === bucketTemplate.name) ?? plan.buckets[i % plan.buckets.length];
        const status = taskStatusForIndex(i, spec.taskCount, spec.activity);
        const assigneeKey = pick(rng, engineerKeys);
        const assigneeId = maps.employeeIds.get(assigneeKey);

        const task = await insertTask(context.db, {
          organizationId: target.organizationId,
          workspaceId: workspace.id,
          projectId,
          boardId: plan.boardId,
          bucketId: bucket?.id ?? null,
          title: `${pick(rng, TASK_TITLES)} — ${spec.name.slice(0, 24)}`,
          description: `${SEED_MARKER}:task:${spec.docNum}:${i}`,
          priority: i % 7 === 0 ? 'high' : i % 3 === 0 ? 'medium' : 'none',
          startDate: spec.startDate,
          dueDate: spec.activity === 'done' ? HISTORY_END : `2026-${String(intBetween(rng, 3, 9)).padStart(2, '0')}-15`,
          source: 'manual',
          sortKey: generateSortKey(),
          ...creatorFields,
        });

        await updateTaskById(context.db, target.organizationId, task.id, { status });

        if (assigneeId) {
          await insertTaskAssignee(context.db, {
            taskId: task.id,
            organizationId: target.organizationId,
            employeeId: assigneeId,
            assignedByOrgMemberId: context.membershipId,
          });
        }

        createdForProject += 1;
        stats.tasks += 1;
      }

      if (createdForProject > 0) {
        stats.notes.push(`UWM ${spec.docNum}: +${createdForProject} tasks`);
      }
    }

    const adminWorkspaceId = maps.workspaceIds.get('משימות מנהלה');
    const adminEmployeeId = maps.employeeIds.get('e6');
    if (adminWorkspaceId && adminEmployeeId) {
      const [{ count: adminCount }] = await context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.organizationId, target.organizationId),
            eq(tasks.workspaceId, adminWorkspaceId),
            like(tasks.description, `%${SEED_MARKER}:admin%`),
          ),
        );
      if (adminCount < 8) {
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
          await insertTask(context.db, {
            organizationId: target.organizationId,
            workspaceId: adminWorkspaceId,
            boardId: adminBoard.id,
            bucketId: todoBucket.id,
            title,
            description: `${SEED_MARKER}:admin:${index}`,
            source: 'manual',
            sortKey: generateSortKey(),
            createdByEmployeeId: adminEmployeeId,
          });
          stats.tasks += 1;
        }
      }
    }
  });

  await runPhase('meetings decisions milestones', target.organizationId, target.userId, async (context) => {
    const { createMeeting } = await import('../../src/modules/meetings/index.ts');
    const { createMeetingDecision, createMeetingActionItem } = await import(
      '../../src/modules/meetings/index.ts'
    );
    const { createMilestone } = await import('../../src/modules/projects/application/milestones.ts');
    const { meetingRecords, projectMilestones } = await import('@drizzle/schema');
    const { and, eq, like, sql } = await import('drizzle-orm');

    const [{ count: meetingCount }] = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(meetingRecords)
      .where(
        and(
          eq(meetingRecords.organizationId, target.organizationId),
          like(meetingRecords.notes, `%${SEED_MARKER}%`),
        ),
      );

    const meetingsToCreate = Math.max(0, 200 - meetingCount);
    const activeProjects = projectSpecs.filter(
      (spec) => spec.activity !== 'done' && spec.bucket !== 'completed',
    );
    const rng = mulberry32(909090);

    for (let i = 0; i < meetingsToCreate; i += 1) {
      const spec = pick(rng, activeProjects.length > 0 ? activeProjects : projectSpecs);
      const projectId = maps.projectIds.get(spec.docNum);
      if (!projectId) continue;

      const month = intBetween(rng, 1, 9);
      const day = intBetween(rng, 1, 26);
      const meeting = await createMeeting(context, {
        title: `ישיבת תיאום — ${spec.name.slice(0, 40)}`,
        scheduledAt: new Date(`2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T09:30:00.000Z`),
        projectId,
        notes: `${SEED_MARKER}:meeting:${i}`,
      });
      stats.meetings += 1;

      if (i % 3 === 0) {
        await createMeetingDecision(context, {
          meetingId: meeting.id,
          title: pick(rng, DECISION_TITLES),
          body: `${SEED_MARKER}:decision`,
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
          notes: `${SEED_MARKER}:milestone`,
        });
        stats.milestones += 1;
      }
    }
  });
}
