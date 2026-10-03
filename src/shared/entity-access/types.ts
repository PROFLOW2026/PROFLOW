import type { DbExecutor } from '@/shared/db/types';

/**
 * Where an entity lives. Threads, attachments, evidence and links use this to authorize access
 * for BOTH internal (project capability) and external (grant scope) actors. FROZEN CONTRACT.
 */
export interface EntityScope {
  readonly organizationId: string;
  readonly projectId: string | null;
  /** Set when the entity belongs to a contractor (vendor) - drives external scoping. */
  readonly vendorId?: string | null;
  readonly subcontractAgreementId?: string | null;
  /** true = never visible to external principals regardless of grant. */
  readonly internalOnly?: boolean;
}

export interface EntityAccessResolver {
  /** snake_case table-like key, e.g. 'rfi', 'defect', 'coordination_event'. */
  readonly entityType: string;
  /** Uses the caller's RLS-bound executor; returns null when missing or not visible. */
  resolve(db: DbExecutor, organizationId: string, entityId: string): Promise<EntityScope | null>;
}
