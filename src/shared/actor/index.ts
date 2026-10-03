/**
 * Actor identity for the Developer / GC layer (frozen contract, MAIN AGENT owned).
 *
 * internal -> profiles.id (OrgContext.userId; owner app and employee app)
 * external -> external_principals.id (ExternalContext.principalId; never an OrgContext)
 * system   -> scheduled jobs / domain-event handlers
 *
 * Tables record `actor_type`, `actor_user_id`, `actor_principal_id` with a CHECK that exactly the
 * matching identity is set (see entity_links / domain_events in migration 0155).
 */

export type Actor =
  | { readonly type: 'internal'; readonly userId: string }
  | { readonly type: 'external'; readonly principalId: string }
  | { readonly type: 'system' };

export interface ActorColumns {
  readonly actorType: 'internal' | 'external' | 'system';
  readonly actorUserId: string | null;
  readonly actorPrincipalId: string | null;
}

export function actorColumns(actor: Actor): ActorColumns {
  switch (actor.type) {
    case 'internal':
      return { actorType: 'internal', actorUserId: actor.userId, actorPrincipalId: null };
    case 'external':
      return { actorType: 'external', actorUserId: null, actorPrincipalId: actor.principalId };
    case 'system':
      return { actorType: 'system', actorUserId: null, actorPrincipalId: null };
  }
}

export function internalActor(userId: string): Actor {
  return { type: 'internal', userId };
}

export function externalActor(principalId: string): Actor {
  return { type: 'external', principalId };
}

export const SYSTEM_ACTOR: Actor = { type: 'system' };

/** Rebuilds an Actor from stored columns; throws on an inconsistent row. */
export function actorFromColumns(columns: ActorColumns): Actor {
  if (columns.actorType === 'internal' && columns.actorUserId) {
    return { type: 'internal', userId: columns.actorUserId };
  }
  if (columns.actorType === 'external' && columns.actorPrincipalId) {
    return { type: 'external', principalId: columns.actorPrincipalId };
  }
  if (columns.actorType === 'system') return { type: 'system' };
  throw new Error('Inconsistent actor columns');
}
