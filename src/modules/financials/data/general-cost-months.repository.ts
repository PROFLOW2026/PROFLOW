import { and, eq, inArray, sql } from 'drizzle-orm';

import {

  generalCostMonthAllocations,

  generalCostMonths,

  generalCostMonthSources,

} from '@drizzle/schema';

import type { DbExecutor, Transaction } from '@/shared/db/types';

import { withTransaction } from '@/shared/db/client';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';

import { DomainRuleError } from '@/shared/errors';

import { fromNumericString, money, roundMoney, toNumericString } from '@/shared/money';

import type { GeneralCostSourceKind } from '../domain/company-actual';



export type GeneralCostMonthRow = typeof generalCostMonths.$inferSelect;

export type GeneralCostMonthAllocationRow = typeof generalCostMonthAllocations.$inferSelect;



function generalCostMonthLockKey(

  organizationId: string,

  yearMonth: string,

  currency: string,

): string {

  return `${organizationId}:${yearMonth}:${currency.toUpperCase()}`;

}



export async function findGeneralCostMonth(

  db: DbExecutor,

  organizationId: string,

  yearMonth: string,

  currency: string,

): Promise<GeneralCostMonthRow | null> {

  const [row] = await db

    .select()

    .from(generalCostMonths)

    .where(

      and(

        eq(generalCostMonths.organizationId, organizationId),

        eq(generalCostMonths.yearMonth, yearMonth),

        eq(generalCostMonths.currency, currency.toUpperCase()),

      ),

    )

    .limit(1);

  return row ?? null;

}



