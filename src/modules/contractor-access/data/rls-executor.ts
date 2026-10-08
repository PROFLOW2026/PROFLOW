import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';

/**
 * RLS-bound executor for an external principal (mirror of `withUserContext` in `@/shared/db/client`).
 *
 * `requireExternalContext()` is callback-free (frozen contract), so the context cannot hold an open
 * transaction the way `withOrgContext(fn)` does. Instead every awaited statement built on this
 * executor is replayed inside its own short transaction that first pins the principal's auth user
 * (`request.jwt.claim.sub` + `app.user_id`) and switches to the `authenticated` role - exactly what
 * the org executor does - so every `app.external_*` RLS policy applies. `executor.transaction(fn)`
 * opens ONE transaction with the same identity for multi-statement writes.
 *
 * Builders are created eagerly on the base connection (so they can still be embedded as subqueries)
 * but are never executed there: execution entry points (`then` / `execute`) replay the recorded call
 * chain on the identity-pinned transaction.
 */

const RLS_BOUND = Symbol.for('projectflow.externalRlsBound');

type Step = { readonly kind: 'get'; readonly key: PropertyKey } | { readonly kind: 'call'; readonly key: PropertyKey; readonly args: unknown[] };

type TransactionCapableDb = DbExecutor & {
  transaction: <T>(fn: (tx: DbExecutor) => Promise<T>, config?: unknown) => Promise<T>;
};

async function pinIdentity(tx: DbExecutor, authUserId: string): Promise<void> {
  await tx.execute(
    sql`select set_config('request.jwt.claim.sub', ${authUserId}, true), set_config('app.user_id', ${authUserId}, true)`,
  );
  await tx.execute(sql`set local role authenticated`);
}

function replay(target: unknown, steps: readonly Step[]): unknown {
  let current: unknown = target;
  for (const step of steps) {
    const holder = current as Record<PropertyKey, unknown>;
    if (step.kind === 'get') {
      current = holder[step.key];
    } else {
      const fn = holder[step.key] as (...args: unknown[]) => unknown;
      current = fn.apply(holder, step.args);
    }
  }
  return current;
}

const EXECUTION_KEYS = new Set<PropertyKey>(['then', 'catch', 'finally', 'execute']);

export function createRlsBoundExecutor(base: DbExecutor, authUserId: string): DbExecutor {
  const pool = base as TransactionCapableDb;
  const runChain = (steps: readonly Step[]): Promise<unknown> =>
    pool.transaction(async (tx) => {
      await pinIdentity(tx, authUserId);
      return await (replay(tx, steps) as Promise<unknown>);
    });

  const wrap = (value: object, steps: readonly Step[]): unknown =>
    new Proxy(value, {
      get(target, key, receiver) {
        if (key === RLS_BOUND) return true;
        if (typeof key === 'symbol' || key === 'constructor') return Reflect.get(target, key, receiver);
        if (EXECUTION_KEYS.has(key) && typeof (target as Record<PropertyKey, unknown>)[key] === 'function') {
          if (key === 'execute') return () => runChain(steps);
          return (...args: unknown[]) => {
            const promise = runChain(steps);
            return (promise as unknown as Record<PropertyKey, (...a: unknown[]) => unknown>)[key as string]!(...args);
          };
        }
        const property = Reflect.get(target, key, receiver) as unknown;
        if (typeof property === 'function') {
          return (...args: unknown[]) => {
            const result = (property as (...a: unknown[]) => unknown).apply(target, args);
            if (result !== null && typeof result === 'object') {
              return wrap(result, [...steps, { kind: 'call', key, args }]);
            }
            return result;
          };
        }
        // Relational query namespace: `db.query.<table>.findMany(...)`.
        const inQueryNamespace = steps.length === 1 && steps[0]!.kind === 'get' && steps[0]!.key === 'query';
        if (property !== null && typeof property === 'object' && inQueryNamespace) {
          return wrap(property, [...steps, { kind: 'get', key }]);
        }
        return property;
      },
    });

  return new Proxy(pool, {
    get(target, key, receiver) {
      if (key === RLS_BOUND) return true;
      if (typeof key === 'symbol' || key === 'constructor') return Reflect.get(target, key, receiver);
      if (key === 'transaction') {
        return <T>(fn: (tx: DbExecutor) => Promise<T>, config?: unknown) =>
          target.transaction(async (tx) => {
            await pinIdentity(tx, authUserId);
            return fn(tx);
          }, config);
      }
      const property = Reflect.get(target, key, receiver) as unknown;
      if (typeof property === 'function') {
        return (...args: unknown[]) => {
          const result = (property as (...a: unknown[]) => unknown).apply(target, args);
          if (result !== null && typeof result === 'object') {
            return wrap(result, [{ kind: 'call', key, args }]);
          }
          return result;
        };
      }
      if (key === 'query' && property !== null && typeof property === 'object') {
        return wrap(property, [{ kind: 'get', key }]);
      }
      return property;
    },
  }) as unknown as DbExecutor;
}

export function isRlsBoundExecutor(executor: DbExecutor): boolean {
  return (executor as unknown as Record<PropertyKey, unknown>)[RLS_BOUND] === true;
}
