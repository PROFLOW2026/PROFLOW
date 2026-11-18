import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { organizationMemberships, profiles } from "@drizzle/schema";
import { runNightlyReset } from "@/modules/demo/application/nightly-reset";
import { sweepOrphanDemoIdentities } from "@/modules/demo/application/orphan-identities";
import { deleteDemoAuthUserViaSupabase } from "@/modules/demo/application/supabase-demo-auth-deletion";
import { getAdminDb } from "@/shared/db/client";
import { rejectUnauthorizedInternalWorker } from "@/shared/http/internal-worker-auth";
import { getSupabaseAdminClient, isSupabaseAdminConfigured } from "@/shared/supabase/admin";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const denied = rejectUnauthorizedInternalWorker(request, 'demo-reset');
  if (denied) return denied;
  const result = await runNightlyReset(getAdminDb(), {
    async deleteStoragePrefix() {
      return;
    },
    async deleteAuthUser(userId) {
      if (!isSupabaseAdminConfigured()) return;
      await getSupabaseAdminClient().auth.admin.deleteUser(userId);
    },
    async profileEmail(profileId) {
      const db = getAdminDb();
      const [row] = await db.select({ email: profiles.email }).from(profiles).where(eq(profiles.id, profileId)).limit(1);
      return row?.email ?? null;
    },
    async membershipOrganizationIds(profileId) {
      const db = getAdminDb();
      const rows = await db
        .select({ organizationId: organizationMemberships.organizationId })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, profileId));
      return rows.map((row) => row.organizationId);
    },
  }, new Date(), { includeAbandonedSessionOrgs: true });
  let identities: Awaited<ReturnType<typeof sweepOrphanDemoIdentities>> | { error: string } | null = null;
  if (isSupabaseAdminConfigured()) {
    try {
      identities = await sweepOrphanDemoIdentities(getAdminDb(), {
        deleteAuthUser: deleteDemoAuthUserViaSupabase,
      });
    } catch (error) {
      console.error('demo orphan identity sweep failed', error);
      identities = { error: 'orphan identity sweep failed' };
    }
  }
  return NextResponse.json({ ...result, identities });
}

/** Vercel Cron calls GET. The same bearer secret as POST is required. */
export function GET(request: Request): Response | Promise<Response> {
  const denied = rejectUnauthorizedInternalWorker(request, 'demo-reset');
  if (denied) return denied;
  return POST(request);
}
