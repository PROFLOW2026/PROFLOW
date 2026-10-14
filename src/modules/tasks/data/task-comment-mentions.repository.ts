import { taskCommentMentions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export async function insertTaskCommentMentions(
  db: DbExecutor,
  input: {
    organizationId: string;
    taskCommentId: string;
    mentionedUserIds: readonly string[];
  },
): Promise<void> {
  if (input.mentionedUserIds.length === 0) return;

  await db.insert(taskCommentMentions).values(
    input.mentionedUserIds.map((mentionedUserId) => ({
      organizationId: input.organizationId,
      taskCommentId: input.taskCommentId,
      mentionedUserId,
    })),
  );
}
