import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { expenseManagerialScheduleLines } from '@drizzle/schema';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { DbExecutor } from '@/shared/db/types';

export type ManagerialScheduleLineStatus = 'scheduled' | 'recognized' | 'void';

export interface ManagerialScheduleLineRow {
  readonly id: string;
  readonly yearMonth: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: ManagerialScheduleLineStatus;
  readonly sortOrder: number;
}

export interface ManagerialScheduleLineInsert {
  readonly yearMonth: string;
  readonly amount: string;
  readonly currency: string;
  readonly sortOrder: number;
  readonly status?: Exclude<ManagerialScheduleLineStatus, 'void'>;
}

export async function listScheduleLines(
  db: DbExecutor,
  orgId: string,
  expenseId: string,
): Promise<ManagerialScheduleLineRow[]> {
  const rows = await db
    .select({
      id: expenseManagerialScheduleLines.id,
      yearMonth: expenseManagerialScheduleLines.yearMonth,
      amount: expenseManagerialScheduleLines.amount,
      currency: expenseManagerialScheduleLines.currency,
      status: expenseManagerialScheduleLines.status,
      sortOrder: expenseManagerialScheduleLines.sortOrder,
    })
    .from(expenseManagerialScheduleLines)
    .where(
      and(
        eq(expenseManagerialScheduleLines.organizationId, orgId),
        eq(expenseManagerialScheduleLines.expenseId, expenseId),
        ne(expenseManagerialScheduleLines.status, 'void'),
      ),
    )
    .orderBy(asc(expenseManagerialScheduleLines.sortOrder), asc(expenseManagerialScheduleLines.yearMonth));

  return rows.map((row) => ({
    ...row,
    status: row.status as ManagerialScheduleLineStatus,
  }));
}

export async function voidScheduleLines(
  db: DbExecutor,
  orgId: string,
  expenseId: string,
): Promise<void> {
  await asServiceRoleWrite(db, async () => {
    await db
      .update(expenseManagerialScheduleLines)
      .set({ status: 'void' })
      .where(
        and(
          eq(expenseManagerialScheduleLines.organizationId, orgId),
          eq(expenseManagerialScheduleLines.expenseId, expenseId),
          inArray(expenseManagerialScheduleLines.status, ['scheduled', 'recognized']),
        ),
      );
  });
}

export async function replaceScheduleLines(
  db: DbExecutor,
  orgId: string,
  expenseId: string,
  lines: readonly ManagerialScheduleLineInsert[],
): Promise<void> {
  await asServiceRoleWrite(db, async () => {
    await db
      .delete(expenseManagerialScheduleLines)
      .where(
        and(
          eq(expenseManagerialScheduleLines.organizationId, orgId),
          eq(expenseManagerialScheduleLines.expenseId, expenseId),
        ),
      );

    if (lines.length === 0) return;

    await db.insert(expenseManagerialScheduleLines).values(
      lines.map((line) => ({
        organizationId: orgId,
        expenseId,
        yearMonth: line.yearMonth,
        amount: line.amount,
        currency: line.currency,
        status: line.status ?? 'scheduled',
        sortOrder: line.sortOrder,
      })),
    );
  });
}
