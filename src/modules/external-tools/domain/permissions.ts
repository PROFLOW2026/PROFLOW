import type { ExternalGrantView } from '@/shared/external/context';

export const ORG_TOOL_VIEWER = 'ext.tools.viewer';
export const ORG_TOOL_TAKEOFF = 'ext.tools.takeoff';

/** A project grant never unlocks the tool, even when the scope list contains it. */
export function holdsOrgTool(grants: readonly Pick<ExternalGrantView, 'projectId' | 'capabilities'>[], capability: string): boolean {
  return grants.some((grant) => grant.projectId === null && grant.capabilities.has(capability));
}

export function orgToolCapabilities(values: readonly string[]): string[] {
  const allowed = new Set([ORG_TOOL_VIEWER, ORG_TOOL_TAKEOFF]);
  if (values.some((value) => !allowed.has(value))) throw new Error('org_tool_capability_only');
  const picked = [...new Set(values)];
  if (picked.length === 0) throw new Error('org_tool_capability_required');
  return picked;
}
