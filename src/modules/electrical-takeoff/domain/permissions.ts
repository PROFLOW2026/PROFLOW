import type { AnalysisView } from './contracts';

/** Facts resolved by the server from org permissions / contractor grants — never from app type alone. */
export interface TakeoffPermissionFacts {
  readonly external: boolean;
  readonly canView: boolean;
  readonly canManage: boolean;
  readonly canApprove: boolean;
  readonly canManageLibrary: boolean;
  readonly analysisApproved: boolean;
  readonly persistenceMode: 'persistent' | 'ephemeral';
  readonly canPickFromProjectCloud: boolean;
}

export type TakeoffViewPermissions = AnalysisView['permissions'];

/**
 * ONE resolver for main app, employee app, and contractor portal.
 * Same permission or grant ⇒ same capability on every surface.
 */
export function resolveTakeoffPermissions(facts: TakeoffPermissionFacts): TakeoffViewPermissions {
  const canEdit = facts.canManage && !facts.analysisApproved;
  const persistent = facts.persistenceMode === 'persistent';
  return {
    canRun: facts.canManage && !facts.analysisApproved,
    canEdit,
    canApprove: facts.canApprove && !facts.analysisApproved,
    canManageLibrary: facts.canManageLibrary,
    canReopen: facts.canApprove && persistent,
    canPickFromProjectCloud: facts.canPickFromProjectCloud && persistent,
    canPurgeEphemeral: facts.canManage && !persistent,
  };
}