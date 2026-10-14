import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { organizationMemberships, profiles } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { extractMentionOrgMemberIds } from '../domain/comment-mentions';

export async function loadMentionLabelsForCommentBodies(
  context: OrgContext,
  bodies: readonly string[],
): Promise<Record<string, string>> {
  const memberIds = new Set<string>();
  for (const body of bodies) {
    for (const id of extractMentionOrgMemberIds(body)) {
      memberIds.add(id);
    }
  }
  if (memberIds.size === 0) return {};

  const rows = await context.db
    .select({
      orgMemberId: organizationMemberships.id,
      displayName: profiles.displayName,
      email: profiles.email,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, context.organizationId),
        inArray(organizationMemberships.id, [...memberIds]),
      ),
    );

  const labels: Record<string, string> = {};
  for (const row of rows) {
    labels[row.orgMemberId] = row.displayName?.trim() || row.email?.trim() || row.orgMemberId;
  }
  return labels;
}
