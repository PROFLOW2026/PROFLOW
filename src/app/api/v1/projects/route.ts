import { listProjectsForOrg } from '@/modules/projects';
import {
  apiError,
  apiSuccess,
  assertApiKeyHasScope,
  assertNoClientOrganizationOverride,
  nextCursorFromItems,
  parseApiPagination,
  requireApiKeyAuth,
  withApiKeyOrgContext,
} from '@/modules/api';

/**
 * GET /api/v1/projects — tenant-scoped project list.
 * Requires `projects.read` (maps to UI `projects.read` permission).
 * Never trusts a client-supplied organization id.
 */
export async function GET(request: Request) {
  const gated = await requireApiKeyAuth(request);
  if (!gated.ok) return gated.response;

  try {
    assertApiKeyHasScope(gated.auth, 'projects.read');

    const url = new URL(request.url);
    assertNoClientOrganizationOverride(url.searchParams);

    const pagination = parseApiPagination(url.searchParams);

    const page = await withApiKeyOrgContext(gated.auth, async (context) => {
      const projects = await listProjectsForOrg(context, {
        sortBy: 'created_at',
        sortDirection: 'desc',
        includeArchived: false,
      });

      let filtered = projects;
      if (pagination.cursor) {
        const cursorMs = Date.parse(pagination.cursor);
        if (!Number.isNaN(cursorMs)) {
          filtered = projects.filter((project) => project.createdAt.getTime() < cursorMs);
        }
      }

      const slice = filtered.slice(0, pagination.limit);
      const items = slice.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        clientId: project.clientId,
        clientName: project.clientName,
        currency: project.currency,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        progressPercent: project.progressPercent,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      }));

      return {
        items,
        nextCursor: nextCursorFromItems(slice, pagination.limit),
      };
    });

    return apiSuccess(page);
  } catch (error) {
    return apiError(error);
  }
}
