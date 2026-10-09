import 'server-only';

import { notFound } from 'next/navigation';
import { findProjectDeliveryProfile } from '@/modules/project-profile/application/read-delivery-profile';
import { isDeveloperGcMode } from '@/modules/project-profile/domain/management-mode';
import { withOrgContext } from '@/shared/auth/session';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SEC-004 — Developer/GC execution workspace routes require the delivery profile,
 * not only nav hiding (deep links must 404 like other project guards).
 *
 * WP-F route audit (owner `/projects/{id}/…` execution hubs — gated via):
 * - `execution` → `execution/screen.tsx`
 * - `execution-contracts` → `contracts-execution-hub.tsx`
 * - `execution-planning`, `execution-quality`, `contractor-payments` → `execution-hub-links.tsx`
 * - `cost-control` → `cost-control/screen.tsx`
 *
 * Employee shells reuse the same server components above (gate runs in shared screen/hub).
 *
 * Not covered here (nav-hidden child segments e.g. `coordination`, `rfi`, `tasks` under
 * execution workspace): still capability-gated per page; central layout gate is follow-up.
 */
export async function requireDeveloperGcExecutionPage(projectId: string): Promise<void> {
  if (!UUID_PATTERN.test(projectId)) notFound();

  const allowed = await withOrgContext(async (context) => {
    const profile = await findProjectDeliveryProfile(context, projectId);
    return isDeveloperGcMode(profile);
  }).catch(() => false);

  if (!allowed) notFound();
}
