import { listProjectsForOrg } from '@/modules/projects';
import {
  displayedPercentString,
  loadDerivedProgressByProject,
} from '@/modules/projects/application/project-progress-mode';
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
 * GET /api/v1/projects - tenant-scoped project list.
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
      // Cursor condition is pushed into SQL – no full-table load + JS filter.
      const slice = await listProjectsForOrg(context, {
        sortBy: 'created_at',
        sortDirection: 'desc',
        includeArchived: false,
        limit: pagination.limit,
        createdBefore: pagination.cursor ?? null,
      });
      const taskProgressIds = slice
        .filter((project) => project.progressSource === 'tasks')
        .map((project) => project.id);
      const derivedProgress = await loadDerivedProgressByProject(
        context.db,
        context.organizationId,
        taskProgressIds,
      );
      const items = slice.map((project) => ({
        id: project.id,
        name: project.name,
        status: project.status,
        clientId: project.clientId,
        clientName: project.clientName,
        currency: project.currency,
        startDate: project.startDate,
        targetEndDate: project.targetEndDate,
        progressPercent:
          project.progressSource === 'tasks'
            ? displayedPercentString(derivedProgress.get(project.id) ?? null)
            : project.progressPercent,
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
