/** Maps board URL assignee params to/from picker keys (`m:` / `e:`). */
export function assigneeKeyFromBoardQuery(query: Readonly<Record<string, string>>): string {
  if (query.assigneeOrgMemberId) return `m:${query.assigneeOrgMemberId}`;
  if (query.assigneeEmployeeId) return `e:${query.assigneeEmployeeId}`;
  return '';
}

export function boardQueryPatchForAssigneeKey(
  key: string | undefined,
): Record<string, string | undefined> {
  if (!key) {
    return { assigneeOrgMemberId: undefined, assigneeEmployeeId: undefined };
  }
  if (key.startsWith('m:')) {
    return { assigneeOrgMemberId: key.slice(2), assigneeEmployeeId: undefined };
  }
  if (key.startsWith('e:')) {
    return { assigneeEmployeeId: key.slice(2), assigneeOrgMemberId: undefined };
  }
  return { assigneeOrgMemberId: undefined, assigneeEmployeeId: undefined };
}