async function acquireGeneralCostMonthLock(

  tx: Transaction,

  organizationId: string,

  yearMonth: string,

  currency: string,

): Promise<void> {

  const lockKey = generalCostMonthLockKey(organizationId, yearMonth, currency);

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`);

}



async function upsertOpenGeneralCostMonthInTx(

  tx: Transaction,

  input: {

    readonly organizationId: string;

    readonly yearMonth: string;

    readonly currency: string;

    readonly poolAmount: string;

    readonly allocatedAmount: string;

    readonly unallocatableAmount: string;

    readonly basisMode: string;

  },

): Promise<GeneralCostMonthRow> {

  const [locked] = await tx

    .select()

    .from(generalCostMonths)

    .where(

      and(

        eq(generalCostMonths.organizationId, input.organizationId),

        eq(generalCostMonths.yearMonth, input.yearMonth),

        eq(generalCostMonths.currency, input.currency.toUpperCase()),

      ),

    )

    .for('update')

    .limit(1);



  if (locked?.status === 'frozen') {

    return locked;

  }



  if (locked) {

    const [updated] = await tx

      .update(generalCostMonths)

      .set({

        poolAmount: input.poolAmount,

        allocatedAmount: input.allocatedAmount,

        unallocatableAmount: input.unallocatableAmount,

        basisMode: input.basisMode,

        computedAt: new Date(),

        updatedAt: new Date(),

      })

      .where(

        and(

          eq(generalCostMonths.id, locked.id),

          eq(generalCostMonths.organizationId, input.organizationId),

          eq(generalCostMonths.status, 'open'),

        ),

      )

      .returning();

    return updated ?? locked;

  }



  const [inserted] = await tx

    .insert(generalCostMonths)

    .values({

      organizationId: input.organizationId,

      yearMonth: input.yearMonth,

      currency: input.currency.toUpperCase(),

      poolAmount: input.poolAmount,

      allocatedAmount: input.allocatedAmount,

      unallocatableAmount: input.unallocatableAmount,

      status: 'open',

      basisMode: input.basisMode,

      computedAt: new Date(),

    })

    .returning();

  if (!inserted) throw new Error('Failed to insert general_cost_months');

  return inserted;

}



async function replaceGeneralCostMonthChildrenInTx(

  tx: Transaction,

  organizationId: string,

  generalCostMonthId: string,

  allocations: readonly {

    readonly projectId: string;

    readonly directActualBasis: string;

    readonly weightPercent: string | null;

    readonly amount: string;

    readonly currency: string;

  }[],

  sources: readonly {

    readonly sourceKind: GeneralCostSourceKind;

    readonly sourceKey: string;

    readonly sourceId?: string | null;

    readonly amount: string;

    readonly currency: string;

    readonly label?: string | null;

  }[],

): Promise<void> {

  await tx

    .delete(generalCostMonthAllocations)

    .where(

      and(

        eq(generalCostMonthAllocations.organizationId, organizationId),

        eq(generalCostMonthAllocations.generalCostMonthId, generalCostMonthId),

      ),

    );

  await tx

    .delete(generalCostMonthSources)

    .where(

      and(

        eq(generalCostMonthSources.organizationId, organizationId),

        eq(generalCostMonthSources.generalCostMonthId, generalCostMonthId),

      ),

    );



  if (allocations.length > 0) {

    await tx.insert(generalCostMonthAllocations).values(

      allocations.map((row) => ({

        organizationId,

        generalCostMonthId,

        projectId: row.projectId,

        directActualBasis: row.directActualBasis,

        weightPercent: row.weightPercent,

        amount: row.amount,

        currency: row.currency.toUpperCase(),

      })),

    );

  }



  if (sources.length > 0) {

    await tx.insert(generalCostMonthSources).values(

      sources.map((row) => ({

        organizationId,

        generalCostMonthId,

        sourceKind: row.sourceKind,

        sourceKey: row.sourceKey,

        sourceId: row.sourceId ?? null,

        amount: row.amount,

        currency: row.currency.toUpperCase(),

        label: row.label ?? null,

      })),

    );

  }

}



async function assertPersistedGeneralCostMonthIntegrity(

  tx: Transaction,

  organizationId: string,

  generalCostMonthId: string,

  expected: {

    readonly poolAmount: string;

    readonly allocatedAmount: string;

    readonly unallocatableAmount: string;

    readonly currency: string;

  },

): Promise<void> {

  const currency = expected.currency.toUpperCase();

  const [monthRow] = await tx

    .select({

      poolAmount: generalCostMonths.poolAmount,

      allocatedAmount: generalCostMonths.allocatedAmount,

      unallocatableAmount: generalCostMonths.unallocatableAmount,

    })

    .from(generalCostMonths)

    .where(

      and(

        eq(generalCostMonths.id, generalCostMonthId),

        eq(generalCostMonths.organizationId, organizationId),

      ),

    )

    .limit(1);



  if (!monthRow) {

    throw new DomainRuleError(

      'General cost month missing after persist',

      'financials.errors.generalPoolConservation',

    );

  }



  const pool = fromNumericString(monthRow.poolAmount, currency)!;

  const allocated = fromNumericString(monthRow.allocatedAmount, currency)!;

  const unallocatable = fromNumericString(monthRow.unallocatableAmount, currency)!;

  const expectedPool = fromNumericString(expected.poolAmount, currency)!;

  const expectedAllocated = fromNumericString(expected.allocatedAmount, currency)!;

  const expectedUnallocatable = fromNumericString(expected.unallocatableAmount, currency)!;



  if (

    toNumericString(roundMoney(pool)) !== toNumericString(roundMoney(expectedPool)) ||

    toNumericString(roundMoney(allocated)) !== toNumericString(roundMoney(expectedAllocated)) ||

    toNumericString(roundMoney(unallocatable)) !==

      toNumericString(roundMoney(expectedUnallocatable))

  ) {

    throw new DomainRuleError(

      'General cost month header does not match expected amounts',

      'financials.errors.generalPoolConservation',

    );

  }



  const conserved = roundMoney(

    money(String(Number(allocated.amount) + Number(unallocatable.amount)), currency),

  );

  if (toNumericString(conserved) !== toNumericString(roundMoney(pool))) {

    throw new DomainRuleError(

      'General cost month header does not conserve pool',

      'financials.errors.generalPoolConservation',

    );

  }



  const [sourceSumRow] = await tx

    .select({

      total: sql<string>`coalesce(sum(${generalCostMonthSources.amount}), 0)::text`,

    })

    .from(generalCostMonthSources)

    .where(

      and(

        eq(generalCostMonthSources.organizationId, organizationId),

        eq(generalCostMonthSources.generalCostMonthId, generalCostMonthId),

      ),

    );



  const sourceTotal = fromNumericString(sourceSumRow?.total ?? '0', currency)!;

  if (toNumericString(roundMoney(sourceTotal)) !== toNumericString(roundMoney(pool))) {

    throw new DomainRuleError(

      'General cost sources do not sum to pool',

      'financials.errors.generalPoolConservation',

    );

  }



  const [allocationSumRow] = await tx

    .select({

      total: sql<string>`coalesce(sum(${generalCostMonthAllocations.amount}), 0)::text`,

    })

    .from(generalCostMonthAllocations)

    .where(

      and(

        eq(generalCostMonthAllocations.organizationId, organizationId),

        eq(generalCostMonthAllocations.generalCostMonthId, generalCostMonthId),

      ),

    );



  const allocationTotal = fromNumericString(allocationSumRow?.total ?? '0', currency)!;

  if (toNumericString(roundMoney(allocationTotal)) !== toNumericString(roundMoney(allocated))) {

    throw new DomainRuleError(

      'General cost allocations do not sum to allocated amount',

      'financials.errors.generalPoolConservation',

    );

  }

}



export interface PersistGeneralCostMonthRecomputeInput {

  readonly organizationId: string;

  readonly yearMonth: string;

  readonly currency: string;

  readonly poolAmount: string;

  readonly allocatedAmount: string;

  readonly unallocatableAmount: string;

  readonly basisMode: string;

  readonly allocations: readonly {

    readonly projectId: string;

    readonly directActualBasis: string;

    readonly weightPercent: string | null;

    readonly amount: string;

    readonly currency: string;

  }[];

  readonly sources: readonly {

    readonly sourceKind: GeneralCostSourceKind;

    readonly sourceKey: string;

    readonly sourceId?: string | null;

    readonly amount: string;

    readonly currency: string;

    readonly label?: string | null;

  }[];

}



/**

 * Idempotent open-month replace: advisory lock, upsert header, delete+insert children,

 * assert SUM(sources)=pool and allocated+unallocatable=pool before commit.

 */

export async function persistGeneralCostMonthRecompute(

  db: DbExecutor,

  input: PersistGeneralCostMonthRecomputeInput,

): Promise<GeneralCostMonthRow> {

  return withTransaction(db, async (tx) => {

    return asServiceRoleWrite(tx, async () => {

      await acquireGeneralCostMonthLock(

        tx,

        input.organizationId,

        input.yearMonth,

        input.currency,

      );



      const monthRow = await upsertOpenGeneralCostMonthInTx(tx, input);

      if (monthRow.status === 'frozen') {

        return monthRow;

      }



      await replaceGeneralCostMonthChildrenInTx(

        tx,

        input.organizationId,

        monthRow.id,

        input.allocations,

        input.sources,

      );



      await assertPersistedGeneralCostMonthIntegrity(tx, input.organizationId, monthRow.id, {

        poolAmount: input.poolAmount,

        allocatedAmount: input.allocatedAmount,

        unallocatableAmount: input.unallocatableAmount,

        currency: input.currency,

      });



      return monthRow;

    });

  });

}



/** @deprecated Use persistGeneralCostMonthRecompute for transactional replace. */

export async function upsertOpenGeneralCostMonth(

  db: DbExecutor,

  input: {

    readonly organizationId: string;

    readonly yearMonth: string;

    readonly currency: string;

    readonly poolAmount: string;

    readonly allocatedAmount: string;

    readonly unallocatableAmount: string;

    readonly basisMode: string;

  },

): Promise<GeneralCostMonthRow> {

  const existing = await findGeneralCostMonth(

    db,

    input.organizationId,

    input.yearMonth,

    input.currency,

  );

  if (existing?.status === 'frozen') {

    return existing;

  }



  return asServiceRoleWrite(db, async () => {

    if (existing) {

      const [updated] = await db

        .update(generalCostMonths)

        .set({

          poolAmount: input.poolAmount,

          allocatedAmount: input.allocatedAmount,

          unallocatableAmount: input.unallocatableAmount,

          basisMode: input.basisMode,

          computedAt: new Date(),

          updatedAt: new Date(),

        })

        .where(

          and(

            eq(generalCostMonths.id, existing.id),

            eq(generalCostMonths.organizationId, input.organizationId),

            eq(generalCostMonths.status, 'open'),

          ),

        )

        .returning();

      return updated ?? existing;

    }



    const [inserted] = await db

      .insert(generalCostMonths)

      .values({

        organizationId: input.organizationId,

        yearMonth: input.yearMonth,

        currency: input.currency.toUpperCase(),

        poolAmount: input.poolAmount,

        allocatedAmount: input.allocatedAmount,

        unallocatableAmount: input.unallocatableAmount,

        status: 'open',

        basisMode: input.basisMode,

        computedAt: new Date(),

      })

      .returning();

    if (!inserted) throw new Error('Failed to insert general_cost_months');

    return inserted;

  });

}



/** @deprecated Use persistGeneralCostMonthRecompute for transactional replace. */

export async function replaceGeneralCostMonthChildren(

  db: DbExecutor,

  organizationId: string,

  generalCostMonthId: string,

  allocations: readonly {

    readonly projectId: string;

    readonly directActualBasis: string;

    readonly weightPercent: string | null;

    readonly amount: string;

    readonly currency: string;

  }[],

  sources: readonly {

    readonly sourceKind: GeneralCostSourceKind;

    readonly sourceKey?: string;

    readonly sourceId?: string | null;

    readonly amount: string;

    readonly currency: string;

    readonly label?: string | null;

  }[],

): Promise<void> {

  await asServiceRoleWrite(db, async () => {

    await replaceGeneralCostMonthChildrenInTx(

      db as Transaction,

      organizationId,

      generalCostMonthId,

      allocations,

      sources.map((row) => ({

        ...row,

        sourceKey: row.sourceKey ?? `${row.sourceKind}:${row.sourceId ?? 'aggregate'}`,

      })),

    );

  });

}



export async function freezeGeneralCostMonth(

  db: DbExecutor,

  organizationId: string,

  yearMonth: string,

  currency: string,

): Promise<GeneralCostMonthRow | null> {

  return asServiceRoleWrite(db, async () => {

    const [updated] = await db

      .update(generalCostMonths)

      .set({

        status: 'frozen',

        frozenAt: new Date(),

        updatedAt: new Date(),

      })

      .where(

        and(

          eq(generalCostMonths.organizationId, organizationId),

          eq(generalCostMonths.yearMonth, yearMonth),

          eq(generalCostMonths.currency, currency.toUpperCase()),

          eq(generalCostMonths.status, 'open'),

        ),

      )

      .returning();

    return updated ?? null;

  });

}



/** Sum of auto-general allocations for one project across all months (or open+frozen). */

export async function sumGeneralAllocationsForProject(

  db: DbExecutor,

  organizationId: string,

  projectId: string,

  currency: string,

): Promise<string> {

  const [row] = await db

    .select({

      total: sql<string>`coalesce(sum(${generalCostMonthAllocations.amount}), 0)::text`,

    })

    .from(generalCostMonthAllocations)

    .innerJoin(

      generalCostMonths,

      and(

        eq(generalCostMonthAllocations.generalCostMonthId, generalCostMonths.id),

        eq(generalCostMonthAllocations.organizationId, generalCostMonths.organizationId),

      ),

    )

    .where(

      and(

        eq(generalCostMonthAllocations.organizationId, organizationId),

        eq(generalCostMonthAllocations.projectId, projectId),

        sql`upper(${generalCostMonthAllocations.currency}) = upper(${currency})`,

        inArray(generalCostMonths.status, ['open', 'frozen']),

      ),

    );

  return row?.total ?? '0';

}



export async function sumGeneralAllocationsGroupedByProject(

  db: DbExecutor,

  organizationId: string,

  projectIds: readonly string[],

  currency: string,

): Promise<Map<string, string>> {

  const result = new Map<string, string>();

  if (projectIds.length === 0) return result;



  const rows = await db

    .select({

      projectId: generalCostMonthAllocations.projectId,

      total: sql<string>`coalesce(sum(${generalCostMonthAllocations.amount}), 0)::text`,

    })

    .from(generalCostMonthAllocations)

    .innerJoin(

      generalCostMonths,

      and(

        eq(generalCostMonthAllocations.generalCostMonthId, generalCostMonths.id),

        eq(generalCostMonthAllocations.organizationId, generalCostMonths.organizationId),

      ),

    )

    .where(

      and(

        eq(generalCostMonthAllocations.organizationId, organizationId),

        inArray(generalCostMonthAllocations.projectId, [...projectIds]),

        sql`upper(${generalCostMonthAllocations.currency}) = upper(${currency})`,

        inArray(generalCostMonths.status, ['open', 'frozen']),

      ),

    )

    .groupBy(generalCostMonthAllocations.projectId);



  for (const row of rows) {

    result.set(row.projectId, row.total);

  }

  return result;

}



export async function sumOrganizationGeneralPoolTotals(

  db: DbExecutor,

  organizationId: string,

  currency: string,

): Promise<{ pool: string; allocated: string; unallocatable: string }> {

  const [row] = await db

    .select({

      pool: sql<string>`coalesce(sum(${generalCostMonths.poolAmount}), 0)::text`,

      allocated: sql<string>`coalesce(sum(${generalCostMonths.allocatedAmount}), 0)::text`,

      unallocatable: sql<string>`coalesce(sum(${generalCostMonths.unallocatableAmount}), 0)::text`,

    })

    .from(generalCostMonths)

    .where(

      and(

        eq(generalCostMonths.organizationId, organizationId),

        sql`upper(${generalCostMonths.currency}) = upper(${currency})`,

        inArray(generalCostMonths.status, ['open', 'frozen']),

      ),

    );

  return {

    pool: row?.pool ?? '0',

    allocated: row?.allocated ?? '0',

    unallocatable: row?.unallocatable ?? '0',

  };

}



/** Open (non-frozen) general-cost year months for an org/currency, ascending. */
export async function listOpenGeneralCostYearMonths(
  db: DbExecutor,
  organizationId: string,
  currency: string,
): Promise<readonly string[]> {
  const rows = await db
    .select({ yearMonth: generalCostMonths.yearMonth })
    .from(generalCostMonths)
    .where(
      and(
        eq(generalCostMonths.organizationId, organizationId),
        sql`upper(${generalCostMonths.currency}) = upper(${currency})`,
        eq(generalCostMonths.status, 'open'),
      ),
    )
    .orderBy(generalCostMonths.yearMonth);

  return [...new Set(rows.map((row) => row.yearMonth))];
}


