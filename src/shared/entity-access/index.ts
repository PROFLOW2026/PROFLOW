import { CLAIMS_ENTITY_RESOLVERS } from './resolvers/claims';
import { COLLAB_ENTITY_RESOLVERS } from './resolvers/collab';
import { COMPLIANCE_ENTITY_RESOLVERS } from './resolvers/compliance';
import { COORDINATION_ENTITY_RESOLVERS } from './resolvers/coordination';
import { DOCUMENTS_ENTITY_RESOLVERS } from './resolvers/documents';
import { EXTERNAL_ENTITY_RESOLVERS } from './resolvers/external';
import { FIELD_ENTITY_RESOLVERS } from './resolvers/field';
import { NOTIFICATIONS_ENTITY_RESOLVERS } from './resolvers/notifications';
import { PERMISSIONS_ENTITY_RESOLVERS } from './resolvers/permissions';
import { PROCUREMENT_ENTITY_RESOLVERS } from './resolvers/procurement';
import { PROFILE_ENTITY_RESOLVERS } from './resolvers/profile';
import { QUALITY_ENTITY_RESOLVERS } from './resolvers/quality';
import { RFI_ENTITY_RESOLVERS } from './resolvers/rfi';
import { SUBCONTRACT_ENTITY_RESOLVERS } from './resolvers/subcontract';
import { SURFACES_ENTITY_RESOLVERS } from './resolvers/surfaces';
import type { EntityAccessResolver, EntityScope } from './types';
import type { DbExecutor } from '@/shared/db/types';

export type { EntityAccessResolver, EntityScope } from './types';

const RESOLVERS: readonly EntityAccessResolver[] = [
  ...CLAIMS_ENTITY_RESOLVERS,
  ...COLLAB_ENTITY_RESOLVERS,
  ...COMPLIANCE_ENTITY_RESOLVERS,
  ...COORDINATION_ENTITY_RESOLVERS,
  ...DOCUMENTS_ENTITY_RESOLVERS,
  ...EXTERNAL_ENTITY_RESOLVERS,
  ...FIELD_ENTITY_RESOLVERS,
  ...NOTIFICATIONS_ENTITY_RESOLVERS,
  ...PERMISSIONS_ENTITY_RESOLVERS,
  ...PROCUREMENT_ENTITY_RESOLVERS,
  ...PROFILE_ENTITY_RESOLVERS,
  ...QUALITY_ENTITY_RESOLVERS,
  ...RFI_ENTITY_RESOLVERS,
  ...SUBCONTRACT_ENTITY_RESOLVERS,
  ...SURFACES_ENTITY_RESOLVERS,
];

const BY_TYPE = new Map(RESOLVERS.map((resolver) => [resolver.entityType, resolver] as const));

export function isKnownEntityType(entityType: string): boolean {
  return BY_TYPE.has(entityType);
}

export function listEntityTypes(): readonly string[] {
  return [...BY_TYPE.keys()];
}

/** Resolves where an entity lives (org/project/vendor/agreement) using the caller's RLS-bound executor. null = not found / not visible. */
export async function resolveEntityScope(
  db: DbExecutor,
  entityType: string,
  organizationId: string,
  entityId: string,
): Promise<EntityScope | null> {
  const resolver = BY_TYPE.get(entityType);
  if (!resolver) return null;
  return resolver.resolve(db, organizationId, entityId);
}

