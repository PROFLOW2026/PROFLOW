import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { taskCommentUpdateWhere } from '@/modules/tasks/domain/comment-update-scope';

const dialect = new PgDialect();

describe('task comment update where', () => {
  it('includes task_id and the organization, not only the comment id', () => {
    const commentId = '018f1234-5678-7abc-8def-0123456789ab';
    const taskId = '018f1234-5678-7abc-8def-0123456789ac';
    const organizationId = '018f1234-5678-7abc-8def-0123456789ad';
    const authorOrgMemberId = '018f1234-5678-7abc-8def-0123456789ae';
    const query = dialect.sqlToQuery(
      taskCommentUpdateWhere({
        commentId,
        taskId,
        organizationId,
        authorOrgMemberId,
      }),
    );

    expect(query.sql).toContain('"task_id"');
    expect(query.sql).toContain('"organization_id"');
    expect(query.sql).toContain('"id"');
    expect(query.params).toContain(commentId);
    expect(query.params).toContain(taskId);
    expect(query.params).toContain(organizationId);
    expect(query.params.indexOf(taskId)).toBeGreaterThan(query.params.indexOf(commentId));
  });

  it('is the predicate used by the comment edit action', () => {
    const source = readFileSync(path.join(process.cwd(), 'src/modules/tasks/ui/actions.ts'), 'utf8');
    expect(source).toContain('taskCommentUpdateWhere({');
    expect(source).toContain('taskId,');
    expect(source).toContain('organizationId: context.organizationId');
  });
});
